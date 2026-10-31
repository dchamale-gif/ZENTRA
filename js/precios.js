// ============================================
// PRECIOS
// El precio de venta sugerido sale del precio de compra y el margen de beneficio (sobre el
// costo). Lo sugerido no cambia nada hasta publicarlo: entonces lo ve el punto de venta y,
// si la página web está conectada, también la web.
// ============================================

const PreciosModule = {
    state: { data: null, seleccion: new Set(), initialized: false, busy: false },

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        this.field('preciosConfigForm').addEventListener('submit', (event) => {
            event.preventDefault();
            this.guardarConfig();
        });
        ['preciosBuscar', 'preciosFiltro', 'preciosSeccion'].forEach((id) => {
            this.field(id).addEventListener(id === 'preciosBuscar' ? 'input' : 'change', () => this.render());
        });
        this.field('preciosTodos').addEventListener('change', (event) => {
            this.visibles().forEach((articulo) => {
                if (event.target.checked) this.state.seleccion.add(articulo.id);
                else this.state.seleccion.delete(articulo.id);
            });
            this.render();
        });
        this.field('preciosAplicarMargen').addEventListener('click', () => this.aplicarMargen());
        this.field('preciosPublicar').addEventListener('click', () => this.publicar([...this.state.seleccion]));
    },

    field(id) {
        return document.getElementById(id);
    },

    puedeEditar() {
        return AccessControl.canEdit('articulos');
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    },

    async load() {
        this.init();
        try {
            this.state.data = await this.request('/api/precios');
            const { config } = this.state.data;
            this.field('preciosMargenDefecto').value = config.margenDefecto;
            this.field('preciosRedondeo').value = String(config.redondeo);
            const secciones = [...new Set(this.state.data.articulos.map((a) => a.seccion).filter(Boolean))].sort();
            const actual = this.field('preciosSeccion').value;
            this.field('preciosSeccion').innerHTML = '<option value="">Todas las secciones</option>' +
                secciones.map((seccion) => `<option value="${this.escape(seccion)}">${this.escape(seccion)}</option>`).join('');
            this.field('preciosSeccion').value = secciones.includes(actual) ? actual : '';
            // Si no hay nada por publicar, se muestran todos para no ver una tabla vacía.
            if (!this.state.data.resumen.pendientes && this.field('preciosFiltro').value === 'pendientes') {
                this.field('preciosFiltro').value = 'todos';
            }
            const ids = new Set(this.state.data.articulos.map((a) => a.id));
            this.state.seleccion = new Set([...this.state.seleccion].filter((id) => ids.has(id)));
            this.field('preciosConfigForm').querySelectorAll('input, select, button').forEach((element) => {
                element.disabled = !this.puedeEditar();
            });
            this.render();
        } catch (error) {
            this.field('preciosBody').innerHTML = `<tr><td colspan="7">${this.escape(error.message)}</td></tr>`;
        }
    },

    visibles() {
        const data = this.state.data;
        if (!data) return [];
        const texto = this.field('preciosBuscar').value.trim().toLowerCase();
        const filtro = this.field('preciosFiltro').value;
        const seccion = this.field('preciosSeccion').value;
        return data.articulos.filter((a) =>
            (filtro === 'todos' || (filtro === 'pendientes' ? a.pendiente : a.sugerido === null)) &&
            (!seccion || a.seccion === seccion) &&
            (!texto || `${a.nombre} ${a.codigo}`.toLowerCase().includes(texto)));
    },

    render() {
        const data = this.state.data;
        if (!data) return;
        const q = (value) => (value === null || value === undefined ? '—' : formatQ(value));
        this.field('preciosResumen').innerHTML = [
            ['Por publicar', data.resumen.pendientes, data.resumen.pendientes ? 'is-warning' : ''],
            ['Sin precio de compra', data.resumen.sinCosto, ''],
            ['Margen por defecto', `${data.config.margenDefecto} %`, '']
        ].map(([label, value, tone]) => `<div class="stat-tile ${tone}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`).join('');

        const filas = this.visibles();
        const editar = this.puedeEditar();
        const body = this.field('preciosBody');
        if (!filas.length) {
            const filtro = this.field('preciosFiltro').value;
            body.innerHTML = `<tr><td colspan="7">${filtro === 'pendientes'
                ? 'No hay precios por publicar: todos coinciden con su margen.'
                : 'Ningún artículo coincide con la búsqueda.'}</td></tr>`;
        } else {
            body.innerHTML = filas.map((a) => {
                const diferencia = a.sugerido !== null ? a.sugerido - a.publicado : null;
                return `<tr class="${a.pendiente ? 'precio-pendiente' : ''}">
                    <td><input type="checkbox" data-sel="${this.escape(a.id)}" aria-label="Seleccionar ${this.escape(a.nombre)}" ${this.state.seleccion.has(a.id) ? 'checked' : ''} ${editar ? '' : 'disabled'}></td>
                    <td><strong>${this.escape(a.nombre)}</strong><br><small class="text-muted">${this.escape(a.codigo || '')}${a.seccion ? ` · ${this.escape(a.seccion)}` : ''}</small></td>
                    <td class="text-right">${a.costo ? q(a.costo) : '<span class="text-muted">Sin costo</span>'}</td>
                    <td class="text-right">
                        <input type="text" class="form-input precio-margen" inputmode="decimal" data-margen="${this.escape(a.id)}"
                            value="${a.margenPropio ?? ''}" placeholder="${data.config.margenDefecto}" aria-label="Margen de ${this.escape(a.nombre)} (%)" ${editar ? '' : 'disabled'}>
                        ${a.margenActual !== null ? `<small class="text-muted">hoy ${a.margenActual} %</small>` : ''}
                    </td>
                    <td class="text-right">${q(a.publicado)}</td>
                    <td class="text-right">${a.sugerido === null ? '—' : `<strong>${q(a.sugerido)}</strong>${a.pendiente
                        ? `<br><small class="${diferencia > 0 ? 'precio-sube' : 'precio-baja'}">${diferencia > 0 ? '+' : '−'}${formatQ(Math.abs(diferencia))}</small>` : ''}`}</td>
                    <td>${editar && a.pendiente ? `<button type="button" class="btn btn-secondary btn-small" data-publicar="${this.escape(a.id)}">Publicar</button>` : ''}</td>
                </tr>`;
            }).join('');
        }

        body.querySelectorAll('[data-sel]').forEach((check) => check.addEventListener('change', () => {
            if (check.checked) this.state.seleccion.add(check.dataset.sel);
            else this.state.seleccion.delete(check.dataset.sel);
            this.renderBulk();
        }));
        body.querySelectorAll('[data-margen]').forEach((input) => input.addEventListener('change', () => this.cambiarMargen(input)));
        body.querySelectorAll('[data-publicar]').forEach((button) => button.addEventListener('click', () => this.publicar([button.dataset.publicar], button)));
        this.field('preciosTodos').checked = filas.length > 0 && filas.every((a) => this.state.seleccion.has(a.id));
        this.field('preciosTodos').disabled = !editar;
        this.renderBulk();
    },

    renderBulk() {
        const n = this.state.seleccion.size;
        this.field('preciosBulk').hidden = n === 0 || !this.puedeEditar();
        this.field('preciosSeleccion').textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
    },

    // Margen escrito en la fila: se guarda al salir del campo y se recalcula el sugerido.
    async cambiarMargen(input) {
        const valor = input.value.trim().replace(',', '.');
        await this.run(async () => {
            await this.request('/api/precios/margen', { method: 'PUT', body: JSON.stringify({ ids: [input.dataset.margen], margen: valor }) });
            await this.load();
        });
    },

    async aplicarMargen() {
        const valor = this.field('preciosMargenLote').value.trim().replace(',', '.');
        const n = this.state.seleccion.size;
        if (!confirm(valor
            ? `¿Poner margen de ${valor} % a ${n} artículo${n === 1 ? '' : 's'}? Los precios no cambian hasta que los publiques.`
            : `¿Quitar el margen propio a ${n} artículo${n === 1 ? '' : 's'} para que usen el de la empresa?`)) return;
        await this.run(async () => {
            const data = await this.request('/api/precios/margen', { method: 'PUT', body: JSON.stringify({ ids: [...this.state.seleccion], margen: valor }) });
            this.field('preciosMargenLote').value = '';
            showNotification(data.message, 'success');
            await this.load();
        });
    },

    async publicar(ids, button) {
        const articulos = this.state.data.articulos.filter((a) => ids.includes(a.id));
        const sinSugerido = articulos.filter((a) => a.sugerido === null);
        if (sinSugerido.length) {
            showNotification(`${sinSugerido.length} sin precio de compra no se pueden calcular; quítalos de la selección o ponles costo.`, 'warning');
            return;
        }
        if (articulos.length > 1 && !confirm(`¿Publicar ${articulos.length} precios? Se actualizan el punto de venta y la página web.`)) return;
        await this.run(async () => {
            const data = await this.request('/api/precios/publicar', {
                method: 'POST',
                body: JSON.stringify({ items: articulos.map((a) => ({ id: a.id })) })
            });
            ids.forEach((id) => this.state.seleccion.delete(id));
            showNotification(data.message, data.web && !data.web.ok ? 'warning' : 'success');
            await this.load();
        }, button);
    },

    async guardarConfig() {
        await this.run(async () => {
            const data = await this.request('/api/precios/config', {
                method: 'PUT',
                body: JSON.stringify({
                    margenDefecto: this.field('preciosMargenDefecto').value.trim().replace(',', '.'),
                    redondeo: Number(this.field('preciosRedondeo').value)
                })
            });
            showNotification(`${data.message}. Revisa los precios sugeridos y publícalos.`, 'success');
            await this.load();
        }, this.field('preciosConfigGuardar'));
    },

    async run(task, button) {
        if (this.state.busy) return;
        this.state.busy = true;
        if (button) button.disabled = true;
        try {
            await task();
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            this.state.busy = false;
            if (button) button.disabled = false;
        }
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
