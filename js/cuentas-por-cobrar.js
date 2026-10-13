// ============================================
// MÓDULO DE CUENTAS POR COBRAR
// ============================================

const CuentasPorCobrarModule = {
    state: {
        deudas: [],
        clientes: [],
        pagos: []
    },

    // Inicializar el módulo
    init() {
        this.setupEventListeners();
        this.loadData();
        console.log('Módulo de Cuentas por Cobrar inicializado');
    },

    // Configurar event listeners
    setupEventListeners() {
        const newDebtBtn = document.getElementById('addDebtBtn');
        if (newDebtBtn) {
            newDebtBtn.addEventListener('click', () => this.openDebtModal());
        }

        const saveDebtBtn = document.getElementById('saveDebtBtn');
        if (saveDebtBtn) {
            saveDebtBtn.addEventListener('click', () => this.saveDebt());
        }

        const clientFilter = document.getElementById('debtClientFilter');
        if (clientFilter) {
            clientFilter.addEventListener('change', () => this.filterDeudas());
        }

        const statusFilter = document.getElementById('debtStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.filterDeudas());
        }
    },

    // Cargar datos
    loadData() {
        this.state.deudas = [
            {
                id: 'CXC-001',
                cliente: 'Distribuidora Centro',
                monto: 2400.00,
                saldo: 2400.00,
                fechaVencimiento: '2026-06-15',
                estado: 'Pendiente',
                diasVencido: 0,
                referencia: 'FAC-2026-001',
                fechaCreacion: '2026-05-15'
            },
            {
                id: 'CXC-002',
                cliente: 'Tienda Premium',
                monto: 1750.00,
                saldo: 1750.00,
                fechaVencimiento: '2026-06-14',
                estado: 'Pendiente',
                diasVencido: 0,
                referencia: 'FAC-2026-002',
                fechaCreacion: '2026-05-14'
            },
            {
                id: 'CXC-003',
                cliente: 'Empresa XYZ',
                monto: 12000.00,
                saldo: 8000.00,
                fechaVencimiento: '2026-05-28',
                estado: 'Parcialmente Pagada',
                diasVencido: 0,
                referencia: 'FAC-2026-006',
                fechaCreacion: '2026-05-10',
                pagosRealizados: [
                    { id: 'PAG-001', monto: 4000.00, fecha: '2026-05-12' }
                ]
            },
            {
                id: 'CXC-004',
                cliente: 'Cliente A',
                monto: 600.00,
                saldo: 600.00,
                fechaVencimiento: '2026-05-20',
                estado: 'Vencida',
                diasVencido: -5,
                referencia: 'FAC-2026-007',
                fechaCreacion: '2026-05-09'
            },
            {
                id: 'CXC-005',
                cliente: 'Distribuidora Centro',
                monto: 3150.00,
                saldo: 3150.00,
                fechaVencimiento: '2026-06-12',
                estado: 'Pendiente',
                diasVencido: 0,
                referencia: 'FAC-2026-004',
                fechaCreacion: '2026-05-12'
            },
            {
                id: 'CXC-006',
                cliente: 'Tienda Premium',
                monto: 800.00,
                saldo: 0.00,
                fechaVencimiento: '2026-05-15',
                estado: 'Pagada',
                diasVencido: 0,
                referencia: 'FAC-2026-005',
                fechaCreacion: '2026-05-09',
                pagosRealizados: [
                    { id: 'PAG-002', monto: 800.00, fecha: '2026-05-15' }
                ]
            }
        ];

        this.state.clientes = [
            { id: 1, nombre: 'Distribuidora Centro', limite: 50000, montoUsado: 5550 },
            { id: 2, nombre: 'Tienda Premium', limite: 30000, montoUsado: 2550 },
            { id: 3, nombre: 'Empresa XYZ', limite: 100000, montoUsado: 8000 },
            { id: 4, nombre: 'Cliente A', limite: 5000, montoUsado: 600 }
        ];
    },

    // Abrir modal de nueva deuda
    openDebtModal() {
        const modal = document.getElementById('debtModal');
        if (modal) {
            modal.style.display = 'block';
        }
    },

    // Guardar nueva deuda
    saveDebt() {
        const client = document.getElementById('debtClient')?.value;
        const amount = document.getElementById('debtAmount')?.value;
        const dueDate = document.getElementById('debtDueDate')?.value;
        const reason = document.getElementById('debtReason')?.value;

        if (!client || !amount || !dueDate) {
            showNotification('Por favor, completa todos los campos obligatorios', 'error');
            return;
        }

        const newDebt = {
            id: `CXC-${Date.now()}`,
            cliente: client,
            monto: parseFloat(amount),
            fechaVencimiento: dueDate,
            estado: 'Pendiente',
            razon: reason || 'Venta a crédito',
            fechaCreacion: new Date().toISOString(),
            diasVencido: 0
        };

        this.state.deudas.push(newDebt);
        this.refreshTable();

        const modal = document.getElementById('debtModal');
        if (modal) {
            modal.style.display = 'none';
        }
        showNotification('Deuda registrada correctamente', 'success');
    },

    // Registrar pago
    recordPayment(debtId) {
        const amount = prompt('Ingresa el monto del pago:');
        if (!amount || isNaN(amount)) return;

        const debt = this.state.deudas.find(d => d.id === debtId);
        if (!debt) return;

        const payment = {
            id: `PAG-${Date.now()}`,
            deudaId: debtId,
            monto: parseFloat(amount),
            fecha: new Date().toISOString(),
            referencia: 'Pago registrado'
        };

        this.state.pagos.push(payment);

        if (parseFloat(amount) >= debt.monto) {
            debt.estado = 'Pagada';
            debt.monto = 0;
        } else {
            debt.monto -= parseFloat(amount);
        }

        this.refreshTable();
        showNotification('Pago registrado correctamente', 'success');
    },

    // Filtrar deudas
    filterDeudas() {
        this.refreshTable();
    },

    // Actualizar tabla de deudas
    refreshTable() {
        const table = document.getElementById('debutsTable');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        tbody.innerHTML = this.state.deudas.map(deuda => `
            <tr>
                <td>${deuda.id}</td>
                <td>${deuda.cliente}</td>
                <td>$${deuda.monto.toFixed(2)}</td>
                <td>${deuda.fechaVencimiento}</td>
                <td><span class="badge badge-${deuda.estado.toLowerCase()}">${deuda.estado}</span></td>
                <td>${deuda.diasVencido > 0 ? `<span class="warning">${deuda.diasVencido} días vencida</span>` : 'Al día'}</td>
                <td class="actions">
                    <button class="btn-icon" onclick="CuentasPorCobrarModule.recordPayment('${deuda.id}')">
                        <i class="fas fa-money-bill"></i>
                    </button>
                    <button class="btn-icon" onclick="CuentasPorCobrarModule.sendReminder('${deuda.id}')">
                        <i class="fas fa-bell"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    // Enviar recordatorio
    sendReminder(debtId) {
        const debt = this.state.deudas.find(d => d.id === debtId);
        if (debt) {
            showNotification(`Recordatorio enviado a ${debt.cliente} por $${debt.monto.toFixed(2)}`, 'info');
            console.log('Recordatorio enviado:', debt);
        }
    },

    // Calcular total adeudado
    getTotalOweAmount() {
        return this.state.deudas.reduce((sum, d) => sum + d.monto, 0);
    },

    // Obtener deudas vencidas
    getOverdueDebts() {
        const today = new Date();
        return this.state.deudas.filter(d => new Date(d.fechaVencimiento) < today && d.estado !== 'Pagada');
    }
};
