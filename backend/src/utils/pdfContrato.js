// Documentos de contratación que se envían al cliente al crear su empresa:
// propuesta comercial (COT), contrato (CTR), Anexo A (ANX) y acta de entrega (ACT).
// Lo que no se conoce al crear la empresa (DPI, registro mercantil, fechas de firma) queda
// en una línea en blanco para llenarse a mano al firmar.

const PDFDocument = require('pdfkit');

const PROVEEDOR = {
  representante: 'Diego Chamalé',
  empresa: 'BotEngineCorp',
  lema: 'Soluciones digitales para empresas · botenginecorp.com',
  whatsapp: '+502 3995-9782',
  // Correo de soporte que aparece en el anexo y el acta; sin él queda la línea en blanco.
  correo: () => (process.env.SOPORTE_CORREO || '').trim()
};

const VERSION_PLANTILLA = '1.0';
const LINEA = '________________';

// Funciones incluidas por módulo, como se describen en la propuesta y el Anexo A.
const DESCRIPCION_MODULOS = {
  ventas: ['Punto de venta', 'Registro de ventas en caja, búsqueda de productos por nombre o código, cobro en efectivo, tarjeta o transferencia, cierre de caja y devoluciones.'],
  clientes: ['Clientes', 'Ficha de clientes con datos de contacto y NIT, e historial de sus compras.'],
  cobros: ['Cuentas por cobrar', 'Ventas al crédito, abonos, saldos por cliente y estados de cuenta.'],
  articulos: ['Manejo de inventario', 'Catálogo de productos con precios, existencias en tiempo real, entradas y salidas, ajustes, alertas de existencia mínima y kardex por producto.'],
  compras: ['Compras', 'Registro de compras a proveedores con ingreso al inventario y costo por producto.'],
  proveedores: ['Proveedores', 'Catálogo de proveedores con datos de contacto, NIT e historial de compras.'],
  caja: ['Caja', 'Apertura y cierre de caja, ingresos y egresos de efectivo y movimientos por turno.'],
  gastos: ['Gastos y servicios', 'Registro y clasificación de gastos de operación y pagos de servicios.'],
  finanzas: ['Dashboard ejecutivo', 'Indicadores de ventas, compras, gastos y utilidad, con el detalle de transacciones.'],
  reportes: ['Reportes', 'Ventas por período, por producto y por usuario, inventario valorizado y movimientos de caja, con descarga en PDF y Excel.'],
  fel: ['Conexión con FEL', 'Emisión de facturas electrónicas, notas de crédito y anulaciones por medio del certificador autorizado por la SAT que contrate el cliente.']
};

// ---------- Números y fechas en letras ----------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const menorMil = (n) => {
  if (n === 100) return 'cien';
  const resto = n % 100;
  const decenas = resto < 30 ? UNIDADES[resto] : DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` y ${UNIDADES[resto % 10]}` : '');
  return [CENTENAS[Math.floor(n / 100)], decenas].filter(Boolean).join(' ');
};

// «uno» delante de un sustantivo: un usuario, veintiún usuarios.
const apocope = (texto) => texto.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

const enLetras = (n) => {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor(n / 1000) % 1000;
  const resto = n % 1000;
  return [
    millones ? (millones === 1 ? 'un millón' : `${apocope(menorMil(millones))} millones`) : '',
    miles ? (miles === 1 ? 'mil' : `${apocope(menorMil(miles))} mil`) : '',
    resto ? menorMil(resto) : ''
  ].filter(Boolean).join(' ');
};

const cantidadEnLetras = (n, singular, plural) => `${apocope(enLetras(n))} (${n}) ${n === 1 ? singular : plural}`;

const dinero = (monto) => `Q${monto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dineroEnLetras = (monto) => {
  const centavos = Math.round(monto * 100) % 100;
  const entero = Math.round(monto * 100 - centavos) / 100;
  const quetzales = entero === 1 ? 'un quetzal' : `${apocope(enLetras(entero))} quetzales`;
  return centavos ? `${quetzales} con ${String(centavos).padStart(2, '0')}/100` : `${quetzales} exactos`;
};

// fecha = { anio, mes (1-12), dia }
const fechaCorta = (f) => `${f.dia} de ${MESES[f.mes - 1]} de ${f.anio}`;
const fechaEnLetras = (f) => `${enLetras(f.dia)} de ${MESES[f.mes - 1]} de ${enLetras(f.anio)}`;
const minusculaInicial = (texto) => texto.charAt(0).toLowerCase() + texto.slice(1);
const listaConY = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : items[0] || '');

// ---------- Maquetación ----------

const COLOR = {
  texto: '#1f2937', suave: '#64748b', azul: '#1d4ed8', seccion: '#2563eb',
  borde: '#cbd5e1', encabezado: '#eef2fb', etiqueta: '#f8fafc', aviso: '#fff7ed', avisoBorde: '#c2410c'
};
const R = 'Helvetica';
const B = 'Helvetica-Bold';
const MARGEN = { top: 56, bottom: 64, left: 57, right: 57 };
const ANCHO = 612 - MARGEN.left - MARGEN.right;
const CUERPO = 10;

const finDePagina = (doc) => doc.page.height - doc.page.margins.bottom;
const asegurarEspacio = (doc, alto) => {
  if (doc.y + alto > finDePagina(doc)) doc.addPage();
};

const logo = (doc, x, y) => {
  doc.save();
  doc.roundedRect(x, y, 30, 30, 7).fill(COLOR.azul);
  doc.roundedRect(x + 7, y + 11, 16, 12, 3).fill('#ffffff');
  doc.moveTo(x + 15, y + 11).lineTo(x + 15, y + 7).lineWidth(1.6).stroke('#ffffff');
  doc.circle(x + 15, y + 6, 1.8).fill('#ffffff');
  doc.circle(x + 12, y + 17, 1.6).fill(COLOR.azul);
  doc.circle(x + 18, y + 17, 1.6).fill(COLOR.azul);
  doc.restore();
};

const encabezado = (doc, codigo, fecha, titulo, subtitulo) => {
  const x = MARGEN.left;
  const y = MARGEN.top;
  logo(doc, x, y);
  doc.fillColor(COLOR.texto).font(B).fontSize(15).text(PROVEEDOR.empresa, x + 38, y + 1, { lineBreak: false });
  doc.fillColor(COLOR.suave).font(R).fontSize(8).text(PROVEEDOR.lema, x + 38, y + 20, { lineBreak: false });
  const derecha = { width: ANCHO, align: 'right' };
  doc.fillColor(COLOR.texto).font(B).fontSize(8.5).text(codigo, x, y, derecha);
  doc.fillColor(COLOR.suave).font(R).fontSize(8.5)
    .text(`Guatemala, ${fechaCorta(fecha)}`, x, y + 12, derecha)
    .text(`Versión de plantilla ${VERSION_PLANTILLA}`, x, y + 24, derecha);
  doc.moveTo(x, y + 40).lineTo(x + ANCHO, y + 40).lineWidth(1.6).stroke(COLOR.azul);
  doc.fillColor(COLOR.texto).font(B).fontSize(14).text(titulo, x, y + 58, { width: ANCHO, align: 'center' });
  doc.moveDown(0.25).fillColor(COLOR.suave).font(R).fontSize(9).text(subtitulo, { width: ANCHO, align: 'center' });
  doc.moveDown(1.4);
};

const seccion = (doc, texto) => {
  asegurarEspacio(doc, 60);
  doc.moveDown(0.6).fillColor(COLOR.seccion).font(B).fontSize(10.5).text(texto, MARGEN.left, doc.y, { width: ANCHO });
  doc.moveDown(0.5);
};

// partes: textos o { b: 'texto en negrita' }.
const parrafo = (doc, partes, { align = 'justify', x = MARGEN.left, width = ANCHO, size = CUERPO, color = COLOR.texto } = {}) => {
  // pdfkit descarta el espacio inicial de un segmento continuado: se pasa al final del anterior.
  const lista = (Array.isArray(partes) ? partes : [partes])
    .map((parte) => (typeof parte === 'object' ? { texto: parte.b, negrita: true } : { texto: parte, negrita: false }));
  lista.forEach((parte, i) => {
    if (i > 0 && /^\s/.test(parte.texto)) {
      lista[i - 1].texto += ' ';
      parte.texto = parte.texto.trimStart();
    }
  });
  doc.fillColor(color).fontSize(size);
  lista.forEach(({ texto, negrita }, i) => {
    const opciones = { width, align, lineGap: 3, continued: i < lista.length - 1 };
    doc.font(negrita ? B : R);
    if (i === 0) doc.text(texto, x, doc.y, opciones);
    else doc.text(texto, opciones);
  });
  doc.moveDown(0.6);
};

const vinetas = (doc, items) => {
  items.forEach((item) => {
    asegurarEspacio(doc, 28);
    const y = doc.y;
    doc.fillColor(COLOR.texto).font(R).fontSize(CUERPO).text('•', MARGEN.left + 4, y, { lineBreak: false });
    doc.y = y;
    parrafo(doc, item, { align: 'left', x: MARGEN.left + 16, width: ANCHO - 16 });
    doc.moveDown(-0.35);
  });
  doc.moveDown(0.5);
};

const PAD = 6;
const CASILLA = { casilla: true };

// columnas: [{ titulo, ancho (fracción), alinear }]. Celdas: texto, { b }, o CASILLA (☐ Sí ☐ No).
// etiquetas: la primera columna va sombreada y en negrita (tablas de dos columnas sin encabezado).
const tabla = (doc, { columnas, filas, encabezado: conEncabezado = true, etiquetas = false, negritaUltima = false }) => {
  const anchos = columnas.map((c) => c.ancho * ANCHO);
  const textoDe = (celda) => (typeof celda === 'object' ? (celda.b ?? 'Sí   No') : String(celda ?? ''));
  const altoDe = (fila, fuente) => Math.max(...fila.map((celda, i) => {
    doc.font(typeof celda === 'object' && celda.b !== undefined ? B : fuente).fontSize(9.5);
    return doc.heightOfString(textoDe(celda), { width: anchos[i] - PAD * 2, lineGap: 2 });
  })) + PAD * 2;

  const dibujarFila = (fila, { fondo, fuente = R, primeraFondo, primeraFuente }) => {
    const alto = altoDe(fila, fuente);
    if (doc.y + alto > finDePagina(doc)) {
      doc.addPage();
      if (conEncabezado) dibujarFila(columnas.map((c) => c.titulo), { fondo: COLOR.encabezado, fuente: B });
    }
    const y = doc.y;
    let x = MARGEN.left;
    fila.forEach((celda, i) => {
      const relleno = i === 0 && primeraFondo ? primeraFondo : fondo;
      if (relleno) doc.rect(x, y, anchos[i], alto).fill(relleno);
      doc.rect(x, y, anchos[i], alto).lineWidth(0.7).stroke(COLOR.borde);
      if (celda === CASILLA) {
        doc.lineWidth(0.7).rect(x + PAD, y + PAD + 1, 8, 8).stroke(COLOR.texto)
          .rect(x + PAD + 30, y + PAD + 1, 8, 8).stroke(COLOR.texto);
        doc.fillColor(COLOR.texto).font(R).fontSize(9.5)
          .text('Sí', x + PAD + 11, y + PAD, { lineBreak: false })
          .text('No', x + PAD + 41, y + PAD, { lineBreak: false });
      } else {
        const negrita = (typeof celda === 'object' && celda.b !== undefined) || (i === 0 && primeraFuente === B);
        doc.fillColor(COLOR.texto).font(negrita ? B : fuente).fontSize(9.5)
          .text(textoDe(celda), x + PAD, y + PAD, { width: anchos[i] - PAD * 2, align: columnas[i].alinear || 'left', lineGap: 2 });
      }
      x += anchos[i];
    });
    doc.y = y + alto;
  };

  if (conEncabezado) dibujarFila(columnas.map((c) => c.titulo), { fondo: COLOR.encabezado, fuente: B });
  filas.forEach((fila, i) => {
    const ultima = negritaUltima && i === filas.length - 1;
    dibujarFila(fila, ultima
      ? { fondo: COLOR.encabezado, fuente: B }
      : { primeraFondo: etiquetas ? COLOR.etiqueta : null, primeraFuente: etiquetas ? B : R });
  });
  doc.x = MARGEN.left;
  doc.moveDown(0.8);
};

const aviso = (doc, partes) => {
  doc.font(R).fontSize(8.5);
  const texto = partes.map((p) => (typeof p === 'object' ? p.b : p)).join('');
  const alto = doc.heightOfString(texto, { width: ANCHO - 24, lineGap: 2 }) + 16;
  asegurarEspacio(doc, alto);
  const y = doc.y;
  doc.rect(MARGEN.left, y, ANCHO, alto).fill(COLOR.aviso);
  doc.rect(MARGEN.left, y, 3, alto).fill(COLOR.avisoBorde);
  doc.y = y + 8;
  parrafo(doc, partes, { align: 'left', x: MARGEN.left + 14, width: ANCHO - 24, size: 8.5 });
  doc.y = y + alto + 10;
};

const recuadro = (doc, alto, leyenda) => {
  asegurarEspacio(doc, alto);
  const y = doc.y;
  doc.lineWidth(0.7);
  if (leyenda) doc.dash(3, { space: 2 });
  doc.rect(MARGEN.left, y, ANCHO, alto).stroke(COLOR.borde).undash();
  if (leyenda) doc.fillColor('#94a3b8').font(R).fontSize(7.5).text(leyenda, MARGEN.left + 8, y + 8);
  doc.y = y + alto + 12;
};

// Dos bloques de firma lado a lado; cada bloque es una lista de renglones bajo la línea.
const firmas = (doc, izquierda, derecha) => {
  asegurarEspacio(doc, 140);
  doc.moveDown(4);
  const y = doc.y;
  const ancho = (ANCHO - 44) / 2;
  [[izquierda, MARGEN.left + 10], [derecha, MARGEN.left + 34 + ancho]].forEach(([renglones, x]) => {
    doc.moveTo(x, y).lineTo(x + ancho, y).lineWidth(1).stroke(COLOR.texto);
    doc.fillColor(COLOR.texto).font(R).fontSize(9.5).text(renglones.join('\n'), x, y + 8, { width: ancho, align: 'center', lineGap: 2 });
  });
  doc.x = MARGEN.left;
  doc.moveDown(1.5);
};

const pies = (doc, codigo, conIniciales) => {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i);
    const inferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 44;
    const izquierda = `${PROVEEDOR.empresa} · ${codigo}${conIniciales ? ' · Iniciales: ______ / ______' : ''}`;
    doc.fillColor(COLOR.suave).font(R).fontSize(7.5)
      .text(izquierda, MARGEN.left, y, { lineBreak: false })
      .text(`Página ${i - start + 1} de ${count}`, MARGEN.left, y, { width: ANCHO, align: 'right', lineBreak: false });
    doc.page.margins.bottom = inferior;
  }
};

const renderizar = (codigo, titulo, conIniciales, dibujar) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({
    size: 'LETTER', margins: MARGEN, bufferPages: true,
    info: { Title: `${codigo} · ${titulo}`, Author: PROVEEDOR.empresa, Creator: 'BotEngine ERP' }
  });
  const partes = [];
  doc.on('data', (parte) => partes.push(parte));
  doc.on('end', () => resolve(Buffer.concat(partes)));
  doc.on('error', reject);
  try {
    dibujar(doc);
    pies(doc, codigo, conIniciales);
    doc.end();
  } catch (error) {
    reject(error);
  }
});

// ---------- Documentos ----------

const modulosDe = (datos) => [...datos.modulos, ...(datos.fel ? ['fel'] : [])]
  .filter((key) => DESCRIPCION_MODULOS[key])
  .map((key) => DESCRIPCION_MODULOS[key]);

const precios = (datos) => {
  const base = Math.round((datos.mensualidad / 1.12) * 100) / 100;
  return { base, iva: Math.round((datos.mensualidad - base) * 100) / 100 };
};

const tablaModulos = (doc, datos) => tabla(doc, {
  columnas: [{ titulo: 'Módulo', ancho: 0.3 }, { titulo: 'Funciones incluidas', ancho: 0.7 }],
  filas: modulosDe(datos).map(([titulo, descripcion]) => [{ b: titulo }, descripcion])
});

const cotizacion = (datos) => {
  const codigo = `${datos.numero}-COT`;
  const { base, iva } = precios(datos);
  return renderizar(codigo, 'Propuesta comercial', false, (doc) => {
    encabezado(doc, codigo, datos.fecha, 'PROPUESTA COMERCIAL Y ACEPTACIÓN DE SERVICIO', 'BotEngine ERP · Licencia de uso mensual');
    seccion(doc, 'DATOS DEL CLIENTE');
    tabla(doc, {
      encabezado: false, etiquetas: true,
      columnas: [{ ancho: 0.34 }, { ancho: 0.66 }],
      filas: [
        ['Razón social', datos.cliente.nombre],
        ['Nombre comercial', datos.cliente.nombre],
        ['NIT', datos.cliente.nit || LINEA],
        ['Dirección fiscal', LINEA],
        ['Contacto', `${datos.cliente.contacto} · ${LINEA} · ${datos.cliente.correo}`]
      ]
    });
    seccion(doc, 'SERVICIO PROPUESTO');
    parrafo(doc, ['Licencia de uso de ', { b: 'BotEngine ERP' }, ` en modalidad de software como servicio (SaaS), alojado y mantenido por ${PROVEEDOR.empresa}, con los siguientes módulos:`]);
    vinetas(doc, modulosDe(datos).map(([titulo, descripcion]) => [{ b: `${titulo}.` }, ` ${descripcion}`]));
    tabla(doc, {
      negritaUltima: true,
      columnas: [{ titulo: 'Concepto', ancho: 0.63 }, { titulo: 'Cantidad', ancho: 0.14, alinear: 'right' }, { titulo: 'Monto mensual', ancho: 0.23, alinear: 'right' }],
      filas: [
        ['Licencia BotEngine ERP (módulos detallados arriba)', '1', dinero(base)],
        ['Usuarios incluidos', String(datos.usuarios), 'Incluido'],
        ['Puntos de venta incluidos', String(datos.puntosVenta), 'Incluido'],
        ['Instalación, configuración inicial y capacitación', '1', 'Sin costo'],
        ['IVA (12%) incluido en el total', '', dinero(iva)],
        ['Total mensual', '', dinero(datos.mensualidad)]
      ]
    });
    parrafo(doc, `Total mensual en letras: ${dineroEnLetras(datos.mensualidad)}.`, { size: 8.5, color: COLOR.suave });
    seccion(doc, 'SERVICIOS OPCIONALES');
    tabla(doc, {
      columnas: [{ titulo: 'Concepto', ancho: 0.54 }, { titulo: 'Precio', ancho: 0.46 }],
      filas: [
        ['Punto de venta adicional (sucursal o caja independiente)', 'según la tarifa vigente al momento de su activación'],
        ['Usuario adicional', 'según la tarifa vigente al momento de su activación'],
        ['Desarrollos o ajustes a medida', 'Se cotizan por separado']
      ]
    });
    aviso(doc, [{ b: 'No incluido:' }, ' el costo de certificación de documentos tributarios electrónicos (FEL). Dicho costo lo cobra directamente el certificador autorizado por la SAT que contrate el cliente. Tampoco incluye equipo de cómputo, impresoras, lectores ni servicio de internet.']);
    seccion(doc, 'CONDICIONES COMERCIALES');
    vinetas(doc, [
      'Modalidad de pago mensual, por adelantado, a más tardar el día 1 de cada mes.',
      `${PROVEEDOR.empresa} emitirá factura electrónica (FEL) por cada mensualidad.`,
      `Plazo inicial de doce (12) meses a partir del ${fechaCorta(datos.inicioCobro)}, con renovación automática.`,
      'Esta propuesta tiene una vigencia de 15 días calendario a partir de su fecha de emisión.',
      'Las condiciones completas se rigen por el contrato de licencia de uso y su Anexo A.'
    ]);
    seccion(doc, 'REQUISITOS PARA ACTIVAR EL SERVICIO');
    vinetas(doc, [
      'Copia del RTU actualizado y constancia de NIT.',
      'Copia del DPI del representante legal y, si aplica, de su nombramiento inscrito en el Registro Mercantil.',
      ...(datos.fel ? ['Constancia de habilitación como emisor FEL en la Agencia Virtual de la SAT y nombre del certificador contratado.'] : []),
      'Listado de usuarios: nombre, correo electrónico y rol de cada uno.',
      `Catálogo inicial de productos en la plantilla de Excel proporcionada por ${PROVEEDOR.empresa}.`
    ]);
    seccion(doc, 'ACEPTACIÓN');
    parrafo(doc, 'El cliente acepta la presente propuesta y solicita la activación del servicio en las condiciones aquí descritas.');
    firmas(doc, ['Nombre:', 'Propietario', datos.cliente.nombre], [PROVEEDOR.representante, 'Propietario', PROVEEDOR.empresa]);
    parrafo(doc, `Fecha de aceptación: ${LINEA}`, { size: 8.5, color: COLOR.suave, align: 'left' });
  });
};

const comparecencia = (nombre, empresaMayusculas, rol) => [
  nombre ? { b: nombre } : LINEA,
  `, de ${LINEA} años de edad, ${LINEA}, ${LINEA}, guatemalteco, con domicilio en el departamento de Guatemala, quien se identifica con el Documento Personal de Identificación (DPI) con Código Único de Identificación (CUI) número ${LINEA}, extendido por el Registro Nacional de las Personas de la República de Guatemala; actúa en su calidad de propietario de la empresa mercantil `,
  { b: empresaMayusculas },
  `, inscrita en el Registro Mercantil General de la República bajo el número ${LINEA}, folio ${LINEA}, del libro ${LINEA} de Empresas Mercantiles, con Número de Identificación Tributaria (NIT) `,
  rol.nit || LINEA,
  '; a quien en lo sucesivo se le denominará ',
  { b: `"${rol.nombre}"` },
  rol.final
];

const contrato = (datos) => {
  const codigo = `${datos.numero}-CTR`;
  const clausula = (doc, titulo, ...texto) => parrafo(doc, [{ b: `${titulo}. ` }, ...texto]);
  const modulos = modulosDe(datos).map(([titulo]) => titulo);
  return renderizar(codigo, 'Contrato', true, (doc) => {
    encabezado(doc, codigo, datos.fecha, 'CONTRATO PRIVADO DE LICENCIA DE USO DE SOFTWARE COMO SERVICIO Y SOPORTE TÉCNICO', `BotEngine ERP · ${datos.cliente.nombre}`);
    parrafo(doc, `En la ciudad de Guatemala, el ${fechaEnLetras(datos.fecha)}, NOSOTROS:`);
    parrafo(doc, comparecencia(PROVEEDOR.representante.toUpperCase(), PROVEEDOR.empresa, { nombre: 'EL PROVEEDOR', final: '; y' }));
    parrafo(doc, comparecencia(null, datos.cliente.nombre.toUpperCase(), { nombre: 'EL CLIENTE', nit: datos.cliente.nit, final: '.' }));
    parrafo(doc, ['Los comparecientes aseguramos ser de los datos de identificación personal consignados, hallarnos en el libre ejercicio de nuestros derechos civiles, que la representación que ejercitamos es suficiente conforme a la ley para la celebración de este acto, y que por este medio celebramos ', { b: 'CONTRATO PRIVADO DE LICENCIA DE USO DE SOFTWARE COMO SERVICIO Y SOPORTE TÉCNICO' }, ', contenido en las cláusulas siguientes:']);
    clausula(doc, 'PRIMERA. OBJETO', 'EL PROVEEDOR otorga a EL CLIENTE una licencia de uso no exclusiva, intransferible y por el plazo de vigencia de este contrato, sobre el sistema informático denominado ', { b: 'BotEngine ERP' }, ' (en adelante "EL SISTEMA"), el cual se presta en modalidad de software como servicio, alojado en servidores administrados por EL PROVEEDOR y accesible por internet. El objeto incluye el alojamiento, mantenimiento, actualizaciones y soporte técnico de EL SISTEMA en los términos de este contrato y su Anexo A.');
    clausula(doc, 'SEGUNDA. ALCANCE DEL SERVICIO', `El servicio contratado comprende los módulos siguientes: ${listaConY(modulos.map((m, i) => (i ? minusculaInicial(m) : m)))}. Incluye hasta ${cantidadEnLetras(datos.usuarios, 'usuario', 'usuarios')} con acceso simultáneo o no, y ${cantidadEnLetras(datos.puntosVenta, 'punto de venta', 'puntos de venta')}. La descripción detallada de cada módulo, los niveles de servicio y las exclusiones constan en el `, { b: 'Anexo A' }, ', que forma parte integrante de este contrato.');
    clausula(doc, 'TERCERA. PRECIO Y FORMA DE PAGO', 'EL CLIENTE pagará a EL PROVEEDOR la cantidad mensual de ', { b: `${dineroEnLetras(datos.mensualidad).toUpperCase()} (${dinero(datos.mensualidad)})` }, `, con el Impuesto al Valor Agregado (IVA) incluido. El pago se efectuará por mes adelantado, a más tardar el día 1 de cada mes calendario, mediante depósito o transferencia a la cuenta que EL PROVEEDOR indique por escrito. La primera mensualidad se pagará el ${fechaEnLetras(datos.inicioCobro)}, fecha de inicio del servicio. EL PROVEEDOR emitirá factura electrónica en línea (FEL) por cada pago recibido. No se cobra cargo por instalación ni configuración inicial.`);
    clausula(doc, 'CUARTA. MORA Y SUSPENSIÓN', 'La falta de pago en la fecha convenida constituirá en mora a EL CLIENTE sin necesidad de requerimiento alguno. Si transcurren quince (15) días calendario desde la fecha de pago sin que este se realice, EL PROVEEDOR podrá suspender el acceso a EL SISTEMA, previo aviso por correo electrónico con al menos tres (3) días de anticipación. La suspensión no implica la eliminación de los datos de EL CLIENTE y el acceso se restablecerá dentro de las veinticuatro (24) horas hábiles siguientes a la acreditación del pago de lo adeudado.');
    clausula(doc, 'QUINTA. PLAZO Y RENOVACIÓN', `El plazo de este contrato es de doce (12) meses contados a partir del ${fechaEnLetras(datos.inicioCobro)}. Al vencimiento se prorrogará automáticamente por períodos iguales, salvo que cualquiera de las partes notifique por escrito a la otra su decisión de no prorrogarlo con al menos treinta (30) días calendario de anticipación al vencimiento. EL PROVEEDOR podrá ajustar el precio para el período de prórroga siguiente, notificándolo con al menos treinta (30) días calendario de anticipación; si EL CLIENTE no está de acuerdo, podrá dar por terminado el contrato al vencimiento del período en curso.`);
    if (datos.fel) {
      clausula(doc, 'SEXTA. FACTURACIÓN ELECTRÓNICA EN LÍNEA (FEL)', 'EL SISTEMA incluye la integración técnica para la emisión de documentos tributarios electrónicos por medio del certificador autorizado por la Superintendencia de Administración Tributaria (SAT) que EL CLIENTE contrate, cuyo nombre EL CLIENTE informará por escrito a EL PROVEEDOR. Corresponde exclusivamente a EL CLIENTE: a) estar inscrito y habilitado como emisor en el régimen FEL ante la SAT; b) contratar y pagar los servicios del certificador, incluyendo el costo por documento certificado, el cual no está incluido en el precio de este contrato; c) la veracidad, el contenido y el cumplimiento de las obligaciones tributarias derivadas de los documentos que emita. EL PROVEEDOR responde por el correcto funcionamiento de la integración, pero no por interrupciones o fallas atribuibles a la SAT o al certificador. En tales casos EL SISTEMA permitirá operar en el modo de contingencia que la normativa FEL establezca.');
    } else {
      clausula(doc, 'SEXTA. FACTURACIÓN ELECTRÓNICA EN LÍNEA (FEL)', 'El servicio contratado no incluye la emisión de documentos tributarios electrónicos. EL CLIENTE podrá solicitar su activación conforme a la cláusula SÉPTIMA; en tal caso le corresponderá exclusivamente estar habilitado como emisor FEL ante la Superintendencia de Administración Tributaria (SAT) y contratar y pagar los servicios del certificador.');
    }
    clausula(doc, 'SÉPTIMA. AMPLIACIONES', 'EL CLIENTE podrá solicitar por escrito la activación de puntos de venta o usuarios adicionales. El precio de cada punto de venta adicional será según la tarifa vigente al momento de su activación, y el de cada usuario adicional, según la tarifa vigente al momento de su activación. Las ampliaciones se sumarán a la mensualidad a partir del mes de su activación. Cualquier desarrollo, módulo o modificación a la medida que no esté descrito en el Anexo A se cotizará y acordará por separado.');
    clausula(doc, 'OCTAVA. PROPIEDAD INTELECTUAL', 'EL SISTEMA, su código fuente y objeto, bases de datos estructurales, diseño, documentación, marcas y nombres comerciales son propiedad exclusiva de EL PROVEEDOR y se encuentran protegidos por la Ley de Derecho de Autor y Derechos Conexos, Decreto 33-98 del Congreso de la República, y la Ley de Propiedad Industrial, Decreto 57-2000. Este contrato no transfiere a EL CLIENTE derecho alguno de propiedad sobre EL SISTEMA ni le da acceso a su código fuente. EL CLIENTE no podrá copiar, modificar, descompilar, aplicar ingeniería inversa, sublicenciar, ceder, arrendar ni permitir el uso de EL SISTEMA a terceros ajenos a su negocio.');
    clausula(doc, 'NOVENA. PROPIEDAD Y TRATAMIENTO DE LOS DATOS', 'Toda la información que EL CLIENTE ingrese en EL SISTEMA, incluyendo productos, inventarios, ventas, clientes y documentos emitidos, es propiedad de EL CLIENTE. EL PROVEEDOR actúa únicamente como encargado de su alojamiento y procesamiento, y la utilizará solo para prestar el servicio objeto de este contrato. EL PROVEEDOR realizará respaldos automáticos diarios de la información. Al terminar el contrato por cualquier causa, EL CLIENTE contará con treinta (30) días calendario para solicitar la exportación de su información en formato de hoja de cálculo o CSV, sin costo adicional; vencido dicho plazo, EL PROVEEDOR eliminará la información de sus servidores, salvo que una disposición legal le obligue a conservarla.');
    clausula(doc, 'DÉCIMA. CONFIDENCIALIDAD', 'Las partes se obligan a guardar confidencialidad sobre toda la información comercial, técnica, financiera o de clientes de la otra parte a la que tengan acceso con motivo de este contrato, y a no divulgarla a terceros sin autorización escrita, salvo requerimiento de autoridad competente. Esta obligación subsistirá por dos (2) años después de terminado el contrato.');
    clausula(doc, 'DÉCIMA PRIMERA. OBLIGACIONES DE EL PROVEEDOR', 'a) Mantener EL SISTEMA disponible conforme a los niveles de servicio del Anexo A; b) aplicar las actualizaciones y correcciones necesarias para su buen funcionamiento; c) brindar soporte técnico por los canales y en los horarios establecidos; d) realizar respaldos de la información; e) capacitar al personal designado por EL CLIENTE en la puesta en marcha; f) mantener medidas razonables de seguridad para proteger la información alojada.');
    clausula(doc, 'DÉCIMA SEGUNDA. OBLIGACIONES DE EL CLIENTE', 'a) Pagar puntualmente el precio convenido; b) custodiar las credenciales de acceso de sus usuarios y responder por el uso que se haga de ellas; c) notificar de inmediato cualquier uso no autorizado; d) utilizar EL SISTEMA únicamente para fines lícitos y propios de su negocio; e) contar con el equipo de cómputo, impresoras y conexión a internet necesarios; f) proporcionar información veraz y oportuna para la configuración del servicio.');
    clausula(doc, 'DÉCIMA TERCERA. LIMITACIÓN DE RESPONSABILIDAD', 'EL PROVEEDOR no será responsable por daños indirectos, lucro cesante o pérdida de oportunidades de negocio derivados del uso o de la imposibilidad de uso de EL SISTEMA. La responsabilidad total de EL PROVEEDOR por cualquier reclamo relacionado con este contrato no excederá el monto efectivamente pagado por EL CLIENTE durante los tres (3) meses anteriores al hecho que lo origine. Ninguna de las partes responderá por incumplimientos causados por caso fortuito o fuerza mayor, conforme al artículo 1426 del Código Civil, incluyendo fallas generalizadas de internet, energía eléctrica o de los servicios de la SAT.');
    clausula(doc, 'DÉCIMA CUARTA. TERMINACIÓN', 'Este contrato terminará: a) por vencimiento del plazo sin prórroga; b) por mutuo acuerdo; c) por decisión unilateral de EL CLIENTE, notificada por escrito con treinta (30) días calendario de anticipación, pagando las mensualidades correspondientes a dicho período de aviso; d) por incumplimiento de cualquiera de las partes que no sea subsanado dentro de los quince (15) días calendario siguientes a su notificación escrita; e) por falta de pago de dos (2) o más mensualidades consecutivas. La terminación no exime a EL CLIENTE del pago de las mensualidades devengadas.');
    clausula(doc, 'DÉCIMA QUINTA. NOTIFICACIONES Y COMUNICACIONES ELECTRÓNICAS', `Las partes señalan como lugar para recibir notificaciones: EL PROVEEDOR, ${LINEA}, correo electrónico ${PROVEEDOR.correo() || LINEA}; EL CLIENTE, ${LINEA}, correo electrónico ${datos.cliente.correo}. Las comunicaciones enviadas a dichos correos electrónicos tendrán plena validez conforme a la Ley para el Reconocimiento de las Comunicaciones y Firmas Electrónicas, Decreto 47-2008 del Congreso de la República. Cualquier cambio deberá notificarse por escrito; mientras no se haga, se tendrán por válidas las notificaciones hechas en los lugares indicados.`);
    clausula(doc, 'DÉCIMA SEXTA. LEY APLICABLE Y JURISDICCIÓN', 'Este contrato se rige por las leyes de la República de Guatemala, en particular por el Código Civil, Decreto-Ley 106, y el Código de Comercio, Decreto 2-70 del Congreso de la República. Para cualquier controversia, las partes procurarán primero un arreglo directo; de no lograrlo, renuncian al fuero de su domicilio y se someten a los tribunales del departamento de Guatemala.');
    clausula(doc, 'DÉCIMA SÉPTIMA. DOCUMENTOS INTEGRANTES', `Forman parte de este contrato: a) el Anexo A, Alcance técnico y niveles de servicio, identificado como ${datos.numero}-ANX; b) la propuesta comercial aceptada, identificada como ${datos.numero}-COT; y c) el acta de entrega y puesta en marcha. En caso de contradicción prevalecerá lo dispuesto en este contrato.`);
    clausula(doc, 'DÉCIMA OCTAVA. ACEPTACIÓN', 'En los términos relacionados, los comparecientes aceptamos el contenido íntegro del presente contrato, el cual, leído íntegramente por nosotros y bien enterados de su contenido, objeto, validez y efectos legales, lo ratificamos, aceptamos y firmamos en dos ejemplares originales de igual valor, uno para cada parte.');
    firmas(doc, [PROVEEDOR.representante, 'EL PROVEEDOR', PROVEEDOR.empresa], ['Nombre:', 'EL CLIENTE', datos.cliente.nombre]);
    recuadro(doc, 110, 'Espacio para auténtica de firmas por Notario (opcional).');
  });
};

const anexo = (datos) => {
  const codigo = `${datos.numero}-ANX`;
  return renderizar(codigo, 'Anexo A', true, (doc) => {
    encabezado(doc, codigo, datos.fecha, 'ANEXO A · ALCANCE TÉCNICO Y NIVELES DE SERVICIO', `Integrante del contrato ${datos.numero}-CTR · ${datos.cliente.nombre}`);
    seccion(doc, '1. MÓDULOS CONTRATADOS');
    tablaModulos(doc, datos);
    seccion(doc, '2. CAPACIDAD CONTRATADA');
    tabla(doc, {
      encabezado: false, etiquetas: true,
      columnas: [{ ancho: 0.34 }, { ancho: 0.66 }],
      filas: [
        ['Usuarios incluidos', String(datos.usuarios)],
        ['Puntos de venta incluidos', String(datos.puntosVenta)],
        ['Punto de venta adicional', 'según la tarifa vigente al momento de su activación'],
        ['Usuario adicional', 'según la tarifa vigente al momento de su activación'],
        ...(datos.fel ? [['Certificador FEL del cliente', datos.certificador || LINEA]] : []),
        ['Acceso', 'Navegador web actualizado (Chrome, Edge, Firefox o Safari) desde computadora, tableta o teléfono, con usuario y contraseña individuales.']
      ]
    });
    seccion(doc, '3. PUESTA EN MARCHA');
    vinetas(doc, [
      'Creación de la empresa, sucursal y usuarios con sus roles.',
      ...(datos.fel ? ['Configuración de la integración FEL con el certificador del cliente y prueba de emisión.'] : []),
      'Carga inicial del catálogo de productos y existencias desde la plantilla de Excel proporcionada por EL PROVEEDOR.',
      'Capacitación de hasta 2 horas, virtual o presencial en la ciudad de Guatemala, para el personal designado.'
    ]);
    seccion(doc, '4. SOPORTE TÉCNICO');
    tabla(doc, {
      encabezado: false, etiquetas: true,
      columnas: [{ ancho: 0.34 }, { ancho: 0.66 }],
      filas: [
        ['Horario', 'lunes a viernes de 8:00 a 17:00 horas (hora de Guatemala), excepto días de asueto oficial.'],
        ['Canales', `WhatsApp ${PROVEEDOR.whatsapp} · correo ${PROVEEDOR.correo() || LINEA}`]
      ]
    });
    tabla(doc, {
      columnas: [{ titulo: 'Prioridad', ancho: 0.18 }, { titulo: 'Situación', ancho: 0.48 }, { titulo: 'Tiempo de primera respuesta', ancho: 0.34, alinear: 'right' }],
      filas: [
        ['Crítica', `EL SISTEMA no está disponible o no permite vender${datos.fel ? ' ni facturar' : ''}.`, '2 horas hábiles'],
        ['Alta', 'Un módulo presenta fallas que afectan la operación, pero existe una alternativa temporal.', '8 horas hábiles'],
        ['Normal', 'Consultas de uso, configuración o reportes.', '2 días hábiles']
      ]
    });
    seccion(doc, '5. DISPONIBILIDAD, RESPALDOS Y SEGURIDAD');
    vinetas(doc, [
      'Disponibilidad objetivo del 99% mensual, excluyendo mantenimientos programados.',
      'Los mantenimientos programados se avisarán con al menos 48 horas de anticipación y se realizarán preferentemente fuera del horario comercial.',
      'Respaldo automático diario de la base de datos, con retención de 30 días.',
      'Conexión cifrada (HTTPS), contraseñas almacenadas de forma cifrada y permisos por rol.'
    ]);
    seccion(doc, '6. EXCLUSIONES');
    vinetas(doc, [
      ...(datos.fel ? ['Costo por documento certificado del certificador FEL.'] : []),
      'Equipo de cómputo, impresoras de tickets, lectores de código de barras, gavetas y conexión a internet.',
      'Desarrollos, reportes o integraciones a la medida no descritos en este anexo.',
      'Migraciones de información histórica de otros sistemas distintas a la carga inicial de productos.',
      `Fallas originadas por uso indebido, equipos del cliente, terceros${datos.fel ? ', la SAT o el certificador' : ''}.`
    ]);
    firmas(doc, [PROVEEDOR.representante, 'EL PROVEEDOR'], ['Nombre:', 'EL CLIENTE']);
  });
};

const acta = (datos) => {
  const codigo = `${datos.numero}-ACT`;
  return renderizar(codigo, 'Acta de entrega', false, (doc) => {
    encabezado(doc, codigo, datos.fecha, 'ACTA DE ENTREGA Y PUESTA EN MARCHA', `Contrato ${datos.numero}-CTR · BotEngine ERP`);
    parrafo(doc, `En la ciudad de Guatemala, a los ${LINEA} días del mes de ${LINEA} de dos mil ${LINEA}, ${PROVEEDOR.representante}, en representación de ${PROVEEDOR.empresa}, y ${LINEA}, en representación de ${datos.cliente.nombre}, hacemos constar la entrega y puesta en marcha de BotEngine ERP conforme al contrato ${datos.numero}-CTR y su Anexo A.`);
    seccion(doc, '1. VERIFICACIÓN DE LA ENTREGA');
    tabla(doc, {
      columnas: [{ titulo: 'Elemento', ancho: 0.62 }, { titulo: 'Conforme', ancho: 0.18 }, { titulo: 'Observación', ancho: 0.2 }],
      filas: [
        ...modulosDe(datos).map(([titulo]) => [`Módulo ${titulo} instalado y funcionando`, CASILLA, '']),
        ['Acceso web con usuario y contraseña para cada usuario', CASILLA, ''],
        ...(datos.fel ? [['Emisión de factura FEL de prueba con el certificador del cliente', CASILLA, '']] : []),
        ['Carga inicial del catálogo de productos y existencias', CASILLA, ''],
        ['Capacitación impartida al personal designado', CASILLA, '']
      ]
    });
    seccion(doc, '2. USUARIOS CREADOS');
    tabla(doc, {
      columnas: [{ titulo: 'No.', ancho: 0.06 }, { titulo: 'Nombre', ancho: 0.34 }, { titulo: 'Correo electrónico', ancho: 0.36 }, { titulo: 'Rol', ancho: 0.24 }],
      filas: Array.from({ length: datos.usuarios }, (_, i) => (i === 0
        ? ['1', datos.cliente.contacto, datos.cliente.correo, 'Administrador']
        : [String(i + 1), '', '', '']))
    });
    seccion(doc, '3. INICIO DEL SERVICIO');
    tabla(doc, {
      encabezado: false, etiquetas: true,
      columnas: [{ ancho: 0.34 }, { ancho: 0.66 }],
      filas: [
        ['Fecha de inicio del cobro', fechaCorta(datos.inicioCobro)],
        ['Mensualidad', `${dinero(datos.mensualidad)} (IVA (12%) incluido en el total)`],
        ['Día de pago', 'A más tardar el día 1 de cada mes'],
        ['Soporte', `WhatsApp ${PROVEEDOR.whatsapp} · ${PROVEEDOR.correo() || LINEA} · lunes a viernes de 8:00 a 17:00 horas`]
      ]
    });
    seccion(doc, '4. OBSERVACIONES');
    recuadro(doc, 70);
    parrafo(doc, 'EL CLIENTE declara recibir EL SISTEMA funcionando a su entera satisfacción, con excepción de lo anotado en observaciones, y acepta que a partir de la fecha indicada inicia el cobro de la mensualidad.');
    firmas(doc, [PROVEEDOR.representante, `Entrega · ${PROVEEDOR.empresa}`], ['Nombre:', `Recibe · ${datos.cliente.nombre}`]);
  });
};

/**
 * Genera los cuatro documentos. datos: { numero, fecha, inicioCobro, cliente: { nombre, nit,
 * contacto, correo }, mensualidad, usuarios, puntosVenta, modulos (claves), fel, certificador }.
 * Devuelve [{ nombre, contenido (Buffer) }] en el orden en que se firman.
 */
const generarDocumentos = async (datos) => {
  const [cot, ctr, anx, act] = await Promise.all([cotizacion(datos), contrato(datos), anexo(datos), acta(datos)]);
  return [
    { nombre: `${datos.numero}-COT.pdf`, contenido: cot },
    { nombre: `${datos.numero}-CTR.pdf`, contenido: ctr },
    { nombre: `${datos.numero}-ANX.pdf`, contenido: anx },
    { nombre: `${datos.numero}-ACT.pdf`, contenido: act }
  ];
};

module.exports = {
  generarDocumentos,
  enLetras,
  dineroEnLetras,
  // Maquetación compartida con las facturas de plataforma (pdfFactura.js).
  maquetacion: { PROVEEDOR, COLOR, R, B, MARGEN, ANCHO, encabezado, seccion, parrafo, tabla, aviso, renderizar, dinero, fechaCorta }
};
