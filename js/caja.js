// ============================================
// MÓDULO DE CAJA
// ============================================

const CajaModule = {
    state: {
        aperturasDelDia: [],
        movimientos: [],
        saldoActual: 0,
        cajaAbierta: false,
        searchTerm: '',
        filtroTipo: 'todos',
        filtroFecha: 'todos'
    },

    // Inicializar el módulo
    init() {
        this.setupEventListeners();
        this.loadData();
        console.log('Módulo de Caja inicializado');
    },

    // Configurar event listeners
    setupEventListeners() {
        // Búsqueda
        const searchInput = document.getElementById('searchMovimientos');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderMovimientos();
            });
        }

        // Filtro por tipo
        const filterTipo = document.getElementById('filterTipoMovimiento');
        if (filterTipo) {
            filterTipo.addEventListener('change', (e) => {
                this.filtroTipo = e.target.value;
                this.renderMovimientos();
            });
        }

        // Filtro por fecha
        const filterFecha = document.getElementById('filterFechaMovimiento');
        if (filterFecha) {
            filterFecha.addEventListener('change', (e) => {
                this.filtroFecha = e.target.value;
                this.renderMovimientos();
            });
        }

        // Modal close buttons
        const modalCloseBtns = document.querySelectorAll('#movimientoCajaModal .close-btn');
        modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('movimientoCajaModal').style.display = 'none';
            });
        });
    },

    // Cargar datos de caja
    loadData() {
        try {
            // Intentar cargar de localStorage primero
            const savedMovimientos = localStorage.getItem('cajaMovimientos');
            const savedAperturas = localStorage.getItem('cajaAperturas');
            const savedSaldo = localStorage.getItem('cajaSaldoActual');

            if (savedMovimientos) {
                this.state.movimientos = JSON.parse(savedMovimientos);
            } else {
                // Usar datos de demostración
                this.state.movimientos = [
                    {
                        id: 'MOV-CAJ-001',
                        tipo: 'Ingreso por Cobro',
                        monto: 2400.00,
                        descripcion: 'Pago factura FAC-2026-001',
                        cliente: 'Distribuidora Centro',
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '09:15',
                        referencia: 'FAC-2026-001',
                        usuario: 'Caja 1'
                    },
                    {
                        id: 'MOV-CAJ-002',
                        tipo: 'Egreso',
                        monto: 500.00,
                        descripcion: 'Compra de suministros',
                        cliente: null,
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '10:30',
                        referencia: 'COMP-001',
                        usuario: 'Administrador'
                    },
                    {
                        id: 'MOV-CAJ-003',
                        tipo: 'Ingreso por Cobro',
                        monto: 1750.00,
                        descripcion: 'Pago factura FAC-2026-002',
                        cliente: 'Tienda Premium',
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '11:00',
                        referencia: 'FAC-2026-002',
                        usuario: 'Caja 2'
                    },
                    {
                        id: 'MOV-CAJ-004',
                        tipo: 'Ingreso por Cobro',
                        monto: 195.00,
                        descripcion: 'Pago venta en línea',
                        cliente: 'Cliente Online',
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '12:45',
                        referencia: 'FAC-2026-003',
                        usuario: 'Caja 1'
                    },
                    {
                        id: 'MOV-CAJ-005',
                        tipo: 'Ingreso por Transferencia',
                        monto: 450.00,
                        descripcion: 'Transferencia bancaria',
                        cliente: null,
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '14:20',
                        referencia: 'TRANS-001',
                        usuario: 'Caja 2'
                    },
                    {
                        id: 'MOV-CAJ-006',
                        tipo: 'Ingreso por Cobro',
                        monto: 3150.00,
                        descripcion: 'Pago factura FAC-2026-004',
                        cliente: 'Distribuidora Centro',
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '15:00',
                        referencia: 'FAC-2026-004',
                        usuario: 'Caja 1'
                    },
                    {
                        id: 'MOV-CAJ-007',
                        tipo: 'Egreso',
                        monto: 200.00,
                        descripcion: 'Reposición de efectivo',
                        cliente: null,
                        fecha: new Date().toISOString().split('T')[0],
                        hora: '16:30',
                        referencia: 'REPOSICION-001',
                        usuario: 'Administrador'
                    }
                ];
            }

            if (savedAperturas) {
                this.state.aperturasDelDia = JSON.parse(savedAperturas);
            } else {
                this.state.aperturasDelDia = [];
            }

            if (savedSaldo) {
                this.state.saldoActual = parseFloat(savedSaldo);
            } else {
                this.state.saldoActual = 5000;
            }

            this.state.cajaAbierta = true;
            this.renderMovimientos();
            this.updateCashStatus();
        } catch (error) {
            console.error('Error cargando datos de caja:', error);
            this.renderMovimientos();
        }
    },

    // Abrir caja
    openCash() {
        const saldoInicial = document.getElementById('saldoInicial')?.value;

        if (!saldoInicial || isNaN(saldoInicial)) {
            showNotification('Por favor, ingresa un saldo inicial válido', 'error');
            return;
        }

        this.state.cajaAbierta = true;
        this.state.saldoActual = parseFloat(saldoInicial);
        
        const apertura = {
            id: `AP-${Date.now()}`,
            fecha: new Date().toISOString(),
            saldoInicial: parseFloat(saldoInicial),
            saldoFinal: null,
            usuario: 'Admin User'
        };

        this.state.aperturasDelDia.push(apertura);
        this.updateCashStatus();
        showNotification('Caja abierta correctamente', 'success');
    },

    // Cerrar caja
    closeCash() {
        if (!this.state.cajaAbierta) {
            showNotification('La caja no está abierta', 'warning');
            return;
        }

        const totalMovimientos = this.state.movimientos.reduce((sum, mov) => {
            return sum + (mov.tipo === 'Ingreso' ? mov.monto : -mov.monto);
        }, 0);

        const saldoFinal = this.state.saldoActual + totalMovimientos;

        this.state.aperturasDelDia[this.state.aperturasDelDia.length - 1].saldoFinal = saldoFinal;
        this.state.cajaAbierta = false;
        this.state.movimientos = [];

        this.updateCashStatus();
        showNotification(`Caja cerrada. Saldo final: $${saldoFinal.toFixed(2)}`, 'success');
    },

    // Abrir modal de movimiento
    openMovementModal() {
        if (!this.state.cajaAbierta) {
            AlertasModule.mostrarError('Debes abrir la caja primero');
            return;
        }

        const modal = document.getElementById('movimientoCajaModal');
        if (modal) {
            modal.style.display = 'block';
            // Establecer fecha actual
            document.getElementById('movimientoCajaFecha').valueAsDate = new Date();
        }
    },

    // Agregar movimiento de caja
    addMovement() {
        const type = document.getElementById('movimientoCajaType')?.value;
        const amount = document.getElementById('movimientoCajaMonto')?.value;
        const description = document.getElementById('movimientoCajaDesc')?.value;
        const referencia = document.getElementById('movimientoCajaRef')?.value || null;
        const fecha = document.getElementById('movimientoCajaFecha')?.value;

        if (!type || !amount || !description || !fecha) {
            AlertasModule.mostrarError('Por favor, completa los campos requeridos');
            return;
        }

        if (isNaN(amount) || parseFloat(amount) <= 0) {
            AlertasModule.mostrarError('El monto debe ser un número mayor a 0');
            return;
        }

        const movement = {
            id: `MOV-${Date.now()}`,
            tipo: type,
            monto: parseFloat(amount),
            descripcion: description,
            cliente: null,
            referencia: referencia,
            fecha: fecha,
            hora: new Date().toTimeString().split(' ')[0],
            usuario: authManager?.getCurrentUser?.() || 'Sistema'
        };

        this.state.movimientos.push(movement);
        
        // Guardar en localStorage
        localStorage.setItem('cajaMovimientos', JSON.stringify(this.state.movimientos));
        
        this.renderMovimientos();
        AlertasModule.mostrarExito('Movimiento registrado correctamente');

        const modal = document.getElementById('movimientoCajaModal');
        if (modal) {
            modal.style.display = 'none';
            // Limpiar formulario
            document.getElementById('movimientoCajaType').value = '';
            document.getElementById('movimientoCajaMonto').value = '';
            document.getElementById('movimientoCajaDesc').value = '';
            document.getElementById('movimientoCajaRef').value = '';
        }
    },

    // Renderizar movimientos con filtros y búsqueda
    renderMovimientos() {
        const table = document.getElementById('movementsTable');
        if (!table) return;

        let filtered = [...this.state.movimientos];

        // Filtro por tipo
        if (this.filtroTipo !== 'todos') {
            filtered = filtered.filter(m => m.tipo.includes(this.filtroTipo));
        }

        // Filtro por fecha
        const hoy = new Date().toISOString().split('T')[0];
        if (this.filtroFecha === 'hoy') {
            filtered = filtered.filter(m => m.fecha === hoy);
        } else if (this.filtroFecha === 'semana') {
            const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            filtered = filtered.filter(m => m.fecha >= hace7Dias);
        } else if (this.filtroFecha === 'mes') {
            const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            filtered = filtered.filter(m => m.fecha >= hace30Dias);
        }

        // Búsqueda
        if (this.searchTerm) {
            filtered = filtered.filter(m =>
                (m.cliente && m.cliente.toLowerCase().includes(this.searchTerm)) ||
                (m.referencia && m.referencia.toLowerCase().includes(this.searchTerm)) ||
                (m.descripcion && m.descripcion.toLowerCase().includes(this.searchTerm)) ||
                (m.id && m.id.toLowerCase().includes(this.searchTerm))
            );
        }

        // Ordenar por fecha descendent (más recientes primero)
        filtered.sort((a, b) => new Date(b.fecha + ' ' + b.hora) - new Date(a.fecha + ' ' + a.hora));

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 20px; color: #999;">No hay movimientos que coincidan</td></tr>';
            return;
        }

        // Calcular totales
        const totalIngresos = filtered.filter(m => m.tipo.includes('Ingreso')).reduce((sum, m) => sum + m.monto, 0);
        const totalEgresos = filtered.filter(m => m.tipo === 'Egreso').reduce((sum, m) => sum + m.monto, 0);
        const neto = totalIngresos - totalEgresos;

        tbody.innerHTML = filtered.map(mov => {
            const tipoClass = mov.tipo.includes('Ingreso') ? 'badge-success' : mov.tipo === 'Egreso' ? 'badge-danger' : 'badge-info';
            return `
                <tr>
                    <td><strong>${mov.id}</strong></td>
                    <td>${mov.fecha} ${mov.hora}</td>
                    <td>${mov.descripcion}</td>
                    <td>${mov.cliente || '-'}</td>
                    <td><strong>${mov.referencia}</strong></td>
                    <td><span class="badge ${tipoClass}">${mov.tipo}</span></td>
                    <td class="text-right">
                        <span class="${mov.tipo.includes('Ingreso') ? 'positive' : 'negative'}">
                            ${mov.tipo.includes('Ingreso') ? '+' : '-'}Q${mov.monto.toFixed(2)}
                        </span>
                    </td>
                    <td>${mov.usuario}</td>
                    <td class="actions">
                        <button class="btn-icon btn-delete" title="Eliminar" onclick="CajaModule.deleteMovimiento('${mov.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('') + `
            <tr style="background: #f5f5f5; font-weight: bold;">
                <td colspan="6">TOTALES</td>
                <td class="text-right">
                    <span class="positive">+Q${totalIngresos.toFixed(2)}</span> / <span class="negative">-Q${totalEgresos.toFixed(2)}</span> = <span>${neto >= 0 ? 'positive' : 'negative'}">Q${neto.toFixed(2)}</span>
                </td>
                <td colspan="2"></td>
            </tr>
        `;
    },

    // Eliminar movimiento
    deleteMovimiento(id) {
        if (confirm('¿Eliminar este movimiento?')) {
            this.state.movimientos = this.state.movimientos.filter(m => m.id !== id);
            localStorage.setItem('cajaMovimientos', JSON.stringify(this.state.movimientos));
            this.renderMovimientos();
        }
    },

    // Actualizar tabla de movimientos (fallback)
    refreshMovementsTable() {
        this.renderMovimientos();
    },

    // Actualizar estado de caja
    updateCashStatus() {
        const statusElement = document.getElementById('cashStatus');
        if (statusElement) {
            const totalIngresos = this.state.movimientos
                .filter(m => m.tipo.includes('Ingreso'))
                .reduce((sum, m) => sum + m.monto, 0);
            
            const totalEgresos = this.state.movimientos
                .filter(m => m.tipo === 'Egreso')
                .reduce((sum, m) => sum + m.monto, 0);

            const neto = this.state.saldoActual + totalIngresos - totalEgresos;

            statusElement.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">💰 Saldo Inicial</div>
                        <div style="font-size: 24px; font-weight: bold;">Q${this.state.saldoActual.toFixed(2)}</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">📈 Total Ingresos</div>
                        <div style="font-size: 24px; font-weight: bold;">+Q${totalIngresos.toFixed(2)}</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">📉 Total Egresos</div>
                        <div style="font-size: 24px; font-weight: bold;">-Q${totalEgresos.toFixed(2)}</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">✓ Saldo Final</div>
                        <div style="font-size: 24px; font-weight: bold;">Q${neto.toFixed(2)}</div>
                    </div>
                </div>
            `;
        }
    },

    // Guardar datos en localStorage
    saveToLocalStorage() {
        localStorage.setItem('cajaMovimientos', JSON.stringify(this.state.movimientos));
        localStorage.setItem('cajaAperturas', JSON.stringify(this.state.aperturasDelDia));
        localStorage.setItem('cajaSaldoActual', JSON.stringify(this.state.saldoActual));
    },
};
