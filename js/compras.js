// ============================================
// MÓDULO DE COMPRAS
// ============================================

const ComprasModule = {
    state: {
        compras: [],
        proveedores: [],
        articulos: [],
        items: [],
        initialized: false,
        filtroEstado: '',
        busqueda: '',
        periodo: 'todo',
        recibiendo: null
    },

    // Por pedir → Pedida → Recibida (suma al inventario); o Cancelada.
    ESTADOS: {
        pendiente: { label: 'Por pedir', plural: 'Por pedir', badge: 'badge-neutral' },
        ordenada: { label: 'Pedida', plural: 'Pedidas', badge: 'badge-info' },
        recibida: { label: 'Recibida', plural: 'Recibidas', badge: 'badge-success' },
        cancelada: { label: 'Cancelada', plural: 'Canceladas', badge: 'badge-danger' }
    },

    // Quien no es administrador ve solo hoy o los últimos 7 días (el servidor también lo aplica);
    // las compras por pedir o por recibir se ven siempre.
    DIAS_SIN_ADMIN: 7,

    limitado() {
        return typeof AccessControl !== 'undefined' && !AccessControl.isAdmin();
    },

    initPeriodo() {
        const select = document.getElementById('comprasPeriodo');
        if (!select) return;
        if (this.limitado()) {
            [...select.options].forEach(option => {
                if (!['hoy', 'ultimos7'].includes(option.value)) option.remove();
            });
            this.state.periodo = 'hoy';
            const aviso = document.getElementById('comprasLimite');
            if (aviso) {
                aviso.hidden = false;
                aviso.textContent = `Puedes consultar las compras de los últimos ${this.DIAS_SIN_ADMIN} días. Las compras por pedir o por recibir se muestran siempre.`;
            }
        }
        select.value = this.state.periodo;
        select.addEventListener('change', async () => {
            this.state.periodo = select.value;
            try {
                this.state.compras = (await this.apiRequest(this.comprasPath())).compras || [];
                this.render();
            } catch (error) {
                this.notify(`No se pudieron cargar las compras: ${error.message}`, 'error');
            }
        });
    },

    ymd(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    comprasPath() {
        const hoy = new Date();
        const rangos = {
            hoy: [hoy, hoy],
            ultimos7: [new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (this.DIAS_SIN_ADMIN - 1)), hoy],
            mes: [new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy]
        };
        const rango = rangos[this.state.periodo];
        if (!rango) return '/api/compras';
        return `/api/compras?desde=${this.ymd(rango[0])}&hasta=${this.ymd(rango[1])}`;
    },

    init() {
        if (this.state.initialized) return;
        this.initPeriodo();
        this.setupEventListeners();
        this.state.initialized = true;
        this.loadData();
    },

    setupEventListeners() {
        document.getElementById('addPurchaseBtn')?.addEventListener('click', () => this.openPurchaseModal());
        document.getElementById('savePurchaseBtn')?.addEventListener('click', () => this.savePurchase());
        document.getElementById('comprasEstados')?.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-estado]');
            if (!chip) return;
            this.state.filtroEstado = chip.dataset.estado;
            this.render();
        });
        document.getElementById('comprasBuscar')?.addEventListener('input', (event) => {
            this.state.busqueda = event.target.value;
            this.render();
        });
        document.querySelector('#comprasTable tbody')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-compra-action]');
            if (button) this.accion(button.dataset.compraAction, button.dataset.compraId);
        });
        document.getElementById('receiveForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.recibir();
        });
        document.getElementById('receiveItems')?.addEventListener('input', () => this.renderReceiveTotal());
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
                this.apiRequest(this.comprasPath()),
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

    // Pedida y con la fecha de entrega ya pasada.
    isAtrasada(compra) {
        return compra.estado === 'ordenada' && compra.fecha_entrega && this.dateValue(compra.fecha_entrega) < this.today();
    },

    renderEstados() {
        const container = document.getElementById('comprasEstados');
        if (!container) return;
        const count = (estado) => this.state.compras.filter(compra => compra.estado === estado).length;
        const chips = [
            ['', 'Todas', this.state.compras.length],
            ...Object.entries(this.ESTADOS).map(([estado, { plural }]) => [estado, plural, count(estado)])
        ];
        container.innerHTML = chips.map(([estado, label, total]) => {
            const active = this.state.filtroEstado === estado;
            return `<button type="button" class="pos-chip${active ? ' active' : ''}" data-estado="${estado}" aria-pressed="${active}">
                ${label} <span class="chip-count">${total}</span></button>`;
        }).join('');
    },

    filteredCompras() {
        const term = this.normalizeSearch(this.state.busqueda);
        return this.state.compras.filter(compra =>
            (!this.state.filtroEstado || compra.estado === this.state.filtroEstado) &&
            (!term || this.normalizeSearch(`${compra.numero_compra} ${compra.proveedor_nombre}`).includes(term))
        );
    },

    // Botones según el estado: la acción siguiente va primero.
    actionsFor(compra) {
        const id = this.escapeHtml(compra.id);
        const button = (action, label, icon, cls = 'btn-secondary') =>
            `<button type="button" class="btn ${cls} btn-sm" data-compra-action="${action}" data-compra-id="${id}"><i class="fas ${icon}" aria-hidden="true"></i> ${label}</button>`;
        const icon = (action, title, iconName, cls = '') =>
            `<button type="button" class="btn-icon ${cls}" data-compra-action="${action}" data-compra-id="${id}" title="${title}" aria-label="${title}"><i class="fas ${iconName}" aria-hidden="true"></i></button>`;
        if (!AccessControl.canEdit('compras')) return '';
        const borrar = icon('eliminar', 'Eliminar compra', 'fa-trash', 'btn-delete');
        switch (compra.estado) {
        case 'pendiente':
            return button('recibir', 'Recibir', 'fa-boxes-stacked', 'btn-primary') + button('pedir', 'Pedir', 'fa-paper-plane') +
                icon('editar', 'Editar compra', 'fa-edit', 'btn-edit') + icon('cancelar', 'Cancelar compra', 'fa-ban') + borrar;
        case 'ordenada':
            return button('recibir', 'Recibir', 'fa-boxes-stacked', 'btn-primary') +
                icon('editar', 'Editar compra', 'fa-edit', 'btn-edit') + icon('cancelar', 'Cancelar compra', 'fa-ban') + borrar;
        case 'recibida':
            return icon('deshacer', 'Deshacer recepción', 'fa-rotate-left') + borrar;
        case 'cancelada':
            return button('reabrir', 'Reabrir', 'fa-rotate-left') + borrar;
        default:
            return borrar;
        }
    },

    render() {
        const tbody = document.querySelector('#comprasTable tbody');
        if (!tbody) return;
        this.renderEstados();

        if (this.state.compras.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">Aún no hay compras.
                ${AccessControl.canEdit('compras') ? '<button class="btn btn-primary btn-sm" type="button" onclick="ComprasModule.openPurchaseModal()"><i class="fas fa-plus" aria-hidden="true"></i> Registrar la primera</button>' : ''}</td></tr>`;
            return;
        }
        const compras = this.filteredCompras();
        if (compras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay compras con este filtro.</td></tr>';
            return;
        }

        tbody.innerHTML = compras.map(compra => {
            const estado = this.ESTADOS[compra.estado] || { label: compra.estado, badge: '' };
            let detalle = '';
            if (compra.estado === 'recibida') {
                detalle = `Llegó el ${this.formatDate(compra.recibida_en || compra.fecha)} · sumada al inventario`;
            } else if (compra.estado === 'cancelada') {
                detalle = compra.motivo_cancelacion ? `Motivo: ${this.escapeHtml(compra.motivo_cancelacion)}` : '';
            } else if (compra.fecha_entrega) {
                detalle = `Entrega ${this.formatDate(compra.fecha_entrega)}`;
            }
            return `
            <tr class="${this.isAtrasada(compra) ? 'compra-atrasada' : ''}${compra.estado === 'cancelada' ? ' compra-cancelada' : ''}">
                <td><strong>${this.escapeHtml(compra.numero_compra)}</strong></td>
                <td>${this.formatDate(compra.fecha)}</td>
                <td>${this.escapeHtml(compra.proveedor_nombre)}</td>
                <td>${formatQ(Number(compra.total || 0))}</td>
                <td><div>
                    <span class="badge ${estado.badge}">${estado.label}</span>
                    ${this.isAtrasada(compra) ? '<span class="badge badge-warning">Atrasada</span>' : ''}
                    ${detalle ? `<small class="compra-detalle">${detalle}</small>` : ''}
                </div></td>
                <td class="actions"><div class="compra-acciones">${this.actionsFor(compra)}</div></td>
            </tr>`;
        }).join('');
    },

    accion(action, id) {
        const compra = this.state.compras.find(entry => String(entry.id) === String(id));
        if (!compra) return;
        switch (action) {
        case 'recibir': return this.openReceiveModal(compra);
        case 'editar': return this.openPurchaseModal(compra);
        case 'eliminar': return this.deletePurchase(compra.id);
        case 'pedir': return this.cambiarEstado(compra, 'ordenada');
        case 'reabrir': return this.cambiarEstado(compra, 'pendiente');
        case 'cancelar': {
            const motivo = prompt(`¿Cancelar la compra ${compra.numero_compra} a ${compra.proveedor_nombre}? Escribe el motivo (opcional).`, '');
            if (motivo === null) return;
            return this.cambiarEstado(compra, 'cancelada', motivo);
        }
        case 'deshacer':
            if (!confirm(`¿Deshacer la recepción de ${compra.numero_compra}? Sus artículos se descontarán del inventario y la compra vuelve a «Pedida» para corregirla.`)) return;
            return this.cambiarEstado(compra, 'ordenada');
        default:
        }
    },

    async cambiarEstado(compra, estado, motivo) {
        try {
            const result = await this.apiRequest(`/api/compras/${encodeURIComponent(compra.id)}/estado`, {
                method: 'POST',
                body: JSON.stringify({ estado, motivo })
            });
            this.notify(`${result.message}.`, 'success');
            await this.loadData();
        } catch (error) {
            this.notify(error.message, 'error');
        }
    },

    // ---------- Recibir ----------

    openReceiveModal(compra) {
        this.state.recibiendo = compra;
        document.getElementById('receiveTitle').textContent = `Recibir ${compra.numero_compra}`;
        document.getElementById('receiveIntro').textContent =
            `De ${compra.proveedor_nombre}. Revisa que lo que llegó coincida con lo pedido.`;
        document.getElementById('receiveDate').value = this.today();
        document.getElementById('receiveError').hidden = true;
        document.getElementById('receiveItems').innerHTML = (compra.items || []).map(item => `
            <tr data-item-id="${this.escapeHtml(item.id)}">
                <td>${this.escapeHtml(item.concepto_nombre)}${item.concepto_codigo ? `<small class="compra-detalle">${this.escapeHtml(item.concepto_codigo)}</small>` : ''}</td>
                <td class="text-right">${Number(item.cantidad)}</td>
                <td><input class="form-input receive-qty" type="text" inputmode="numeric" autocomplete="off" value="${Number(item.cantidad)}" aria-label="Cantidad que llegó de ${this.escapeHtml(item.concepto_nombre)}"></td>
                <td><input class="form-input receive-price" type="text" inputmode="decimal" autocomplete="off" value="${Number(item.precio_unitario)}" aria-label="Costo unitario de ${this.escapeHtml(item.concepto_nombre)}"></td>
                <td class="text-right receive-subtotal"></td>
            </tr>`).join('');
        this.renderReceiveTotal();
        document.getElementById('receiveModal').style.display = 'flex';
        document.querySelector('#receiveItems .receive-qty')?.focus();
    },

    closeReceiveModal() {
        document.getElementById('receiveModal').style.display = 'none';
        this.state.recibiendo = null;
    },

    readReceiveLines() {
        return [...document.querySelectorAll('#receiveItems tr')].map(row => ({
            row,
            id: row.dataset.itemId,
            nombre: row.cells[0].firstChild.textContent,
            cantidad: CodigosArticulosModule.parseDecimal(row.querySelector('.receive-qty').value),
            precio_unitario: CodigosArticulosModule.parseDecimal(row.querySelector('.receive-price').value)
        }));
    },

    renderReceiveTotal() {
        let total = 0;
        this.readReceiveLines().forEach(line => {
            const subtotal = (Number(line.cantidad) || 0) * (Number(line.precio_unitario) || 0);
            total += subtotal;
            line.row.querySelector('.receive-subtotal').textContent = formatQ(subtotal);
            line.row.classList.toggle('receive-none', Number(line.cantidad) === 0);
        });
        document.getElementById('receiveTotal').textContent = formatQ(total);
    },

    async recibir() {
        const compra = this.state.recibiendo;
        if (!compra) return;
        const error = document.getElementById('receiveError');
        error.hidden = true;
        const lines = this.readReceiveLines();
        const invalid = lines.find(line => !Number.isInteger(line.cantidad) || line.cantidad < 0 ||
            Number.isNaN(line.precio_unitario) || line.precio_unitario < 0);
        if (invalid) {
            error.textContent = `«${invalid.nombre}»: escribe una cantidad entera (0 si no llegó) y un costo válido.`;
            error.hidden = false;
            return;
        }
        if (!lines.some(line => line.cantidad > 0)) {
            error.textContent = 'No llegó ningún artículo. Si el proveedor no entregará, cierra esto y cancela la compra.';
            error.hidden = false;
            return;
        }
        const button = document.getElementById('receiveSubmit');
        button.disabled = true;
        try {
            const result = await this.apiRequest(`/api/compras/${encodeURIComponent(compra.id)}/recibir`, {
                method: 'POST',
                body: JSON.stringify({
                    recibida_en: document.getElementById('receiveDate').value,
                    items: lines.map(({ id, cantidad, precio_unitario }) => ({ id, cantidad, precio_unitario }))
                })
            });
            this.closeReceiveModal();
            this.notify(`${result.message}.`, 'success');
            await this.loadData();
        } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
        } finally {
            button.disabled = false;
        }
    },

    today() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },

    openPurchaseModal(compra = null) {
        const form = document.getElementById('purchaseForm');
        form.reset();
        document.getElementById('purchaseId').value = compra?.id || '';
        document.getElementById('purchaseModalTitle').textContent = compra ? 'Editar Compra' : 'Nueva Compra';
        this.renderProviderOptions(compra?.proveedor_id || '');
        document.getElementById('purchaseDate').value = compra ? this.dateValue(compra.fecha) : this.dateValue(new Date());
        document.getElementById('purchaseDeliveryDate').value = compra?.fecha_entrega ? this.dateValue(compra.fecha_entrega) : '';
        // El estado se elige al crear; después se cambia con los botones de la lista.
        document.getElementById('purchaseStatus').value = 'pendiente';
        document.getElementById('purchaseStatusGroup').hidden = Boolean(compra);
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
            estado: id ? undefined : document.getElementById('purchaseStatus').value,
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

    async deletePurchase(id) {
        const compra = this.state.compras.find(entry => String(entry.id) === String(id));
        const aviso = compra?.inventario_aplicado ? ' Sus artículos se descontarán del inventario.' : '';
        if (!confirm(`¿Eliminar la compra ${compra?.numero_compra || ''}? No se puede deshacer.${aviso}`)) return;
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
