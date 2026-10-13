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

const ClientesModule = createDirectoryModule({
    prefix: 'clientes',
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
