// ============================================
// DIRECTORIO: CLIENTES Y PROVEEDORES
// ============================================
// Módulo genérico de listado + alta/edición/baja + carga masiva.

const createDirectoryModule = (cfg) => ({
    state: { items: [], search: '', initialized: false },

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        const $ = (suffix) => document.getElementById(`${cfg.prefix}${suffix}`);

        $('AddBtn')?.addEventListener('click', () => this.openForm());
        $('ImportBtn')?.addEventListener('click', () => this.openImport());
        $('Search')?.addEventListener('input', (event) => {
            this.state.search = event.target.value.trim().toLowerCase();
            this.render();
        });
        $('Table')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const item = this.state.items.find((entry) => entry.id === button.dataset.id);
            if (button.dataset.action === 'edit' && item) this.openForm(item);
            if (button.dataset.action === 'history' && item) this.openHistory(item);
            if (button.dataset.action === 'delete' && item) this.remove(item);
        });
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        if (!response) throw new Error('Sesión expirada');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    },

    async load() {
        try {
            const data = await this.request(cfg.endpoint);
            this.state.items = data[cfg.listKey] || [];
            this.render();
        } catch (error) {
            this.renderMessage(error.message, true);
        }
    },

    renderMessage(message, isError) {
        const body = document.querySelector(`#${cfg.prefix}Table tbody`);
        if (body) {
            body.innerHTML = `<tr><td colspan="${cfg.fields.length + 2}" style="text-align:center;${
                isError ? 'color:var(--danger-color)' : ''}">${BulkImport.escapeHtml(message)}</td></tr>`;
        }
    },

    render() {
        const body = document.querySelector(`#${cfg.prefix}Table tbody`);
        if (!body) return;
        const term = this.state.search;
        const items = this.state.items.filter((item) => !term ||
            cfg.fields.some((field) => String(item[field.key] ?? '').toLowerCase().includes(term)));

        if (items.length === 0) {
            this.renderMessage(`No hay ${cfg.plural} registrados`, false);
            return;
        }

        const e = BulkImport.escapeHtml;
        body.innerHTML = items.map((item) => `
            <tr>
                ${cfg.fields.filter((f) => f.column !== false).map((f) => `<td>${e(item[f.key] ?? '')}</td>`).join('')}
                <td><span class="badge ${item.activo ? 'badge-success' : 'badge-info'}">${item.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    ${cfg.history ? `<button class="btn btn-secondary btn-sm" data-action="history" data-id="${e(item.id)}" title="${e(cfg.history.title)}"><i class="fas fa-clock-rotate-left"></i></button>` : ''}
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${e(item.id)}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${e(item.id)}" title="Dar de baja"><i class="fas fa-user-slash"></i></button>
                </td>
            </tr>`).join('');
    },

    openForm(item = null) {
        const e = BulkImport.escapeHtml;
        document.getElementById('directoryModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'directoryModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${item ? 'Editar' : 'Nuevo'} ${e(cfg.singular)}</h2>
                    <button class="modal-close" type="button" data-dir="close">&times;</button>
                </div>
                <form class="modal-body" id="directoryForm">
                    ${cfg.fields.map((f) => `
                        <div class="form-group">
                            <label>${e(f.label)}${f.required ? ' <span class="required">*</span>' : ''}</label>
                            <input class="form-input" name="${f.key}" type="${f.type || 'text'}"
                                value="${e(item?.[f.key] ?? '')}" ${f.required ? 'required' : ''}>
                        </div>`).join('')}
                    <div class="form-group">
                        <label><input type="checkbox" name="activo" ${item?.activo === false ? '' : 'checked'}> Activo</label>
                    </div>
                    <p id="directoryError" style="color:var(--danger-color)"></p>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="btn btn-secondary" type="button" data-dir="close">Cancelar</button>
                        <button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Guardar</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-dir="close"]')) modal.remove();
        });
        modal.querySelector('#directoryForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = new FormData(event.target);
            const payload = { activo: form.has('activo') };
            cfg.fields.forEach((f) => { payload[f.key] = String(form.get(f.key) || '').trim(); });

            try {
                await this.request(item ? `${cfg.endpoint}/${encodeURIComponent(item.id)}` : cfg.endpoint, {
                    method: item ? 'PUT' : 'POST',
                    body: JSON.stringify(payload)
                });
                modal.remove();
                await this.load();
            } catch (error) {
                modal.querySelector('#directoryError').textContent = error.message;
            }
        });
    },

    // Ventas de un cliente o compras a un proveedor, con sus totales.
    async openHistory(item) {
        const e = BulkImport.escapeHtml;
        const { history } = cfg;
        document.getElementById('directoryModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'directoryModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content modal-content-xl">
                <div class="modal-header">
                    <h2>${e(history.title)} · ${e(item.nombre)}</h2>
                    <button class="modal-close" type="button" data-dir="close">&times;</button>
                </div>
                <div class="modal-body" id="directoryHistory">Cargando...</div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-dir="close"]')) modal.remove();
        });

        const container = modal.querySelector('#directoryHistory');
        try {
            const data = await this.request(history.path(item.id));
            const rows = data[history.listKey] || [];
            if (rows.length === 0) {
                container.innerHTML = `<p>${e(history.empty)}</p>`;
                return;
            }
            container.innerHTML = `
                <p>${history.summary(rows)}</p>
                <div class="table-responsive"><table class="data-table">
                    <thead><tr>${history.columns.map((c) => `<th>${e(c.label)}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map((row) => `<tr>${history.columns.map((c) => `<td>${c.render(row, e)}</td>`).join('')}</tr>`).join('')}</tbody>
                </table></div>`;
        } catch (error) {
            container.innerHTML = `<p style="color:var(--danger-color)">${e(error.message)}</p>`;
        }
    },

    async remove(item) {
        if (!confirm(`¿Dar de baja a "${item.nombre}"?`)) return;
        try {
            await this.request(`${cfg.endpoint}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            await this.load();
        } catch (error) {
            alert(error.message);
        }
    },

    openImport() {
        BulkImport.open({
            title: `Importar ${cfg.plural} desde Excel`,
            endpoint: `${cfg.endpoint}/import`,
            templateName: `plantilla_${cfg.plural}`,
            columns: cfg.fields.map((f) => ({
                key: f.key, label: f.label, example: f.example, required: f.required
            })),
            onDone: () => this.load()
        });
    }
});

const historyMoney = formatQ;
const historyDate = (value) => (value ? new Date(value).toLocaleDateString('es-GT', { timeZone: 'UTC' }) : '-');
const historySum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

const ClientesModule = createDirectoryModule({
    prefix: 'clientes',
    history: {
        title: 'Ventas del cliente',
        path: (id) => `/api/ventas?cliente_id=${encodeURIComponent(id)}`,
        listKey: 'ventas',
        empty: 'Este cliente aún no tiene ventas.',
        summary: (rows) => `${rows.length} venta(s) por <strong>${historyMoney(historySum(rows, 'total'))}</strong> · ` +
            `pendiente de cobro: <strong>${historyMoney(historySum(rows, 'pendiente'))}</strong>`,
        columns: [
            { label: 'Venta', render: (row, e) => `<strong>${e(row.numero_venta)}</strong>` },
            { label: 'Fecha', render: (row) => historyDate(row.fecha) },
            { label: 'Pago', render: (row, e) => e(row.metodo_pago || 'efectivo') },
            { label: 'Total', render: (row) => historyMoney(row.total) },
            { label: 'Pendiente', render: (row) => historyMoney(row.pendiente) }
        ]
    },
    endpoint: '/api/clientes',
    listKey: 'clientes',
    singular: 'cliente',
    plural: 'clientes',
    fields: [
        { key: 'nombre', label: 'Nombre', required: true, example: 'Juan Pérez' },
        { key: 'nit', label: 'NIT (o CF)', example: 'CF' },
        { key: 'dpi', label: 'DPI', column: false, example: '2456789010101' },
        { key: 'telefono', label: 'Teléfono', example: '5555-1234' },
        { key: 'email', label: 'Email', type: 'email', example: 'juan@correo.com' },
        { key: 'razon_social', label: 'Razón social', column: false, example: 'Comercial Pérez, S.A.' },
        { key: 'contacto_principal', label: 'Contacto principal', column: false, example: '' },
        { key: 'direccion', label: 'Dirección', column: false, example: 'Ciudad de Guatemala' }
    ]
});

const ProveedoresModule = createDirectoryModule({
    prefix: 'proveedores',
    history: {
        title: 'Compras al proveedor',
        path: (id) => `/api/compras?proveedor_id=${encodeURIComponent(id)}`,
        listKey: 'compras',
        empty: 'Aún no hay compras a este proveedor.',
        summary: (rows) => `${rows.length} compra(s) por <strong>${historyMoney(historySum(rows, 'total'))}</strong>`,
        columns: [
            { label: 'Compra', render: (row, e) => `<strong>${e(row.numero_compra)}</strong>` },
            { label: 'Fecha', render: (row) => historyDate(row.fecha) },
            { label: 'Estado', render: (row, e) => e(row.estado) + (row.inventario_aplicado ? ' · en inventario' : '') },
            { label: 'Artículos', render: (row, e) => e((row.items || []).map((i) => `${i.concepto_nombre} ×${i.cantidad}`).join(', ')) },
            { label: 'Total', render: (row) => historyMoney(row.total) }
        ]
    },
    endpoint: '/api/proveedores',
    listKey: 'proveedores',
    singular: 'proveedor',
    plural: 'proveedores',
    fields: [
        { key: 'nombre', label: 'Nombre', required: true, example: 'Distribuidora López' },
        { key: 'nit', label: 'NIT', example: '7654321-0' },
        { key: 'telefono', label: 'Teléfono', example: '2222-3333' },
        { key: 'email', label: 'Email', type: 'email', example: 'ventas@lopez.com' },
        { key: 'ciudad', label: 'Ciudad', column: false, example: 'Guatemala' },
        { key: 'razon_social', label: 'Razón social', column: false, example: 'Distribuidora López, S.A.' },
        { key: 'contacto', label: 'Contacto', column: false, example: 'María López' },
        { key: 'direccion', label: 'Dirección', column: false, example: '5a Avenida 10-20 zona 1' }
    ]
});
