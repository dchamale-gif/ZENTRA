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
        error: null,
        depositos: [],
        depositosResumen: { pendientes: 0, montoPendiente: 0 },
        cuentasBancarias: [],
        depositosError: null,
        depositoFoto: null
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
        document.getElementById('depositosFiltro')?.addEventListener('change', () => this.loadDepositos());
        document.getElementById('depositosLista')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-deposito-action]');
            if (button) this.revisarDeposito(button.dataset.depositoId, button.dataset.depositoAction);
        });
        document.getElementById('depositoForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.registrarDeposito();
        });
        document.getElementById('depositoFoto')?.addEventListener('change', (event) => this.leerFotoBoleta(event.target.files[0]));
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
        await this.loadDepositos();
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
        const monto = parseMonto(document.getElementById('movimientoCajaMonto')?.value);
        const descripcion = document.getElementById('movimientoCajaDesc')?.value.trim();
        const referencia = document.getElementById('movimientoCajaRef')?.value.trim() || null;
        const fecha = document.getElementById('movimientoCajaFecha')?.value;
        const clienteId = document.getElementById('movimientoClienteId')?.value || null;

        if (!tipo || !descripcion || !fecha) {
            showNotification('Completa el tipo, la fecha y la descripción del movimiento', 'error');
            return;
        }
        if (!isValidMonto(monto)) {
            showNotification('Escribe un monto mayor que 0, por ejemplo 25.50 (máximo 99,999,999.99).', 'error');
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
            showNotification(`No se pudo registrar el movimiento. ${friendlyError(error)}`, 'error');
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
                ${tile('Depósitos por confirmar', formatQ(this.state.depositosResumen.montoPendiente), this.state.depositosResumen.pendientes ? 'is-warning' : '')}
            </div>
        `;
    },

    // ---------- Depósitos al banco ----------

    // Revisar depósitos: solo administradores (y no en soporte de solo lectura).
    puedeRevisar() {
        return AccessControl.isAdmin() && AccessControl.canEdit('caja');
    },

    async loadDepositos() {
        const estado = document.getElementById('depositosFiltro')?.value || '';
        try {
            const data = await this.apiRequest(`/depositos${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`);
            this.state.depositos = data.depositos || [];
            this.state.depositosResumen = data.resumen || { pendientes: 0, montoPendiente: 0 };
            this.state.cuentasBancarias = data.cuentas || [];
            this.state.depositosError = null;
        } catch (error) {
            this.state.depositosError = error.message;
        }
        this.renderDepositos();
        this.updateCashStatus();
    },

    renderDepositos() {
        const container = document.getElementById('depositosLista');
        if (!container) return;
        const depositoBtn = document.getElementById('cajaDepositoBtn');
        if (depositoBtn) depositoBtn.hidden = !AccessControl.canEdit('caja');
        const { pendientes, montoPendiente } = this.state.depositosResumen;
        const resumen = document.getElementById('depositosResumen');
        if (resumen) {
            resumen.textContent = pendientes
                ? `${pendientes} por confirmar, ${formatQ(montoPendiente)}.${this.puedeRevisar() ? ' Confírmalos cuando los veas en el banco.' : ' Un administrador los confirmará al verlos en el banco.'}`
                : 'Quien maneja la caja registra el depósito con su boleta; un administrador lo confirma al verlo en el banco.';
        }

        if (this.state.depositosError) {
            container.innerHTML = `<p class="depositos-empty">No se pudieron cargar los depósitos: ${this.escapeHtml(this.state.depositosError)}.
                <button class="btn btn-secondary btn-sm" type="button" onclick="CajaModule.loadDepositos()">Reintentar</button></p>`;
            return;
        }
        if (!this.state.depositos.length) {
            const filtrado = document.getElementById('depositosFiltro')?.value;
            container.innerHTML = `<p class="depositos-empty">${filtrado ? 'No hay depósitos en este estado.' : 'Aún no hay depósitos registrados.'}
                ${!filtrado && AccessControl.canEdit('caja') ? '<button class="btn btn-secondary btn-sm" type="button" onclick="CajaModule.openDepositoModal()"><i class="fas fa-building-columns" aria-hidden="true"></i> Registrar depósito</button>' : ''}</p>`;
            return;
        }

        const estados = {
            pendiente: ['badge-warning', 'Por confirmar'],
            confirmado: ['badge-success', 'Confirmado'],
            rechazado: ['badge-danger', 'Rechazado']
        };
        const revisar = this.puedeRevisar();
        const fechaHora = (value) => value ? new Date(value).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '';
        container.innerHTML = `<table class="data-table">
            <thead><tr>
                <th>Fecha</th><th>Cuenta y boleta</th><th class="text-right">Monto</th><th>Registró</th><th>Estado</th><th>Acciones</th>
            </tr></thead>
            <tbody>${this.state.depositos.map(dep => {
                const [badge, label] = estados[dep.estado] || ['', dep.estado];
                const id = this.escapeHtml(dep.id);
                const revision = dep.estado === 'pendiente' ? ''
                    : `<small>${dep.estado === 'confirmado' ? 'Confirmó' : 'Rechazó'} ${this.escapeHtml(dep.revisadoPor || '')} · ${this.escapeHtml(fechaHora(dep.revisadoAt))}</small>`;
                return `<tr class="${dep.estado === 'pendiente' ? 'deposito-pendiente' : ''}">
                    <td>${this.escapeHtml(dep.fecha)}</td>
                    <td>
                        <strong>${this.escapeHtml(dep.cuentaBancaria)}</strong>
                        <small class="deposito-detalle">Boleta ${this.escapeHtml(dep.numeroBoleta)}${dep.nota ? ` · ${this.escapeHtml(dep.nota)}` : ''}</small>
                    </td>
                    <td class="text-right"><strong>${formatQ(dep.monto)}</strong></td>
                    <td>${this.escapeHtml(dep.registradoPor || '-')}<small class="deposito-detalle">${this.escapeHtml(fechaHora(dep.registradoAt))}</small></td>
                    <td>
                        <span class="badge ${badge}">${label}</span>
                        ${revision}
                        ${dep.motivoRechazo ? `<small class="deposito-detalle">Motivo: ${this.escapeHtml(dep.motivoRechazo)}</small>` : ''}
                    </td>
                    <td class="actions"><div class="deposito-acciones">
                        ${dep.tieneBoleta ? `<a class="btn btn-secondary btn-sm" href="${authManager.apiBaseUrl}/api/caja/depositos/${encodeURIComponent(dep.id)}/boleta" target="_blank" rel="noopener"><i class="fas fa-image" aria-hidden="true"></i> Boleta</a>` : ''}
                        ${revisar && dep.estado === 'pendiente' ? `
                            <button class="btn btn-primary btn-sm" type="button" data-deposito-action="confirmar" data-deposito-id="${id}"><i class="fas fa-check" aria-hidden="true"></i> Confirmar</button>
                            <button class="btn btn-secondary btn-sm" type="button" data-deposito-action="rechazar" data-deposito-id="${id}">Rechazar</button>` : ''}
                    </div></td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    },

    openDepositoModal() {
        if (!AccessControl.canEdit('caja')) return;
        document.getElementById('depositoForm').reset();
        this.state.depositoFoto = null;
        document.getElementById('depositoError').hidden = true;
        document.getElementById('depositoEnCaja').textContent = formatQ(this.state.saldoCaja);
        // Lo normal es depositar todo el efectivo de la caja.
        if (this.state.saldoCaja > 0) document.getElementById('depositoMonto').value = this.state.saldoCaja.toFixed(2);
        document.getElementById('depositoFecha').value = this.today();
        document.getElementById('depositoCuentas').innerHTML = this.state.cuentasBancarias
            .map(cuenta => `<option value="${this.escapeHtml(cuenta)}"></option>`).join('');
        if (this.state.cuentasBancarias.length) document.getElementById('depositoCuenta').value = this.state.cuentasBancarias[0];
        document.getElementById('depositoModal').style.display = 'flex';
        document.getElementById('depositoMonto').focus();
    },

    closeDepositoModal() {
        document.getElementById('depositoModal').style.display = 'none';
    },

    async leerFotoBoleta(file) {
        this.state.depositoFoto = null;
        if (!file) return;
        try {
            // Grande para que se lean los números de la boleta.
            this.state.depositoFoto = await CodigosArticulosModule.resizeImage(file, 1600);
        } catch {
            this.showDepositoError('No se pudo leer la foto. Prueba con una foto JPG o PNG.');
            document.getElementById('depositoFoto').value = '';
        }
    },

    showDepositoError(message, focusId) {
        const error = document.getElementById('depositoError');
        error.textContent = message;
        error.hidden = false;
        if (focusId) document.getElementById(focusId)?.focus();
    },

    async registrarDeposito() {
        document.getElementById('depositoError').hidden = true;
        const monto = parseMonto(document.getElementById('depositoMonto').value);
        const fecha = document.getElementById('depositoFecha').value;
        const cuentaBancaria = document.getElementById('depositoCuenta').value.trim();
        const numeroBoleta = document.getElementById('depositoBoleta').value.trim();
        if (!isValidMonto(monto)) return this.showDepositoError('Escribe el monto depositado, por ejemplo 1500.00.', 'depositoMonto');
        if (monto > this.state.saldoCaja + 0.004) {
            return this.showDepositoError(`En la caja hay ${formatQ(this.state.saldoCaja)}; el depósito no puede ser mayor.`, 'depositoMonto');
        }
        if (!fecha) return this.showDepositoError('Elige la fecha del depósito.', 'depositoFecha');
        if (!cuentaBancaria) return this.showDepositoError('Escribe la cuenta bancaria donde depositaste.', 'depositoCuenta');
        if (!numeroBoleta) return this.showDepositoError('Escribe el número de la boleta.', 'depositoBoleta');

        const button = document.getElementById('depositoSubmit');
        button.disabled = true;
        try {
            const data = await this.apiRequest('/depositos', {
                method: 'POST',
                body: JSON.stringify({
                    monto,
                    fecha,
                    cuentaBancaria,
                    numeroBoleta,
                    nota: document.getElementById('depositoNota').value.trim(),
                    boleta: this.state.depositoFoto
                })
            });
            this.closeDepositoModal();
            showNotification(data.message, 'success');
            await this.loadData();
        } catch (error) {
            this.showDepositoError(error.message);
        } finally {
            button.disabled = false;
        }
    },

    async revisarDeposito(id, accion) {
        const deposito = this.state.depositos.find(dep => dep.id === id);
        if (!deposito) return;
        const detalle = `${formatQ(deposito.monto)} en ${deposito.cuentaBancaria}, boleta ${deposito.numeroBoleta}`;
        let body = {};
        if (accion === 'confirmar') {
            if (!confirm(`¿Confirmar que el depósito de ${detalle} ya está en el banco?`)) return;
        } else {
            const motivo = prompt(`¿Por qué rechazas el depósito de ${detalle}? El monto volverá a contar en la caja.`, 'No aparece en el banco');
            if (motivo === null) return;
            if (!motivo.trim()) return showNotification('Escribe el motivo del rechazo.', 'error');
            body = { motivo: motivo.trim() };
        }
        try {
            const data = await this.apiRequest(`/depositos/${encodeURIComponent(id)}/${accion}`, { method: 'POST', body: JSON.stringify(body) });
            showNotification(data.message, 'success');
            await this.loadData();
            if (typeof NotificationsModule !== 'undefined') NotificationsModule.refresh();
        } catch (error) {
            showNotification(`No se pudo ${accion} el depósito: ${error.message}`, 'error');
            this.loadDepositos();
        }
    },

    today() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
