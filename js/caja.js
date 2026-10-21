// ============================================
// MÓDULO DE CAJA
// Movimientos guardados en la base de datos (/api/caja).
// ============================================

const CajaModule = {
    state: {
        movimientos: [],
        saldoCaja: 0,
        clientes: [],
        loading: false,
        error: null
    },
    tiposSalida: ['Egreso', 'Devolución'],
    searchTerm: '',
    filtroTipo: 'todos',
    filtroFecha: 'todos',

    init() {
        this.setupEventListeners();
        this.loadData();
        console.log('Módulo de Caja inicializado');
    },

    setupEventListeners() {
        document.getElementById('searchMovimientos')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.renderMovimientos();
        });
        document.getElementById('filterTipoMovimiento')?.addEventListener('change', (e) => {
            this.filtroTipo = e.target.value;
            this.renderMovimientos();
        });
        document.getElementById('filterFechaMovimiento')?.addEventListener('change', (e) => {
            this.filtroFecha = e.target.value;
            this.renderMovimientos();
        });
        document.querySelectorAll('#movimientoCajaModal .close-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeMovementModal());
        });
    },

    async apiRequest(path, options = {}) {
        const response = await authManager.fetchWithAuth(`/api/caja${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.message || data.error || `Error ${response.status}`);
        }
        return data;
    },

    async loadData() {
        this.state.loading = true;
        this.state.error = null;
        this.renderMovimientos();
        try {
            const [movimientos, resumen] = await Promise.all([
                this.apiRequest(''),
                this.apiRequest('/summary')
            ]);
            this.state.movimientos = (movimientos.data || []).map(mov => ({
                ...mov,
                monto: Number(mov.monto) || 0,
                fecha: String(mov.fecha || '').slice(0, 10),
                hora: mov.hora ? String(mov.hora).slice(0, 5) : ''
            }));
            this.state.saldoCaja = Number(resumen.data?.saldo) || 0;
        } catch (error) {
            console.error('Error cargando movimientos de caja:', error);
            this.state.error = error.message;
            this.state.movimientos = [];
        } finally {
            this.state.loading = false;
            this.renderMovimientos();
        }
    },

    // Dirección del movimiento según la base de datos; los tipos de salida quedan como respaldo.
    getDireccion(mov) {
        if (mov.direccion === 'entrada' || mov.direccion === 'salida') return mov.direccion;
        if (mov.direccion === 'transferencia' || mov.tipo === 'Transferencia') return 'transferencia';
        return this.tiposSalida.includes(mov.tipo) ? 'salida' : 'entrada';
    },

    async loadClientes() {
        const select = document.getElementById('movimientoClienteId');
        if (!select || this.state.clientes.length) return;
        try {
            const response = await authManager.fetchWithAuth('/api/clientes?activo=true');
            const data = response?.ok ? await response.json() : { clientes: [] };
            this.state.clientes = data.clientes || [];
            select.innerHTML = '<option value="">-- Cliente (opcional) --</option>' +
                this.state.clientes.map(cliente =>
                    `<option value="${this.escapeHtml(cliente.id)}">${this.escapeHtml(cliente.nombre)}</option>`
                ).join('');
        } catch (error) {
            console.warn('No se pudieron cargar los clientes:', error);
        }
    },

    openMovementModal() {
        const modal = document.getElementById('movimientoCajaModal');
        if (!modal) return;
        document.getElementById('editMovimientoCajaForm')?.reset();
        document.getElementById('movimientoCajaFecha').valueAsDate = new Date();
        modal.style.display = 'block';
        this.loadClientes();
    },

    closeMovementModal() {
        const modal = document.getElementById('movimientoCajaModal');
        if (modal) modal.style.display = 'none';
    },

    async addMovement() {
        const tipo = document.getElementById('movimientoCajaType')?.value;
        const monto = Number(document.getElementById('movimientoCajaMonto')?.value);
        const descripcion = document.getElementById('movimientoCajaDesc')?.value.trim();
        const referencia = document.getElementById('movimientoCajaRef')?.value.trim() || null;
        const fecha = document.getElementById('movimientoCajaFecha')?.value;
        const clienteId = document.getElementById('movimientoClienteId')?.value || null;

        if (!tipo || !descripcion || !fecha) {
            showNotification('Completa el tipo, la fecha y la descripción del movimiento', 'error');
            return;
        }
        if (!Number.isFinite(monto) || monto <= 0) {
            showNotification('El monto debe ser mayor a 0', 'error');
            return;
        }

        const saveButton = document.querySelector('#movimientoCajaModal .modal-footer .btn-primary');
        if (saveButton) saveButton.disabled = true;
        try {
            await this.apiRequest('', {
                method: 'POST',
                body: JSON.stringify({
                    tipo,
                    monto,
                    descripcion,
                    referencia,
                    fecha,
                    clienteId,
                    hora: new Date().toTimeString().slice(0, 8)
                })
            });
            this.closeMovementModal();
            showNotification('Movimiento registrado', 'success');
            await this.loadData();
        } catch (error) {
            showNotification(`No se pudo registrar el movimiento: ${error.message}`, 'error');
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    },

    async anularMovimiento(id) {
        const movimiento = this.state.movimientos.find(m => m.id === id);
        const detalle = movimiento ? ` "${movimiento.descripcion}" por ${formatQ(movimiento.monto)}` : '';
        if (!confirm(`¿Anular el movimiento${detalle}? Quedará fuera de los totales de caja.`)) return;
        try {
            await this.apiRequest(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
            showNotification('Movimiento anulado', 'success');
            await this.loadData();
        } catch (error) {
            showNotification(`No se pudo anular el movimiento: ${error.message}`, 'error');
        }
    },

    getFiltered() {
        let filtered = [...this.state.movimientos];

        if (this.filtroTipo === 'Ingreso') {
            filtered = filtered.filter(m => this.getDireccion(m) === 'entrada');
        } else if (this.filtroTipo === 'Egreso') {
            filtered = filtered.filter(m => this.getDireccion(m) === 'salida');
        } else if (this.filtroTipo === 'Transferencia') {
            filtered = filtered.filter(m => this.getDireccion(m) === 'transferencia');
        }

        const toIsoDate = (date) => date.toISOString().split('T')[0];
        if (this.filtroFecha === 'hoy') {
            const hoy = toIsoDate(new Date());
            filtered = filtered.filter(m => m.fecha === hoy);
        } else if (this.filtroFecha === 'semana') {
            const desde = toIsoDate(new Date(Date.now() - 7 * 86400000));
            filtered = filtered.filter(m => m.fecha >= desde);
        } else if (this.filtroFecha === 'mes') {
            const desde = toIsoDate(new Date(Date.now() - 30 * 86400000));
            filtered = filtered.filter(m => m.fecha >= desde);
        }

        if (this.searchTerm) {
            filtered = filtered.filter(m =>
                [m.cliente, m.referencia, m.descripcion, m.id]
                    .some(value => value && String(value).toLowerCase().includes(this.searchTerm))
            );
        }
        return filtered;
    },

    renderMovimientos() {
        const tbody = document.querySelector('#movementsTable tbody');
        if (!tbody) return;

        const filtered = this.getFiltered();
        this.updateCashStatus(filtered);

        if (this.state.loading) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Cargando movimientos...</td></tr>';
            return;
        }
        if (this.state.error) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 20px;">
                No se pudieron cargar los movimientos: ${this.escapeHtml(this.state.error)}.
                <button class="btn btn-secondary" onclick="CajaModule.loadData()">Reintentar</button>
            </td></tr>`;
            return;
        }
        if (this.state.movimientos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 24px;">
                Aún no hay movimientos de caja.
                <button class="btn btn-primary btn-sm" onclick="CajaModule.openMovementModal()"><i class="fas fa-plus"></i> Registrar el primero</button>
            </td></tr>`;
            return;
        }
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 20px; color: #999;">No hay movimientos que coincidan con los filtros</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(mov => {
            const direccion = this.getDireccion(mov);
            const badge = direccion === 'entrada' ? 'badge-success' : direccion === 'salida' ? 'badge-danger' : 'badge-info';
            const sign = direccion === 'entrada' ? '+' : direccion === 'salida' ? '-' : '';
            const amountClass = direccion === 'entrada' ? 'positive' : direccion === 'salida' ? 'negative' : '';
            return `
                <tr>
                    <td><strong>${this.escapeHtml(mov.id)}</strong></td>
                    <td>${this.escapeHtml(mov.fecha)} ${this.escapeHtml(mov.hora)}</td>
                    <td>${this.escapeHtml(mov.descripcion)}</td>
                    <td>${this.escapeHtml(mov.cliente || '-')}</td>
                    <td>${this.escapeHtml(mov.referencia || '-')}</td>
                    <td><span class="badge ${badge}">${this.escapeHtml(mov.tipo)}</span></td>
                    <td class="text-right"><span class="${amountClass}">${sign}${formatQ(mov.monto)}</span></td>
                    <td>${this.escapeHtml(mov.usuario)}</td>
                    <td class="actions">
                        <button class="btn-icon btn-delete" title="Anular movimiento" onclick="CajaModule.anularMovimiento('${this.escapeHtml(mov.id)}')">
                            <i class="fas fa-ban"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Totales de los movimientos visibles y saldo acumulado de la caja.
    updateCashStatus(filtered = this.getFiltered()) {
        const statusElement = document.getElementById('cashStatus');
        if (!statusElement) return;

        const sum = (direccion) => filtered
            .filter(m => this.getDireccion(m) === direccion)
            .reduce((total, m) => total + m.monto, 0);
        const ingresos = sum('entrada');
        const egresos = sum('salida');
        const tile = (label, value, tone = '') => `
            <div class="stat-tile ${tone}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;

        statusElement.innerHTML = `
            <div class="stat-strip">
                ${tile('Ingresos', `${formatQ(ingresos)}`, 'is-positive')}
                ${tile('Egresos', `${formatQ(egresos)}`, egresos > 0 ? 'is-danger' : '')}
                ${tile('Neto del período', `${formatQ((ingresos - egresos))}`)}
                ${tile('Saldo en caja', `${formatQ(this.state.saldoCaja)}`, 'is-accent')}
            </div>
        `;
    },

    refreshMovementsTable() {
        this.renderMovimientos();
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
