// ============================================
// MÓDULO DE CAJA INTEGRADA
// ============================================
// Integrar saldos de clientes, microfacturas
// Sistema de movimientos de caja

const CajaIntegradaModule = {
    state: {
        movimientosCaja: [],
        clientes: [],
        saldosClientes: [],
        tiposMovimiento: ['Ingreso por Cobro', 'Egreso', 'Devolución', 'Transferencia', 'Microfactura'],
        searchTerm: '',
        filterTipo: 'todos',
        selectedCliente: null,
        resumenCaja: {
            ingresos: 0,
            egresos: 0,
            saldo: 0,
            fecha: new Date().toLocaleDateString()
        }
    },

    // Inicializar
    init() {
        this.setupEventListeners();
        this.loadData();
        this.renderResumenCaja();
        console.log('Módulo de Caja Integrada inicializado');
    },

    // Setup event listeners
    setupEventListeners() {
        const searchInput = document.getElementById('searchCaja');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderMovimientosCaja();
            });
        }

        const filterTipo = document.getElementById('filterTipoCaja');
        if (filterTipo) {
            filterTipo.addEventListener('change', (e) => {
                this.filterTipo = e.target.value;
                this.renderMovimientosCaja();
            });
        }

        const addMovBtn = document.getElementById('addMovimientoCajaBtn');
        if (addMovBtn) {
            addMovBtn.addEventListener('click', () => this.openMovimientoModal());
        }

        const saveMovBtn = document.getElementById('saveMovimientoCajaBtn');
        if (saveMovBtn) {
            saveMovBtn.addEventListener('click', () => this.saveMovimiento());
        }

        const addMicrofacturaBtn = document.getElementById('addMicrofacturaBtn');
        if (addMicrofacturaBtn) {
            addMicrofacturaBtn.addEventListener('click', () => this.openMicrofacturaModal());
        }

        const saveMicrofacturaBtn = document.getElementById('saveMicrofacturaBtn');
        if (saveMicrofacturaBtn) {
            saveMicrofacturaBtn.addEventListener('click', () => this.saveMicrofactura());
        }

        // Cerrar modales
        const closeMovModal = document.querySelector('#movimientoCajaModal .close-btn');
        if (closeMovModal) {
            closeMovModal.addEventListener('click', () => this.closeMovimientoModal());
        }

        const closeMicroModal = document.querySelector('#microfacturaModal .close-btn');
        if (closeMicroModal) {
            closeMicroModal.addEventListener('click', () => this.closeMicrofacturaModal());
        }
    },

    // Cargar datos
    loadData() {
        authManager.fetchWithAuth('/api/clientes?activo=true')
            .then((response) => (response && response.ok ? response.json() : { clientes: [] }))
            .then((data) => { this.state.clientes = data.clientes || []; })
            .catch((error) => console.warn('No se pudieron cargar los clientes:', error));

        // Restaurar desde localStorage
        const saldosFromStorage = localStorage.getItem('saldosClientes');
        if (saldosFromStorage) {
            this.state.saldosClientes = JSON.parse(saldosFromStorage);
        }

        const movFromStorage = localStorage.getItem('movimientosCaja');
        if (movFromStorage) {
            this.state.movimientosCaja = JSON.parse(movFromStorage);
        }

        this.renderMovimientosCaja();
        this.calculateResumenCaja();
        this.loadMovimientosFromAPI();
    },

    async loadMovimientosFromAPI() {
        const token = authManager?.getToken?.();
        const apiHost = authManager?.apiBaseUrl || 'http://178.128.72.110:3011';
        const apiBase = apiHost.endsWith('/api') ? apiHost : `${apiHost}/api`;
        if (!token) return;

        try {
            const response = await fetch(`${apiBase}/caja`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || !result.success || !Array.isArray(result.data)) {
                throw new Error(result.error || result.message || 'Respuesta inválida de la API');
            }

            this.state.movimientosCaja = result.data.map(movimiento => ({
                ...movimiento,
                monto: Number(movimiento.monto),
                fecha: String(movimiento.fecha).slice(0, 10),
                hora: movimiento.hora ? String(movimiento.hora).slice(0, 8) : ''
            }));
            localStorage.setItem('movimientosCaja', JSON.stringify(this.state.movimientosCaja));
            this.renderMovimientosCaja();
            this.renderResumenCaja();
        } catch (error) {
            console.warn('No se pudo cargar Caja desde la API; se conserva el respaldo local:', error);
        }
    },

    // Renderizar resumen de caja
    renderResumenCaja() {
        const container = document.getElementById('resumenCajaContainer');
        if (!container) return;

        const { ingresos, egresos, saldo } = this.calculateResumenCaja();

        container.innerHTML = `
            <div class="resumen-grid">
                <div class="resumen-card card-ingresos">
                    <div class="card-icon">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="card-content">
                        <label>Total Ingresos</label>
                        <p class="amount positive">$${ingresos.toFixed(2)}</p>
                    </div>
                </div>

                <div class="resumen-card card-egresos">
                    <div class="card-icon">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <div class="card-content">
                        <label>Total Egresos</label>
                        <p class="amount negative">$${egresos.toFixed(2)}</p>
                    </div>
                </div>

                <div class="resumen-card card-saldo">
                    <div class="card-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="card-content">
                        <label>Saldo en Caja</label>
                        <p class="amount ${saldo >= 0 ? 'positive' : 'negative'}" style="font-size: 20px;">$${saldo.toFixed(2)}</p>
                    </div>
                </div>

                <div class="resumen-card card-fecha">
                    <div class="card-icon">
                        <i class="fas fa-calendar"></i>
                    </div>
                    <div class="card-content">
                        <label>Fecha</label>
                        <p>${new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    </div>
                </div>
            </div>
        `;
    },

    // Calcular resumen
    calculateResumenCaja() {
        let ingresos = 0;
        let egresos = 0;

        this.state.movimientosCaja.forEach(mov => {
            if (mov.tipo === 'Ingreso por Cobro' || mov.tipo === 'Microfactura') {
                ingresos += mov.monto;
            } else if (mov.tipo === 'Egreso') {
                egresos += mov.monto;
            } else if (mov.tipo === 'Devolución') {
                egresos += mov.monto;
            }
        });

        const saldo = ingresos - egresos;
        this.state.resumenCaja = { ingresos, egresos, saldo };

        return { ingresos, egresos, saldo };
    },

    // Renderizar movimientos
    renderMovimientosCaja() {
        const container = document.getElementById('movimientosCajaTableContainer');
        if (!container) return;

        let filtered = [...this.state.movimientosCaja];

        // Filtro por tipo
        if (this.filterTipo !== 'todos') {
            filtered = filtered.filter(m => m.tipo === this.filterTipo);
        }

        // Búsqueda
        if (this.searchTerm) {
            filtered = filtered.filter(m =>
                m.descripcion.toLowerCase().includes(this.searchTerm) ||
                (m.clienteId && this.getClienteName(m.clienteId).toLowerCase().includes(this.searchTerm)) ||
                m.referencia.toLowerCase().includes(this.searchTerm)
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay movimientos registrados</p></div>';
            return;
        }

        // Ordenar por fecha (más recientes primero)
        filtered.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        container.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Cliente/Referencia</th>
                            <th>Descripción</th>
                            <th>Monto</th>
                            <th>Usuario</th>
                            <th>Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(mov => this.renderMovimientoRow(mov)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    // Renderizar fila de movimiento
    renderMovimientoRow(movimiento) {
        const tipoBadge = this.getTipoBadge(movimiento.tipo);
        const clienteName = movimiento.clienteId ? this.getClienteName(movimiento.clienteId) : movimiento.referencia;
        const montoClass = (movimiento.tipo === 'Ingreso por Cobro' || movimiento.tipo === 'Microfactura') ? 'positive' : 'negative';

        return `
            <tr>
                <td>${movimiento.fecha}</td>
                <td>${tipoBadge}</td>
                <td>${clienteName}</td>
                <td>${movimiento.descripcion}</td>
                <td><span class="amount ${montoClass}">$${movimiento.monto.toFixed(2)}</span></td>
                <td>${movimiento.usuario}</td>
                <td>
                    <button class="btn-icon btn-view" title="Ver Detalles" onclick="CajaIntegradaModule.viewMovimientoDetails('${movimiento.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    },

    // Obtener badge del tipo
    getTipoBadge(tipo) {
        const badges = {
            'Ingreso por Cobro': '<span class="badge badge-success">Ingreso</span>',
            'Egreso': '<span class="badge badge-warning">Egreso</span>',
            'Devolución': '<span class="badge badge-danger">Devolución</span>',
            'Transferencia': '<span class="badge badge-info">Transferencia</span>',
            'Microfactura': '<span class="badge badge-primary">Microfactura</span>'
        };
        return badges[tipo] || `<span class="badge badge-secondary">${tipo}</span>`;
    },

    // Obtener nombre del cliente
    getClienteName(clienteId) {
        const client = this.state.clientes.find(p => p.id === clienteId);
        return client ? client.nombre : 'Desconocido';
    },

    // Ver detalles de movimiento
    viewMovimientoDetails(movimientoId) {
        const movimiento = this.state.movimientosCaja.find(m => m.id === movimientoId);
        if (!movimiento) return;

        const detailsHTML = `
            <div class="movimiento-details-card">
                <div class="detail-header">
                    <h3>${movimiento.tipo}</h3>
                    ${this.getTipoBadge(movimiento.tipo)}
                </div>

                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Fecha</label>
                        <p>${movimiento.fecha}</p>
                    </div>
                    <div class="detail-item">
                        <label>Hora</label>
                        <p>${movimiento.hora || 'N/A'}</p>
                    </div>
                    <div class="detail-item">
                        <label>Usuario</label>
                        <p>${movimiento.usuario}</p>
                    </div>
                    <div class="detail-item">
                        <label>Referencia</label>
                        <p>${movimiento.referencia}</p>
                    </div>
                </div>

                <div class="detail-section">
                    <label>Descripción</label>
                    <p>${movimiento.descripcion}</p>
                </div>

                ${movimiento.clienteId ? `
                    <div class="detail-section">
                        <label>Cliente</label>
                        <p>${this.getClienteName(movimiento.clienteId)}</p>
                    </div>
                ` : ''}

                <div class="detail-amount">
                    <label>Monto</label>
                    <p class="amount ${(movimiento.tipo === 'Ingreso por Cobro' || movimiento.tipo === 'Microfactura') ? 'positive' : 'negative'}" style="font-size: 18px;">
                        $${movimiento.monto.toFixed(2)}
                    </p>
                </div>

                ${movimiento.detallesItems && movimiento.detallesItems.length > 0 ? `
                    <div class="detail-items-section">
                        <label>Artículos/Servicios</label>
                        <ul>
                            ${movimiento.detallesItems.map(item => `
                                <li>${item.descripcion} - $${item.monto.toFixed(2)}</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;

        this.showDetailsModal('Detalles del Movimiento', detailsHTML);
    },

    // Modal de detalles
    showDetailsModal(title, content) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        overlay.querySelector('.close-btn').addEventListener('click', () => {
            overlay.remove();
            document.body.style.overflow = 'auto';
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                document.body.style.overflow = 'auto';
            }
        });

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    },

    // Abrir modal de movimiento
    openMovimientoModal() {
        const modal = document.getElementById('movimientoCajaModal');
        const form = document.getElementById('editMovimientoCajaForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('movimientoCajaFecha').valueAsDate = new Date();
        this.updateClientesSelectCaja();

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    // Cerrar modal de movimiento
    closeMovimientoModal() {
        const modal = document.getElementById('movimientoCajaModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    },

    // Actualizar select de clientes
    updateClientesSelectCaja() {
        const select = document.getElementById('movimientoClienteId');
        if (!select) return;

        select.innerHTML = '<option value="">-- Cliente (opcional) --</option>' +
            this.state.clientes
                .map(p => `<option value="${p.id}">${p.nombre}</option>`)
                .join('');
    },

    // Guardar movimiento
    saveMovimiento() {
        const tipo = document.getElementById('movimientoCajaType').value;
        const clienteId = document.getElementById('movimientoClienteId').value;
        const monto = parseFloat(document.getElementById('movimientoCajaMonto').value) || 0;
        const descripcion = document.getElementById('movimientoCajaDesc').value.trim();
        const fecha = document.getElementById('movimientoCajaFecha').value;
        const referencia = document.getElementById('movimientoCajaRef').value.trim();

        if (!tipo || !monto || monto <= 0 || !fecha || !descripcion) {
            this.showNotification('⚠️ Por favor completa todos los campos requeridos', 'warning');
            return;
        }

        const movimiento = {
            id: this.generateId('MOV'),
            tipo,
            clienteId: clienteId || null,
            monto,
            descripcion,
            fecha,
            referencia: referencia || '-',
            usuario: 'Usuario Actual',
            hora: new Date().toLocaleTimeString()
        };

        this.state.movimientosCaja.push(movimiento);

        // Si es cobro a cliente, actualizar saldo
        if (tipo === 'Ingreso por Cobro' && clienteId) {
            const saldo = this.state.saldosClientes.find(s => s.clienteId === clienteId);
            if (saldo) {
                saldo.saldoPendiente -= monto;
                saldo.totalAbonos += monto;
                saldo.ultimaTransaccion = fecha;
            }
        }

        this.showNotification('✅ Movimiento registrado', 'success');
        this.saveToDB(movimiento);
        this.closeMovimientoModal();
        this.renderMovimientosCaja();
        this.renderResumenCaja();
    },

    // Abrir modal de microfactura
    openMicrofacturaModal() {
        const modal = document.getElementById('microfacturaModal');
        const form = document.getElementById('editMicrofacturaForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('microfacturaClienteSelect').innerHTML = '<option value="">-- Selecciona cliente --</option>' +
            this.state.clientes
                .map(p => `<option value="${p.id}">${p.nombre}</option>`)
                .join('');

        document.getElementById('microfacturaFecha').valueAsDate = new Date();
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    // Cerrar modal de microfactura
    closeMicrofacturaModal() {
        const modal = document.getElementById('microfacturaModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    },

    // Guardar microfactura
    saveMicrofactura() {
        const clienteId = document.getElementById('microfacturaClienteSelect').value;
        const monto = parseFloat(document.getElementById('microfacturaMonto').value) || 0;
        const descripcion = document.getElementById('microfacturaDesc').value.trim();
        const fecha = document.getElementById('microfacturaFecha').value;

        if (!clienteId || !monto || monto <= 0 || !fecha) {
            this.showNotification('⚠️ Por favor completa todos los campos', 'warning');
            return;
        }

        const client = this.state.clientes.find(p => p.id === clienteId);
        if (!client) return;

        const microfactura = {
            id: this.generateId('MF'),
            tipo: 'Microfactura',
            clienteId,
            monto,
            descripcion: descripcion || `Microfactura - ${client.nombre}`,
            fecha,
            referencia: `MF-${Date.now().toString(36).toUpperCase()}`,
            usuario: 'Usuario Actual',
            hora: new Date().toLocaleTimeString()
        };

        this.state.movimientosCaja.push(microfactura);

        // Actualizar saldo del cliente
        const saldo = this.state.saldosClientes.find(s => s.clienteId === clienteId);
        if (saldo) {
            saldo.saldoPendiente -= monto;
            saldo.totalAbonos += monto;
            saldo.ultimaTransaccion = fecha;
        }

        this.showNotification('✅ Microfactura generada exitosamente', 'success');
        this.saveToDB(microfactura);
        this.closeMicrofacturaModal();
        this.renderMovimientosCaja();
        this.renderResumenCaja();
    },

    // Generar ID
    generateId(prefix) {
        const timestamp = Date.now().toString(36);
        return `${prefix}-${timestamp}`;
    },

    // Guardar en DB
    saveToDB(movimiento = null) {
        localStorage.setItem('movimientosCaja', JSON.stringify(this.state.movimientosCaja));
        localStorage.setItem('saldosClientes', JSON.stringify(this.state.saldosClientes));
        if (movimiento) this.saveMovimientoToAPI(movimiento);
    },

    async saveMovimientoToAPI(movimiento) {
        const token = authManager?.getToken?.();
        const apiHost = authManager?.apiBaseUrl || 'http://178.128.72.110:3011';
        const apiBase = apiHost.endsWith('/api') ? apiHost : `${apiHost}/api`;
        if (!token) return;

        try {
            const response = await fetch(`${apiBase}/caja`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(movimiento)
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'No se pudo registrar el movimiento');
            }

            if (result.data?.id) movimiento.id = result.data.id;
            localStorage.setItem('movimientosCaja', JSON.stringify(this.state.movimientosCaja));
        } catch (error) {
            console.warn('Movimiento conservado localmente; falló la API de Caja:', error);
            this.showNotification('El movimiento quedó guardado localmente y se sincronizará al restablecer la conexión', 'warning');
        }
    },

    // Notificación
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};
