// ============================================
// MÓDULO DE ESTADOS DE CUENTA (por cliente, datos reales)
// ============================================

const EstadosDeCuentaModule = {
    state: { statement: null },

    init() {
        document.getElementById('generateStatementBtn')?.addEventListener('click', () => this.loadStatement());
        document.getElementById('exportStatementBtn')?.addEventListener('click', () => this.exportStatement());
        document.getElementById('accountFilter')?.addEventListener('change', () => this.loadStatement());
        document.getElementById('periodFilter')?.addEventListener('change', () => this.loadStatement());
        this.renderPeriods();
    },

    monthRange(offset) {
        const d = new Date();
        const start = new Date(d.getFullYear(), d.getMonth() - offset, 1);
        const end = new Date(d.getFullYear(), d.getMonth() - offset + 1, 0);
        const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        const name = start.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
        return { from: iso(start), to: iso(end), name: name.charAt(0).toUpperCase() + name.slice(1) };
    },

    renderPeriods() {
        const select = document.getElementById('periodFilter');
        if (!select) return;
        let options = '<option value="">Todos los períodos</option>';
        for (let i = 0; i < 12; i++) {
            const r = this.monthRange(i);
            options += `<option value="${r.from}|${r.to}">${r.name}</option>`;
        }
        select.innerHTML = options;
    },

    async loadClients() {
        const select = document.getElementById('accountFilter');
        if (!select) return;
        const current = select.value;
        try {
            const response = await authManager.fetchWithAuth('/api/clientes?activo=true');
            const result = await response.json();
            const clientes = result.success ? (result.clientes || result.data || []) : [];
            select.innerHTML = '<option value="">Selecciona un cliente...</option>' +
                clientes.map(c => `<option value="${BulkImport.escapeHtml(c.id)}">${BulkImport.escapeHtml(c.nombre)}</option>`).join('');
            select.value = current;
        } catch (error) {
            console.error('Error cargando clientes:', error);
        }
    },

    async loadStatement() {
        const clienteId = document.getElementById('accountFilter')?.value;
        const container = document.getElementById('statementContent');
        if (!container) return;
        if (!clienteId) {
            container.innerHTML = '';
            this.state.statement = null;
            return;
        }

        const [from, to] = (document.getElementById('periodFilter')?.value || '|').split('|');
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);

        try {
            const response = await authManager.fetchWithAuth(`/api/receivables/statement/${encodeURIComponent(clienteId)}?${qs}`);
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || 'Error al cargar el estado de cuenta');
            this.state.statement = result.data;
            this.render(result.data);
        } catch (error) {
            container.innerHTML = `<p class="text-muted">${BulkImport.escapeHtml(error.message)}</p>`;
        }
    },

    render(data) {
        const esc = v => BulkImport.escapeHtml(v);
        const rows = data.movimientos.length === 0
            ? '<tr><td colspan="5" style="text-align:center;padding:20px;">Sin movimientos en el período</td></tr>'
            : data.movimientos.map(m => `
                <tr>
                    <td>${esc(m.fecha)}</td>
                    <td>${esc(m.descripcion)}</td>
                    <td>${esc(m.tipo)}</td>
                    <td>${this.formatCurrency(m.monto)}</td>
                    <td class="saldo"><strong>${this.formatCurrency(m.saldo)}</strong></td>
                </tr>`).join('');

        document.getElementById('statementContent').innerHTML = `
            <div class="statement-header">
                <h3>${esc(data.cliente.nombre)}</h3>
                <p><strong>NIT:</strong> ${esc(data.cliente.nit || 'CF')}</p>
            </div>
            <table class="statement-table">
                <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Saldo</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="statement-summary">
                <div class="summary-item"><span>Saldo Inicial:</span><strong>${this.formatCurrency(data.saldoInicial)}</strong></div>
                <div class="summary-item"><span>Saldo Final:</span><strong>${this.formatCurrency(data.saldoFinal)}</strong></div>
            </div>`;
    },

    formatCurrency(value) {
        return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2 }).format(Number(value) || 0);
    },

    exportStatement() {
        const data = this.state.statement;
        if (!data) {
            showNotification('Selecciona un cliente primero', 'error');
            return;
        }
        const cell = v => `"${String(v).replace(/"/g, '""')}"`;
        let csv = 'Fecha,Descripción,Tipo,Monto GTQ,Saldo GTQ\n';
        data.movimientos.forEach(m => {
            csv += [m.fecha, cell(m.descripcion), m.tipo, m.monto, m.saldo].join(',') + '\n';
        });
        const link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + csv);
        link.download = `estado_cuenta_${data.cliente.id}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
