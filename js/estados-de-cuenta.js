// ============================================
// MÓDULO DE ESTADOS DE CUENTA
// ============================================

const EstadosDeCuentaModule = {
    state: {
        cuentas: [],
        movimientos: [],
        periodos: []
    },

    // Inicializar el módulo
    init() {
        this.setupEventListeners();
        this.loadData();
        this.renderSelects();
        console.log('Módulo de Estados de Cuenta inicializado');
    },

    // Renderizar selects con datos
    renderSelects() {
        const accountFilter = document.getElementById('accountFilter');
        if (accountFilter) {
            accountFilter.innerHTML = '<option value="">Selecciona una cuenta...</option>' + 
                this.state.cuentas.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        }

        const periodFilter = document.getElementById('periodFilter');
        if (periodFilter) {
            periodFilter.innerHTML = '<option value="">Todos los períodos</option>' + 
                this.state.periodos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
        }
    },

    // Configurar event listeners
    setupEventListeners() {
        const generateReportBtn = document.getElementById('generateStatementBtn');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => this.generateStatement());
        }

        const exportBtn = document.getElementById('exportStatementBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportStatement());
        }

        const accountFilter = document.getElementById('accountFilter');
        if (accountFilter) {
            accountFilter.addEventListener('change', () => this.loadStatement());
        }

        const periodFilter = document.getElementById('periodFilter');
        if (periodFilter) {
            periodFilter.addEventListener('change', () => this.loadStatement());
        }
    },

    // Cargar datos
    loadData() {
        this.state.cuentas = [
            {
                id: 'CTA-001',
                nombre: 'Cuenta Corriente Principal',
                saldoInicial: 50000,
                saldoActual: 47500,
                tipo: 'Corriente'
            },
            {
                id: 'CTA-002',
                nombre: 'Cuenta de Ahorros',
                saldoInicial: 100000,
                saldoActual: 105000,
                tipo: 'Ahorros'
            }
        ];

        this.state.movimientos = [
            {
                id: 1,
                cuenta: 'CTA-001',
                fecha: '2026-04-01',
                descripcion: 'Depósito inicial',
                tipo: 'Crédito',
                monto: 50000,
                saldo: 50000
            },
            {
                id: 2,
                cuenta: 'CTA-001',
                fecha: '2026-04-15',
                descripcion: 'Pago de servicios',
                tipo: 'Débito',
                monto: 2500,
                saldo: 47500
            }
        ];

        this.state.periodos = [
            { id: 1, nombre: 'Enero 2026', fechaInicio: '2026-01-01', fechaFin: '2026-01-31' },
            { id: 2, nombre: 'Febrero 2026', fechaInicio: '2026-02-01', fechaFin: '2026-02-28' },
            { id: 3, nombre: 'Marzo 2026', fechaInicio: '2026-03-01', fechaFin: '2026-03-31' },
            { id: 4, nombre: 'Abril 2026', fechaInicio: '2026-04-01', fechaFin: '2026-04-30' }
        ];
    },

    // Cargar estado de cuenta
    loadStatement() {
        const accountId = document.getElementById('accountFilter')?.value;
        const periodId = document.getElementById('periodFilter')?.value;

        if (!accountId) {
            alert('Selecciona una cuenta');
            return;
        }

        const account = this.state.cuentas.find(c => c.id === accountId);
        if (!account) return;

        const statementContent = document.getElementById('statementContent');
        if (!statementContent) return;

        const period = periodId ? this.state.periodos.find(p => p.id === parseInt(periodId)) : null;
        const movs = period 
            ? this.state.movimientos.filter(m => m.cuenta === accountId && m.fecha >= period.fechaInicio && m.fecha <= period.fechaFin)
            : this.state.movimientos.filter(m => m.cuenta === accountId);

        const html = `
            <div class="statement-header">
                <h3>${account.nombre}</h3>
                <p><strong>Tipo de Cuenta:</strong> ${account.tipo}</p>
                ${period ? `<p><strong>Período:</strong> ${period.nombre}</p>` : ''}
            </div>

            <table class="statement-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Descripción</th>
                        <th>Tipo</th>
                        <th>Monto</th>
                        <th>Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    ${movs.map(m => `
                        <tr>
                            <td>${m.fecha}</td>
                            <td>${m.descripcion}</td>
                            <td><span class="badge badge-${m.tipo.toLowerCase()}">${m.tipo}</span></td>
                            <td>${this.formatCurrency(m.monto)}</td>
                            <td class="saldo"><strong>${this.formatCurrency(m.saldo)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="statement-summary">
                <div class="summary-item">
                    <span>Saldo Inicial:</span>
                    <strong>${this.formatCurrency(account.saldoInicial)}</strong>
                </div>
                <div class="summary-item">
                    <span>Saldo Actual:</span>
                    <strong>${this.formatCurrency(account.saldoActual)}</strong>
                </div>
            </div>
        `;

        statementContent.innerHTML = html;
    },

    formatCurrency(value) {
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2
        }).format(Number(value) || 0);
    },

    // Generar estado de cuenta
    generateStatement() {
        const accountId = document.getElementById('accountFilter')?.value;
        if (!accountId) {
            alert('Selecciona una cuenta');
            return;
        }

        this.loadStatement();
        alert('Estado de cuenta generado correctamente');
    },

    // Exportar estado de cuenta
    exportStatement() {
        const accountId = document.getElementById('accountFilter')?.value;
        if (!accountId) {
            alert('Selecciona una cuenta');
            return;
        }

        const account = this.state.cuentas.find(c => c.id === accountId);
        const movs = this.state.movimientos.filter(m => m.cuenta === accountId);

        let csv = 'Fecha,Descripción,Tipo,Monto GTQ,Saldo GTQ\n';
        movs.forEach(m => {
            csv += `${m.fecha},"${m.descripcion}",${m.tipo},${m.monto},${m.saldo}\n`;
        });

        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
        element.setAttribute('download', `estado_cuenta_${account.id}.csv`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);

        alert('Estado de cuenta exportado a CSV');
    },

    // Generar reporte PDF
    generatePDFReport() {
        const accountId = document.getElementById('accountFilter')?.value;
        if (!accountId) {
            alert('Selecciona una cuenta para exportar a PDF');
            return;
        }

        alert('Generando PDF del estado de cuenta...');
        console.log('Generando PDF para cuenta:', accountId);
        // Implementar con librería como jsPDF
    },

    // Obtener resumen por período
    getSummaryByPeriod(periodId) {
        const period = this.state.periodos.find(p => p.id === periodId);
        if (!period) return null;

        const movs = this.state.movimientos.filter(m => m.fecha >= period.fechaInicio && m.fecha <= period.fechaFin);
        const creditos = movs.filter(m => m.tipo === 'Crédito').reduce((sum, m) => sum + m.monto, 0);
        const debitos = movs.filter(m => m.tipo === 'Débito').reduce((sum, m) => sum + m.monto, 0);

        return {
            periodo: period.nombre,
            creditos,
            debitos,
            neto: creditos - debitos,
            movimientos: movs.length
        };
    }
};
