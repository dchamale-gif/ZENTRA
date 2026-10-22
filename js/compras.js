// ============================================
// MÓDULO DE COMPRAS
// ============================================

const ComprasModule = {
    state: {
        compras: [],
        proveedores: [],
        articulos: [],
        items: [],
        initialized: false
    },

    init() {
        if (this.state.initialized) return;
        this.setupEventListeners();
        this.state.initialized = true;
        this.loadData();
    },

    setupEventListeners() {
        document.getElementById('addPurchaseBtn')?.addEventListener('click', () => this.openPurchaseModal());
        document.getElementById('savePurchaseBtn')?.addEventListener('click', () => this.savePurchase());
    },

    async apiRequest(path, options = {}) {
        let response;
        try {
            response = await fetch(`${authManager.apiBaseUrl}${path}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
        } catch (error) {
            throw new Error(friendlyError(error));
        }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Error ${response.status}`);
        }
        return response.json();
    },

    async loadData() {
        try {
            const [comprasData, proveedoresData, articulosData] = await Promise.all([
                this.apiRequest('/api/compras'),
                this.apiRequest('/api/proveedores'),
                this.apiRequest('/api/codigos-articulos')
            ]);
            this.state.compras = comprasData.compras || [];
            this.state.proveedores = proveedoresData.proveedores || [];
            this.state.articulos = (articulosData.articulos || []).map(articulo => ({
                id: String(articulo.id),
                nombre: articulo.nombre_articulo,
                codigo: articulo.codigo || articulo.codigo_barras || articulo.codigo_alternativo || '',
                precio: Number(articulo.precio_costo ?? 0),
                seccion: articulo.categoria || articulo.seccion || '',
                familia: articulo.familia || '',
                subfamilia: articulo.subfamilia || ''
            }));
            this.render();
        } catch (error) {
            console.error('Error cargando compras:', error);
            this.state.compras = [];
            this.render();
            this.notify(`No se pudieron cargar las compras: ${error.message}`, 'error');
        }
    },

    // Al volver a la página se recargan las compras desde el servidor.
    refreshTable() {
        if (this.state.initialized) this.loadData();
        else this.init();
    },

    render() {
        const tbody = document.querySelector('#comprasTable tbody');
        if (!tbody) return;

        if (this.state.compras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay compras registradas</td></tr>';
            return;
        }

        tbody.innerHTML = this.state.compras.map(compra => `
            <tr>
                <td><strong>${this.escapeHtml(compra.numero_compra)}</strong></td>
                <td>${this.formatDate(compra.fecha)}</td>
                <td>${this.escapeHtml(compra.proveedor_nombre)}</td>
                <td>${formatQ(Number(compra.total || 0))}</td>
                <td>
                    <span class="badge badge-${this.escapeHtml(compra.estado)}">${this.capitalize(compra.estado)}</span>
                    ${compra.inventario_aplicado ? '<br><small><i class="fas fa-boxes-stacked"></i> Sumada al inventario</small>' : ''}
                </td>
                <td class="actions">
                    <button class="btn-icon btn-edit" title="Editar compra" onclick="ComprasModule.editPurchase('${compra.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Eliminar compra" onclick="ComprasModule.deletePurchase('${compra.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    openPurchaseModal(compra = null) {
        const form = document.getElementById('purchaseForm');
        form.reset();
        document.getElementById('purchaseId').value = compra?.id || '';
        document.getElementById('purchaseModalTitle').textContent = compra ? 'Editar Compra' : 'Nueva Compra';
        this.renderProviderOptions(compra?.proveedor_id || '');
        document.getElementById('purchaseDate').value = compra ? this.dateValue(compra.fecha) : this.dateValue(new Date());
        document.getElementById('purchaseDeliveryDate').value = compra?.fecha_entrega ? this.dateValue(compra.fecha_entrega) : '';
        document.getElementById('purchaseStatus').value = compra?.estado || 'pendiente';
        document.getElementById('purchaseObservations').value = compra?.observaciones || '';
        this.state.items = compra?.items?.length
            ? compra.items.map(item => ({
                tipo: item.tipo,
                concepto_id: String(item.concepto_id),
                cantidad: Number(item.cantidad),
                precio_unitario: Number(item.precio_unitario),
                filtros: { seccion: '', familia: '', subfamilia: '' }
            }))
            : [{ tipo: 'articulo', concepto_id: '', cantidad: 1, precio_unitario: 0, filtros: { seccion: '', familia: '', subfamilia: '' } }];
        this.renderItems();
        document.getElementById('purchaseModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.toggleProviderForm(this.state.proveedores.length === 0);
    },

    renderProviderOptions(selectedId = '') {
        const select = document.getElementById('purchaseProvider');
        select.innerHTML = '<option value="">Selecciona un proveedor</option>' +
            this.state.proveedores.map(proveedor =>
                `<option value="${this.escapeHtml(proveedor.id)}">${this.escapeHtml(proveedor.nombre)}</option>`
            ).join('');
        select.value = String(selectedId);
    },

    toggleProviderForm(forceOpen) {
        const panel = document.getElementById('quickProviderForm');
        const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : panel.hidden;
        panel.hidden = !shouldOpen;
        if (shouldOpen) document.getElementById('quickProviderName').focus();
    },

    async saveQuickProvider() {
        const nameInput = document.getElementById('quickProviderName');
        const nombre = nameInput.value.trim();
        if (!nombre) {
            this.notify('El nombre del proveedor es requerido.', 'warning');
            nameInput.focus();
            return;
        }

        const button = document.getElementById('saveQuickProviderBtn');
        const payload = {
            nombre,
            razon_social: document.getElementById('quickProviderBusinessName').value.trim() || null,
            nit: document.getElementById('quickProviderNit').value.trim() || null,
            contacto: document.getElementById('quickProviderContact').value.trim() || null,
            email: document.getElementById('quickProviderEmail').value.trim() || null,
            telefono: document.getElementById('quickProviderPhone').value.trim() || null,
            ciudad: document.getElementById('quickProviderCity').value.trim() || null,
            direccion: document.getElementById('quickProviderAddress').value.trim() || null
        };

        button.disabled = true;
        try {
            const data = await this.apiRequest('/api/proveedores', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            this.state.proveedores.push(data.proveedor);
            this.state.proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre));
            this.renderProviderOptions(data.proveedor.id);
            document.querySelectorAll('#quickProviderForm input').forEach(input => { input.value = ''; });
            this.toggleProviderForm(false);
            this.notify('Proveedor creado y seleccionado.', 'success');
        } catch (error) {
            this.notify(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    closePurchaseModal() {
        document.getElementById('purchaseModal').style.display = 'none';
        document.body.style.overflow = 'auto';
        this.state.items = [];
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
        } else if (field === 'concepto_id') {
            item.concepto_id = value;
            const concepto = this.getCatalog(item.tipo).find(entry => entry.id === String(value));
            item.precio_unitario = concepto?.precio || 0;
        } else {
            // Misma lectura de montos que Artículos y Ventas ("1,5" = 1.5, "1,500" = 1500).
            item[field] = CodigosArticulosModule.parseDecimal(value);
            item.texto ||= {};
            item.texto[field] = Number.isNaN(item[field]) ? String(value) : null;
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
        const panel = document.getElementById(`purchaseConceptFilters-${index}`);
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
        document.getElementById(`purchaseConceptFilters-${index}`).hidden = false;
        this.searchConcept(index, document.getElementById(`purchaseConceptSearch-${index}`).value);
    },

    searchConcept(index, term) {
        const item = this.state.items[index];
        const results = document.getElementById(`conceptSearchResults-${index}`);
        if (!item || !results) return;

        const selected = this.getCatalog(item.tipo).find(entry => entry.id === String(item.concepto_id));
        if (!selected || selected.nombre !== term) {
            item.concepto_id = '';
            item.precio_unitario = 0;
            document.getElementById(`purchaseItemPrice-${index}`).value = 0;
            document.getElementById(`purchaseItemSubtotal-${index}`).textContent = 'Q0.00';
            this.updateCalculatedTotal();
        }

        const normalizedTerm = this.normalizeSearch(term);
        const filters = item.filtros || {};
        const hasFilters = filters.seccion || filters.familia || filters.subfamilia;
        if (normalizedTerm.length < 2 && !hasFilters) {
            results.hidden = true;
            results.innerHTML = '';
            return;
        }

        const matches = this.getCatalog(item.tipo).filter(concepto =>
            (!normalizedTerm || this.normalizeSearch(`${concepto.nombre} ${concepto.codigo}`).includes(normalizedTerm)) &&
            (!filters.seccion || concepto.seccion === filters.seccion) &&
            (!filters.familia || concepto.familia === filters.familia) &&
            (!filters.subfamilia || concepto.subfamilia === filters.subfamilia)
        ).slice(0, 8);

        results.innerHTML = matches.length > 0
            ? matches.map(concepto => `
                <button class="concept-search-result" type="button" data-concept-id="${this.escapeHtml(concepto.id)}"
                    onclick="ComprasModule.selectConcept(${index}, this.dataset.conceptId)">
                    <strong>${this.escapeHtml(concepto.nombre)}</strong>
                    ${concepto.codigo ? `<small>${this.escapeHtml(concepto.codigo)}</small>` : ''}
                </button>
            `).join('')
            : '<div class="concept-search-empty">Sin coincidencias</div>';
        results.hidden = false;
    },

    selectConcept(index, conceptId) {
        const item = this.state.items[index];
        const concepto = this.getCatalog(item.tipo).find(entry => entry.id === String(conceptId));
        if (!concepto) return;
        item.concepto_id = concepto.id;
        item.precio_unitario = concepto.precio || 0;
        this.renderItems();
    },

    normalizeSearch(value = '') {
        return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    },

    renderItems() {
        const tbody = document.getElementById('purchaseItemsBody');
        tbody.innerHTML = this.state.items.map((item, index) => {
            item.filtros ||= { seccion: '', familia: '', subfamilia: '' };
            const selectedConcept = this.getCatalog(item.tipo).find(concepto =>
                concepto.id === String(item.concepto_id)
            );
            const sections = this.getFilterOptions(item, 'seccion');
            const families = this.getFilterOptions(item, 'familia');
            const subfamilies = this.getFilterOptions(item, 'subfamilia');
            const subtotal = Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precio_unitario) || 0);
            return `
                <tr>
                    <td>
                        <div class="concept-search">
                            <div class="concept-search-input">
                                <i class="fas fa-search"></i>
                                <input id="purchaseConceptSearch-${index}" class="form-input" type="search" autocomplete="off"
                                    placeholder="Buscar por nombre o código..."
                                    value="${this.escapeHtml(selectedConcept?.nombre || '')}"
                                    oninput="ComprasModule.searchConcept(${index}, this.value)">
                                <button class="concept-filter-toggle" type="button" title="Filtrar conceptos" onclick="ComprasModule.toggleConceptFilters(${index})">
                                    <i class="fas fa-filter"></i>
                                </button>
                            </div>
                            <div id="purchaseConceptFilters-${index}" class="concept-filter-panel" hidden>
                                <select class="form-input" aria-label="Sección" onchange="ComprasModule.setConceptFilter(${index}, 'seccion', this.value)">
                                    <option value="">Todas las secciones</option>
                                    ${sections.map(value => `<option value="${this.escapeHtml(value)}" ${item.filtros.seccion === value ? 'selected' : ''}>${this.escapeHtml(value)}</option>`).join('')}
                                </select>
                                <select class="form-input" aria-label="Familia" onchange="ComprasModule.setConceptFilter(${index}, 'familia', this.value)">
                                    <option value="">Todas las familias</option>
                                    ${families.map(value => `<option value="${this.escapeHtml(value)}" ${item.filtros.familia === value ? 'selected' : ''}>${this.escapeHtml(value)}</option>`).join('')}
                                </select>
                                <select class="form-input" aria-label="Subfamilia" onchange="ComprasModule.setConceptFilter(${index}, 'subfamilia', this.value)">
                                    <option value="">Todas las subfamilias</option>
                                    ${subfamilies.map(value => `<option value="${this.escapeHtml(value)}" ${item.filtros.subfamilia === value ? 'selected' : ''}>${this.escapeHtml(value)}</option>`).join('')}
                                </select>
                            </div>
                            <div id="conceptSearchResults-${index}" class="concept-search-results" hidden></div>
                        </div>
                    </td>
                    <td><input class="form-input" type="text" inputmode="numeric" autocomplete="off" aria-label="Cantidad de la línea ${index + 1}" value="${this.escapeHtml(item.texto?.cantidad ?? item.cantidad)}" onchange="ComprasModule.updateItem(${index}, 'cantidad', this.value)"></td>
                    <td><input id="purchaseItemPrice-${index}" class="form-input" type="text" inputmode="decimal" autocomplete="off" aria-label="Precio unitario de la línea ${index + 1}" value="${this.escapeHtml(item.texto?.precio_unitario ?? item.precio_unitario)}" onchange="ComprasModule.updateItem(${index}, 'precio_unitario', this.value)"></td>
                    <td><strong id="purchaseItemSubtotal-${index}">${formatQ(subtotal)}</strong></td>
                    <td>
                        <button class="btn-icon btn-delete" type="button" title="Quitar concepto" onclick="ComprasModule.removeItem(${index})" ${this.state.items.length === 1 ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        }).join('');
        this.updateCalculatedTotal();
    },

    updateCalculatedTotal() {
        document.getElementById('purchaseCalculatedTotal').textContent = `${formatQ(this.calculateTotal())}`;
    },

    calculateTotal() {
        return this.state.items.reduce((total, item) =>
            total + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0);
    },

    async savePurchase() {
        const id = document.getElementById('purchaseId').value;
        const payload = {
            proveedor_id: document.getElementById('purchaseProvider').value,
            fecha: document.getElementById('purchaseDate').value,
            fecha_entrega: document.getElementById('purchaseDeliveryDate').value || null,
            estado: document.getElementById('purchaseStatus').value,
            observaciones: document.getElementById('purchaseObservations').value.trim() || null,
            items: this.state.items.map(item => ({
                tipo: item.tipo,
                concepto_id: item.concepto_id,
                cantidad: Number(item.cantidad),
                precio_unitario: Number(item.precio_unitario)
            }))
        };

        if (!payload.proveedor_id || !payload.fecha) {
            this.notify('Elige el proveedor y la fecha de la compra.', 'warning');
            return;
        }
        const lineError = payload.items.findIndex(item =>
            !item.concepto_id || !Number.isInteger(item.cantidad) || item.cantidad <= 0 ||
            Number.isNaN(item.precio_unitario) || item.precio_unitario < 0 || item.precio_unitario > 99999999.99);
        if (lineError >= 0) {
            const prefix = payload.items.length > 1 ? `Línea ${lineError + 1}: ` : '';
            this.notify(`${prefix}elige un artículo, una cantidad entera mayor que 0 y un precio válido (por ejemplo 25.50).`.replace(/^./, c => c.toUpperCase()), 'warning');
            return;
        }

        // Evita compras duplicadas por doble clic (cada una sumaría existencias).
        if (this.state.saving) return;
        this.state.saving = true;
        const button = document.getElementById('savePurchaseBtn');
        if (button) button.disabled = true;
        try {
            const result = await this.apiRequest(id ? `/api/compras/${id}` : '/api/compras', {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(payload)
            });
            this.closePurchaseModal();
            this.notify(`${result.message}.`, 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error guardando compra:', error);
            this.notify(error.message, 'error');
        } finally {
            this.state.saving = false;
            if (button) button.disabled = false;
        }
    },

    editPurchase(id) {
        const compra = this.state.compras.find(entry => String(entry.id) === String(id));
        if (compra) this.openPurchaseModal(compra);
    },

    async deletePurchase(id) {
        const compra = this.state.compras.find(entry => String(entry.id) === String(id));
        const aviso = compra?.inventario_aplicado ? ' Sus artículos se descontarán del inventario.' : '';
        if (!confirm(`¿Eliminar esta compra?${aviso}`)) return;
        try {
            const result = await this.apiRequest(`/api/compras/${id}`, { method: 'DELETE' });
            await this.loadData();
            this.notify(`${result.message}.`, 'success');
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    dateValue(value) {
        const date = value instanceof Date ? value : new Date(value);
        return date.toISOString().slice(0, 10);
    },

    formatDate(value) {
        if (!value) return '-';
        return new Date(value).toLocaleDateString('es-GT', { timeZone: 'UTC' });
    },

    capitalize(value = '') {
        return value.charAt(0).toUpperCase() + value.slice(1);
    },

    // Se usa también dentro de atributos (value="..."), así que escapa comillas.
    escapeHtml(value = '') {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    },

    notify(message, type) {
        showNotification(message, type);
    }
};
