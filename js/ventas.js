// ============================================
// MÓDULO DE VENTAS
// ============================================

const VentasModule = {
    state: {
        ventas: [],
        receptores: [],
        articulos: [],
        items: [],
        receptorId: '',
        receptorTipo: '',
        initialized: false
    },

    init() {
        if (this.state.initialized) return;
        document.getElementById('addSaleBtn')?.addEventListener('click', () => this.openSaleModal());
        document.getElementById('saveSaleBtn')?.addEventListener('click', () => this.saveSale());
        this.state.initialized = true;
        this.loadData();
    },

    async apiRequest(path, options = {}) {
        const response = await fetch(`${authManager.apiBaseUrl}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Error ${response.status}`);
        }
        return response.json();
    },

    async loadData() {
        const requests = await Promise.allSettled([
            this.apiRequest('/api/ventas'),
            this.apiRequest('/api/ventas/receptores'),
            this.apiRequest('/api/codigos-articulos')
        ]);
        const [ventasResult, receptoresResult, articulosResult] = requests;

        if (ventasResult.status === 'fulfilled') {
            this.state.ventas = ventasResult.value.ventas || [];
        } else {
            this.notify(`No se pudieron cargar las ventas: ${ventasResult.reason.message}`, 'error');
        }
        if (receptoresResult.status === 'fulfilled') {
            this.state.receptores = receptoresResult.value.receptores || [];
        }
        if (articulosResult.status === 'fulfilled') {
            this.state.articulos = (articulosResult.value.articulos || []).map(articulo => ({
                id: String(articulo.id),
                nombre: articulo.nombre_articulo,
                codigo: articulo.codigo || articulo.codigo_barras || articulo.codigo_alternativo || '',
                precio: Number(articulo.precio_unitario ?? 0),
                stock: Number(articulo.cantidad_disponible ?? 0),
                seccion: articulo.categoria || articulo.seccion || '',
                familia: articulo.familia || '',
                subfamilia: articulo.subfamilia || ''
            }));
        }

        requests.slice(1).forEach((result, index) => {
            if (result.status === 'rejected') {
                const names = ['receptores', 'artículos'];
                this.notify(`No se pudieron cargar ${names[index]}: ${result.reason.message}`, 'warning');
            }
        });
        this.render();
    },

    render() {
        const tbody = document.querySelector('#ventasTable tbody');
        if (!tbody) return;
        if (this.state.ventas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay ventas registradas</td></tr>';
            return;
        }
        tbody.innerHTML = this.state.ventas.map(venta => `
            <tr>
                <td><strong>${this.escapeHtml(venta.numero_venta)}</strong></td>
                <td>${this.formatDate(venta.fecha)}</td>
                <td>${this.escapeHtml(venta.receptor_nombre)}</td>
                <td>Q${Number(venta.total || 0).toFixed(2)}</td>
                <td><span class="badge badge-${this.escapeHtml(venta.estado)}">${this.capitalize(venta.estado)}</span></td>
                <td class="actions">
                    <button class="btn-icon" type="button" title="Ver conceptos" onclick="VentasModule.viewSale('${venta.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" type="button" title="Editar venta" onclick="VentasModule.editSale('${venta.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" type="button" title="Eliminar venta" onclick="VentasModule.deleteSale('${venta.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`).join('');
    },

    refreshTable() {
        this.render();
    },

    openSaleModal(venta = null) {
        document.getElementById('saleForm').reset();
        document.getElementById('saleId').value = venta?.id || '';
        document.getElementById('saleDate').value = venta ? this.dateValue(venta.fecha) : this.dateValue(new Date());
        document.getElementById('salePaymentMethod').value = venta?.metodo_pago || 'efectivo';
        document.getElementById('saleObservations').value = venta?.observaciones || '';
        document.getElementById('saleRecipientSearch').value = venta?.receptor_nombre === 'Consumidor final' ? '' : (venta?.receptor_nombre || '');
        document.getElementById('saleRecipientResults').hidden = true;
        this.state.receptorId = venta ? String(venta.cliente_id || '') : '';
        this.state.receptorTipo = venta?.cliente_id ? 'cliente' : '';
        this.state.items = venta?.items?.length ? venta.items.map(item => ({
            tipo: item.tipo,
            concepto_id: String(item.concepto_id),
            cantidad: Number(item.cantidad),
            precio_unitario: Number(item.precio_unitario),
            filtros: { seccion: '', familia: '', subfamilia: '' }
        })) : [{ tipo: 'articulo', concepto_id: '', cantidad: 1, precio_unitario: 0, filtros: { seccion: '', familia: '', subfamilia: '' } }];
        this.renderItems();
        document.getElementById('saleModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeSaleModal() {
        document.getElementById('saleModal').style.display = 'none';
        document.body.style.overflow = 'auto';
        this.state.items = [];
    },

    searchRecipient(term) {
        const results = document.getElementById('saleRecipientResults');
        this.state.receptorId = '';
        this.state.receptorTipo = '';
        const normalized = this.normalizeSearch(term);
        if (normalized.length < 2) {
            results.hidden = true;
            return;
        }
        const matches = this.state.receptores.filter(receptor =>
            this.normalizeSearch(`${receptor.nombre} ${receptor.nit || ''} ${receptor.dpi || ''} ${receptor.telefono || ''}`).includes(normalized)
        ).slice(0, 8);
        results.innerHTML = matches.length ? matches.map(receptor => `
            <button class="concept-search-result" type="button" data-id="${this.escapeHtml(receptor.id)}" data-type="${receptor.tipo}"
                onclick="VentasModule.selectRecipient(this.dataset.id, this.dataset.type)">
                <strong>${this.escapeHtml(receptor.nombre)}</strong>
                <small>Cliente${receptor.nit ? ` · ${this.escapeHtml(receptor.nit)}` : ''}</small>
            </button>`).join('') : '<div class="concept-search-empty">Sin coincidencias</div>';
        results.hidden = false;
    },

    toggleQuickClient(show) {
        const box = document.getElementById('quickClientBox');
        box.hidden = !show;
        if (!show) return;
        document.getElementById('quickClientName').value = document.getElementById('saleRecipientSearch').value.trim();
        document.getElementById('quickClientNit').value = 'CF';
        document.getElementById('quickClientDpi').value = '';
        document.getElementById('quickClientName').focus();
    },

    async saveQuickClient() {
        const nombre = document.getElementById('quickClientName').value.trim();
        const nit = document.getElementById('quickClientNit').value.trim() || 'CF';
        const dpi = document.getElementById('quickClientDpi').value.trim();
        if (!nombre) return this.notify('El nombre del cliente es requerido', 'error');
        try {
            const result = await this.apiRequest('/api/ventas/receptores', {
                method: 'POST',
                body: JSON.stringify({ nombre, nit, dpi, activo: true })
            });
            const cliente = result.cliente;
            this.state.receptores.push({ id: cliente.id, nombre: cliente.nombre, nit: cliente.nit, dpi: cliente.dpi, telefono: cliente.telefono, tipo: 'cliente' });
            this.selectRecipient(cliente.id, 'cliente');
            this.toggleQuickClient(false);
            this.notify('Cliente creado y seleccionado', 'success');
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    selectRecipient(id, type) {
        const receptor = this.state.receptores.find(entry => String(entry.id) === String(id) && entry.tipo === type);
        if (!receptor) return;
        this.state.receptorId = String(id);
        this.state.receptorTipo = type;
        document.getElementById('saleRecipientSearch').value = receptor.nombre;
        document.getElementById('saleRecipientResults').hidden = true;
    },

    addItem() {
        this.state.items.push({ tipo: 'articulo', concepto_id: '', cantidad: 1, precio_unitario: 0, filtros: { seccion: '', familia: '', subfamilia: '' } });
        this.renderItems();
    },

    removeItem(index) {
        if (this.state.items.length === 1) return;
        this.state.items.splice(index, 1);
        this.renderItems();
    },

    updateItem(index, field, value) {
        const item = this.state.items[index];
        if (!item) return;
        if (field === 'tipo') {
            item.tipo = value;
            item.concepto_id = '';
            item.precio_unitario = 0;
            item.filtros = { seccion: '', familia: '', subfamilia: '' };
        } else {
            item[field] = Number(value);
        }
        this.renderItems();
    },

    getCatalog() {
        return this.state.articulos;
    },

    getFilterOptions(item, field) {
        const filters = item.filtros || {};
        const catalog = this.getCatalog(item.tipo).filter(concepto =>
            (field === 'seccion' || !filters.seccion || concepto.seccion === filters.seccion) &&
            (field !== 'subfamilia' || !filters.familia || concepto.familia === filters.familia)
        );
        return [...new Set(catalog.map(concepto => concepto[field]).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right));
    },

    toggleConceptFilters(index) {
        const panel = document.getElementById(`saleConceptFilters-${index}`);
        if (panel) panel.hidden = !panel.hidden;
    },

    setConceptFilter(index, field, value) {
        const item = this.state.items[index];
        if (!item) return;
        item.filtros ||= { seccion: '', familia: '', subfamilia: '' };
        item.filtros[field] = value;
        if (field === 'seccion') {
            item.filtros.familia = '';
            item.filtros.subfamilia = '';
        } else if (field === 'familia') {
            item.filtros.subfamilia = '';
        }
        this.renderItems();
        document.getElementById(`saleConceptFilters-${index}`).hidden = false;
        this.searchConcept(index, document.getElementById(`saleConceptSearch-${index}`).value);
    },

    searchConcept(index, term) {
        const item = this.state.items[index];
        const results = document.getElementById(`saleConceptResults-${index}`);
        if (!item || !results) return;
        const selected = this.getCatalog(item.tipo).find(entry => entry.id === String(item.concepto_id));
        if (!selected || selected.nombre !== term) {
            item.concepto_id = '';
            item.precio_unitario = 0;
            this.updateTotalsOnly();
        }
        const normalized = this.normalizeSearch(term);
        const filters = item.filtros || {};
        const hasFilters = filters.seccion || filters.familia || filters.subfamilia;
        if (normalized.length < 2 && !hasFilters) {
            results.hidden = true;
            return;
        }
        const matches = this.getCatalog(item.tipo).filter(concepto =>
            (!normalized || this.normalizeSearch(`${concepto.nombre} ${concepto.codigo}`).includes(normalized)) &&
            (!filters.seccion || concepto.seccion === filters.seccion) &&
            (!filters.familia || concepto.familia === filters.familia) &&
            (!filters.subfamilia || concepto.subfamilia === filters.subfamilia)
        ).slice(0, 8);
        results.innerHTML = matches.length ? matches.map(concepto => `
            <button class="concept-search-result" type="button" data-id="${this.escapeHtml(concepto.id)}"
                onclick="VentasModule.selectConcept(${index}, this.dataset.id)">
                <strong>${this.escapeHtml(concepto.nombre)}</strong>
                <small>${this.escapeHtml(concepto.codigo || 'Sin código')} · Existencia: ${concepto.stock}</small>
            </button>`).join('') : '<div class="concept-search-empty">Sin coincidencias</div>';
        results.hidden = false;
    },

    selectConcept(index, id) {
        const item = this.state.items[index];
        const concepto = this.getCatalog(item.tipo).find(entry => entry.id === String(id));
        if (!concepto) return;
        item.concepto_id = concepto.id;
        item.precio_unitario = concepto.precio;
        this.renderItems();
    },

    renderItems() {
        const tbody = document.getElementById('saleItemsBody');
        if (!tbody) return;
        tbody.innerHTML = this.state.items.map((item, index) => {
            item.filtros ||= { seccion: '', familia: '', subfamilia: '' };
            const selected = this.getCatalog(item.tipo).find(entry => entry.id === String(item.concepto_id));
            const subtotal = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
            const sections = this.getFilterOptions(item, 'seccion');
            const families = this.getFilterOptions(item, 'familia');
            const subfamilies = this.getFilterOptions(item, 'subfamilia');
            return `<tr>
                <td><select class="form-input" onchange="VentasModule.updateItem(${index}, 'tipo', this.value)">
                    <option value="articulo" ${item.tipo === 'articulo' ? 'selected' : ''}>Artículo</option>
                </select></td>
                <td><div class="concept-search"><div class="concept-search-input"><i class="fas fa-search"></i>
                    <input id="saleConceptSearch-${index}" class="form-input" type="search" autocomplete="off" placeholder="Buscar por nombre o código..."
                        value="${this.escapeHtml(selected?.nombre || '')}" oninput="VentasModule.searchConcept(${index}, this.value)">
                    <button class="concept-filter-toggle" type="button" title="Filtrar conceptos" onclick="VentasModule.toggleConceptFilters(${index})"><i class="fas fa-filter"></i></button>
                    </div>
                    <div id="saleConceptFilters-${index}" class="concept-filter-panel" hidden>
                        <select class="form-input" aria-label="Sección" onchange="VentasModule.setConceptFilter(${index}, 'seccion', this.value)">
                            <option value="">Todas las secciones</option>
                            ${sections.map(value => `<option value="${this.escapeHtml(value)}" ${item.filtros.seccion === value ? 'selected' : ''}>${this.escapeHtml(value)}</option>`).join('')}
                        </select>
                        <select class="form-input" aria-label="Familia" onchange="VentasModule.setConceptFilter(${index}, 'familia', this.value)">
                            <option value="">Todas las familias</option>
                            ${families.map(value => `<option value="${this.escapeHtml(value)}" ${item.filtros.familia === value ? 'selected' : ''}>${this.escapeHtml(value)}</option>`).join('')}
                        </select>
                        <select class="form-input" aria-label="Subfamilia" onchange="VentasModule.setConceptFilter(${index}, 'subfamilia', this.value)">
                            <option value="">Todas las subfamilias</option>
                            ${subfamilies.map(value => `<option value="${this.escapeHtml(value)}" ${item.filtros.subfamilia === value ? 'selected' : ''}>${this.escapeHtml(value)}</option>`).join('')}
                        </select>
                    </div>
                    <div id="saleConceptResults-${index}" class="concept-search-results" hidden></div></div></td>
                <td><input class="form-input" type="number" min="1" step="1" value="${item.cantidad}" onchange="VentasModule.updateItem(${index}, 'cantidad', this.value)"></td>
                <td><input class="form-input" type="number" min="0" step="0.01" value="${item.precio_unitario}" onchange="VentasModule.updateItem(${index}, 'precio_unitario', this.value)"></td>
                <td><strong>Q${subtotal.toFixed(2)}</strong></td>
                <td><button class="btn-icon btn-delete" type="button" title="Quitar concepto" onclick="VentasModule.removeItem(${index})" ${this.state.items.length === 1 ? 'disabled' : ''}><i class="fas fa-trash"></i></button></td>
            </tr>`;
        }).join('');
        this.updateTotalsOnly();
    },

    updateTotalsOnly() {
        const total = this.state.items.reduce((sum, item) =>
            sum + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0);
        document.getElementById('saleCalculatedTotal').textContent = `Q${total.toFixed(2)}`;
    },

    async saveSale() {
        const id = document.getElementById('saleId').value;
        const payload = {
            fecha: document.getElementById('saleDate').value,
            metodo_pago: document.getElementById('salePaymentMethod').value,
            observaciones: document.getElementById('saleObservations').value.trim() || null,
            items: this.state.items.map(item => ({
                tipo: item.tipo,
                concepto_id: item.concepto_id,
                cantidad: Number(item.cantidad),
                precio_unitario: Number(item.precio_unitario)
            }))
        };
        if (this.state.receptorId) payload[`${this.state.receptorTipo}_id`] = this.state.receptorId;
        if (!payload.fecha || payload.items.some(item => !item.concepto_id || !Number.isInteger(item.cantidad) || item.cantidad <= 0 || item.precio_unitario < 0)) {
            this.notify('Completa la fecha y todos los conceptos de la venta.', 'warning');
            return;
        }

        const button = document.getElementById('saveSaleBtn');
        button.disabled = true;
        try {
            await this.apiRequest(id ? `/api/ventas/${id}` : '/api/ventas', {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(payload)
            });
            this.closeSaleModal();
            await this.loadData();
            this.notify(id ? 'Venta actualizada e inventario recalculado.' : 'Venta registrada y existencias actualizadas.', 'success');
        } catch (error) {
            this.notify(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    viewSale(id) {
        const venta = this.state.ventas.find(entry => String(entry.id) === String(id));
        if (!venta) return;
        const details = venta.items.map(item =>
            `${item.concepto_nombre}: ${item.cantidad} × Q${Number(item.precio_unitario).toFixed(2)}`
        ).join('\n');
        alert(`${venta.numero_venta}\n${venta.receptor_nombre}\n\n${details}\n\nTotal: Q${Number(venta.total).toFixed(2)}`);
    },

    editSale(id) {
        const venta = this.state.ventas.find(entry => String(entry.id) === String(id));
        if (venta) this.openSaleModal(venta);
    },

    async deleteSale(id) {
        if (!confirm('¿Eliminar esta venta y restituir sus existencias?')) return;
        try {
            await this.apiRequest(`/api/ventas/${id}`, { method: 'DELETE' });
            await this.loadData();
            this.notify('Venta eliminada e inventario restituido.', 'success');
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    dateValue(value) {
        const date = value instanceof Date ? value : new Date(value);
        return date.toISOString().slice(0, 10);
    },

    normalizeSearch(value = '') {
        return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    },

    formatDate(value) {
        return value ? new Date(value).toLocaleDateString('es-GT', { timeZone: 'UTC' }) : '-';
    },

    capitalize(value = '') {
        return value.charAt(0).toUpperCase() + value.slice(1);
    },

    escapeHtml(value = '') {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML;
    },

    notify(message, type) {
        if (window.NotificationsModule?.show) window.NotificationsModule.show(message, type);
        else alert(message);
    }
};