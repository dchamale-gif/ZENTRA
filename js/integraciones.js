// ============================================
// INTEGRACIÓN CON LA PÁGINA WEB
// El administrador de cada empresa conecta la base de datos de su página web; el ERP
// lee de ahí productos, precios y fotos (una vía: web → ERP).
// ============================================

const IntegracionModule = {
    CAMPOS: ['codigo', 'nombre', 'precio', 'costo', 'existencia', 'categoria', 'familia', 'descripcion', 'codigo_barras', 'unidad', 'foto'],
    state: { data: null, initialized: false, busy: false, autoSyncing: null, prueba: null },
    ETIQUETAS: {
        codigo: 'Código o SKU', nombre: 'Nombre', precio: 'Precio de venta', costo: 'Precio de compra (costo)',
        existencia: 'Existencia', categoria: 'Sección o categoría', familia: 'Familia', descripcion: 'Descripción',
        codigo_barras: 'Código de barras', unidad: 'Unidad de medida', foto: 'Foto (base64)'
    },
    // Nombres de columna habituales para proponer el mapeo; el primero que coincida gana.
    SUGERENCIAS: {
        codigo: [/^(sku|codigo|code|cod|referencia|ref)$/i, /^(?!.*(barra|bar)).*(sku|codigo|code)/i],
        nombre: [/^(nombre|name|title|titulo|producto|product|product_name|nombre_producto)$/i, /nombre|name|title|titulo/i],
        costo: [/^(costo|cost|precio_costo|precio_compra|cost_price|purchase_price|costo_unitario|unit_cost)$/i, /cost|compra/i],
        precio: [/^(precio|price|precio_venta|sale_price|regular_price|pvp|precio_publico)$/i, /^(?!.*(cost|compra)).*(precio|price)/i],
        codigo_barras: [/^(codigo_barras|barcode|ean|upc|gtin|cod_barras)$/i, /barra|barcode|ean|gtin/i],
        unidad: [/^(unidad|unit|uom|unidad_medida|medida)$/i],
        categoria: [/categor|seccion|section/i],
        familia: [/familia|family|subcateg/i],
        descripcion: [/descrip|detalle|detail/i],
        existencia: [/^(stock|existencia|existencias|inventario|cantidad|qty|quantity|stock_quantity)$/i, /stock|existencia/i],
        foto: [/foto|imagen|image|img|photo|picture/i]
    },
    TABLA_PRODUCTOS: /product|producto|articulo|article|item|catalog|inventario|sku/i,

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        const form = document.getElementById('integracionForm');
        form?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.save();
        });
        document.getElementById('intProbarBtn')?.addEventListener('click', () => this.probar());
        document.getElementById('intSyncBtn')?.addEventListener('click', () => this.sincronizar());
        document.getElementById('intQuitarBtn')?.addEventListener('click', () => this.quitar());
        document.getElementById('intInventario')?.addEventListener('change', () => this.explicarInventario());
        document.getElementById('intMotor')?.addEventListener('change', (event) => {
            document.getElementById('intPuerto').placeholder = event.target.value === 'mysql' ? '3306' : '5432';
        });
    },

    // Se llama al entrar a Configuración.
    async load() {
        if (!AccessControl.isAdmin()) return;
        this.init();
        try {
            const data = await this.request('/api/integraciones/web');
            this.state.data = data.integracion;
            this.fill();
        } catch (error) {
            this.showError(error.message);
        }
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(data.error || `Error ${response.status}`), { status: response.status });
        return data;
    },

    field(id) {
        return document.getElementById(id);
    },

    fill() {
        const info = this.state.data;
        const config = info.config || {};
        this.field('intMotor').value = config.motor || 'mysql';
        this.field('intHost').value = config.host || '';
        this.field('intPuerto').value = config.puerto || '';
        this.field('intPuerto').placeholder = (config.motor || 'mysql') === 'mysql' ? '3306' : '5432';
        this.field('intBase').value = config.base || '';
        this.field('intUsuario').value = config.usuario || '';
        this.field('intPassword').value = '';
        this.field('intPasswordHint').textContent = info.passwordGuardada
            ? 'Hay una contraseña guardada (cifrada). Escribe otra solo si quieres cambiarla.'
            : 'Se guarda cifrada.';
        this.field('intSsl').checked = Boolean(config.ssl);
        this.field('intTabla').value = config.tabla || '';
        this.CAMPOS.forEach((campo) => {
            this.field(`intCol-${campo}`).value = config.columnas?.[campo] || '';
        });
        // Configuraciones anteriores: copiarExistencia true equivalía a «siempre».
        this.field('intInventario').value = config.inventarioDesdeWeb
            || (config.motor ? (config.copiarExistencia ? 'siempre' : 'nunca') : 'inicial');
        this.explicarInventario();
        this.field('intAuto').value = String(config.autoMinutos ?? 5);
        this.field('intActiva').checked = info.configurada ? info.activa : true;

        this.fillOptions('intHosts', info.servidoresAutorizados);
        this.field('intHostHint').textContent = info.servidoresAutorizados.length
            ? `Autorizados: ${info.servidoresAutorizados.join(', ')}`
            : '';
        this.field('intSyncBtn').hidden = !info.configurada;
        this.field('intQuitarBtn').hidden = !info.configurada;

        const aviso = this.field('integracionAviso');
        const motivo = !info.habilitada
            ? 'Las integraciones aún no están habilitadas en este servidor. Pide a soporte que las active.'
            : !info.servidoresAutorizados.length
                ? 'Aún no hay servidores de base de datos autorizados. Pide a soporte que autorice el de tu página web.'
                : '';
        aviso.hidden = !motivo;
        aviso.querySelector('span').textContent = motivo;

        const pill = this.field('integracionPill');
        pill.hidden = !info.configurada;
        pill.textContent = info.activa ? 'Activa' : 'Pausada';
        pill.className = `status-pill ${info.activa ? 'is-ok' : 'is-off'}`;
        this.renderEstado();
        this.showError('');
    },

    // Qué hace el modo elegido y qué permiso necesita el usuario de la base de la web.
    explicarInventario() {
        const modo = this.field('intInventario').value;
        const textos = {
            dosVias: 'La existencia se suma desde los dos lados: lo que compres o vendas en el ERP llega a la web y lo que se venda en la web llega al ERP. El precio de compra solo se copia al crear el artículo.',
            inicial: 'La web da la existencia y el costo al crear cada artículo; después los llevan las compras y ventas del ERP y la web no se entera.',
            siempre: 'Cada sincronización reemplaza existencia y costo por los de la web. No registres compras en el ERP: se perderían.',
            nunca: 'El ERP lleva existencia y costo desde cero; la web no los toca.'
        };
        this.field('intInventarioHint').textContent = textos[modo];
        this.field('intUsuarioHint').textContent = modo === 'dosVias'
            ? `Este usuario necesita permiso para modificar la columna de existencia${this.field('intCol-existencia').value.trim() ? ` («${this.field('intCol-existencia').value.trim()}»)` : ''}; con el resto basta leer.`
            : 'Usa un usuario que solo pueda leer.';
    },

    fillOptions(id, values = []) {
        this.field(id).innerHTML = values.map((value) => `<option value="${this.escape(value)}"></option>`).join('');
    },

    renderEstado() {
        const info = this.state.data;
        const estado = this.field('integracionEstado');
        if (!info?.ultimaSync) {
            estado.textContent = info?.configurada ? 'Todavía no se ha sincronizado.' : '';
            return;
        }
        const cuando = new Date(info.ultimaSync).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
        const r = info.resultado || {};
        estado.textContent = r.ok === false
            ? `Última sincronización (${cuando}) falló: ${r.error}`
            : `Última sincronización: ${cuando} · ${this.resumen(r)}${r.errores?.length ? ` ${r.errores.slice(0, 3).join('. ')}${r.errores.length > 3 ? '…' : '.'}` : ''}`;
        estado.classList.toggle('is-error', r.ok === false);
    },

    resumen(r) {
        const partes = [
            `${r.total ?? 0} productos en la web`,
            r.creados ? `${r.creados} nuevos` : '',
            r.actualizados ? `${r.actualizados} actualizados` : '',
            r.sinCambios ? `${r.sinCambios} sin cambios` : '',
            r.fotosDescargadas ? `${r.fotosDescargadas} fotos nuevas` : '',
            r.enviadosWeb ? `existencia enviada a la web en ${r.enviadosWeb}` : '',
            r.recibidosWeb ? `existencia recibida de la web en ${r.recibidosWeb}` : '',
            r.fallidos ? `${r.fallidos} con error` : ''
        ].filter(Boolean);
        return `${partes.join(', ')}${r.segundos !== undefined ? ` (${r.segundos} s)` : ''}.`;
    },

    readForm() {
        const columnas = {};
        this.CAMPOS.forEach((campo) => {
            const value = this.field(`intCol-${campo}`).value.trim();
            if (value) columnas[campo] = value;
        });
        return {
            motor: this.field('intMotor').value,
            host: this.field('intHost').value.trim(),
            puerto: this.field('intPuerto').value.trim() || null,
            base: this.field('intBase').value.trim(),
            usuario: this.field('intUsuario').value.trim(),
            password: this.field('intPassword').value,
            ssl: this.field('intSsl').checked,
            tabla: this.field('intTabla').value.trim(),
            columnas,
            inventarioDesdeWeb: this.field('intInventario').value,
            autoMinutos: Number(this.field('intAuto').value),
            activa: this.field('intActiva').checked
        };
    },

    // Revisa en el navegador lo que el servidor rechazaría, y enfoca el primer campo.
    validate(config, { requireMapping }) {
        if (requireMapping && config.inventarioDesdeWeb === 'dosVias' && !config.columnas.existencia) {
            this.showError('Para sincronizar la existencia en las dos direcciones indica la columna de existencia.');
            this.field('intCol-existencia').focus();
            return false;
        }
        const missing = [
            ['intHost', config.host, 'el servidor'],
            ['intBase', config.base, 'la base de datos'],
            ['intUsuario', config.usuario, 'el usuario'],
            ...(requireMapping ? [
                ['intTabla', config.tabla, 'la tabla de productos'],
                ['intCol-codigo', config.columnas.codigo, 'la columna del código'],
                ['intCol-nombre', config.columnas.nombre, 'la columna del nombre']
            ] : [])
        ].find(([, value]) => !value);
        if (!missing) return true;
        this.showError(`Falta ${missing[2]}.`);
        this.field(missing[0]).focus();
        return false;
    },

    async withBusy(button, task) {
        if (this.state.busy) return;
        this.state.busy = true;
        button.disabled = true;
        this.showError('');
        try {
            await task();
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.state.busy = false;
            button.disabled = false;
        }
    },

    probar() {
        const config = this.readForm();
        if (!this.validate(config, { requireMapping: false })) return;
        const box = this.field('integracionPrueba');
        return this.withBusy(this.field('intProbarBtn'), async () => {
            box.hidden = false;
            box.className = 'integracion-prueba';
            box.textContent = config.tabla ? `Leyendo «${config.tabla}»…` : 'Conectando…';
            try {
                let data = await this.request('/api/integraciones/web/probar', { method: 'POST', body: JSON.stringify(config) });
                this.fillOptions('intTablas', data.tablas);
                this.fillOptions('intColumnas', data.columnas);
                // Tabla nueva: se proponen las columnas por su nombre, sin tocar lo ya escrito, y
                // si con eso ya hay código y nombre se vuelve a leer para mostrar los productos.
                if (config.tabla && data.columnas.length && this.sugerirColumnas(data.columnas) && !data.muestra.length) {
                    const conSugerencias = this.readForm();
                    if (conSugerencias.columnas.codigo && conSugerencias.columnas.nombre) {
                        data = await this.request('/api/integraciones/web/probar', { method: 'POST', body: JSON.stringify(conSugerencias) });
                    }
                }
                this.state.prueba = { ...data, tabla: config.tabla };
                box.classList.add('is-ok');
                box.innerHTML = this.renderPrueba(data, this.readForm());
                this.bindPrueba(box);
            } catch (error) {
                box.hidden = true;
                throw error;
            }
        });
    },

    // Elegir una tabla en el explorador: se escribe en el formulario y se vuelve a probar.
    elegirTabla(nombre) {
        if (this.field('intTabla').value.trim() !== nombre) {
            this.CAMPOS.forEach((campo) => { this.field(`intCol-${campo}`).value = ''; });
        }
        this.field('intTabla').value = nombre;
        this.probar();
    },

    // Devuelve true si propuso alguna columna.
    sugerirColumnas(columnas) {
        let propuso = false;
        const usadas = new Set(this.CAMPOS.map((campo) => this.field(`intCol-${campo}`).value.trim()).filter(Boolean));
        this.CAMPOS.forEach((campo) => {
            const input = this.field(`intCol-${campo}`);
            if (input.value.trim()) return;
            for (const patron of this.SUGERENCIAS[campo]) {
                const columna = columnas.find((nombre) => !usadas.has(nombre) && patron.test(nombre));
                if (columna) {
                    input.value = columna;
                    usadas.add(columna);
                    propuso = true;
                    break;
                }
            }
        });
        return propuso;
    },

    // Campo del ERP al que está asignada una columna, según el formulario.
    campoDe(columna) {
        return this.CAMPOS.find((campo) => this.field(`intCol-${campo}`).value.trim() === columna) || '';
    },

    renderPrueba(data, config) {
        const esc = (value) => this.escape(value ?? '');
        const partes = [`<p><strong>Conexión correcta.</strong> La base tiene ${data.esquema.length} tabla${data.esquema.length === 1 ? '' : 's'}. ${config.tabla
            ? `Estás usando «${esc(config.tabla)}»; puedes elegir otra abajo.`
            : 'Elige la que tiene los productos: las que parecen de productos salen primero.'}</p>`];
        partes.push(this.renderExplorador(data.esquema, config.tabla));
        if (config.tabla) partes.push(this.renderVistaPrevia(data, config.tabla));
        if (data.faltantes?.length) {
            partes.push(`<p class="integracion-aviso-columnas">Estas columnas del formulario no existen en «${esc(config.tabla)}»: ${data.faltantes.map(esc).join(', ')}. Corrígelas o elige la columna correcta arriba.</p>`);
        } else if (config.tabla && !data.muestra.length) {
            partes.push('<p>Indica cuál columna es el <strong>código</strong> y cuál el <strong>nombre</strong> (con los selectores de arriba) y vuelve a probar para ver cómo se leerán los productos.</p>');
        }
        if (data.muestra.length) {
            const rows = data.muestra.map((row) => `<tr><td>${esc(row.codigo)}</td><td>${esc(row.nombre)}</td><td class="text-right">${esc(row.precio)}</td><td class="text-right">${esc(row.costo)}</td><td class="text-right">${esc(row.existencia)}</td><td>${esc(row.categoria)}</td><td>${esc(row.foto)}</td></tr>`).join('');
            partes.push(`<p><strong>${data.total} productos</strong> en «${esc(config.tabla)}». Así se leerán los primeros:</p>
                <div class="table-responsive"><table class="data-table">
                    <thead><tr><th>Código</th><th>Nombre</th><th class="text-right">Precio</th><th class="text-right">Costo</th><th class="text-right">Existencia</th><th>Sección</th><th>Foto</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>`);
        }
        return partes.join('');
    },

    renderExplorador(esquema, tablaActual) {
        const esc = (value) => this.escape(value ?? '');
        const ordenadas = [...esquema].sort((a, b) =>
            Number(this.TABLA_PRODUCTOS.test(b.nombre)) - Number(this.TABLA_PRODUCTOS.test(a.nombre)));
        const filas = (tabla) => tabla.filas === null ? '' : ` · ~${tabla.filas.toLocaleString('es-GT')} filas`;
        return `<div class="int-explorador">
            ${esquema.length > 8 ? '<input type="search" class="form-input int-filtro" placeholder="Buscar tabla o columna" aria-label="Buscar tabla o columna">' : ''}
            <ul class="int-tablas">${ordenadas.map((tabla) => `
                <li data-buscar="${esc([tabla.nombre, ...tabla.columnas.map((c) => c.nombre)].join(' ').toLowerCase())}">
                    <button type="button" class="int-tabla${tabla.nombre === tablaActual ? ' is-actual' : ''}" data-tabla="${esc(tabla.nombre)}" aria-pressed="${tabla.nombre === tablaActual}">
                        <span class="int-tabla-nombre">${esc(tabla.nombre)}${this.TABLA_PRODUCTOS.test(tabla.nombre) ? ' <span class="int-chip">Parece de productos</span>' : ''}</span>
                        <span class="int-tabla-meta">${tabla.columnas.length} columnas${filas(tabla)}</span>
                        <span class="int-tabla-columnas">${tabla.columnas.map((c) => esc(c.nombre)).join(', ')}</span>
                    </button>
                </li>`).join('')}
            </ul>
        </div>`;
    },

    // Primeras filas con todas las columnas; en cada encabezado se elige a qué dato del ERP corresponde.
    renderVistaPrevia(data, tabla) {
        const esc = (value) => this.escape(value ?? '');
        const tipos = new Map((data.esquema.find((t) => t.nombre === tabla)?.columnas || []).map((c) => [c.nombre, c.tipo]));
        const opciones = (columna) => {
            const actual = this.campoDe(columna);
            return `<option value="">No usar</option>${this.CAMPOS.map((campo) =>
                `<option value="${campo}"${campo === actual ? ' selected' : ''}>${this.ETIQUETAS[campo]}</option>`).join('')}`;
        };
        const encabezados = data.columnas.map((columna) => `
            <th scope="col"><span class="int-col-nombre">${esc(columna)}</span><span class="int-col-tipo">${esc(tipos.get(columna) || '')}</span>
                <select class="form-input int-usar" data-columna="${esc(columna)}" aria-label="Usar la columna ${esc(columna)} como">${opciones(columna)}</select></th>`).join('');
        const filas = data.vistaPrevia.length
            ? data.vistaPrevia.map((row) => `<tr>${data.columnas.map((columna) =>
                `<td title="${esc(row[columna])}">${row[columna] === null || row[columna] === undefined ? '<span class="int-nulo">vacío</span>' : esc(row[columna])}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${data.columnas.length}">La tabla está vacía.</td></tr>`;
        return `<p class="int-vista-titulo"><strong>«${esc(tabla)}»</strong>: primeras filas. Usa los selectores para decir qué guarda cada columna.</p>
            <div class="table-responsive int-vista"><table class="data-table">
                <thead><tr>${encabezados}</tr></thead>
                <tbody>${filas}</tbody>
            </table></div>`;
    },

    bindPrueba(box) {
        box.querySelectorAll('[data-tabla]').forEach((button) => {
            button.addEventListener('click', () => this.elegirTabla(button.dataset.tabla));
        });
        box.querySelector('.int-filtro')?.addEventListener('input', (event) => {
            const texto = event.target.value.trim().toLowerCase();
            box.querySelectorAll('.int-tablas li').forEach((item) => {
                item.hidden = Boolean(texto) && !item.dataset.buscar.includes(texto);
            });
        });
        box.querySelectorAll('.int-usar').forEach((select) => {
            select.addEventListener('change', () => {
                const columna = select.dataset.columna;
                // La columna deja el dato que tenía; el dato elegido deja la columna anterior.
                const anterior = this.campoDe(columna);
                if (anterior) this.field(`intCol-${anterior}`).value = '';
                if (select.value) this.field(`intCol-${select.value}`).value = columna;
                box.querySelectorAll('.int-usar').forEach((other) => { other.value = this.campoDe(other.dataset.columna); });
            });
        });
    },

    save() {
        const config = this.readForm();
        if (!this.validate(config, { requireMapping: true })) return;
        return this.withBusy(this.field('intGuardarBtn'), async () => {
            const data = await this.request('/api/integraciones/web', { method: 'PUT', body: JSON.stringify(config) });
            this.state.data = data.integracion;
            this.fill();
            showNotification('Conexión con la página web guardada. Pulsa «Sincronizar ahora» para traer los productos.', 'success');
        });
    },

    sincronizar() {
        const button = this.field('intSyncBtn');
        return this.withBusy(button, async () => {
            const estado = this.field('integracionEstado');
            estado.classList.remove('is-error');
            estado.textContent = 'Sincronizando… puede tardar si hay muchas fotos nuevas.';
            try {
                const data = await this.request('/api/integraciones/web/sincronizar', { method: 'POST', body: '{}' });
                showNotification(`Sincronización lista: ${this.resumen(data.resultado)}`, data.resultado.fallidos ? 'warning' : 'success');
            } finally {
                await this.load();
            }
        });
    },

    async quitar() {
        if (!confirm('¿Quitar la conexión con la página web? Se borran las credenciales guardadas. Los artículos y fotos ya importados se quedan.')) return;
        await this.withBusy(this.field('intQuitarBtn'), async () => {
            const data = await this.request('/api/integraciones/web', { method: 'DELETE' });
            this.state.data = data.integracion;
            this.fill();
            this.field('integracionPrueba').hidden = true;
            showNotification('Conexión con la página web quitada.', 'success');
        });
    },

    // La piden el punto de venta y Artículos al abrirse. Devuelve true si cambió algo.
    // El servidor decide si toca según el intervalo configurado; los errores no interrumpen a quien vende.
    async autoSync() {
        if (this.state.autoSyncing) return this.state.autoSyncing;
        this.state.autoSyncing = (async () => {
            try {
                const response = await fetch(`${authManager.apiBaseUrl}/api/integraciones/web/sincronizar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ auto: true })
                });
                if (!response.ok) return false;
                const { resultado } = await response.json();
                return Boolean(resultado && (resultado.creados || resultado.actualizados));
            } catch {
                return false;
            } finally {
                this.state.autoSyncing = null;
            }
        })();
        return this.state.autoSyncing;
    },

    showError(message) {
        const error = this.field('integracionError');
        if (!error) return;
        error.textContent = message;
        error.hidden = !message;
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
