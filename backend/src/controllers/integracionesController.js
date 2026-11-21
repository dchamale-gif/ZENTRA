const crypto = require('crypto');
const pool = require('../db/connection');
const authPool = require('../db/authConnection');
const { getTenantId, runWithTenant } = require('../db/tenantContext');
const { hasOrganizationAccess } = require('../middleware/auth');
const { registrarVenta, eliminarVenta } = require('./ventasController');
const { encrypt, decrypt } = require('../utils/secretBox');
const { runImport, rowError, MAX_IMPORT_ROWS } = require('../utils/bulkImport');
const { upsertArticulo, articuloIdIsManual } = require('./importController');
const { prepararFoto } = require('../utils/fotoRemota');
const { parseFotoBase64 } = require('../utils/fotos');
const {
  connect, describeConnectionError, listColumns, describeSchema, previewTable, parseIdentifier, quoteWith, md5Expression, allowedHosts, httpError
} = require('../utils/webDb');

// Integración «web»: el ERP lee los productos de la base de datos de la página web de
// la empresa y los carga en Artículos. Con el modo 'dosVias', además, la existencia se
// concilia en las dos direcciones (las compras y ventas del ERP llegan a la web).
// Con 'erpManda' el ERP es el dueño de la existencia: la escribe tal cual en la web, y la web
// registra cada pedido como venta del ERP (POST /api/integraciones/web/pedidos, con llave).
const TIPO = 'web_db';
const CAMPOS = ['codigo', 'nombre', 'precio', 'costo', 'existencia', 'categoria', 'familia', 'descripcion', 'codigo_barras', 'unidad', 'activo', 'foto'];
// Existencia y precio de compra también los mueven las compras y ventas del ERP:
// 'inicial' los copia solo al crear el artículo, 'siempre' en cada sincronización, 'nunca' no los toca,
// 'dosVias' copia el costo al crear y concilia la existencia en los dos sentidos,
// 'erpManda' los copia solo al crear y desde ahí la existencia del ERP reemplaza la de la web.
const MODOS_INVENTARIO = new Set(['inicial', 'siempre', 'nunca', 'dosVias', 'erpManda']);
// Modos en los que el ERP escribe la existencia en la web.
const ESCRIBE_EXISTENCIA = new Set(['dosVias', 'erpManda']);
// Datos que, con datosDesde 'erp', la web solo pone al crear el artículo.
const DATOS_DEL_ARTICULO = ['nombre_articulo', 'descripcion', 'categoria', 'familia', 'codigo_barras', 'unidad_medida', 'activo'];

// Configuraciones guardadas antes de existir el modo: copiarExistencia true equivalía a 'siempre'.
const modoInventario = (config) => (MODOS_INVENTARIO.has(config.inventarioDesdeWeb)
  ? config.inventarioDesdeWeb
  : config.copiarExistencia === true ? 'siempre' : 'nunca');
const FOTO_BATCH = 100;
const FOTO_DESCARGAS_SIMULTANEAS = 8;

// Las fotos que fallan casi siempre fallan por lo mismo: se agrupan por motivo.
const resumirFotosFallidas = (fallidas) => {
  const porMotivo = new Map();
  fallidas.forEach(({ codigo, motivo }) => porMotivo.set(motivo, [...(porMotivo.get(motivo) || []), codigo]));
  return [...porMotivo].map(([motivo, codigos]) =>
    `${codigos.length} foto${codigos.length === 1 ? '' : 's'} sin cargar (${motivo}): ${codigos.slice(0, 3).join(', ')}${codigos.length > 3 ? '…' : ''}. Los productos sí se importaron`);
};
const MAX_AUTO_MINUTOS = 1440;

// Una sincronización por empresa a la vez; las solicitudes que llegan mientras tanto esperan la misma.
const enCurso = new Map();

const sendError = (res, error, fallback) => {
  if (error.status && error.status < 500 || error.expose) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  console.error(fallback, error);
  res.status(error.status || 500).json({ error: fallback });
};

const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);

// Valida y normaliza lo que llega del formulario. No incluye la contraseña.
const normalizeConfig = (body) => {
  const config = {
    motor: text(body.motor, 10),
    host: text(body.host, 255),
    puerto: Number(body.puerto) || null,
    base: text(body.base, 120),
    usuario: text(body.usuario, 120),
    ssl: body.ssl === true,
    tabla: text(body.tabla, 130),
    columnas: {},
    inventarioDesdeWeb: MODOS_INVENTARIO.has(body.inventarioDesdeWeb) ? body.inventarioDesdeWeb : 'inicial',
    // 'erp': el precio de venta lo calcula y publica el ERP (pantalla Precios); 'web': lo trae la web.
    preciosDesde: body.preciosDesde === 'web' ? 'web' : 'erp',
    // 'web': nombre, descripción, clasificación, código de barras, unidad y estado los trae la web
    // en cada sincronización; 'erp': la web solo los usa al crear el artículo y luego se editan en el ERP.
    datosDesde: body.datosDesde === 'erp' ? 'erp' : 'web',
    // Dirección de la web para las fotos guardadas como ruta («/uploads/pez.jpg»).
    urlFotos: text(body.urlFotos, 255).replace(/\/+$/, ''),
    autoMinutos: Math.min(Math.max(Math.round(Number(body.autoMinutos) || 0), 0), MAX_AUTO_MINUTOS)
  };
  if (!['postgres', 'mysql'].includes(config.motor)) throw httpError(400, 'Elige el motor de la base: PostgreSQL o MySQL');
  if (!config.host || !config.base || !config.usuario) {
    throw httpError(400, 'Completa servidor, base de datos y usuario');
  }
  if (config.puerto !== null && (!Number.isInteger(config.puerto) || config.puerto < 1 || config.puerto > 65535)) {
    throw httpError(400, 'El puerto debe ser un número entre 1 y 65535');
  }
  if (config.tabla) parseIdentifier(config.tabla, 'La tabla');
  // Sección guardada como número (category_id): el nombre se lee de otra tabla, y si esa tabla
  // tiene categoría padre, el padre es la sección y la categoría la familia.
  const relacion = body.categoriaTabla;
  if (relacion && relacion.tabla && relacion.id && relacion.nombre) {
    config.categoriaTabla = {
      tabla: text(relacion.tabla, 130),
      id: text(relacion.id, 63),
      nombre: text(relacion.nombre, 63),
      padre: relacion.padre ? text(relacion.padre, 63) : null
    };
    parseIdentifier(config.categoriaTabla.tabla, 'La tabla de categorías');
    ['id', 'nombre', 'padre'].forEach((clave) => {
      if (config.categoriaTabla[clave]) parseIdentifier(config.categoriaTabla[clave], 'La columna de categorías');
    });
  }
  if (config.urlFotos && !/^https?:\/\/[^\s/]+/i.test(config.urlFotos)) {
    throw httpError(400, 'La dirección de la web debe empezar con https:// (por ejemplo https://tropinsideacuarios.com)');
  }
  for (const campo of CAMPOS) {
    const column = text(body.columnas?.[campo], 63);
    if (column) {
      parseIdentifier(column, `La columna de ${campo}`);
      config.columnas[campo] = column;
    }
  }
  return config;
};

const loadIntegracion = async () => {
  const result = await pool.query(
    'SELECT activa, config, secreto, ultima_sync_at, ultima_sync_resultado FROM integraciones WHERE tipo = $1',
    [TIPO]
  );
  return result.rows[0] || null;
};

// La huella de la llave no sale del servidor; solo cuándo se creó y cómo empieza.
const publicView = (row) => {
  const { llaveWeb, ...config } = row?.config || {};
  return {
    configurada: Boolean(row),
    activa: row?.activa ?? false,
    config: row?.config ? config : null,
    llaveWeb: llaveWeb?.hash ? { creada: llaveWeb.creada, inicio: llaveWeb.inicio } : null,
    passwordGuardada: Boolean(row?.secreto),
    ultimaSync: row?.ultima_sync_at || null,
    resultado: row?.ultima_sync_resultado || null,
    servidoresAutorizados: allowedHosts(),
    habilitada: Boolean(process.env.INTEGRATIONS_KEY && process.env.INTEGRATIONS_KEY.length >= 32)
  };
};

const passwordFor = (row, provided) => {
  if (provided) return String(provided);
  if (!row?.secreto) return '';
  try {
    return decrypt(row.secreto, getTenantId());
  } catch (error) {
    if (error.status) throw error;
    throw httpError(400, 'La contraseña guardada ya no se puede leer (cambió la llave del servidor); escríbela de nuevo y guarda');
  }
};

const getConfig = async (req, res) => {
  try {
    res.status(200).json({ success: true, integracion: publicView(await loadIntegracion()) });
  } catch (error) {
    sendError(res, error, 'Error obteniendo la integración');
  }
};

const saveConfig = async (req, res) => {
  try {
    const config = normalizeConfig(req.body);
    if (!config.tabla || !config.columnas.codigo || !config.columnas.nombre) {
      throw httpError(400, 'Indica la tabla de productos y las columnas de código y nombre');
    }
    if (ESCRIBE_EXISTENCIA.has(config.inventarioDesdeWeb) && !config.columnas.existencia) {
      throw httpError(400, 'Para enviar la existencia a la web indica la columna de existencia');
    }
    const existing = await loadIntegracion();
    // La llave de la web no viene en el formulario: se conserva al guardar.
    if (existing?.config?.llaveWeb) config.llaveWeb = existing.config.llaveWeb;
    // Al empezar a conciliar, las bases anteriores ya no valen: la primera vez manda la web.
    if (config.inventarioDesdeWeb === 'dosVias' && (!existing || modoInventario(existing.config) !== 'dosVias')) {
      await pool.query('UPDATE codigos_articulos SET existencia_web_base = NULL WHERE existencia_web_base IS NOT NULL');
    }
    const secreto = req.body.password
      ? encrypt(String(req.body.password), getTenantId())
      : existing?.secreto || null;
    await pool.query(
      `INSERT INTO integraciones (tipo, activa, config, secreto, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (organization_id, tipo) DO UPDATE
       SET activa = EXCLUDED.activa, config = EXCLUDED.config, secreto = EXCLUDED.secreto, updated_at = NOW()`,
      [TIPO, req.body.activa !== false, config, secreto]
    );
    res.status(200).json({ success: true, integracion: publicView(await loadIntegracion()) });
  } catch (error) {
    sendError(res, error, 'Error guardando la integración');
  }
};

const deleteConfig = async (req, res) => {
  try {
    await pool.query('DELETE FROM integraciones WHERE tipo = $1', [TIPO]);
    res.status(200).json({ success: true, integracion: publicView(null) });
  } catch (error) {
    sendError(res, error, 'Error quitando la integración');
  }
};

// Prueba con lo que hay en el formulario (sin guardar): tablas, columnas y una muestra.
// Conecta y devuelve el esquema (tablas, columnas, filas aproximadas). Con una tabla elegida,
// también sus primeras filas y, si el mapeo está completo, cómo se leerían los productos.
const probar = async (req, res) => {
  let conn;
  try {
    const config = normalizeConfig(req.body);
    const password = passwordFor(await loadIntegracion(), req.body.password);
    conn = await connect({ ...config, password });
    const esquema = await describeSchema(conn);
    let columnas = [];
    let vistaPrevia = [];
    let faltantes = [];
    let muestra = [];
    let total = null;
    if (config.tabla) {
      columnas = await listColumns(conn, config.tabla);
      if (!columnas.length) throw httpError(400, `No se encontró la tabla «${config.tabla}» o el usuario no puede leerla`);
      vistaPrevia = await previewTable(conn, config.tabla);
      // Al cambiar de tabla, el mapeo anterior puede no aplicar: se avisa en vez de fallar.
      faltantes = Object.values(config.columnas).filter((column) => !columnas.includes(column));
      if (!faltantes.length && config.columnas.codigo && config.columnas.nombre) {
        const quote = quoteWith(conn.motor);
        const table = quote(parseIdentifier(config.tabla, 'La tabla'));
        total = Number((await conn.query(`SELECT COUNT(*) AS total FROM ${table}`))[0].total);
        const rows = await conn.query(`${selectSinFoto(conn.motor, config)} LIMIT 3`);
        muestra = rows.map((row) => ({ ...mapRow(row), foto: row.foto_md5 ? 'sí' : 'no' }));
        // Se lee la foto de la muestra como en la sincronización, para ver si el formato sirve.
        if (config.columnas.foto) {
          const fotoCol = quote(parseIdentifier(config.columnas.foto, 'foto'));
          const codigoCol = quote(parseIdentifier(config.columnas.codigo, 'codigo'));
          for (const item of muestra.filter((m) => m.foto === 'sí')) {
            const [fila] = await conn.query(`SELECT ${fotoCol} AS foto FROM ${table} WHERE ${codigoCol} = ${conn.param(1)}`, [item.codigo]);
            try {
              const { mime, buffer } = parseFotoBase64(await prepararFoto(fila?.foto, config.urlFotos));
              item.foto = `${mime.replace('image/', '').toUpperCase()}, ${Math.ceil(buffer.length / 1024)} KB`;
            } catch (error) {
              item.foto = `no se puede leer: ${error.expose ? error.message : 'formato desconocido'}`;
            }
          }
        }
      }
    }
    res.status(200).json({
      success: true,
      esquema,
      tablas: esquema.map((tabla) => tabla.nombre),
      columnas,
      vistaPrevia,
      faltantes,
      muestra,
      total
    });
  } catch (error) {
    sendError(res, error, 'Error probando la conexión');
  } finally {
    if (conn) conn.close();
  }
};

// SELECT con todas las columnas mapeadas; de la foto solo su huella (MD5), no la imagen.
const selectSinFoto = (motor, config) => {
  const quote = quoteWith(motor);
  const table = quote(parseIdentifier(config.tabla, 'La tabla'));
  const columna = (campo) => `${table}.${quote(parseIdentifier(config.columnas[campo], campo))}`;
  const expresiones = {};
  const relacion = config.categoriaTabla;
  if (relacion && config.columnas.categoria) {
    const cat = quote(parseIdentifier(relacion.tabla, 'La tabla de categorías'));
    const id = quote([relacion.id]);
    const nombre = quote([relacion.nombre]);
    const fk = columna('categoria');
    if (relacion.padre) {
      const padre = quote([relacion.padre]);
      expresiones.categoria = `(SELECT COALESCE(p.${nombre}, c.${nombre}) FROM ${cat} c LEFT JOIN ${cat} p ON p.${id} = c.${padre} WHERE c.${id} = ${fk})`;
      if (!config.columnas.familia) {
        expresiones.familia = `(SELECT CASE WHEN c.${padre} IS NOT NULL THEN c.${nombre} END FROM ${cat} c WHERE c.${id} = ${fk})`;
      }
    } else {
      expresiones.categoria = `(SELECT c.${nombre} FROM ${cat} c WHERE c.${id} = ${fk})`;
    }
  }
  const select = CAMPOS
    .filter((campo) => campo !== 'foto' && (config.columnas[campo] || expresiones[campo]))
    .map((campo) => `${expresiones[campo] || columna(campo)} AS ${quote([campo])}`);
  if (config.columnas.foto) {
    select.push(`${md5Expression(motor, columna('foto'))} AS ${quote(['foto_md5'])}`);
  }
  return `SELECT ${select.join(', ')} FROM ${table}`;
};

const mapRow = (row) => ({
  codigo: row.codigo == null ? '' : String(row.codigo).trim(),
  nombre: row.nombre ?? null,
  precio: row.precio ?? null,
  categoria: row.categoria ?? null,
  familia: row.familia ?? null,
  descripcion: row.descripcion ?? null,
  existencia: row.existencia ?? null,
  costo: row.costo ?? null,
  codigo_barras: row.codigo_barras == null ? null : String(row.codigo_barras).trim(),
  unidad: row.unidad ?? null,
  activo: row.activo ?? null
});

const sincronizarWeb = async (row) => {
  const { config } = row;
  const started = Date.now();
  const modo = modoInventario(config);
  const dosVias = modo === 'dosVias' && Boolean(config.columnas.existencia);
  const erpManda = modo === 'erpManda' && Boolean(config.columnas.existencia);
  const conn = await connect({ ...config, password: passwordFor(row), escritura: dosVias || erpManda });
  try {
    const fotos = new Map();
    const rows = await conn.query(`${selectSinFoto(conn.motor, config)} LIMIT ${MAX_IMPORT_ROWS + 1}`);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw httpError(400, `La tabla tiene más de ${MAX_IMPORT_ROWS} productos; pide a soporte que amplíe el límite`);
    }

    // Solo se traen las fotos que cambiaron desde la última vez.
    if (config.columnas.foto) {
      const actuales = await pool.query(
        `SELECT a.codigo, f.origen_hash FROM codigos_articulos a
         LEFT JOIN articulo_fotos f ON f.articulo_id = a.id`
      );
      const origen = new Map(actuales.rows.map((r) => [r.codigo, r.origen_hash]));
      const cambiadas = rows
        .filter((r) => r.foto_md5 && origen.get(String(r.codigo).trim()) !== r.foto_md5)
        .map((r) => r.codigo);
      const quote = quoteWith(conn.motor);
      const codigoCol = quote(parseIdentifier(config.columnas.codigo, 'codigo'));
      const fotoCol = quote(parseIdentifier(config.columnas.foto, 'foto'));
      const table = quote(parseIdentifier(config.tabla, 'La tabla'));
      for (let i = 0; i < cambiadas.length; i += FOTO_BATCH) {
        const batch = cambiadas.slice(i, i + FOTO_BATCH);
        const placeholders = batch.map((_, index) => conn.param(index + 1)).join(', ');
        const fotoRows = await conn.query(
          `SELECT ${codigoCol} AS codigo, ${fotoCol} AS foto, ${md5Expression(conn.motor, fotoCol)} AS foto_md5
           FROM ${table} WHERE ${codigoCol} IN (${placeholders})`,
          batch
        );
        fotoRows.forEach((r) => fotos.set(String(r.codigo).trim(), { valor: r.foto, origenHash: r.foto_md5 }));
      }
      // Foto quitada en la web: se quita en el ERP solo si había venido de la web.
      rows.forEach((r) => {
        const codigo = String(r.codigo ?? '').trim();
        if (!r.foto_md5 && origen.get(codigo)) fotos.set(codigo, { valor: null, origenHash: null });
      });
    }

    // Cada foto se prepara aparte (base64 o descarga si es URL/ruta). Una foto que no sirve
    // no detiene al artículo: se importa sin tocar su foto y se avisa.
    const fotosFallidas = [];
    const pendientes = [...fotos.entries()].filter(([, foto]) => foto.valor !== null);
    for (let i = 0; i < pendientes.length; i += FOTO_DESCARGAS_SIMULTANEAS) {
      await Promise.all(pendientes.slice(i, i + FOTO_DESCARGAS_SIMULTANEAS).map(async ([codigo, foto]) => {
        try {
          foto.valor = await prepararFoto(foto.valor, config.urlFotos);
        } catch (error) {
          fotos.delete(codigo);
          fotosFallidas.push({ codigo, motivo: error.expose ? error.message : 'no se pudo leer' });
        }
      }));
    }

    const importRows = rows
      .map((r) => ({ r, data: mapRow(r) }))
      .filter(({ data }) => data.codigo)
      .map(({ data }) => ({
        codigo: data.codigo,
        nombre_articulo: data.nombre,
        precio_unitario: data.precio,
        categoria: data.categoria,
        familia: data.familia,
        descripcion: data.descripcion,
        codigo_barras: data.codigo_barras,
        unidad_medida: data.unidad,
        // Inactivo en la web = inactivo en el ERP (no aparece en el punto de venta).
        activo: data.activo,
        cantidad_disponible: modo === 'nunca' ? undefined : data.existencia,
        precio_costo: modo === 'nunca' ? undefined : data.costo,
        // Con 'inicial', compras y ventas del ERP mandan una vez creado el artículo; con
        // 'dosVias' la existencia de los que ya existen la ajusta la conciliación.
        _soloAlCrear: [
        ...(['inicial', 'dosVias', 'erpManda'].includes(modo) ? ['cantidad_disponible', 'precio_costo'] : []),
        // Si el ERP publica los precios, el de la web solo sirve para crear el artículo.
        ...(config.preciosDesde === 'web' ? [] : ['precio_unitario']),
        // Si los datos los manda el ERP, la web no pisa lo que se editó en el ERP.
        ...(config.datosDesde === 'erp' ? DATOS_DEL_ARTICULO : [])
      ],
        _foto: fotos.get(data.codigo)
      }));
    const sinCodigo = rows.length - importRows.length;

    let summary = { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] };
    if (importRows.length) {
      const options = { requiresManualId: await articuloIdIsManual(pool) };
      summary = await runImport(pool, importRows, async (client, raw, index) => {
        try {
          return await upsertArticulo(client, raw, index, options);
        } catch (error) {
          throw rowError(`«${raw.codigo}»: ${error.expose ? error.message : 'no se pudo guardar'}`);
        }
      });
    }

    const conciliacion = dosVias
      ? await conciliarExistencias(conn, config, rows)
      : erpManda ? await enviarExistencias(conn, config, rows) : null;

    // Con precios del ERP, avisar si en la web alguien dejó otro precio (el ERP no lo toma).
    let preciosDistintos = 0;
    if (config.preciosDesde !== 'web' && config.columnas.precio) {
      const { rows: publicados } = await pool.query(
        'SELECT codigo, precio_unitario FROM codigos_articulos WHERE codigo = ANY($1)',
        [importRows.map((r) => r.codigo)]
      );
      const enErp = new Map(publicados.map((r) => [r.codigo, Number(r.precio_unitario)]));
      preciosDistintos = importRows.filter((r) => {
        const web = Number(r.precio_unitario);
        return enErp.has(r.codigo) && Number.isFinite(web) && Math.abs(web - enErp.get(r.codigo)) >= 0.005;
      }).length;
    }

    const resultado = {
      ok: true,
      total: rows.length,
      ...(conciliacion ? { enviadosWeb: conciliacion.enviados, recibidosWeb: conciliacion.recibidos } : {}),
      creados: summary.created,
      actualizados: summary.updated,
      sinCambios: summary.unchanged,
      fallidos: summary.failed + sinCodigo,
      fotosDescargadas: [...fotos.values()].filter((foto) => foto.valor).length,
      fotosFallidas: fotosFallidas.length,
      errores: [
        ...(sinCodigo ? [sinCodigo === 1
          ? '1 producto sin código en la web no se importó'
          : `${sinCodigo} productos sin código en la web no se importaron`] : []),
        ...summary.errors.slice(0, 20).map((error) => error.message),
        ...(conciliacion?.errores || []).slice(0, 10),
        ...resumirFotosFallidas(fotosFallidas),
        ...(preciosDistintos ? [`${preciosDistintos} artículo${preciosDistintos === 1 ? ' tiene' : 's tienen'} en la web un precio distinto al publicado en el ERP; en Precios elige «Todos», selecciónalos y pulsa «Publicar seleccionados»`] : [])
      ],
      segundos: Math.round((Date.now() - started) / 100) / 10
    };
    await guardarResultado(resultado);
    return resultado;
  } finally {
    conn.close();
  }
};

/**
 * Dos vías: la existencia nueva suma lo que se movió en cada lado desde la última vez que
 * coincidieron (existencia_web_base): ERP + web − base. En los dos lados se escribe como
 * suma, así una venta que ocurra en medio no se pierde: queda para la siguiente conciliación.
 * Un artículo que aún no tiene base toma la existencia de la web (la tienda en línea es la
 * existencia real al conectar; un ERP recién importado suele estar en 0).
 */
const conciliarExistencias = async (conn, config, rows) => {
  const quote = quoteWith(conn.motor);
  const table = quote(parseIdentifier(config.tabla, 'La tabla'));
  const codigoCol = quote(parseIdentifier(config.columnas.codigo, 'codigo'));
  const stockCol = quote(parseIdentifier(config.columnas.existencia, 'existencia'));
  const web = new Map(rows.map((r) => [String(r.codigo ?? '').trim(), r.existencia]).filter(([codigo]) => codigo));
  const { rows: articulos } = await pool.query(
    // Los que se venden por fracción (1.5 lb) no se concilian: la web lleva existencias enteras.
    'SELECT id, codigo, cantidad_disponible, existencia_web_base FROM codigos_articulos WHERE codigo = ANY($1) AND NOT vende_fraccion',
    [[...web.keys()]]
  );
  const resultado = { enviados: 0, recibidos: 0, errores: [] };
  for (const articulo of articulos) {
    const webRaw = web.get(articulo.codigo);
    const webAhora = Number(webRaw);
    if (webRaw === null || webRaw === undefined || webRaw === '' || !Number.isFinite(webAhora)) continue;
    const erpAhora = Number(articulo.cantidad_disponible) || 0;
    const base = articulo.existencia_web_base;
    let nueva = Math.round(base === null ? webAhora : erpAhora + webAhora - base);
    if (nueva < 0) {
      resultado.errores.push(`«${articulo.codigo}»: entre el ERP y la web se vendió más de lo que había; quedó en 0`);
      nueva = 0;
    }

    const haciaWeb = nueva - webAhora;
    if (haciaWeb !== 0) {
      try {
        await conn.query(
          `UPDATE ${table} SET ${stockCol} = ${stockCol} + ${conn.param(1)} WHERE ${codigoCol} = ${conn.param(2)}`,
          [haciaWeb, articulo.codigo]
        );
      } catch (error) {
        throw httpError(502, `No se pudo actualizar la existencia en la web (${describeConnectionError(error)}). ` +
          `El usuario de la base de la web necesita permiso para modificar la columna «${config.columnas.existencia}» de «${config.tabla}».`);
      }
      resultado.enviados += 1;
    }
    const haciaErp = nueva - erpAhora;
    if (haciaErp !== 0 || base !== nueva) {
      await pool.query(
        `UPDATE codigos_articulos
         SET cantidad_disponible = COALESCE(cantidad_disponible, 0) + $1, existencia_web_base = $2,
             updated_at = CASE WHEN $1 <> 0 THEN NOW() ELSE updated_at END
         WHERE id = $3`,
        [haciaErp, nueva, articulo.id]
      );
      if (haciaErp !== 0) resultado.recibidos += 1;
    }
  }
  return resultado;
};

/**
 * El ERP manda: la existencia de la web pasa a ser la del ERP, tal cual (no se suma ni se
 * concilia). La web lleva existencias enteras: un artículo por fracción (1.5 lb) se publica
 * con las unidades completas. Solo se escriben los que difieren.
 */
const enviarExistencias = async (conn, config, rows) => {
  const quote = quoteWith(conn.motor);
  const table = quote(parseIdentifier(config.tabla, 'La tabla'));
  const codigoCol = quote(parseIdentifier(config.columnas.codigo, 'codigo'));
  const stockCol = quote(parseIdentifier(config.columnas.existencia, 'existencia'));
  const web = new Map(rows.map((r) => [String(r.codigo ?? '').trim(), r.existencia]).filter(([codigo]) => codigo));
  const { rows: articulos } = await pool.query(
    'SELECT codigo, cantidad_disponible FROM codigos_articulos WHERE codigo = ANY($1)',
    [[...web.keys()]]
  );
  const resultado = { enviados: 0, recibidos: 0, errores: [] };
  for (const articulo of articulos) {
    const erp = existenciaWeb(articulo.cantidad_disponible);
    const webRaw = web.get(articulo.codigo);
    if (webRaw !== null && webRaw !== undefined && webRaw !== '' && Number(webRaw) === erp) continue;
    try {
      await conn.query(
        `UPDATE ${table} SET ${stockCol} = ${conn.param(1)} WHERE ${codigoCol} = ${conn.param(2)}`,
        [erp, articulo.codigo]
      );
    } catch (error) {
      throw httpError(502, `No se pudo actualizar la existencia en la web (${describeConnectionError(error)}). ` +
        `El usuario de la base de la web necesita permiso para modificar la columna «${config.columnas.existencia}» de «${config.tabla}».`);
    }
    resultado.enviados += 1;
  }
  return resultado;
};

// Existencia que se publica en la web: entera y nunca negativa.
const existenciaWeb = (cantidad) => Math.max(0, Math.floor(Number(cantidad) || 0));

// Tras un movimiento del ERP basta leer código y existencia de la web (sin importar productos ni fotos).
const enviarExistenciasSolo = async (row) => {
  const { config } = row;
  const conn = await connect({ ...config, password: passwordFor(row), escritura: true });
  try {
    const quote = quoteWith(conn.motor);
    const table = quote(parseIdentifier(config.tabla, 'La tabla'));
    const rows = await conn.query(
      `SELECT ${quote(parseIdentifier(config.columnas.codigo, 'codigo'))} AS ${quote(['codigo'])},
              ${quote(parseIdentifier(config.columnas.existencia, 'existencia'))} AS ${quote(['existencia'])}
       FROM ${table} LIMIT ${MAX_IMPORT_ROWS + 1}`
    );
    return await enviarExistencias(conn, config, rows);
  } finally {
    conn.close();
  }
};

const guardarResultado = (resultado) => pool.query(
  'UPDATE integraciones SET ultima_sync_at = NOW(), ultima_sync_resultado = $2 WHERE tipo = $1',
  [TIPO, resultado]
);

/**
 * Escribe en la web los precios publicados en el ERP. items: [{ codigo, precio }].
 * Devuelve null si la web no está conectada o no tiene columna de precio; si no, { actualizados }.
 * Lanza un error expuesto si la web rechaza la escritura (p. ej. sin permiso).
 */
const publicarPreciosWeb = async (items) => {
  const row = await loadIntegracion();
  const config = row?.config;
  if (!row?.activa || !config?.columnas?.precio || !items.length) return null;
  const conn = await connect({ ...config, password: passwordFor(row), escritura: true });
  try {
    const quote = quoteWith(conn.motor);
    const table = quote(parseIdentifier(config.tabla, 'La tabla'));
    const codigoCol = quote(parseIdentifier(config.columnas.codigo, 'codigo'));
    const precioCol = quote(parseIdentifier(config.columnas.precio, 'precio'));
    let actualizados = 0;
    for (const item of items) {
      try {
        await conn.query(
          `UPDATE ${table} SET ${precioCol} = ${conn.param(1)} WHERE ${codigoCol} = ${conn.param(2)}`,
          [item.precio, item.codigo]
        );
      } catch (error) {
        throw httpError(502, `No se pudieron publicar los precios en la web (${describeConnectionError(error)}). ` +
          `El usuario de la base de la web necesita permiso para modificar la columna «${config.columnas.precio}» de «${config.tabla}».`);
      }
      actualizados += 1;
    }
    return { actualizados };
  } finally {
    conn.close();
  }
};

// Un precio cambiado en el formulario de artículos: va a la web solo si el ERP manda los precios.
const precioWebDesdeErp = async (item) => {
  const row = await loadIntegracion();
  if (!item.codigo || row?.config?.preciosDesde === 'web') return null;
  return publicarPreciosWeb([item]);
};

// Pedidas mientras otra corría (p. ej. dos ventas seguidas): se repite una vez al terminar.
const repetir = new Set();

// Una sincronización por empresa a la vez; quien llega mientras corre espera la misma.
// tarea: la sincronización completa o, tras un movimiento con el ERP al mando, solo la existencia.
const iniciarSincronizacion = (organizationId, row, tarea = sincronizarWeb) => {
  if (!enCurso.has(organizationId)) {
    enCurso.set(organizationId, tarea(row)
      .catch(async (error) => {
        // Se registra el fallo para que el administrador lo vea en Configuración.
        await guardarResultado({ ok: false, error: error.expose || error.status ? error.message : 'Error inesperado' })
          .catch(() => {});
        throw error;
      })
      .finally(() => {
        enCurso.delete(organizationId);
        if (repetir.delete(organizationId)) sincronizarEnSegundoPlano(organizationId);
      }));
  }
  return enCurso.get(organizationId);
};

// Tras una compra, venta o ajuste: si el ERP escribe la existencia en la web, se la lleva.
const sincronizarEnSegundoPlano = (organizationId) => runWithTenant(organizationId, async () => {
  try {
    if (enCurso.has(organizationId)) {
      repetir.add(organizationId);
      return;
    }
    const row = await loadIntegracion();
    const modo = row?.activa ? modoInventario(row.config) : null;
    if (!ESCRIBE_EXISTENCIA.has(modo) || !row.config.columnas?.existencia) return;
    await iniciarSincronizacion(organizationId, row, modo === 'erpManda' ? enviarExistenciasSolo : sincronizarWeb);
  } catch (error) {
    // El resultado (con el error) queda en Configuración; quien vendió no debe ver el fallo.
  }
});

// Middleware para las rutas que mueven existencia; actúa cuando la respuesta salió bien.
const sincronizarTrasMovimiento = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400 && req.organization?.id) sincronizarEnSegundoPlano(req.organization.id);
  });
  next();
};

/**
 * POST /api/integraciones/web/sincronizar   { auto?: true }
 * auto: la pide el punto de venta o Artículos al abrirse; solo corre si pasó el
 * intervalo configurado. Sin auto, la pide un usuario con el botón «Sincronizar ahora».
 */
const sincronizar = async (req, res) => {
  const organizationId = getTenantId();
  try {
    const auto = req.body?.auto === true;
    if (!auto && !req.userPermissions.some((p) => ['admin_config', 'inventario_edit'].includes(p))) {
      throw httpError(403, 'No tienes permiso para sincronizar; pide acceso al administrador');
    }
    const row = await loadIntegracion();
    if (!row || !row.activa) {
      if (auto) return res.status(200).json({ success: true, omitida: true });
      throw httpError(400, 'Primero configura y activa la conexión con la página web en Configuración');
    }
    if (auto) {
      const minutos = Number(row.config.autoMinutos) || 0;
      const ultima = row.ultima_sync_at ? new Date(row.ultima_sync_at).getTime() : 0;
      if (!minutos || Date.now() - ultima < minutos * 60000) {
        return res.status(200).json({ success: true, omitida: true });
      }
    }

    const resultado = await iniciarSincronizacion(organizationId, row);
    res.status(200).json({ success: true, resultado });
  } catch (error) {
    sendError(res, error, 'Error sincronizando con la página web');
  }
};

// ====================================
// PEDIDOS DE LA WEB (el ERP manda)
// ====================================

// Llave: zk_<empresa>_<secreto>. El número de empresa permite ubicarla sin saltarse el
// aislamiento entre empresas; el ERP guarda solo su huella SHA-256.
const LLAVE_RE = /^zk_(\d{1,10})_([A-Za-z0-9_-]{40,})$/;
const huella = (llave) => crypto.createHash('sha256').update(llave).digest('hex');

/** POST /api/integraciones/web/llave: crea (o reemplaza) la llave; se muestra una sola vez. */
const generarLlave = async (req, res) => {
  try {
    const row = await loadIntegracion();
    if (!row) throw httpError(400, 'Primero guarda la conexión con la base de datos de la página web');
    const prefijo = `zk_${getTenantId()}_`;
    const llave = `${prefijo}${crypto.randomBytes(32).toString('base64url')}`;
    const llaveWeb = {
      hash: huella(llave),
      inicio: llave.slice(0, prefijo.length + 4),
      creada: new Date().toISOString(),
      // Las ventas de la web quedan a nombre de quien creó la llave.
      usuarioId: req.user.id
    };
    await pool.query(
      `UPDATE integraciones SET config = jsonb_set(config, '{llaveWeb}', $2::jsonb), updated_at = NOW() WHERE tipo = $1`,
      [TIPO, JSON.stringify(llaveWeb)]
    );
    res.status(200).json({ success: true, llave, integracion: publicView(await loadIntegracion()) });
  } catch (error) {
    sendError(res, error, 'Error creando la llave de la página web');
  }
};

/** DELETE /api/integraciones/web/llave: la web deja de poder registrar ventas. */
const revocarLlave = async (req, res) => {
  try {
    await pool.query(
      `UPDATE integraciones SET config = config - 'llaveWeb', updated_at = NOW() WHERE tipo = $1`,
      [TIPO]
    );
    res.status(200).json({ success: true, integracion: publicView(await loadIntegracion()) });
  } catch (error) {
    sendError(res, error, 'Error quitando la llave de la página web');
  }
};

// Middleware de las rutas que llama el servidor de la página web (sin sesión de usuario).
const autenticarWeb = async (req, res, next) => {
  try {
    const llave = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const match = LLAVE_RE.exec(llave);
    if (!match) return res.status(401).json({ error: 'Falta la llave del ERP o no tiene el formato correcto', code: 'LLAVE_INVALIDA' });
    const organizationId = Number(match[1]);
    if (req.sitio?.tipo === 'empresa' && req.sitio.organizationId !== organizationId) {
      return res.status(401).json({ error: 'La llave es de otra empresa', code: 'LLAVE_INVALIDA' });
    }
    const { rows } = await authPool.query(
      'SELECT id, subscription_status, trial_ends_at, subscription_ends_at FROM organizations WHERE id = $1',
      [organizationId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'La llave no es válida', code: 'LLAVE_INVALIDA' });
    if (!hasOrganizationAccess(rows[0])) {
      return res.status(403).json({ error: 'El acceso de la empresa al ERP está suspendido', code: 'ORGANIZATION_BLOCKED' });
    }
    runWithTenant(organizationId, async () => {
      try {
        const row = await loadIntegracion();
        const guardada = row?.config?.llaveWeb?.hash;
        const recibida = huella(llave);
        if (!guardada || !crypto.timingSafeEqual(Buffer.from(guardada, 'hex'), Buffer.from(recibida, 'hex'))) {
          return res.status(401).json({ error: 'La llave no es válida o fue reemplazada en el ERP', code: 'LLAVE_INVALIDA' });
        }
        if (!row.activa) {
          return res.status(503).json({ error: 'La conexión con la página web está pausada en el ERP', code: 'INTEGRACION_PAUSADA' });
        }
        if (modoInventario(row.config) !== 'erpManda') {
          return res.status(409).json({ error: 'En el ERP, la existencia no está en «El ERP manda»', code: 'MODO_INCORRECTO' });
        }
        req.organization = { id: organizationId };
        req.integracion = row;
        next();
      } catch (error) {
        sendError(res, error, 'Error verificando la llave');
      }
    });
  } catch (error) {
    sendError(res, error, 'Error verificando la llave');
  }
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCIA_RE = /^[A-Za-z0-9._:#-]{1,80}$/;
const METODOS_WEB = new Set(['efectivo', 'tarjeta', 'transferencia']);
const MAX_LINEAS = 200;
const MAX_CANTIDAD_WEB = 999;

const leerReferencia = (valor) => {
  const referencia = text(valor, 80);
  if (!REFERENCIA_RE.test(referencia)) throw httpError(400, 'Falta el número de pedido de la web (referencia)');
  return referencia;
};

const monto = (valor, etiqueta) => {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero < 0 || numero > 99999999.99) throw httpError(400, `${etiqueta} no es válido`);
  return Math.round(numero * 100) / 100;
};

const normalizarPedido = (body) => {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > MAX_LINEAS) throw httpError(400, `El pedido debe tener entre 1 y ${MAX_LINEAS} líneas`);
  const fecha = text(body.fecha, 10);
  if (!FECHA_RE.test(fecha) || Number.isNaN(Date.parse(fecha))) throw httpError(400, 'La fecha debe tener el formato AAAA-MM-DD');
  const metodo = String(body.metodo_pago || '').toLowerCase();
  return {
    referencia: leerReferencia(body.referencia),
    fecha,
    metodoPago: METODOS_WEB.has(metodo) ? metodo : 'transferencia',
    descuento: monto(body.descuento, 'El descuento'),
    envio: monto(body.envio, 'El envío'),
    cliente: {
      nombre: text(body.cliente?.nombre, 120),
      email: text(body.cliente?.email, 120),
      telefono: text(body.cliente?.telefono, 40),
      nit: text(body.cliente?.nit, 20)
    },
    notas: text(body.notas, 200),
    items: items.map((item, index) => {
      const codigo = text(item?.codigo, 120);
      const cantidad = Number(item?.cantidad);
      if (!codigo) throw httpError(400, `Línea ${index + 1}: falta el código (SKU)`);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD_WEB) {
        throw httpError(400, `Línea ${index + 1}: la cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD_WEB}`);
      }
      return { codigo, cantidad, precioUnitario: monto(item?.precio_unitario, `Línea ${index + 1}: el precio`) };
    })
  };
};

// Notas de la venta: de qué pedido viene, quién compró y el envío (el envío no es un artículo).
const observacionesPedido = (pedido) => [
  `Pedido web ${pedido.referencia}`,
  pedido.cliente.nombre,
  pedido.cliente.email,
  pedido.cliente.telefono,
  pedido.cliente.nit ? `NIT ${pedido.cliente.nit}` : '',
  pedido.envio ? `Envío Q${pedido.envio.toFixed(2)} (no incluido en el total)` : '',
  pedido.notas
].filter(Boolean).join(' · ').slice(0, 500);

const existenciasDe = async (db, codigos) => {
  if (!codigos.length) return [];
  const { rows } = await db.query(
    'SELECT codigo, cantidad_disponible FROM codigos_articulos WHERE codigo = ANY($1)',
    [codigos]
  );
  return rows.map((row) => ({ codigo: row.codigo, existencia: existenciaWeb(row.cantidad_disponible) }));
};

const ventaWeb = async (db, referencia, { bloquear = false } = {}) => {
  const { rows } = await db.query(
    `SELECT id, numero_venta, total FROM ventas WHERE origen = 'web' AND referencia_externa = $1${bloquear ? ' FOR UPDATE' : ''}`,
    [referencia]
  );
  return rows[0] || null;
};

/**
 * POST /api/integraciones/web/pedidos
 * { referencia, fecha, metodo_pago, descuento, envio, cliente, notas, items: [{ codigo, cantidad, precio_unitario }] }
 * Registra el pedido como venta y descuenta la existencia. Si no alcanza responde 409 con
 * faltantes y no registra nada. Repetir la misma referencia devuelve la venta ya registrada.
 * Siempre responde la existencia actual de los códigos del pedido para que la web la copie.
 */
const registrarPedidoWeb = async (req, res) => {
  let client;
  try {
    const pedido = normalizarPedido(req.body);
    const codigos = [...new Set(pedido.items.map((item) => item.codigo))];
    client = await pool.connect();
    await client.query('BEGIN');
    // Mismo orden de bloqueo que registrarVenta (correlativo y luego artículos), así un cobro del
    // punto de venta y un pedido de la web no se bloquean entre sí. También ordena los reintentos.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ventas_numero_correlativo'))");
    const previa = await ventaWeb(client, pedido.referencia);
    if (previa) {
      const existencias = await existenciasDe(client, codigos);
      await client.query('COMMIT');
      return res.status(200).json({ success: true, duplicado: true, venta: previa, existencias });
    }

    const { rows: articulos } = await client.query(
      `SELECT id, codigo, nombre_articulo AS nombre, cantidad_disponible
       FROM codigos_articulos WHERE codigo = ANY($1) ORDER BY id FOR UPDATE`,
      [codigos]
    );
    const porCodigo = new Map(articulos.map((articulo) => [articulo.codigo, articulo]));
    const existencias = articulos.map((a) => ({ codigo: a.codigo, existencia: existenciaWeb(a.cantidad_disponible) }));
    const noExisten = codigos.filter((codigo) => !porCodigo.has(codigo));
    if (noExisten.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: `${noExisten.length === 1 ? 'Este producto no existe' : 'Estos productos no existen'} en el ERP: ${noExisten.join(', ')}`,
        code: 'CODIGO_NO_EXISTE', noExisten, existencias
      });
    }
    const pedidas = new Map();
    pedido.items.forEach((item) => pedidas.set(item.codigo, (pedidas.get(item.codigo) || 0) + item.cantidad));
    const faltantes = [...pedidas]
      .map(([codigo, pedida]) => {
        const articulo = porCodigo.get(codigo);
        return { codigo, nombre: articulo.nombre, pedida, disponible: existenciaWeb(articulo.cantidad_disponible) };
      })
      .filter((linea) => linea.disponible < linea.pedida);
    if (faltantes.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: faltantes.map((f) => `«${f.nombre}»: hay ${f.disponible} y se pidieron ${f.pedida}`).join('; '),
        code: 'SIN_EXISTENCIA', faltantes, existencias
      });
    }

    const subtotalCent = pedido.items.reduce((suma, item) => suma + Math.round(item.cantidad * item.precioUnitario * 100), 0);
    const venta = await registrarVenta(client, {
      fecha: pedido.fecha,
      metodo_pago: pedido.metodoPago,
      observaciones: observacionesPedido(pedido),
      // El cupón de la web puede cubrir también el envío; en el ERP no puede pasar de los artículos.
      descuento_general: Math.min(Math.round(pedido.descuento * 100), subtotalCent) / 100,
      items: pedido.items.map((item) => ({
        tipo: 'articulo',
        concepto_id: porCodigo.get(item.codigo).id,
        cantidad: item.cantidad,
        precio_unitario: item.precioUnitario
      }))
    }, req.integracion.config.llaveWeb.usuarioId, { puedeDescontar: true });
    await client.query(
      `UPDATE ventas SET origen = 'web', referencia_externa = $2 WHERE id = $1`,
      [venta.id, pedido.referencia]
    );
    const despues = await existenciasDe(client, codigos);
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      venta: { id: venta.id, numero_venta: venta.numero_venta, total: venta.total },
      existencias: despues
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    sendError(res, error, 'Error registrando el pedido de la web');
  } finally {
    if (client) client.release();
  }
};

/**
 * POST /api/integraciones/web/pedidos/:referencia/anular   { codigos?: [] }
 * Elimina la venta del pedido y devuelve su existencia. Si el ERP nunca recibió el pedido
 * responde existia: false. Una venta con factura vigente, abonos o ya en un cierre de caja
 * no se puede anular desde la web (409): se resuelve en el ERP.
 */
const anularPedidoWeb = async (req, res) => {
  let client;
  try {
    const referencia = leerReferencia(req.params.referencia);
    const pedidos = Array.isArray(req.body?.codigos) ? req.body.codigos.slice(0, MAX_LINEAS).map((c) => text(c, 120)).filter(Boolean) : [];
    client = await pool.connect();
    await client.query('BEGIN');
    // Espera a un registro del mismo pedido que esté en curso, para no responder «no existía» antes de tiempo.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ventas_numero_correlativo'))");
    const venta = await ventaWeb(client, referencia, { bloquear: true });
    let codigos = pedidos;
    if (venta) {
      const { rows } = await client.query(
        `SELECT DISTINCT a.codigo FROM venta_items vi JOIN codigos_articulos a ON a.id = vi.articulo_id WHERE vi.venta_id = $1`,
        [venta.id]
      );
      codigos = [...new Set([...pedidos, ...rows.map((row) => row.codigo)])];
      await eliminarVenta(client, venta.id);
    }
    const existencias = await existenciasDe(client, codigos);
    await client.query('COMMIT');
    res.status(200).json({ success: true, existia: Boolean(venta), venta: venta ? { numero_venta: venta.numero_venta } : null, existencias });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    sendError(res, error, 'Error anulando el pedido de la web');
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getConfig, saveConfig, deleteConfig, probar, sincronizar, sincronizarTrasMovimiento, publicarPreciosWeb, precioWebDesdeErp,
  generarLlave, revocarLlave, autenticarWeb, registrarPedidoWeb, anularPedidoWeb
};
