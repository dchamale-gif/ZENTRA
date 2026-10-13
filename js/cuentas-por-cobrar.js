// ============================================
// MÓDULO DE CUENTAS POR COBRAR (datos reales desde /api/receivables)
// ============================================

const CuentasPorCobrarModule = {
    state: { cuentas: [], resumen: null },

    init() {
        const addBtn = document.getElementById('addDebtBtn');
        if (addBtn) addBtn.style.display = 'none';
        this.refreshTable();
    },

    async load() {
        try {
            const [list, summary] = await Promise.all([
                authManager.fetchWithAuth('/api/receivables').then(r => r.json()),
                authManager.fetchWithAuth('/api/receivables/summary').then(r => r.json())
            ]);
            this.state.cuentas = list.success ? list.data : [];
            this.state.resumen = summary.success ? summary.data : null;
        } catch (error) {
            console.error('Error cargando cuentas por cobrar:', error);
            this.state.cuentas = [];
        }
    },

    money(value) {
        return 'Q. ' + (Number(value) || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    estadoDe(cuenta) {
        if (cuenta.diasVencido > 30) return 'Vencida';
        if (cuenta.pagado > 0) return 'Parcial';
        return 'Pendiente';
    },

    async refreshTable() {
        await this.load();
        const tbody = document.querySelector('#debutsTable tbody');
        if (!tbody) return;
        const esc = v => BulkImport.escapeHtml(v);

        const header = document.getElementById('cxcSummary');
        if (header && this.state.resumen) {
            const r = this.state.resumen;
            header.textContent = `${r.cantidadFacturas} facturas pendientes · Total por cobrar ${this.money(r.totalPendiente)}`;
        }

        if (this.state.cuentas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No hay cuentas por cobrar pendientes</td></tr>';
            return;
        }

        tbody.innerHTML = this.state.cuentas.map(c => {
            const estado = this.estadoDe(c);
            return `
            <tr>
                <td>${esc(c.numeroVenta || c.id)}</td>
                <td>${esc(c.clienteNombre || 'Sin cliente')}</td>
                <td>${this.money(c.pendiente)} <small>de ${this.money(c.total)}</small></td>
                <td>${esc(String(c.fecha).slice(0, 10))}</td>
                <td><span class="badge badge-${estado.toLowerCase()}">${estado}</span></td>
                <td>${c.diasVencido > 30 ? `<span class="warning">${c.diasVencido - 30} días vencida</span>` : 'Al día'}</td>
                <td class="actions">
                    <button class="btn-icon" title="Registrar pago" onclick="CuentasPorCobrarModule.recordPayment('${esc(c.id)}')">
                        <i class="fas fa-money-bill"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    },

    async recordPayment(ventaId) {
        const cuenta = this.state.cuentas.find(c => c.id === ventaId);
        if (!cuenta) return;

        const input = prompt(`Monto del pago (saldo pendiente ${this.money(cuenta.pendiente)}):`, cuenta.pendiente.toFixed(2));
        if (input === null) return;
        const monto = Number(input);
        if (!(monto > 0)) {
            showNotification('Ingresa un monto válido', 'error');
            return;
        }

        try {
            const response = await authManager.fetchWithAuth(`/api/receivables/${encodeURIComponent(ventaId)}/payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ monto })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'No se pudo registrar el pago');
            }
            showNotification('Pago registrado correctamente', 'success');
            this.refreshTable();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
};
