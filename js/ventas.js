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
            const error = new Error(data.error || `Error ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    },

    async loadData() {
        const felReady = typeof FelModule !== 'undefined' ? FelModule.loadEstado() : null;
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
                costo: Number(articulo.precio_costo ?? 0),
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
        await felReady;
        this.render();
    },

    render() {
        const tbody = document.querySelector('#ventasTable tbody');
        if (!tbody) return;
        if (this.state.ventas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay ventas registradas</td></tr>';
            return;
        }
        tbody.innerHTML = this.state.ventas.map(venta => `
            <tr>
                <td><strong>${this.escapeHtml(venta.numero_venta)}</strong></td>
                <td>${this.formatDate(venta.fecha)}</td>
                <td>${this.escapeHtml(this.clienteNombre(venta))}</td>
                <td>${formatQ(Number(venta.total || 0))}</td>
                <td>${this.paymentCell(venta)}</td>
                <td>${typeof FelModule !== 'undefined' ? FelModule.comprobanteCell(venta) : ''}</td>
                <td class="actions">
                    ${this.facturaButton(venta)}
                    <button class="btn-icon" type="button" title="Ver detalle" aria-label="Ver detalle de ${this.escapeHtml(venta.numero_venta)}" onclick="VentasModule.viewSale('${this.escapeHtml(venta.id)}')">
                        <i class="fas fa-eye" aria-hidden="true"></i>
                    </button>
                    <button class="btn-icon btn-edit" type="button" title="Editar venta" aria-label="Editar ${this.escapeHtml(venta.numero_venta)}" onclick="VentasModule.editSale('${this.escapeHtml(venta.id)}')">
                        <i class="fas fa-edit" aria-hidden="true"></i>
                    </button>
                    <button class="btn-icon btn-delete" type="button" title="Eliminar venta" aria-label="Eliminar ${this.escapeHtml(venta.numero_venta)}" onclick="VentasModule.deleteSale('${this.escapeHtml(venta.id)}')">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </td>
            </tr>`).join('');
    },

    // Si se facturó a un NIT, el nombre de la factura dice más que «Consumidor final».
    clienteNombre(venta) {
        const factura = venta.factura;
        if (!venta.cliente_id && factura && factura.estado === 'certificado' && factura.receptor_id !== 'CF') {
            return factura.receptor_nombre;
        }
        return venta.receptor_nombre;
    },

    // Ver la factura, o emitirla si la venta quedó como ticket y la facturación está activa.
    facturaButton(venta) {
        if (typeof FelModule === 'undefined') return '';
        const vigente = venta.factura && venta.factura.estado !== 'error';
        if (!vigente && !FelModule.activa()) return '';
        const label = vigente ? 'Ver factura' : 'Emitir factura';
        return `<button class="btn-icon" type="button" title="${label}" aria-label="${label} de ${this.escapeHtml(venta.numero_venta)}" onclick="VentasModule.openFactura('${this.escapeHtml(venta.id)}')">
                        <i class="fas fa-file-invoice" aria-hidden="true"></i>
                    </button>`;
    },

    openFactura(id) {
        const venta = this.state.ventas.find(entry => String(entry.id) === String(id));
        if (venta) FelModule.open(venta);
    },

    refreshTable() {
        if (this.state.initialized) this.loadData();
        else this.init();
    },

    paymentLabels: { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito: 'Crédito' },

    // Método de pago y, si es al crédito, lo que falta cobrar.
    paymentCell(venta) {
        const label = this.paymentLabels[venta.metodo_pago] || this.capitalize(venta.metodo_pago || 'efectivo');
        const pendiente = Number(venta.pendiente) || 0;
        if (venta.metodo_pago !== 'credito') return `<span class="badge badge-success">${label}</span>`;
        return pendiente > 0
            ? `<span class="badge badge-warning">${label}</span> <small>Pendiente ${formatQ(pendiente)}</small>`
            : `<span class="badge badge-success">${label} · pagada</span>`;
    },

    updateCreditHint() {
        const hint = document.getElementById('saleCreditHint');
        if (hint) hint.hidden = document.getElementById('salePaymentMethod').value !== 'credito';
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
        this.updateCreditHint();
        this.renderCatalogNotice();
        document.getElementById('saleModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    // Sin artículos con existencia no se puede vender: decirlo antes de que el usuario lo intente.
    renderCatalogNotice() {
        const notice = document.getElementById('saleCatalogNotice');
        if (!notice) return;
        const catalog = this.getCatalog();
        const withStock = catalog.filter(item => Number(item.stock) > 0);
        notice.hidden = withStock.length > 0;
        if (notice.hidden) return;
        notice.querySelector('span').textContent = catalog.length
            ? 'Tus artículos no tienen existencia. Edita un artículo y escribe cuántas unidades tienes para poder venderlo.'
            : 'Aún no tienes artículos. Crea tu primer artículo para poder venderlo.';
    },

    goToArticulos() {
        this.closeSaleModal();
        navigateToPage('codigos-articulos');
        if (!this.getCatalog().length) CodigosArticulosModule.openArticuloModal();
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
        if (this.state.savingClient) return;
        const nombre = document.getElementById('quickClientName').value.trim();
        const nit = document.getElementById('quickClientNit').value.trim() || 'CF';
        const dpi = document.getElementById('quickClientDpi').value.trim();
        if (!nombre) return this.notify('Escribe el nombre del cliente.', 'error');
        this.state.savingClient = true;
        try {
            const result = await this.apiRequest('/api/ventas/receptores', {
                method: 'POST',
                body: JSON.stringify({ nombre, nit, dpi, activo: true })
            });
            const cliente = result.cliente;
            this.state.receptores.push({ id: cliente.id, nombre: cliente.nombre, nit: cliente.nit, dpi: cliente.dpi, telefono: cliente.telefono, tipo: 'cliente' });
            this.selectRecipient(cliente.id, 'cliente');
            this.toggleQuickClient(false);
            this.notify('Cliente creado y seleccionado.', 'success');
        } catch (error) {
            this.notify(error.message, 'error');
        } finally {
            this.state.savingClient = false;
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
        results.innerHTML = matches.length ? matches.map(concepto => {
            const agotado = Number(concepto.stock) <= 0;
            return `
            <button class="concept-search-result" type="button" data-id="${this.escapeHtml(concepto.id)}"
                ${agotado ? 'disabled aria-disabled="true"' : ''}
                onclick="VentasModule.selectConcept(${index}, this.dataset.id)">
                <strong>${this.escapeHtml(concepto.nombre)}</strong>
                <small>${this.escapeHtml(concepto.codigo || 'Sin código')} · ${agotado ? 'Sin existencia: no se puede vender' : `Existencia: ${concepto.stock}`}</small>
            </button>`;
        }).join('') : '<div class="concept-search-empty">No hay artículos con ese nombre. Créalo en «Artículos e inventario».</div>';
        results.hidden = false;
        results.scrollIntoView({ block: 'nearest' });
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
            const subtotal = Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precio_unitario) || 0);
            const sections = this.getFilterOptions(item, 'seccion');
            const families = this.getFilterOptions(item, 'familia');
            const subfamilies = this.getFilterOptions(item, 'subfamilia');
            return `<tr>
                <td><div class="concept-search"><div class="concept-search-input"><i class="fas fa-search"></i>
                    <input id="saleConceptSearch-${index}" class="form-input" type="search" autocomplete="off" placeholder="Buscar artículo"
                        aria-label="Artículo de la línea ${index + 1}"
                        value="${this.escapeHtml(selected?.nombre || '')}" oninput="VentasModule.searchConcept(${index}, this.value)">
                    <button class="concept-filter-toggle" type="button" title="Filtrar artículos" aria-label="Filtrar artículos" onclick="VentasModule.toggleConceptFilters(${index})"><i class="fas fa-filter" aria-hidden="true"></i></button>
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
                <td><input class="form-input" type="text" inputmode="numeric" autocomplete="off" aria-label="Cantidad de la línea ${index + 1}" value="${this.escapeHtml(this.inputValue(item, 'cantidad'))}" onchange="VentasModule.updateItem(${index}, 'cantidad', this.value)"></td>
                <td><input class="form-input" type="text" inputmode="decimal" autocomplete="off" aria-label="Precio unitario de la línea ${index + 1}" value="${this.escapeHtml(this.inputValue(item, 'precio_unitario'))}" onchange="VentasModule.updateItem(${index}, 'precio_unitario', this.value)"></td>
                <td><strong>${Number.isFinite(subtotal) ? `${formatQ(subtotal)}` : '—'}</strong></td>
                <td><button class="btn-icon btn-delete" type="button" title="Quitar artículo" aria-label="Quitar la línea ${index + 1}" onclick="VentasModule.removeItem(${index})" ${this.state.items.length === 1 ? 'disabled' : ''}><i class="fas fa-trash" aria-hidden="true"></i></button></td>
            </tr>`;
        }).join('');
        this.updateTotalsOnly();
    },

    inputValue(item, field) {
        // Sin artículo elegido, el precio queda vacío en lugar de mostrar 0.
        if (field === 'precio_unitario' && !item.concepto_id && !item.texto?.[field]) return '';
        return item.texto?.[field] ?? item[field];
    },

    updateTotalsOnly() {
        const total = this.state.items.reduce((sum, item) =>
            sum + Math.max(0, Number(item.cantidad) || 0) * Math.max(0, Number(item.precio_unitario) || 0), 0);
        document.getElementById('saleCalculatedTotal').textContent = `${formatQ(total)}`;
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
        const lineError = this.findLineError(payload.items);
        if (!payload.fecha) {
            this.notify('Elige la fecha de la venta.', 'warning');
            document.getElementById('saleDate').focus();
            return;
        }
        if (lineError) {
            this.notify(lineError.message, 'warning');
            document.getElementById(lineError.focusId)?.focus();
            return;
        }
        if (payload.metodo_pago === 'credito' && !payload.cliente_id) {
            this.notify('Selecciona o crea un cliente: las ventas al crédito se cobran después en Cuentas por Cobrar.', 'warning');
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
            const destino = {
                efectivo: 'el ingreso quedó en Caja',
                credito: 'el saldo quedó en Cuentas por Cobrar'
            }[payload.metodo_pago] || 'quedó registrada como pagada';
            this.notify(`${id ? 'Venta actualizada' : 'Venta registrada'}: existencias descontadas y ${destino}.`, 'success');
            const tbody = document.querySelector('#ventasTable tbody');
            if (tbody && !this.state.ventas.length) tbody.innerHTML = '<tr><td colspan="7" class="text-center">Actualizando la lista…</td></tr>';
            await this.loadData();
        } catch (error) {
            this.notify(error.message, 'error');
            // Otra venta cambió las existencias: actualizar lo que se muestra al buscar.
            if (error.status === 409) this.loadData();
        } finally {
            button.disabled = false;
        }
    },

    findLineError(items) {
        const MAX_PRICE = 99999999.99;
        const line = (index, text) => items.length > 1
            ? `Línea ${index + 1}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`
            : text;
        for (const [index, item] of items.entries()) {
            const articulo = this.getCatalog().find(entry => entry.id === String(item.concepto_id));
            if (!item.concepto_id || !articulo) {
                return { message: line(index, 'Busca y elige un artículo de la lista.'), focusId: `saleConceptSearch-${index}` };
            }
            if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
                return { message: line(index, 'La cantidad debe ser un número entero mayor que 0.') };
            }
            if (item.cantidad > articulo.stock && !document.getElementById('saleId').value) {
                return { message: line(index, `Solo hay ${articulo.stock} unidades de «${articulo.nombre}». Baja la cantidad o registra una compra para tener más existencia.`) };
            }
            if (Number.isNaN(item.precio_unitario) || item.precio_unitario < 0 || item.precio_unitario > MAX_PRICE) {
                return { message: line(index, 'Escribe un precio válido, por ejemplo 25.50.') };
            }
        }
        return null;
    },

    viewSale(id) {
        const venta = this.state.ventas.find(entry => String(entry.id) === String(id));
        if (!venta) return;
        const esc = (value) => this.escapeHtml(value);
        const rows = venta.items.map(item => `
            <tr><td>${esc(item.concepto_nombre)}</td><td class="text-right">${esc(item.cantidad)}</td>
            <td class="text-right">${formatQ(Number(item.precio_unitario))}</td>
            <td class="text-right">${formatQ((Number(item.cantidad) * Number(item.precio_unitario)))}</td></tr>`).join('');
        CodigosArticulosModule.showDetailsModal(`Venta ${venta.numero_venta}`, `
            <p><strong>Cliente:</strong> ${esc(venta.receptor_nombre)}</p>
            <p><strong>Fecha:</strong> ${esc(this.formatDate(venta.fecha))}</p>
            <p><strong>Pago:</strong> ${this.paymentCell(venta)}</p>
            <div class="table-responsive"><table class="data-table" data-mobile-layout="grid">
                <thead><tr><th>Artículo</th><th class="text-right">Cantidad</th><th class="text-right">Precio</th><th class="text-right">Subtotal</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
            <p class="text-right"><strong>Total: ${formatQ(Number(venta.total))}</strong></p>
            ${venta.observaciones ? `<p><strong>Observaciones:</strong> ${esc(venta.observaciones)}</p>` : ''}`);
    },

    editSale(id) {
        const venta = this.state.ventas.find(entry => String(entry.id) === String(id));
        if (venta) this.openSaleModal(venta);
    },

    async deleteSale(id) {
        if (!confirm('¿Eliminar esta venta? Se devolverán las existencias y se anulará su ingreso en caja.')) return;
        try {
            await this.apiRequest(`/api/ventas/${id}`, { method: 'DELETE' });
            await this.loadData();
            this.notify('Venta eliminada: existencias devueltas y caja ajustada.', 'success');
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