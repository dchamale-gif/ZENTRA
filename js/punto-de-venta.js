// ============================================
// PUNTO DE VENTA
// Cuentas abiertas compartidas (un cliente en mostrador, un pedido, una mesa):
// varios usuarios agregan productos a la misma cuenta y cada pantalla se
// sincroniza sola. Al cobrar se crea una venta normal.
// ============================================

const PosModule = {
    POLL_MS: 4000,
    CATALOG_REFRESH_MS: 60000,
    STORAGE_KEY: 'pos.cuentaSeleccionada',

    state: {
        articulos: [],
        cuentas: [],
        cuenta: null,
        cuentaId: '',
        search: '',
        seccion: '',
        familia: '',
        pending: 0,
        catalogLoadedAt: 0,
        polling: null,
        syncError: false,
        initialized: false
    },

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        this.state.cuentaId = this.readStoredCuenta();

        document.getElementById('posSearch')?.addEventListener('input', (event) => {
            this.state.search = event.target.value;
            this.renderProducts();
        });
        document.getElementById('posSearch')?.addEventListener('keydown', (event) => this.onSearchKey(event));
        document.getElementById('posSecciones')?.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-seccion]');
            if (!chip) return;
            this.state.seccion = chip.dataset.seccion;
            this.state.familia = '';
            this.renderFilters();
            this.renderProducts();
        });
        document.getElementById('posFamilias')?.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-familia]');
            if (!chip) return;
            this.state.familia = chip.dataset.familia;
            this.renderFilters();
            this.renderProducts();
        });
        document.getElementById('posProducts')?.addEventListener('click', (event) => {
            const tile = event.target.closest('[data-articulo]');
            if (tile && !tile.disabled) this.addItem(tile.dataset.articulo);
        });
        document.getElementById('posCuentas')?.addEventListener('click', (event) => {
            const tab = event.target.closest('[data-cuenta]');
            if (tab) this.selectCuenta(tab.dataset.cuenta);
        });
        document.getElementById('posLines')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-line-action]');
            if (button) this.lineAction(button.dataset.lineAction, button.dataset.item);
        });
        document.getElementById('posNewAccountBtn')?.addEventListener('click', () => this.openNewAccount());
        document.getElementById('posNewAccountForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.createCuenta();
        });
        document.getElementById('posChargeBtn')?.addEventListener('click', () => this.openCharge());
        document.getElementById('posChargeForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.charge();
        });
        document.getElementById('posChargeForm')?.addEventListener('input', () => this.renderChange());
        document.getElementById('posRenameBtn')?.addEventListener('click', () => this.renameCuenta());
        document.getElementById('posCancelBtn')?.addEventListener('click', () => this.anularCuenta());
        document.getElementById('posTicketJump')?.addEventListener('click', () => {
            document.getElementById('posTicket')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isActive()) this.sync();
        });

        this.applyAccess();
        this.load();
        this.state.polling = setInterval(() => {
            if (this.isActive() && document.visibilityState === 'visible') this.sync();
        }, this.POLL_MS);
    },

    // Se llama al entrar a la página.
    refresh() {
        if (!this.state.initialized) return this.init();
        this.applyAccess();
        this.load();
    },

    isActive() {
        return document.getElementById('page-punto-de-venta')?.classList.contains('active');
    },

    canSell() {
        return AccessControl.canEdit('ventas');
    },

    applyAccess() {
        document.getElementById('page-punto-de-venta')?.classList.toggle('pos-readonly', !this.canSell());
    },

    async apiRequest(path, options = {}) {
        let response;
        try {
            response = await fetch(`${authManager.apiBaseUrl}${path}`, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...options.headers }
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

    async load() {
        if (typeof FelModule !== 'undefined') FelModule.loadEstado();
        await Promise.all([this.loadCatalog(), this.sync({ force: true })]);
        // Si la empresa conectó su página web, traer productos y fotos nuevos sin hacer esperar.
        if (typeof IntegracionModule !== 'undefined' && await IntegracionModule.autoSync()) this.loadCatalog();
    },

    async loadCatalog() {
        try {
            const data = await this.apiRequest('/api/pos/catalogo');
            this.state.articulos = (data.articulos || []).map(articulo => ({
                id: String(articulo.id),
                codigo: articulo.codigo || '',
                nombre: articulo.nombre,
                seccion: articulo.seccion || '',
                familia: articulo.familia || '',
                precio: Number(articulo.precio) || 0,
                stock: Number(articulo.stock) || 0,
                fotoVersion: articulo.foto_version || ''
            }));
            this.state.catalogLoadedAt = Date.now();
        } catch (error) {
            this.notify(`No se pudo cargar el catálogo: ${error.message}`, 'error');
        }
        this.renderFilters();
        this.renderProducts();
    },

    // Trae las cuentas abiertas y, si la seleccionada cambió (otro usuario agregó algo), su detalle.
    async sync({ force = false } = {}) {
        if (this.state.syncing) return;
        this.state.syncing = true;
        try {
            const data = await this.apiRequest('/api/pos/cuentas');
            this.state.cuentas = data.cuentas || [];
            this.setSyncError(false);

            const ids = this.state.cuentas.map(cuenta => cuenta.id);
            if (!ids.includes(this.state.cuentaId)) {
                if (this.state.cuentaId && this.state.cuenta) {
                    this.notify(`La cuenta «${this.state.cuenta.nombre}» se cerró en otro equipo.`, 'info');
                }
                this.state.cuentaId = ids[0] || '';
                this.state.cuenta = null;
                this.storeCuenta();
            }
            const summary = this.state.cuentas.find(cuenta => cuenta.id === this.state.cuentaId);
            // Mientras hay toques en camino, la respuesta de esos toques trae la cuenta al día.
            if (summary && this.state.pending === 0 &&
                (force || !this.state.cuenta || this.state.cuenta.id !== summary.id || this.state.cuenta.version !== summary.version)) {
                const detail = await this.apiRequest(`/api/pos/cuentas/${encodeURIComponent(summary.id)}`);
                this.applyCuenta(detail.cuenta);
            }
            if (Date.now() - this.state.catalogLoadedAt > this.CATALOG_REFRESH_MS) this.loadCatalog();
        } catch (error) {
            this.setSyncError(true);
        } finally {
            this.state.syncing = false;
            this.renderCuentas();
            this.renderTicket();
        }
    },

    // Las respuestas pueden llegar desordenadas: solo se aplica una versión igual o más nueva.
    applyCuenta(cuenta) {
        if (!cuenta || cuenta.id !== this.state.cuentaId) return;
        if (this.state.cuenta?.id === cuenta.id && this.state.cuenta.version > cuenta.version) return;
        this.state.cuenta = cuenta;
        const summary = this.state.cuentas.find(entry => entry.id === cuenta.id);
        if (summary) Object.assign(summary, { version: cuenta.version, total: cuenta.total, unidades: cuenta.unidades, nombre: cuenta.nombre });
        this.renderCuentas();
        this.renderTicket();
    },

    setSyncError(failed) {
        this.state.syncError = failed;
        const status = document.getElementById('posSyncStatus');
        if (!status) return;
        status.textContent = failed ? 'Sin conexión: reintentando…' : 'Sincronizado';
        status.classList.toggle('pos-sync-error', failed);
    },

    selectCuenta(id) {
        if (id === this.state.cuentaId) return;
        this.state.cuentaId = id;
        this.state.cuenta = null;
        this.storeCuenta();
        this.renderCuentas();
        this.renderTicket();
        this.sync({ force: true });
    },

    readStoredCuenta() {
        try { return localStorage.getItem(this.STORAGE_KEY) || ''; } catch { return ''; }
    },

    storeCuenta() {
        try { localStorage.setItem(this.STORAGE_KEY, this.state.cuentaId); } catch { /* opcional */ }
    },

    // ---------- Catálogo y filtros ----------

    filteredProducts() {
        const term = this.normalize(this.state.search);
        return this.state.articulos.filter(articulo =>
            (!this.state.seccion || articulo.seccion === this.state.seccion) &&
            (!this.state.familia || articulo.familia === this.state.familia) &&
            (!term || this.normalize(`${articulo.nombre} ${articulo.codigo}`).includes(term))
        );
    },

    renderFilters() {
        const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        const secciones = unique(this.state.articulos.map(articulo => articulo.seccion));
        if (this.state.seccion && !secciones.includes(this.state.seccion)) this.state.seccion = '';
        const chip = (attr, value, label, active) =>
            `<button type="button" class="pos-chip${active ? ' active' : ''}" data-${attr}="${this.escape(value)}" aria-pressed="${active}">${this.escape(label)}</button>`;

        const seccionesEl = document.getElementById('posSecciones');
        if (seccionesEl) {
            seccionesEl.hidden = secciones.length === 0;
            seccionesEl.innerHTML = chip('seccion', '', 'Todo', !this.state.seccion) +
                secciones.map(seccion => chip('seccion', seccion, seccion, this.state.seccion === seccion)).join('');
        }

        const familias = unique(this.state.articulos
            .filter(articulo => !this.state.seccion || articulo.seccion === this.state.seccion)
            .map(articulo => articulo.familia));
        if (this.state.familia && !familias.includes(this.state.familia)) this.state.familia = '';
        const familiasEl = document.getElementById('posFamilias');
        if (familiasEl) {
            familiasEl.hidden = familias.length < 2;
            familiasEl.innerHTML = chip('familia', '', 'Todas', !this.state.familia) +
                familias.map(familia => chip('familia', familia, familia, this.state.familia === familia)).join('');
        }
    },

    renderProducts() {
        const container = document.getElementById('posProducts');
        if (!container) return;
        if (!this.state.articulos.length) {
            container.innerHTML = `<div class="pos-empty">
                <p>Aún no hay productos para vender.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="navigateToPage('codigos-articulos')">Crear productos en Artículos</button>
            </div>`;
            return;
        }
        const products = this.filteredProducts();
        if (!products.length) {
            container.innerHTML = `<div class="pos-empty">
                <p>${this.state.search.trim() ? `Ningún producto coincide con «${this.escape(this.state.search.trim())}».` : 'No hay productos en este filtro.'}</p>
                <button type="button" class="btn btn-secondary btn-sm" onclick="PosModule.clearFilters()">Quitar filtros</button>
            </div>`;
            return;
        }
        const inCuenta = this.unitsByArticulo();
        const disabled = !this.canSell();
        // Si alguno tiene foto, los demás llevan un espacio vacío para que las tarjetas queden parejas.
        const withPhotos = products.some(articulo => articulo.fotoVersion);
        container.innerHTML = products.map(articulo => {
            const units = inCuenta[articulo.id] || 0;
            const sinStock = articulo.stock <= 0;
            return `<button type="button" class="pos-product${sinStock ? ' pos-product-out' : ''}${withPhotos ? ' pos-product-photo' : ''}" data-articulo="${this.escape(articulo.id)}"
                ${disabled || sinStock ? 'disabled' : ''} title="${sinStock ? 'Sin existencia' : `Agregar ${this.escape(articulo.nombre)}`}">
                ${units ? `<span class="pos-product-count" aria-label="${units} en la cuenta">${units}</span>` : ''}
                ${articulo.fotoVersion
                    ? `<img class="pos-product-img" src="${this.fotoUrl(articulo)}" alt="" loading="lazy" decoding="async">`
                    : (withPhotos ? '<span class="pos-product-img pos-product-img-empty" aria-hidden="true"><i class="fas fa-image"></i></span>' : '')}
                <span class="pos-product-name">${this.escape(articulo.nombre)}</span>
                <span class="pos-product-meta">
                    <strong>${formatQ(articulo.precio)}</strong>
                    <small>${sinStock ? 'Sin existencia' : `${articulo.stock} disp.`}</small>
                </span>
            </button>`;
        }).join('');
    },

    fotoUrl(articulo) {
        return `${authManager.apiBaseUrl}/api/codigos-articulos/${encodeURIComponent(articulo.id)}/foto?v=${encodeURIComponent(articulo.fotoVersion)}`;
    },

    clearFilters() {
        this.state.search = '';
        this.state.seccion = '';
        this.state.familia = '';
        const search = document.getElementById('posSearch');
        if (search) search.value = '';
        this.renderFilters();
        this.renderProducts();
    },

    // Enter agrega el producto si el código coincide exacto (lector de código de barras)
    // o si la búsqueda deja un solo resultado.
    onSearchKey(event) {
        if (event.key === 'Escape') {
            this.clearFilters();
            return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const term = this.normalize(this.state.search);
        if (!term) return;
        const exact = this.state.articulos.find(articulo => this.normalize(articulo.codigo) === term);
        const matches = this.filteredProducts();
        const target = exact || (matches.length === 1 ? matches[0] : null);
        if (!target) {
            this.notify(matches.length ? 'Hay varios productos; tócalo en la lista.' : 'Ningún producto con ese nombre o código.', 'warning');
            return;
        }
        this.addItem(target.id);
        event.target.value = '';
        this.state.search = '';
        this.renderProducts();
    },

    unitsByArticulo() {
        return (this.state.cuenta?.items || []).reduce((units, item) => {
            units[item.articulo_id] = (units[item.articulo_id] || 0) + Number(item.cantidad);
            return units;
        }, {});
    },

    // ---------- Cuentas ----------

    renderCuentas() {
        const container = document.getElementById('posCuentas');
        if (!container) return;
        if (!this.state.cuentas.length) {
            container.innerHTML = '<p class="pos-muted">No hay cuentas abiertas.</p>';
            return;
        }
        container.innerHTML = this.state.cuentas.map(cuenta => {
            const active = cuenta.id === this.state.cuentaId;
            return `<button type="button" role="tab" class="pos-account${active ? ' active' : ''}" aria-selected="${active}" data-cuenta="${this.escape(cuenta.id)}">
                <span>${this.escape(cuenta.nombre)}</span>
                <small>${Number(cuenta.unidades) ? formatQ(Number(cuenta.total)) : 'Vacía'}</small>
            </button>`;
        }).join('');
    },

    renderTicket() {
        const cuenta = this.state.cuenta;
        const summary = this.state.cuentas.find(entry => entry.id === this.state.cuentaId);
        const title = document.getElementById('posTicketTitle');
        const meta = document.getElementById('posTicketMeta');
        const lines = document.getElementById('posLines');
        const total = Number(cuenta?.total ?? summary?.total ?? 0);
        const units = Number(cuenta?.unidades ?? summary?.unidades ?? 0);

        document.getElementById('posTicket')?.classList.toggle('pos-ticket-empty-state', !summary);
        if (title) title.textContent = summary ? summary.nombre : 'Sin cuenta seleccionada';
        if (meta) {
            meta.textContent = summary
                ? `Abierta por ${summary.abierta_por_nombre || '—'} · ${this.formatTime(summary.created_at)}`
                : 'Abre una cuenta para empezar a agregar productos.';
        }
        ['posRenameBtn', 'posCancelBtn'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.hidden = !summary || !this.canSell();
        });

        if (lines) {
            if (!summary) {
                lines.innerHTML = `<li class="pos-empty">
                    <p>Toca un producto para empezar una venta. Puedes tener varias cuentas abiertas (una por cliente o pedido) y varias personas pueden agregar a la misma cuenta a la vez.</p>
                    ${this.canSell() ? '<button type="button" class="btn btn-primary btn-sm" onclick="PosModule.openNewAccount()"><i class="fas fa-plus" aria-hidden="true"></i> Abrir cuenta</button>' : ''}
                </li>`;
            } else if (!cuenta) {
                lines.innerHTML = '<li class="pos-muted">Cargando…</li>';
            } else if (!cuenta.items.length) {
                lines.innerHTML = '<li class="pos-empty"><p>La cuenta está vacía. Toca un producto para agregarlo.</p></li>';
            } else {
                const stockById = Object.fromEntries(this.state.articulos.map(articulo => [articulo.id, articulo.stock]));
                const unitsById = this.unitsByArticulo();
                const myId = authManager.getUser()?.id;
                lines.innerHTML = cuenta.items.map(item => {
                    const qty = Number(item.cantidad);
                    const stock = stockById[item.articulo_id];
                    const overStock = stock !== undefined && unitsById[item.articulo_id] > stock;
                    const byOther = myId !== undefined && String(item.user_id) !== String(myId);
                    return `<li class="pos-line">
                        <div class="pos-line-info">
                            <span class="pos-line-name">${this.escape(item.nombre)}</span>
                            <small>${formatQ(Number(item.precio_unitario))} c/u${byOther ? ` · agregó ${this.escape(item.usuario_nombre || 'otro usuario')}` : ''}${item.nota ? ` · ${this.escape(item.nota)}` : ''}</small>
                            ${overStock ? `<small class="pos-line-warning">Solo hay ${stock} en existencia</small>` : ''}
                        </div>
                        <div class="pos-line-qty pos-sell-only">
                            <button type="button" class="pos-qty-btn" data-line-action="minus" data-item="${this.escape(item.id)}" aria-label="Quitar una unidad de ${this.escape(item.nombre)}"><i class="fas fa-minus" aria-hidden="true"></i></button>
                            <span aria-live="polite">${qty}</span>
                            <button type="button" class="pos-qty-btn" data-line-action="plus" data-item="${this.escape(item.id)}" aria-label="Agregar una unidad de ${this.escape(item.nombre)}"><i class="fas fa-plus" aria-hidden="true"></i></button>
                        </div>
                        <span class="pos-line-qty-readonly">× ${qty}</span>
                        <strong class="pos-line-total">${formatQ(qty * Number(item.precio_unitario))}</strong>
                        <button type="button" class="pos-line-remove pos-sell-only" data-line-action="remove" data-item="${this.escape(item.id)}" aria-label="Quitar ${this.escape(item.nombre)} de la cuenta" title="Quitar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
                    </li>`;
                }).join('');
            }
        }

        const totalEl = document.getElementById('posTotal');
        if (totalEl) totalEl.textContent = formatQ(total);
        const unitsEl = document.getElementById('posUnits');
        if (unitsEl) unitsEl.textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
        const chargeBtn = document.getElementById('posChargeBtn');
        if (chargeBtn) {
            chargeBtn.disabled = !cuenta || !cuenta.items.length;
            chargeBtn.innerHTML = `<i class="fas fa-cash-register" aria-hidden="true"></i> Cobrar ${formatQ(total)}`;
        }
        const jump = document.getElementById('posTicketJump');
        if (jump) {
            jump.hidden = !summary;
            jump.innerHTML = `<span>${this.escape(summary?.nombre || '')} · ${units} ${units === 1 ? 'producto' : 'productos'}</span><strong>${formatQ(total)}</strong>`;
        }
        this.renderProducts();
    },

    openNewAccount() {
        if (!this.canSell()) return;
        const input = document.getElementById('posNewAccountName');
        input.value = this.suggestName();
        this.openModal('posNewAccountModal');
        input.focus();
        input.select();
    },

    // Propone el siguiente número libre para que abrir una cuenta sea un solo Enter.
    suggestName() {
        const used = new Set(this.state.cuentas.map(cuenta => this.normalize(cuenta.nombre)));
        let number = 1;
        while (used.has(`cuenta ${number}`)) number += 1;
        return `Cuenta ${number}`;
    },

    async createCuenta() {
        const input = document.getElementById('posNewAccountName');
        const nombre = input.value.trim();
        const error = document.getElementById('posNewAccountError');
        error.hidden = true;
        if (!nombre) {
            error.textContent = 'Escribe un nombre, por ejemplo el del cliente o «Cuenta 3».';
            error.hidden = false;
            input.focus();
            return;
        }
        const button = document.getElementById('posNewAccountSubmit');
        button.disabled = true;
        try {
            const data = await this.apiRequest('/api/pos/cuentas', { method: 'POST', body: JSON.stringify({ nombre }) });
            this.closeModal('posNewAccountModal');
            this.state.cuentas.push({ ...data.cuenta });
            this.state.cuentaId = data.cuenta.id;
            this.state.cuenta = null;
            this.storeCuenta();
            this.applyCuenta(data.cuenta);
            document.getElementById('posSearch')?.focus();
        } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
            input.focus();
        } finally {
            button.disabled = false;
        }
    },

    async quickOpenCuenta() {
        if (this.state.opening) return this.state.opening;
        this.state.opening = this.apiRequest('/api/pos/cuentas', {
            method: 'POST',
            body: JSON.stringify({ nombre: this.suggestName() })
        }).then(data => {
            this.state.cuentas.push({ ...data.cuenta });
            this.state.cuentaId = data.cuenta.id;
            this.state.cuenta = null;
            this.storeCuenta();
            this.applyCuenta(data.cuenta);
            return true;
        }).catch(error => {
            // Otro usuario abrió ese mismo número un instante antes.
            this.notify(error.message, 'error');
            this.sync({ force: true });
            return false;
        }).finally(() => { this.state.opening = null; });
        return this.state.opening;
    },

    async renameCuenta() {
        const summary = this.state.cuentas.find(entry => entry.id === this.state.cuentaId);
        if (!summary) return;
        const nombre = prompt('Nuevo nombre de la cuenta', summary.nombre);
        if (!nombre || nombre.trim() === summary.nombre) return;
        await this.mutate(`/api/pos/cuentas/${encodeURIComponent(summary.id)}`, 'PUT', { nombre: nombre.trim() });
    },

    async anularCuenta() {
        const summary = this.state.cuentas.find(entry => entry.id === this.state.cuentaId);
        if (!summary) return;
        const detail = Number(summary.unidades) ? ` Tiene ${summary.unidades} productos por ${formatQ(Number(summary.total))} que no se cobrarán.` : '';
        if (!confirm(`¿Anular la cuenta «${summary.nombre}»?${detail}`)) return;
        try {
            await this.apiRequest(`/api/pos/cuentas/${encodeURIComponent(summary.id)}`, { method: 'DELETE' });
            this.notify(`Cuenta «${summary.nombre}» anulada.`, 'success');
            this.state.cuenta = null;
            this.state.cuentaId = '';
            await this.sync({ force: true });
        } catch (error) {
            this.notify(error.message, 'error');
            this.sync({ force: true });
        }
    },

    // ---------- Líneas ----------

    async addItem(articuloId) {
        if (!this.canSell()) return;
        // Venta de mostrador: sin cuenta seleccionada, el primer toque abre una.
        if (!this.state.cuentaId && !(await this.quickOpenCuenta())) return;
        const articulo = this.state.articulos.find(entry => entry.id === articuloId);
        if (articulo && (this.unitsByArticulo()[articuloId] || 0) >= articulo.stock) {
            this.notify(`Solo hay ${articulo.stock} de «${articulo.nombre}» en existencia; al cobrar no alcanzará.`, 'warning');
        }
        this.bumpPreview(articuloId);
        await this.mutate(`/api/pos/cuentas/${encodeURIComponent(this.state.cuentaId)}/items`, 'POST', { articulo_id: articuloId, cantidad: 1 });
    },

    // Respuesta inmediata al toque, antes de que conteste el servidor.
    bumpPreview(articuloId) {
        const tile = document.querySelector(`.pos-product[data-articulo="${CSS.escape(articuloId)}"]`);
        if (!tile) return;
        let badge = tile.querySelector('.pos-product-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pos-product-count';
            tile.prepend(badge);
        }
        badge.textContent = Number(badge.textContent || 0) + 1;
    },

    lineAction(action, itemId) {
        const base = `/api/pos/cuentas/${encodeURIComponent(this.state.cuentaId)}/items/${encodeURIComponent(itemId)}`;
        if (action === 'remove') return this.mutate(base, 'DELETE');
        return this.mutate(base, 'PUT', { delta: action === 'plus' ? 1 : -1 });
    },

    async mutate(path, method, body) {
        this.state.pending += 1;
        try {
            const data = await this.apiRequest(path, { method, body: body ? JSON.stringify(body) : undefined });
            this.applyCuenta(data.cuenta);
        } catch (error) {
            this.notify(error.message, 'error');
            // La cuenta pudo cerrarse o cambiar en otro equipo.
            if ([404, 409].includes(error.status)) this.state.cuenta = null;
        } finally {
            this.state.pending -= 1;
            if (this.state.pending === 0 && !this.state.cuenta) this.sync({ force: true });
            else if (this.state.pending === 0) this.renderTicket();
        }
    },

    // ---------- Cobro ----------

    openCharge() {
        const cuenta = this.state.cuenta;
        if (!cuenta || !cuenta.items.length) return;
        document.getElementById('posChargeForm').reset();
        document.getElementById('posChargeTitle').textContent = `Cobrar «${cuenta.nombre}»`;
        document.getElementById('posChargeTotal').textContent = formatQ(Number(cuenta.total));
        document.getElementById('posChargeError').hidden = true;
        // Ticket o factura: solo si la empresa tiene la facturación activa.
        const fel = typeof FelModule !== 'undefined' && FelModule.activa();
        document.getElementById('posComprobante').hidden = !fel;
        if (fel && FelModule.state.estado.comprobantePorDefecto === 'factura') {
            document.querySelector('input[name="posComprobante"][value="factura"]').checked = true;
        }
        this.renderChange();
        this.openModal('posChargeModal');
        document.getElementById('posChargeReceived').focus();
    },

    comprobante() {
        if (document.getElementById('posComprobante').hidden) return 'ticket';
        return document.querySelector('input[name="posComprobante"]:checked')?.value || 'ticket';
    },

    renderChange() {
        const method = document.querySelector('input[name="posPaymentMethod"]:checked')?.value || 'efectivo';
        const cashGroup = document.getElementById('posCashGroup');
        cashGroup.hidden = method !== 'efectivo';
        document.getElementById('posReceptor').hidden = this.comprobante() !== 'factura';
        const total = Number(this.state.cuenta?.total || 0);
        const received = Number(document.getElementById('posChargeReceived').value);
        const change = document.getElementById('posChargeChange');
        if (method !== 'efectivo' || !received) {
            change.textContent = '';
            return;
        }
        change.textContent = received >= total
            ? `Cambio: ${formatQ(received - total)}`
            : `Faltan ${formatQ(total - received)}`;
        change.classList.toggle('pos-line-warning', received < total);
    },

    async charge() {
        const cuenta = this.state.cuenta;
        if (!cuenta) return;
        const method = document.querySelector('input[name="posPaymentMethod"]:checked')?.value || 'efectivo';
        const received = Number(document.getElementById('posChargeReceived').value);
        const error = document.getElementById('posChargeError');
        error.hidden = true;
        if (method === 'efectivo' && received && received < Number(cuenta.total)) {
            error.textContent = `Lo recibido es menor al total. Faltan ${formatQ(Number(cuenta.total) - received)}.`;
            error.hidden = false;
            return;
        }
        const comprobante = this.comprobante();
        let receptor;
        if (comprobante === 'factura') {
            const leido = FelModule.leerReceptor(document.getElementById('posReceptorId'), document.getElementById('posReceptorNombre'));
            if (leido.error) {
                error.textContent = leido.error;
                error.hidden = false;
                leido.focus?.focus();
                return;
            }
            receptor = leido.receptor;
        }
        const button = document.getElementById('posChargeSubmit');
        button.disabled = true;
        try {
            const data = await this.apiRequest(`/api/pos/cuentas/${encodeURIComponent(cuenta.id)}/cobrar`, {
                method: 'POST',
                body: JSON.stringify({ metodo_pago: method, fecha: this.today(), comprobante, receptor })
            });
            this.closeModal('posChargeModal');
            const change = method === 'efectivo' && received > Number(cuenta.total)
                ? ` Cambio: ${formatQ(received - Number(cuenta.total))}.` : '';
            if (data.factura?.estado === 'certificado') {
                this.notify(`«${cuenta.nombre}» cobrada con factura ${data.factura.serie}-${data.factura.numero}.${change}`, 'success');
            } else if (data.factura) {
                // La venta ya quedó cobrada; la factura se puede reintentar desde Ventas.
                this.notify(`«${cuenta.nombre}» cobrada (venta ${data.venta.numero_venta}), pero la factura no se certificó: ${data.factura.error}. Emítela desde Ventas.${change}`, 'warning');
            } else {
                this.notify(`«${cuenta.nombre}» cobrada: venta ${data.venta.numero_venta}.${change}`, 'success');
            }
            this.state.cuenta = null;
            this.state.cuentaId = '';
            await Promise.all([this.sync({ force: true }), this.loadCatalog()]);
        } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
            if (requestError.status === 409) this.loadCatalog();
        } finally {
            button.disabled = false;
        }
    },

    // ---------- Utilidades ----------

    openModal(id) {
        document.getElementById(id).style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeModal(id) {
        document.getElementById(id).style.display = 'none';
        document.body.style.overflow = '';
    },

    today() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },

    formatTime(value) {
        return value ? new Date(value).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : '';
    },

    normalize(value = '') {
        return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    },

    escape(value = '') {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    },

    notify(message, type) {
        showNotification(message, type);
    }
};
