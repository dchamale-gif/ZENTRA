// ============================================
// INTEGRACIÓN CON LA PÁGINA WEB
// El administrador de cada empresa conecta la base de datos de su página web; el ERP
// lee de ahí productos, precios y fotos (una vía: web → ERP).
// ============================================

const IntegracionModule = {
    CAMPOS: ['codigo', 'nombre', 'precio', 'categoria', 'familia', 'descripcion', 'existencia', 'foto'],
    state: { data: null, initialized: false, busy: false, autoSyncing: null },

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
        this.field('intCopiarExistencia').checked = Boolean(config.copiarExistencia);
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
            copiarExistencia: this.field('intCopiarExistencia').checked,
            autoMinutos: Number(this.field('intAuto').value),
            activa: this.field('intActiva').checked
        };
    },

    // Revisa en el navegador lo que el servidor rechazaría, y enfoca el primer campo.
    validate(config, { requireMapping }) {
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
            box.textContent = 'Conectando…';
            try {
                const data = await this.request('/api/integraciones/web/probar', { method: 'POST', body: JSON.stringify(config) });
                this.fillOptions('intTablas', data.tablas);
                this.fillOptions('intColumnas', data.columnas);
                box.classList.add('is-ok');
                box.innerHTML = this.renderPrueba(data, config);
            } catch (error) {
                box.hidden = true;
                throw error;
            }
        });
    },

    renderPrueba(data, config) {
        const esc = (value) => this.escape(value ?? '');
        if (!config.tabla) {
            return `<p><strong>Conexión correcta.</strong> Encontré ${data.tablas.length} tablas; elige la de productos en el campo «Tabla de productos» y vuelve a probar.</p>`;
        }
        if (!data.muestra.length) {
            return `<p><strong>Conexión correcta.</strong> La tabla tiene ${data.columnas.length} columnas: ${data.columnas.map(esc).join(', ')}. Indica cuál es el código y cuál el nombre y vuelve a probar.</p>`;
        }
        const rows = data.muestra.map((row) => `<tr><td>${esc(row.codigo)}</td><td>${esc(row.nombre)}</td><td class="text-right">${esc(row.precio)}</td><td>${esc(row.categoria)}</td><td>${esc(row.foto)}</td></tr>`).join('');
        return `<p><strong>Conexión correcta.</strong> ${data.total} productos en «${esc(config.tabla)}». Así se leerán los primeros:</p>
            <div class="table-responsive"><table class="data-table">
                <thead><tr><th>Código</th><th>Nombre</th><th class="text-right">Precio</th><th>Sección</th><th>Foto</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>`;
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
