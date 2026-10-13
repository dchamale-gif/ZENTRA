// ============================================
// MÓDULO DASHBOARD FINANCIERO
// ============================================

const DashboardFinancieroModule = {
    state: {
        datos: {
            ingresos: 0,
            egresos: 0,
            ganancia: 0,
            cobrosRecibidos: 0,
            saldoPorCobrar: 0,
            flujoCaja: 0
        },
        operativo: {
            pacientesRegistrados: 0,
            pacientesActivos: 0,
            citasHoy: 0,
            ordenesPendientes: 0,
            camasTotales: 0,
            camasOcupadas: 0,
            camasDisponibles: 0,
            ocupacionHospitalaria: 0,
            hospitalizacionesActivas: 0,
            personalActivo: 0,
            ordenesPorEstado: [],
            citasPorHora: [],
            alertas: []
        },
        historico: []
    },


    init() {
        this.setupEventListeners();
        this.loadData().then(() => {
            this.renderCharts();
        }).catch(error => {
            console.error('Error al inicializar dashboard:', error);
            this.renderCharts(); // Renderizar con datos vacíos si hay error
        });
        console.log('Dashboard Financiero inicializado');
    },

    // Configurar event listeners
    setupEventListeners() {
        const refreshBtn = document.getElementById('refreshFinancialBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }

        const exportBtn = document.getElementById('exportFinancialBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportReport());
        }
    },

    // Cargar datos desde la API
    async loadData() {
        // Inicializar datos por defecto
        this.state.datos = {
            ingresos: 0,
            egresos: 0,
            ganancia: 0,
            cobrosRecibidos: 0,
            saldoPorCobrar: 0,
            flujoCaja: 0,
            margenNeto: 0,
            ventasDelDia: 0,
            gastosDelDia: 0,
            numeroTransacciones: 0,
            ventasDelMes: 0
        };
        this.state.historico = [];
        this.state.categoriaGastos = [];
        this.state.categoriaIngresos = [];
        this.state.operativo = {
            pacientesRegistrados: 0,
            pacientesActivos: 0,
            citasHoy: 0,
            ordenesPendientes: 0,
            camasTotales: 0,
            camasOcupadas: 0,
            camasDisponibles: 0,
            ocupacionHospitalaria: 0,
            hospitalizacionesActivas: 0,
            personalActivo: 0,
            ordenesPorEstado: [],
            citasPorHora: [],
            alertas: []
        };

        try {
            // Obtener resumen financiero usando APIHelper
            const summaryData = await APIHelper.fetchFinancialSummary();
            if (summaryData) {
                this.state.datos = {
                    ingresos: summaryData.ingresos || 0,
                    egresos: summaryData.egresos || 0,
                    ganancia: summaryData.ganancia || 0,
                    cobrosRecibidos: summaryData.cobrosRecibidos || 0,
                    saldoPorCobrar: summaryData.saldoPorCobrar || 0,
                    flujoCaja: summaryData.flujoCaja || 0,
                    margenNeto: summaryData.margenNeto || 0,
                    ventasDelDia: 0,
                    gastosDelDia: 0,
                    numeroTransacciones: summaryData.numeroTransacciones || 0,
                    ventasDelMes: summaryData.ingresos || 0
                };
            }
        } catch (error) {
            console.warn('No se pudo cargar resumen financiero, usando datos por defecto:', error.message);
        }

        try {
            // Obtener datos mensuales históricos usando APIHelper
            const monthlyData = await APIHelper.fetchMonthlyData(12);
            if (Array.isArray(monthlyData)) {
                this.state.historico = monthlyData;
            }
        } catch (error) {
            console.warn('No se pudo cargar datos históricos:', error.message);
        }

        try {
            // Obtener categorías de gastos - usar fetch con URL correcta de APIHelper
            const expenseData = await fetch(
                APIHelper.baseURL + '/reports/expenses-by-category',
                { headers: this.getAuthHeaders() }
            );
            
            if (expenseData.ok) {
                const data = await expenseData.json();
                if (data.success && Array.isArray(data.data)) {
                    this.state.categoriaGastos = data.data;
                }
            }
        } catch (error) {
            console.warn('No se pudo cargar categorías de gastos:', error.message);
        }

        try {
            // Obtener categorías de ingresos - usar fetch con URL correcta de APIHelper
            const incomeData = await fetch(
                APIHelper.baseURL + '/reports/income-by-category',
                { headers: this.getAuthHeaders() }
            );
            
            if (incomeData.ok) {
                const data = await incomeData.json();
                if (data.success && Array.isArray(data.data)) {
                    this.state.categoriaIngresos = data.data;
                }
            }
        } catch (error) {
            console.warn('No se pudo cargar categorías de ingresos:', error.message);
        }
    },

    // Obtener headers de autenticación
    getAuthHeaders() {
        // Usar authManager si está disponible, sino fallback a localStorage
        let token = '';
        if (typeof authManager !== 'undefined') {
            token = authManager.getToken() || '';
        } else {
            token = localStorage.getItem('zentra_token') || localStorage.getItem('auth_token') || '';
        }
        return {
            'Content-Type': 'application/json',
        };
    },

    // Mostrar notificación de error
    showErrorNotification(message) {
        const notif = document.getElementById('notification');
        if (notif) {
            notif.textContent = message;
            notif.className = 'alert alert-danger';
            notif.style.display = 'block';
            setTimeout(() => {
                notif.style.display = 'none';
            }, 3000);
        }
    },

    formatCurrency(value) {
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2
        }).format(Number(value) || 0);
    },

    // Renderizar gráficos
    renderCharts() {
        // Inicializar datos vacíos si no existen
        if (!this.state.historico) this.state.historico = [];
        if (!this.state.categoriaGastos) this.state.categoriaGastos = [];
        if (!this.state.categoriaIngresos) this.state.categoriaIngresos = [];
        
        this.renderIncomeExpenseChart();
        this.renderCashFlowChart();
        this.renderMarginChart();
        this.renderExpenseCategoryChart();
        this.renderIncomeCategoryChart();
        this.updateKPIs();
    },

    renderExecutiveSummary() {
        const kpiContainer = document.getElementById('executiveKPIs');
        const alertsContainer = document.getElementById('executiveAlerts');
        if (!kpiContainer || !alertsContainer) return;

        const data = this.state.operativo;
        const occupancyTone = data.ocupacionHospitalaria >= 90
            ? 'critical'
            : (data.ocupacionHospitalaria >= 75 ? 'warning' : 'healthy');

        kpiContainer.innerHTML = `
            <div class="kpi-card executive-kpi patients">
                <div class="kpi-header"><h3>Pacientes activos</h3><i class="fas fa-user-check"></i></div>
                <div class="kpi-value">${data.pacientesActivos}</div>
                <div class="kpi-change">de ${data.pacientesRegistrados} registrados</div>
            </div>
            <div class="kpi-card executive-kpi appointments">
                <div class="kpi-header"><h3>Citas de hoy</h3><i class="fas fa-calendar-day"></i></div>
                <div class="kpi-value">${data.citasHoy}</div>
                <div class="kpi-change">agenda clínica del día</div>
            </div>
            <div class="kpi-card executive-kpi orders">
                <div class="kpi-header"><h3>Órdenes pendientes</h3><i class="fas fa-file-medical"></i></div>
                <div class="kpi-value">${data.ordenesPendientes}</div>
                <div class="kpi-change ${data.ordenesPendientes > 0 ? 'negative' : 'positive'}">requieren seguimiento</div>
            </div>
            <div class="kpi-card executive-kpi occupancy ${occupancyTone}">
                <div class="kpi-header"><h3>Ocupación hospitalaria</h3><i class="fas fa-bed"></i></div>
                <div class="kpi-value">${data.ocupacionHospitalaria}%</div>
                <div class="kpi-change">${data.camasOcupadas} ocupadas · ${data.camasDisponibles} disponibles</div>
            </div>
            <div class="kpi-card executive-kpi admissions">
                <div class="kpi-header"><h3>Hospitalizados</h3><i class="fas fa-hospital-user"></i></div>
                <div class="kpi-value">${data.hospitalizacionesActivas}</div>
                <div class="kpi-change">ingresos activos</div>
            </div>
            <div class="kpi-card executive-kpi staff">
                <div class="kpi-header"><h3>Personal disponible</h3><i class="fas fa-user-md"></i></div>
                <div class="kpi-value">${data.personalActivo}</div>
                <div class="kpi-change">profesionales activos</div>
            </div>
        `;

        const alerts = Array.isArray(data.alertas) ? data.alertas : [];
        if (alerts.length === 0) {
            alertsContainer.innerHTML = `
                <div class="executive-alert empty">
                    <i class="fas fa-check-circle"></i>
                    <span>Sin alertas operativas críticas en este momento.</span>
                </div>
            `;
            return;
        }

        alertsContainer.innerHTML = alerts.map(alert => `
            <div class="executive-alert ${alert.tipo}">
                <i class="fas ${alert.tipo === 'critica' ? 'fa-exclamation-circle' : (alert.tipo === 'advertencia' ? 'fa-exclamation-triangle' : 'fa-info-circle')}"></i>
                <span>${alert.mensaje}</span>
            </div>
        `).join('');
    },

    renderOperationalCharts() {
        this.renderDynamicChart('ordersStatusChart', 'executiveOrdersChart', {
            type: 'doughnut',
            labels: this.state.operativo.ordenesPorEstado.map(item => this.formatStatus(item.estado)),
            values: this.state.operativo.ordenesPorEstado.map(item => item.total),
            colors: ['#eab308', '#22c55e', '#ef4444', '#0891b2'],
            title: 'Órdenes por estado'
        });

        this.renderDynamicChart('appointmentsHourChart', 'executiveAppointmentsChart', {
            type: 'bar',
            labels: this.state.operativo.citasPorHora.map(item => item.hora),
            values: this.state.operativo.citasPorHora.map(item => item.total),
            colors: ['#0891b2'],
            title: 'Citas por hora · últimos 30 días'
        });
    },

    renderDynamicChart(containerId, chartKey, config) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!config.values.length) {
            container.innerHTML = '<p class="chart-empty">Sin datos para este período</p>';
            return;
        }

        container.innerHTML = '<canvas></canvas>';
        const canvas = container.querySelector('canvas');
        if (window[chartKey]?.destroy) window[chartKey].destroy();

        window[chartKey] = new Chart(canvas.getContext('2d'), {
            type: config.type,
            data: {
                labels: config.labels,
                datasets: [{
                    data: config.values,
                    backgroundColor: config.colors,
                    borderColor: config.type === 'bar' ? '#0e7490' : '#ffffff',
                    borderWidth: config.type === 'bar' ? 0 : 2,
                    borderRadius: config.type === 'bar' ? 5 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: config.type === 'doughnut', position: 'right' },
                    title: { display: false }
                },
                scales: config.type === 'bar' ? {
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                } : undefined
            }
        });
    },

    formatStatus(status) {
        return String(status || '')
            .replace(/_/g, ' ')
            .replace(/^./, character => character.toUpperCase());
    },

    // Gráfico de ingresos vs egresos
    renderIncomeExpenseChart() {
        const canvas = document.getElementById('incomeExpenseChart');
        if (!canvas) return;

        // Validar que hay datos históricos
        if (!this.state.historico || this.state.historico.length === 0) {
            canvas.innerHTML = '<p class="text-muted">Sin datos históricos</p>';
            return;
        }

        const ctx = canvas.getContext('2d');
        if (window.incomeExpenseChart && typeof window.incomeExpenseChart.destroy === 'function') {
            window.incomeExpenseChart.destroy();
        }

        window.incomeExpenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: this.state.historico.map(h => h.mes),
                datasets: [
                    {
                        label: 'Facturación',
                        data: this.state.historico.map(h => h.ingresos),
                        backgroundColor: '#28a745',
                        borderRadius: 5
                    },
                    {
                        label: 'Cobros recibidos',
                        data: this.state.historico.map(h => h.cobros || 0),
                        backgroundColor: '#29B6F6',
                        borderRadius: 5
                    },
                    {
                        label: 'Egresos',
                        data: this.state.historico.map(h => h.egresos),
                        backgroundColor: '#dc3545',
                        borderRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true },
                    title: { display: true, text: 'Facturación, cobros y egresos' },
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label}: ${this.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => this.formatCurrency(value) }
                    }
                }
            }
        });
    },

    // Gráfico de flujo de caja
    renderCashFlowChart() {
        const canvas = document.getElementById('cashFlowChart');
        if (!canvas) return;

        // Validar que hay datos históricos
        if (!this.state.historico || this.state.historico.length === 0) {
            canvas.innerHTML = '<p class="text-muted">Sin datos históricos</p>';
            return;
        }

        const ctx = canvas.getContext('2d');
        if (window.cashFlowChart && typeof window.cashFlowChart.destroy === 'function') {
            window.cashFlowChart.destroy();
        }

        window.cashFlowChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.state.historico.map(h => h.mes),
                datasets: [
                    {
                        label: 'Flujo de Caja',
                        data: this.state.historico.map(h => h.flujoCaja || 0),
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#4CAF50'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true },
                    title: { display: true, text: 'Cobros menos egresos' },
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label}: ${this.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => this.formatCurrency(value) }
                    }
                }
            }
        });
    },

    // Gráfico de márgenes
    renderMarginChart() {
        const canvas = document.getElementById('marginChart');
        if (!canvas) return;

        // Validar que hay datos
        if (!this.state.historico || this.state.historico.length === 0 || !this.state.datos) {
            canvas.innerHTML = '<p class="text-muted">Sin datos de márgenes</p>';
            return;
        }

        const ctx = canvas.getContext('2d');
        if (window.marginChart && typeof window.marginChart.destroy === 'function') {
            window.marginChart.destroy();
        }

        const margins = this.state.historico.map(h => ((h.ganancia / h.ingresos) * 100).toFixed(1));

        window.marginChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Ganancia Neta', 'Costo de Venta'],
                datasets: [
                    {
                        data: [this.state.datos.ganancia || 0, this.state.datos.egresos || 0],
                        backgroundColor: ['#4CAF50', '#FF6B6B'],
                        borderRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true },
                    title: { display: true, text: 'Distribución de Ganancia' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${percentage}%`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Gráfico de categorías de gastos
    renderExpenseCategoryChart() {
        const container = document.getElementById('gastosCategoriaChart');
        if (!container) return;

        // Inicializar si no existe
        if (!this.state.categoriaGastos || this.state.categoriaGastos.length === 0) {
            container.innerHTML = '<p class="text-muted">Sin datos de gastos</p>';
            return;
        }

        // Limpiar contenedor si ya existe un canvas
        const existingCanvas = container.querySelector('canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        if (window.expenseCategoryChart && typeof window.expenseCategoryChart.destroy === 'function') {
            window.expenseCategoryChart.destroy();
        }

        const labels = this.state.categoriaGastos.map(d => d.nombre);
        const montos = this.state.categoriaGastos.map(d => d.monto);
        const colores = ['#FF6B6B', '#FFA07A', '#FFB6C1', '#FFE4E1'];

        window.expenseCategoryChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: montos,
                    backgroundColor: colores,
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'right' },
                    title: { display: true, text: 'Distribución de Gastos' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${DashboardFinancieroModule.formatCurrency(context.parsed)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Gráfico de categorías de ingresos
    renderIncomeCategoryChart() {
        const container = document.getElementById('ingresoCategoriaChart');
        if (!container) return;

        // Inicializar si no existe
        if (!this.state.categoriaIngresos || this.state.categoriaIngresos.length === 0) {
            container.innerHTML = '<p class="text-muted">Sin datos de ingresos</p>';
            return;
        }

        // Limpiar contenedor si ya existe un canvas
        const existingCanvas = container.querySelector('canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        if (window.incomeCategoryChart && typeof window.incomeCategoryChart.destroy === 'function') {
            window.incomeCategoryChart.destroy();
        }

        const labels = this.state.categoriaIngresos.map(d => d.nombre);
        const montos = this.state.categoriaIngresos.map(d => d.monto);
        const colores = ['#66BB6A', '#29B6F6', '#AB47BC'];

        window.incomeCategoryChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: montos,
                    backgroundColor: colores,
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'right' },
                    title: { display: true, text: 'Distribución de Ingresos' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${DashboardFinancieroModule.formatCurrency(context.parsed)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Actualizar KPIs
    updateKPIs() {
        const container = document.getElementById('financialKPIs');
        if (!container) return;

        // Validar que estado.datos existe
        if (!this.state.datos) {
            this.state.datos = {
                ingresos: 0,
                egresos: 0,
                ganancia: 0,
                margenNeto: 0
            };
        }

        // Calcular cambios porcentuales vs mes anterior
        let cambioIngresos = 'N/A';
        let cambioCobros = 'N/A';
        let cambioEgresos = 'N/A';
        let cambioGanancia = 'N/A';
        let margenActual = 'N/A';
        let cambioMargen = 'N/A';

        // Solo calcular si hay al menos 2 meses en el histórico
        if (this.state.historico && this.state.historico.length >= 2) {
            const hist = this.state.historico;
            const mesActual = hist[hist.length - 1];
            const mesAnterior = hist[hist.length - 2];

            if (mesAnterior && mesAnterior.ingresos > 0) {
                cambioIngresos = ((mesActual.ingresos - mesAnterior.ingresos) / mesAnterior.ingresos * 100).toFixed(1);
            }
            if (mesAnterior && mesAnterior.cobros > 0) {
                cambioCobros = ((mesActual.cobros - mesAnterior.cobros) / mesAnterior.cobros * 100).toFixed(1);
            }
            if (mesAnterior && mesAnterior.egresos > 0) {
                cambioEgresos = ((mesActual.egresos - mesAnterior.egresos) / mesAnterior.egresos * 100).toFixed(1);
            }
            if (mesAnterior && mesAnterior.ganancia > 0) {
                cambioGanancia = ((mesActual.ganancia - mesAnterior.ganancia) / mesAnterior.ganancia * 100).toFixed(1);
            }
            if (mesActual && mesActual.ingresos > 0) {
                margenActual = (mesActual.ganancia / mesActual.ingresos * 100).toFixed(1);
            }
            if (mesAnterior && mesAnterior.ingresos > 0) {
                const margenAnterior = (mesAnterior.ganancia / mesAnterior.ingresos * 100);
                cambioMargen = (margenActual - margenAnterior).toFixed(1);
            }
        }

        const claseEgreso = cambioEgresos < 0 ? 'positive' : 'negative';

        container.innerHTML = `
            <div class="kpi-card kpi-ingresos">
                <div class="kpi-header">
                    <h3>Facturación Total</h3>
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="kpi-value">${this.formatCurrency(this.state.datos.ingresos)}</div>
                <div class="kpi-change ${cambioIngresos >= 0 ? 'positive' : 'negative'}">
                    <i class="fas fa-arrow-${cambioIngresos >= 0 ? 'up' : 'down'}"></i> ${cambioIngresos}% vs mes anterior
                </div>
            </div>

            <div class="kpi-card kpi-ingresos">
                <div class="kpi-header">
                    <h3>Cobros Recibidos</h3>
                    <i class="fas fa-hand-holding-usd"></i>
                </div>
                <div class="kpi-value">${this.formatCurrency(this.state.datos.cobrosRecibidos)}</div>
                <div class="kpi-change ${cambioCobros >= 0 ? 'positive' : 'negative'}">
                    <i class="fas fa-arrow-${cambioCobros >= 0 ? 'up' : 'down'}"></i> ${cambioCobros}% vs mes anterior
                </div>
            </div>

            <div class="kpi-card kpi-margen">
                <div class="kpi-header">
                    <h3>Saldo por Cobrar</h3>
                    <i class="fas fa-file-invoice-dollar"></i>
                </div>
                <div class="kpi-value">${this.formatCurrency(this.state.datos.saldoPorCobrar)}</div>
                <div class="kpi-change">Cartera actual en GTQ</div>
            </div>

            <div class="kpi-card kpi-egresos">
                <div class="kpi-header">
                    <h3>Egresos Totales</h3>
                    <i class="fas fa-arrow-down"></i>
                </div>
                <div class="kpi-value">${this.formatCurrency(this.state.datos.egresos)}</div>
                <div class="kpi-change ${claseEgreso}">
                    <i class="fas fa-arrow-${cambioEgresos < 0 ? 'down' : 'up'}"></i> ${typeof cambioEgresos === 'string' ? cambioEgresos : Math.abs(cambioEgresos)}% vs mes anterior
                </div>
            </div>

            <div class="kpi-card kpi-ganancia">
                <div class="kpi-header">
                    <h3>Flujo de Caja</h3>
                    <i class="fas fa-money-bill-wave"></i>
                </div>
                <div class="kpi-value">${this.formatCurrency(this.state.datos.flujoCaja)}</div>
                <div class="kpi-change ${cambioGanancia >= 0 ? 'positive' : 'negative'}">
                    Cobros menos egresos
                </div>
            </div>

            <div class="kpi-card kpi-margen">
                <div class="kpi-header">
                    <h3>Margen Neto</h3>
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="kpi-value">${margenActual}%</div>
                <div class="kpi-change ${cambioMargen !== 'N/A' && cambioMargen > 0 ? 'positive' : 'negative'}">
                    <i class="fas fa-arrow-${cambioMargen !== 'N/A' && cambioMargen > 0 ? 'up' : 'down'}"></i> ${cambioMargen}pp vs mes anterior
                </div>
            </div>
        `;
    },

    // Refrescar dashboard
    async refresh() {
        await this.loadData();
        this.renderCharts();
        alert('Dashboard financiero actualizado');
    },

    // Exportar reporte
    exportReport() {
        let csv = 'Mes,Facturación GTQ,Cobros GTQ,Egresos GTQ,Resultado Contable GTQ,Flujo de Caja GTQ\n';
        this.state.historico.forEach(h => {
            csv += `${h.mes},${h.ingresos},${h.cobros || 0},${h.egresos},${h.ganancia},${h.flujoCaja || 0}\n`;
        });

        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
        element.setAttribute('download', `reporte_financiero_${new Date().toISOString().split('T')[0]}.csv`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);

        alert('Reporte exportado correctamente');
    },

    // Obtener proyección de flujo de caja
    getCashFlowProjection() {
        const lastMonth = this.state.historico[this.state.historico.length - 1];
        const proyectado = lastMonth.ganancia * 1.05; // Proyección con 5% de crecimiento
        return proyectado;
    }
};
