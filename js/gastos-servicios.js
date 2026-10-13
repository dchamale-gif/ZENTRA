// ============================================
// Módulo: Gastos y Servicios
// Descripción: Gestión de gastos, conceptos y proveedores
// ============================================

class GastosServiciosModule {
    constructor() {
        this.state = {
            conceptos: [],
            proveedores: [],
            pagos: [],
            cuentasPorPagar: [], // {id, proveedor, concepto, monto, saldo, fecha, vencimiento, numeroFactura, estado, pagos[]}
            filtroConcepto: 'todos',
            filtroPeriodo: 'mensual',
            fechaInicio: null,
            fechaFin: null
        };
        this.init();
    }

    init() {
        // Cargar datos del localStorage
        const savedData = localStorage.getItem('gastosServiciosData');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.state = { ...this.state, ...data };
            } catch (e) {
                console.error('❌ Error parsing saved data:', e);
                this.loadDemoData();
            }
        } else {
            this.loadDemoData();
        }
        this.setDefaultPeriod();
    }

    loadDemoData() {
        console.error('❌ ERROR: No hay datos de gastos disponibles en localStorage');
        showNotification('❌ Error: No se puede acceder a los datos de gastos. Verifica la base de datos.', 'error');
        this.state.conceptos = [];
        this.state.proveedores = [];
        this.state.pagos = [];
        this.state.gastos = [];
        this.state.cuentasPorPagar = [];
    }

    setDefaultPeriod() {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        this.state.fechaInicio = firstDay.toISOString().split('T')[0];
        this.state.fechaFin = lastDay.toISOString().split('T')[0];
    }

    save() {
        localStorage.setItem('gastosServiciosData', JSON.stringify(this.state));
    }

    // ==================== PAGOS ====================
    addPago(concepto, proveedor, monto, fecha, numeroFactura, requisicion, referencia) {
        if (!concepto || !proveedor || !monto || !fecha || !numeroFactura) {
            alert('Por favor complete todos los campos requeridos (incluyendo número de factura)');
            return false;
        }

        const newPago = {
            id: 'PAG-' + Date.now(),
            fecha: fecha,
            concepto: concepto,
            proveedor: proveedor,
            monto: parseFloat(monto),
            numeroFactura: numeroFactura,
            requisicion: requisicion || '',
            referencia: referencia || '',
            estado: 'pagado'
        };

        this.state.pagos.unshift(newPago);
        this.save();
        return true;
    }

    deletePago(pagoId) {
        this.state.pagos = this.state.pagos.filter(p => p.id !== pagoId);
        this.save();
    }

    editPago(pagoId, concepto, proveedor, monto, fecha, numeroFactura, requisicion, referencia) {
        const pago = this.state.pagos.find(p => p.id === pagoId);
        if (pago) {
            pago.concepto = concepto;
            pago.proveedor = proveedor;
            pago.monto = parseFloat(monto);
            pago.fecha = fecha;
            pago.numeroFactura = numeroFactura;
            pago.requisicion = requisicion || '';
            pago.referencia = referencia || '';
            this.save();
            return true;
        }
        return false;
    }

    getPagoConcepto(conceptoId) {
        return this.state.conceptos.find(c => c.id === conceptoId);
    }

    getPagoProveedor(proveedorId) {
        return this.state.proveedores.find(p => p.id === proveedorId);
    }

    // ==================== PROVEEDORES ====================
    addProveedor(nombre, contacto, referencia, telefono) {
        if (!nombre || !contacto) {
            alert('Por favor ingrese el nombre del proveedor y el contacto');
            return false;
        }

        const newProveedor = {
            id: 'PRV-' + Date.now(),
            nombre: nombre,
            contacto: contacto,
            referencia: referencia || '',
            telefono: telefono || '',
            estado: 'activo',
            fechaAlta: new Date().toISOString().split('T')[0],
            historialBajas: [] // Array para guardar historial de bajas si se reactiva
        };

        this.state.proveedores.push(newProveedor);
        this.save();
        return true;
    }

    deleteProveedor(proveedorId) {
        this.state.proveedores = this.state.proveedores.filter(p => p.id !== proveedorId);
        this.save();
    }

    // Dar de baja un proveedor (sin eliminar datos)
    darDeBajaProveedor(proveedorId, motivo, fechaBaja) {
        const proveedor = this.state.proveedores.find(p => p.id === proveedorId);
        if (proveedor) {
            proveedor.estado = 'inactivo';
            proveedor.fechaBaja = fechaBaja || new Date().toISOString().split('T')[0];
            proveedor.motivoBaja = motivo || '';
            if (!proveedor.historialBajas) {
                proveedor.historialBajas = [];
            }
            proveedor.historialBajas.push({
                fecha: fechaBaja || new Date().toISOString().split('T')[0],
                motivo: motivo || '',
                timestamp: new Date().toISOString()
            });
            this.save();
            return true;
        }
        return false;
    }

    // Reactivar proveedor
    reactivarProveedor(proveedorId) {
        const proveedor = this.state.proveedores.find(p => p.id === proveedorId);
        if (proveedor) {
            proveedor.estado = 'activo';
            delete proveedor.fechaBaja;
            delete proveedor.motivoBaja;
            this.save();
            return true;
        }
        return false;
    }

    editProveedor(proveedorId, nombre, contacto, referencia, telefono) {
        const proveedor = this.state.proveedores.find(p => p.id === proveedorId);
        if (proveedor) {
            proveedor.nombre = nombre;
            proveedor.contacto = contacto;
            proveedor.referencia = referencia || '';
            proveedor.telefono = telefono || '';
            this.save();
            return true;
        }
        return false;
    }

    // ==================== REPORTES ====================
    generateGastosReport() {
        const pagosFiltered = this.filterPagosByPeriodo();
        const resumen = {};
        let totalGeneral = 0;

        pagosFiltered.forEach(pago => {
            const concepto = this.getPagoConcepto(pago.concepto);
            const conceptoNombre = concepto ? concepto.nombre : 'Desconocido';
            
            if (!resumen[conceptoNombre]) {
                resumen[conceptoNombre] = { monto: 0, cantidad: 0, pagos: [] };
            }
            resumen[conceptoNombre].monto += pago.monto;
            resumen[conceptoNombre].cantidad += 1;
            resumen[conceptoNombre].pagos.push(pago);
            totalGeneral += pago.monto;
        });

        return { resumen, totalGeneral, pagosFiltered };
    }

    generateComparativoReport() {
        // Gastos
        const reportGastos = this.generateGastosReport();
        const totalGastos = reportGastos.totalGeneral;

        // Ventas (desde localStorage)
        let totalVentas = 0;
        const ventasData = localStorage.getItem('ventas');
        if (ventasData) {
            try {
                const ventas = JSON.parse(ventasData);
                totalVentas = ventas
                    .filter(v => v.fecha >= this.state.fechaInicio && v.fecha <= this.state.fechaFin)
                    .reduce((sum, v) => sum + (v.monto || v.total || 0), 0);
            } catch (e) {
                console.warn('⚠️ No hay datos de ventas disponibles');
            }
        }

        // Compras
        let totalCompras = 0;
        const comprasData = localStorage.getItem('compras');
        if (comprasData) {
            try {
                const compras = JSON.parse(comprasData);
                totalCompras = compras
                    .filter(c => c.fecha >= this.state.fechaInicio && c.fecha <= this.state.fechaFin)
                    .reduce((sum, c) => sum + (c.monto || c.total || 0), 0);
            } catch (e) {
                console.warn('⚠️ No hay datos de compras disponibles');
            }
        }

        return {
            periodo: `${this.state.fechaInicio} a ${this.state.fechaFin}`,
            gastos: totalGastos,
            ventas: totalVentas,
            compras: totalCompras,
            ganancia: totalVentas - totalCompras - totalGastos
        };
    }

    filterPagosByPeriodo() {
        const inicio = new Date(this.state.fechaInicio);
        const fin = new Date(this.state.fechaFin);
        
        return this.state.pagos.filter(pago => {
            const pagofecha = new Date(pago.fecha);
            return pagofecha >= inicio && pagofecha <= fin;
        });
    }

    setPeriodo(tipoPeriodo) {
        const today = new Date();
        this.state.filtroPeriodo = tipoPeriodo;

        switch (tipoPeriodo) {
            case 'diario':
                this.state.fechaInicio = today.toISOString().split('T')[0];
                this.state.fechaFin = today.toISOString().split('T')[0];
                break;
            case 'semanal':
                const firstDay = new Date(today);
                firstDay.setDate(today.getDate() - today.getDay());
                const lastDay = new Date(firstDay);
                lastDay.setDate(firstDay.getDate() + 6);
                this.state.fechaInicio = firstDay.toISOString().split('T')[0];
                this.state.fechaFin = lastDay.toISOString().split('T')[0];
                break;
            case 'mensual':
                const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                this.state.fechaInicio = firstMonth.toISOString().split('T')[0];
                this.state.fechaFin = lastMonth.toISOString().split('T')[0];
                break;
        }
        this.save();
    }

    // ==================== UTILIDADES ====================
    formatarMoneda(valor) {
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(valor);
    }

    formatarFecha(fecha) {
        return new Intl.DateTimeFormat('es-GT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(new Date(fecha));
    }

    // ==================== RENDERIZADO ====================
    renderPagos() {
        const container = document.getElementById('listadoPagos');
        if (!container) return;

        const pagos = this.filterPagosByPeriodo();
        
        if (pagos.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay pagos registrados en este período</p>';
            return;
        }

        let html = '<table class="tabla-datos">';
        html += '<thead><tr>';
        html += '<th>Fecha</th>';
        html += '<th>Concepto</th>';
        html += '<th>Proveedor</th>';
        html += '<th>Nº Factura</th>';
        html += '<th>Requisición/Lote</th>';
        html += '<th>Referencia</th>';
        html += '<th>Monto</th>';
        html += '<th>Acciones</th>';
        html += '</tr></thead><tbody>';

        pagos.forEach(pago => {
            const concepto = this.getPagoConcepto(pago.concepto);
            const proveedor = this.getPagoProveedor(pago.proveedor);
            const conceptoNombre = concepto ? concepto.nombre : 'Desconocido';
            const proveedorNombre = proveedor ? proveedor.nombre : 'Desconocido';

            html += '<tr>';
            html += `<td>${this.formatarFecha(pago.fecha)}</td>`;
            html += `<td>${conceptoNombre}</td>`;
            html += `<td>${proveedorNombre}</td>`;
            html += `<td><strong>${pago.numeroFactura || '-'}</strong></td>`;
            html += `<td>${pago.requisicion || '-'}</td>`;
            html += `<td>${pago.referencia || '-'}</td>`;
            html += `<td class="monto">${this.formatarMoneda(pago.monto)}</td>`;
            html += `<td class="acciones">`;
            html += `<button onclick="gastosModule.deletePago('${pago.id}'); gastosModule.render();" class="btn-delete"><i class="fas fa-trash"></i></button>`;
            html += `</td></tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    renderProveedores() {
        const container = document.getElementById('listadoProveedores');
        if (!container) return;

        if (this.state.proveedores.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay proveedores registrados</p>';
            return;
        }

        let html = '<table class="tabla-datos">';
        html += '<thead><tr>';
        html += '<th>Nombre</th>';
        html += '<th>Contacto</th>';
        html += '<th>Teléfono</th>';
        html += '<th>Referencia</th>';
        html += '<th>Estado</th>';
        html += '<th>Acciones</th>';
        html += '</tr></thead><tbody>';

        this.state.proveedores.forEach(proveedor => {
            const estadoClass = proveedor.estado === 'activo' ? 'badge-active' : 'badge-inactive';
            const estadoIcon = proveedor.estado === 'activo' ? 'fas fa-check-circle' : 'fas fa-times-circle';
            const botonesAccion = proveedor.estado === 'activo'
                ? `<button onclick="abrirModalBajaProveedor('${proveedor.id}', '${proveedor.nombre}')" class="btn-warning" style="padding: 5px 10px; margin-right: 5px;"><i class="fas fa-ban"></i> Dar de baja</button>`
                : `<button onclick="gastosModule.reactivarProveedor('${proveedor.id}'); gastosModule.render();" class="btn-info" style="padding: 5px 10px; margin-right: 5px;"><i class="fas fa-refresh"></i> Reactivar</button>`;

            html += '<tr>';
            html += `<td><strong>${proveedor.nombre}</strong></td>`;
            html += `<td>${proveedor.contacto || '-'}</td>`;
            html += `<td>${proveedor.telefono || '-'}</td>`;
            html += `<td>${proveedor.referencia || '-'}</td>`;
            html += `<td><span class="${estadoClass}"><i class="${estadoIcon}"></i> ${proveedor.estado}</span></td>`;
            html += `<td class="acciones">`;
            html += botonesAccion;
            html += `<button onclick="gastosModule.deleteProveedor('${proveedor.id}'); gastosModule.render();" class="btn-delete"><i class="fas fa-trash"></i> Eliminar</button>`;
            html += `</td></tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    renderReporteGastos() {
        const container = document.getElementById('reporteGastos');
        if (!container) return;

        const data = this.generateGastosReport();
        const { resumen, totalGeneral } = data;

        let html = '<div class="reporte-contenedor">';
        html += `<h3>Reporte de Gastos (${this.state.filtroPeriodo})</h3>`;
        html += `<p class="periodo-label">Período: ${this.formatarFecha(this.state.fechaInicio)} - ${this.formatarFecha(this.state.fechaFin)}</p>`;

        if (Object.keys(resumen).length === 0) {
            html += '<p class="empty-state">No hay datos para mostrar en este período</p>';
        } else {
            html += '<table class="tabla-datos">';
            html += '<thead><tr>';
            html += '<th>Concepto</th>';
            html += '<th>Cantidad</th>';
            html += '<th>Total</th>';
            html += '</tr></thead><tbody>';

            Object.keys(resumen).sort().forEach(concepto => {
                const data = resumen[concepto];
                html += '<tr>';
                html += `<td>${concepto}</td>`;
                html += `<td class="cantidad">${data.cantidad}</td>`;
                html += `<td class="monto">${this.formatarMoneda(data.monto)}</td>`;
                html += '</tr>';
            });

            html += '<tr class="fila-total">';
            html += '<td><strong>TOTAL</strong></td>';
            html += '<td></td>';
            html += `<td class="monto"><strong>${this.formatarMoneda(totalGeneral)}</strong></td>`;
            html += '</tr></tbody></table>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    renderReporteComparativo() {
        const container = document.getElementById('reporteComparativo');
        if (!container) return;

        const datos = this.generateComparativoReport();

        let html = '<div class="reporte-contenedor">';
        html += '<h3>Reporte Comparativo</h3>';
        html += `<p class="periodo-label">Período: ${datos.periodo}</p>`;

        html += '<table class="tabla-comparativo">';
        html += '<thead><tr>';
        html += '<th>Concepto</th>';
        html += '<th>Monto (Q.)</th>';
        html += '</tr></thead><tbody>';

        html += '<tr>';
        html += `<td>Ventas</td>`;
        html += `<td class="monto positivo">${this.formatarMoneda(datos.ventas)}</td>`;
        html += '</tr>';

        html += '<tr>';
        html += `<td>Compras</td>`;
        html += `<td class="monto negativo">${this.formatarMoneda(datos.compras)}</td>`;
        html += '</tr>';

        html += '<tr>';
        html += `<td>Gastos y Servicios</td>`;
        html += `<td class="monto negativo">${this.formatarMoneda(datos.gastos)}</td>`;
        html += '</tr>';

        html += '<tr class="fila-total">';
        html += `<td><strong>Ganancia Neta</strong></td>`;
        html += `<td class="monto ${datos.ganancia >= 0 ? 'positivo' : 'negativo'}"><strong>${this.formatarMoneda(datos.ganancia)}</strong></td>`;
        html += '</tr>';

        html += '</tbody></table>';
        html += '</div>';

        container.innerHTML = html;
    }

    renderSelectConceptos() {
        const select = document.getElementById('selectConcepto');
        if (!select) return;

        select.innerHTML = '<option value="">-- Seleccionar Concepto --</option>';
        this.state.conceptos.forEach(concepto => {
            select.innerHTML += `<option value="${concepto.id}">${concepto.nombre}</option>`;
        });
    }

    renderSelectProveedores() {
        const select = document.getElementById('selectProveedor');
        if (!select) return;

        select.innerHTML = '<option value="">-- Seleccionar Proveedor --</option>';
        this.state.proveedores.forEach(proveedor => {
            select.innerHTML += `<option value="${proveedor.id}">${proveedor.nombre}</option>`;
        });
    }

    render() {
        this.renderSelectConceptos();
        this.renderSelectProveedores();
        this.renderPagos();
        this.renderProveedores();
        this.renderReporteGastos();
        this.renderReporteComparativo();
    }

    // ==================== EXPORT ====================
    exportHTML(tipoReporte) {
        let html = '<!DOCTYPE html>';
        html += '<html lang="es">';
        html += '<head>';
        html += '<meta charset="UTF-8">';
        html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
        html += `<title>Reporte ${tipoReporte}</title>`;
        html += '<style>';
        html += 'body { font-family: Arial, sans-serif; margin: 20px; color: #333; }';
        html += 'h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }';
        html += 'p { color: #666; }';
        html += 'table { width: 100%; border-collapse: collapse; margin-top: 20px; }';
        html += 'th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }';
        html += 'th { background-color: #3498db; color: white; font-weight: bold; }';
        html += 'tr:nth-child(even) { background-color: #ecf0f1; }';
        html += '.fila-total { background-color: #2ecc71; font-weight: bold; color: white; }';
        html += '.positivo { color: #27ae60; }';
        html += '.negativo { color: #e74c3c; }';
        html += '.monto { text-align: right; }';
        html += '</style>';
        html += '</head>';
        html += '<body>';

        if (tipoReporte === 'Gastos') {
            const data = this.generateGastosReport();
            html += '<h1>Reporte de Gastos y Servicios</h1>';
            html += `<p><strong>Período:</strong> ${this.formatarFecha(this.state.fechaInicio)} - ${this.formatarFecha(this.state.fechaFin)}</p>`;
            html += `<p><strong>Generado:</strong> ${new Date().toLocaleString('es-GT')}</p>`;
            html += '<table>';
            html += '<thead><tr><th>Concepto</th><th>Cantidad</th><th>Total</th></tr></thead>';
            html += '<tbody>';
            
            Object.keys(data.resumen).sort().forEach(concepto => {
                const item = data.resumen[concepto];
                html += `<tr><td>${concepto}</td><td>${item.cantidad}</td><td class="monto">${this.formatarMoneda(item.monto)}</td></tr>`;
            });

            html += `<tr class="fila-total"><td>TOTAL</td><td></td><td class="monto">${this.formatarMoneda(data.totalGeneral)}</td></tr>`;
            html += '</tbody></table>';
        } else if (tipoReporte === 'Comparativo') {
            const datos = this.generateComparativoReport();
            html += '<h1>Reporte Comparativo Financiero</h1>';
            html += `<p><strong>Período:</strong> ${datos.periodo}</p>`;
            html += `<p><strong>Generado:</strong> ${new Date().toLocaleString('es-GT')}</p>`;
            html += '<table>';
            html += '<thead><tr><th>Concepto</th><th>Monto</th></tr></thead>';
            html += '<tbody>';
            html += `<tr><td>Ventas</td><td class="monto positivo">${this.formatarMoneda(datos.ventas)}</td></tr>`;
            html += `<tr><td>Compras</td><td class="monto negativo">${this.formatarMoneda(datos.compras)}</td></tr>`;
            html += `<tr><td>Gastos y Servicios</td><td class="monto negativo">${this.formatarMoneda(datos.gastos)}</td></tr>`;
            html += `<tr class="fila-total"><td>Ganancia Neta</td><td class="monto ${datos.ganancia >= 0 ? 'positivo' : 'negativo'}">${this.formatarMoneda(datos.ganancia)}</td></tr>`;
            html += '</tbody></table>';
        }

        html += '</body></html>';

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-${tipoReporte.toLowerCase()}-${new Date().toISOString().split('T')[0]}.html`;
        link.click();
    }

    // ==================== CUENTAS POR PAGAR ====================
    addCuentaPorPagar(proveedor, concepto, monto, fecha, vencimiento, numeroFactura) {
        if (!proveedor || !concepto || !monto || !fecha || !vencimiento || !numeroFactura) {
            alert('Por favor complete todos los campos requeridos');
            return false;
        }

        const newCuenta = {
            id: 'CPP-' + Date.now(),
            proveedor: proveedor,
            concepto: concepto,
            monto: parseFloat(monto),
            saldo: parseFloat(monto),
            fecha: fecha,
            vencimiento: vencimiento,
            numeroFactura: numeroFactura,
            estado: 'pendiente',
            pagos: []
        };

        this.state.cuentasPorPagar.push(newCuenta);
        this.save();
        return true;
    }

    registrarPagoCuenta(cuentaId, monto, fecha) {
        const cuenta = this.state.cuentasPorPagar.find(c => c.id === cuentaId);
        if (!cuenta) return false;

        const montoNum = parseFloat(monto);
        if (montoNum <= 0 || montoNum > cuenta.saldo) {
            alert('Monto inválido. Debe ser mayor a 0 y menor o igual al saldo pendiente');
            return false;
        }

        const pago = {
            id: 'PAG-' + Date.now(),
            monto: montoNum,
            fecha: fecha
        };

        cuenta.pagos.push(pago);
        cuenta.saldo -= montoNum;

        if (cuenta.saldo === 0) {
            cuenta.estado = 'pagada';
        } else if (cuenta.saldo < cuenta.monto) {
            cuenta.estado = 'parcial';
        }

        this.save();
        return true;
    }

    deleteCuentaPorPagar(cuentaId) {
        this.state.cuentasPorPagar = this.state.cuentasPorPagar.filter(c => c.id !== cuentaId);
        this.save();
    }

    getCuentasPendientes() {
        return this.state.cuentasPorPagar.filter(c => c.estado !== 'pagada');
    }

    getCuentasVencidas() {
        const hoy = new Date();
        return this.state.cuentasPorPagar.filter(c => {
            const vencimiento = new Date(c.vencimiento);
            return vencimiento < hoy && c.estado !== 'pagada';
        });
    }

    renderCuentasPorPagar() {
        const container = document.getElementById('listadoCuentasPorPagar');
        if (!container) return;

        const cuentas = this.state.cuentasPorPagar;

        if (cuentas.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay cuentas por pagar registradas</p>';
            return;
        }

        let html = '<table class="tabla-datos">';
        html += '<thead><tr>';
        html += '<th>Fecha</th>';
        html += '<th>Proveedor</th>';
        html += '<th>Nº Factura</th>';
        html += '<th>Concepto</th>';
        html += '<th>Monto Original</th>';
        html += '<th>Saldo</th>';
        html += '<th>Vencimiento</th>';
        html += '<th>Estado</th>';
        html += '<th>Acciones</th>';
        html += '</tr></thead><tbody>';

        cuentas.forEach(cuenta => {
            const proveedor = this.getPagoProveedor(cuenta.proveedor) || { nombre: cuenta.proveedor };
            const proveedorNombre = proveedor.nombre;
            
            const vencimiento = new Date(cuenta.vencimiento);
            const hoy = new Date();
            const estadoClass = vencimiento < hoy && cuenta.estado !== 'pagada' ? 'vencida' : cuenta.estado;
            const estadoLabel = vencimiento < hoy && cuenta.estado !== 'pagada' ? 'VENCIDA' : cuenta.estado.toUpperCase();
            const estadoIcon = cuenta.estado === 'pagada' ? '✓' : cuenta.estado === 'parcial' ? '◐' : '●';

            html += '<tr>';
            html += `<td>${this.formatarFecha(cuenta.fecha)}</td>`;
            html += `<td>${proveedorNombre}</td>`;
            html += `<td><strong>${cuenta.numeroFactura}</strong></td>`;
            html += `<td>${cuenta.concepto}</td>`;
            html += `<td class="monto">${this.formatarMoneda(cuenta.monto)}</td>`;
            html += `<td class="monto saldo-pendiente">${this.formatarMoneda(cuenta.saldo)}</td>`;
            html += `<td>${this.formatarFecha(cuenta.vencimiento)}</td>`;
            html += `<td><span class="badge badge-${estadoClass}">${estadoIcon} ${estadoLabel}</span></td>`;
            html += `<td class="acciones">`;
            html += `<button onclick="gastosModule.abrirModalDetallesCuenta('${cuenta.id}')" class="btn-info" style="padding: 5px 10px; margin-right: 5px;"><i class="fas fa-eye"></i> Detalles</button>`;
            if (cuenta.estado !== 'pagada') {
                html += `<button onclick="gastosModule.abrirModalPagoCuenta('${cuenta.id}')" class="btn-info" style="padding: 5px 10px; margin-right: 5px;"><i class="fas fa-money-bill"></i> Pagar</button>`;
            }
            html += `<button onclick="gastosModule.deleteCuentaPorPagar('${cuenta.id}'); gastosModule.renderCuentasPorPagar();" class="btn-delete"><i class="fas fa-trash"></i></button>`;
            html += `</td></tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    abrirModalDetallesCuenta(cuentaId) {
        const cuenta = this.state.cuentasPorPagar.find(c => c.id === cuentaId);
        if (!cuenta) return;

        const proveedor = this.getPagoProveedor(cuenta.proveedor) || { nombre: cuenta.proveedor };
        
        let html = `
            <div style="background: white; border-radius: 8px; padding: 20px; max-height: 600px; overflow-y: auto;">
                <h3>${proveedor.nombre} - Factura ${cuenta.numeroFactura}</h3>
                <p style="color: #666; margin-bottom: 15px;"><strong>Concepto:</strong> ${cuenta.concepto}</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="text-align: left; padding: 10px; border-bottom: 2px solid #ddd;">Concepto</th>
                            <th style="text-align: right; padding: 10px; border-bottom: 2px solid #ddd;">Cantidad</th>
                            <th style="text-align: right; padding: 10px; border-bottom: 2px solid #ddd;">Unitario</th>
                            <th style="text-align: right; padding: 10px; border-bottom: 2px solid #ddd;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cuenta.lineas.map(linea => `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding: 10px;">${linea.concepto}</td>
                                <td style="text-align: right; padding: 10px;">${linea.cantidad}</td>
                                <td style="text-align: right; padding: 10px;">${this.formatarMoneda(linea.unitario)}</td>
                                <td style="text-align: right; padding: 10px; font-weight: bold;">${this.formatarMoneda(linea.subtotal)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f5f5f5; font-weight: bold;">
                            <td colspan="3" style="padding: 10px; text-align: right; border-top: 2px solid #ddd;">TOTAL:</td>
                            <td style="text-align: right; padding: 10px; border-top: 2px solid #ddd;">${this.formatarMoneda(cuenta.monto)}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div style="background: #f9f9f9; padding: 12px; border-radius: 5px;">
                        <p style="margin: 0; color: #666; font-size: 12px;">Pagado</p>
                        <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold; color: #27ae60;">${this.formatarMoneda(cuenta.monto - cuenta.saldo)}</p>
                    </div>
                    <div style="background: #f9f9f9; padding: 12px; border-radius: 5px;">
                        <p style="margin: 0; color: #666; font-size: 12px;">Saldo Pendiente</p>
                        <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold; color: ${cuenta.saldo > 0 ? '#e74c3c' : '#27ae60'};">${this.formatarMoneda(cuenta.saldo)}</p>
                    </div>
                </div>

                ${cuenta.pagos.length > 0 ? `
                    <div style="background: #f0f8ff; padding: 12px; border-radius: 5px; margin-bottom: 15px;">
                        <p style="margin: 0 0 8px 0; font-weight: bold; color: #0066cc;">Historial de Pagos:</p>
                        ${cuenta.pagos.map(pago => `
                            <p style="margin: 5px 0; color: #333; font-size: 12px;">
                                📅 ${pago.fecha} - ${this.formatarMoneda(pago.monto)}
                            </p>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = `
            <div style="background: white; border-radius: 8px; padding: 0; max-width: 600px; width: 90%;">
                <div style="padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0;">Detalles de Cuenta por Pagar</h2>
                    <button onclick="this.closest('div').parentElement.remove();" style="border: none; background: none; font-size: 24px; cursor: pointer; color: #999;">×</button>
                </div>
                <div style="padding: 20px;">
                    ${html}
                </div>
                <div style="padding: 15px; background: #f5f5f5; border-top: 1px solid #eee; text-align: right;">
                    <button onclick="this.closest('div').parentElement.remove();" class="btn btn-secondary">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    abrirModalPagoCuenta(cuentaId) {
        const cuenta = this.state.cuentasPorPagar.find(c => c.id === cuentaId);
        if (!cuenta) return;

        const proveedor = this.getPagoProveedor(cuenta.proveedor) || { nombre: cuenta.proveedor };
        const proveedorNombre = proveedor ? proveedor.nombre : 'Desconocido';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 500px;">
                <div class="modal-header">
                    <h2><i class="fas fa-money-bill"></i> Registrar Pago</h2>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <p><strong>Proveedor:</strong> ${proveedorNombre}</p>
                        <p><strong>Factura:</strong> ${cuenta.numeroFactura}</p>
                        <p><strong>Saldo Pendiente:</strong> <span style="color: #e74c3c; font-weight: bold;">${this.formatarMoneda(cuenta.saldo)}</span></p>
                    </div>
                    <div class="form-group full-width">
                        <label>Monto a Pagar *</label>
                        <input type="number" id="montoPago" class="form-input" placeholder="0.00" step="0.01" value="${cuenta.saldo}" required>
                    </div>
                    <div class="form-group full-width">
                        <label>Fecha del Pago *</label>
                        <input type="date" id="fechaPago" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="gastosModule.confirmarPagoCuenta('${cuentaId}')">
                            <i class="fas fa-check"></i> Registrar Pago
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    confirmarPagoCuenta(cuentaId) {
        const monto = document.getElementById('montoPago')?.value;
        const fecha = document.getElementById('fechaPago')?.value;

        if (!monto || !fecha) {
            alert('Por favor complete todos los campos');
            return;
        }

        if (this.registrarPagoCuenta(cuentaId, monto, fecha)) {
            this.renderCuentasPorPagar();
            document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
            alert('Pago registrado exitosamente');
        }
    }
}

// Inicializar módulo globalmente
let gastosModule;
document.addEventListener('DOMContentLoaded', function() {
    gastosModule = new GastosServiciosModule();
    gastosModule.render();
});
