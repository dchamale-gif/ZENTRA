// ============================================
// MÓDULO DE REPORTES CONSOLIDADOS
// ============================================
// Reportes integrados de gastos, costos y ventas
// Consolida datos de compras, ventas, medicinas y otros conceptos

const ReportsModule = {
    state: {
        periodoSeleccionado: 'mes', // día, semana, mes, año, personalizado
        fechaInicio: null,
        fechaFin: null,
        filtroConcepto: 'todos', // todos, compras, ventas, medicinas, servicios
        reporteGenerado: null
    },

    // Inicializar el módulo
    init() {
        this.setupEventListeners();
        // Generar reporte inicial después de que el DOM esté listo
        setTimeout(async () => {
            this.setDefaultDates();
            await this.generateReport();
        }, 100);
        console.log('Módulo de Reportes inicializado');
    },

    // Configurar event listeners
    setupEventListeners() {
        const periodSelect = document.getElementById('reportPeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.state.periodoSeleccionado = e.target.value;
                if (e.target.value === 'personalizado') {
                    document.getElementById('customDateRange').style.display = 'flex';
                } else {
                    document.getElementById('customDateRange').style.display = 'none';
                    this.generateReport();
                }
            });
        }

        const conceptFilter = document.getElementById('conceptFilter');
        if (conceptFilter) {
            conceptFilter.addEventListener('change', () => {
                this.state.filtroConcepto = conceptFilter.value;
                this.generateReport();
            });
        }

        const generateBtn = document.getElementById('generateReportBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateReportWithLoader());
        }

        const refreshBtn = document.getElementById('refreshReportBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.generateReportWithLoader();
                this.showNotification('Reporte actualizado', 'success');
            });
        }

        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => this.exportToExcel());
        }

        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => this.exportToPdf());
        }

        const startDateInput = document.getElementById('reportStartDate');
        const endDateInput = document.getElementById('reportEndDate');
        if (startDateInput && endDateInput) {
            startDateInput.addEventListener('change', () => this.generateReport());
            endDateInput.addEventListener('change', () => this.generateReport());
        }
    },

    // Renderizar reporte inicial
    renderInitialReport() {
        this.setDefaultDates();
        this.generateReport();
    },

    // Establecer fechas por defecto según período
    setDefaultDates() {
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999); // Fin del día
        
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0); // Inicio del día

        switch (this.state.periodoSeleccionado) {
            case 'día':
                this.state.fechaInicio = new Date(hoy);
                this.state.fechaInicio.setHours(0, 0, 0, 0);
                this.state.fechaFin = new Date(hoy);
                break;
            case 'semana':
                inicio.setDate(hoy.getDate() - 7);
                this.state.fechaInicio = new Date(inicio);
                this.state.fechaFin = new Date(hoy);
                break;
            case 'mes':
                inicio.setDate(1);
                this.state.fechaInicio = new Date(inicio);
                this.state.fechaFin = new Date(hoy);
                break;
            case 'año':
                inicio.setMonth(0, 1);
                this.state.fechaInicio = new Date(inicio);
                this.state.fechaFin = new Date(hoy);
                break;
        }
    },

    // Obtener datos consolidados
    getConsolidatedData() {
        const datos = {
            compras: this.getComprasData(),
            ventas: this.getVentasData(),
            medicinas: this.getMedicinasData(),
            servicios: this.getServiciosData()
        };

        return datos;
    },

    // Obtener datos de compras
    getComprasData() {
        let compras = [];
        if (typeof ComprasModule !== 'undefined' && ComprasModule.state && ComprasModule.state.compras) {
            compras = ComprasModule.state.compras;
        } else {
            // Sin datos si el módulo no está cargado
            compras = this.getDemoCompras();
        }

        return this.filtrarPorPeriodo(compras, 'fecha');
    },

    // Obtener datos de ventas
    getVentasData() {
        let ventas = [];
        if (typeof VentasModule !== 'undefined' && VentasModule.state && VentasModule.state.ventas) {
            ventas = VentasModule.state.ventas;
        } else {
            ventas = this.getDemoVentas();
        }

        return this.filtrarPorPeriodo(ventas, 'fecha');
    },

    // Obtener datos de medicinas
    getMedicinasData() {
        let medicinas = [];
        if (typeof MedicinasModule !== 'undefined' && MedicinasModule.state && MedicinasModule.state.medicinas) {
            medicinas = MedicinasModule.state.medicinas;
        } else {
            medicinas = this.getDemoMedicinas();
        }

        return this.filtrarPorPeriodo(medicinas, 'fechaCompra');
    },

    // Obtener datos de servicios
    getServiciosData() {
        // No hay módulo de servicios con datos reales
        return this.getDemoServicios();
    },

    // Filtrar datos por período
    filtrarPorPeriodo(datos, campoFecha) {
        if (!Array.isArray(datos)) return [];

        return datos.filter(item => {
            const fecha = new Date(item[campoFecha]);
            return fecha >= this.state.fechaInicio && fecha <= this.state.fechaFin;
        });
    },

    // Generar reporte con loader/spinner
    generateReportWithLoader() {
        const btn = document.getElementById('generateReportBtn');
        const btnText = btn.querySelector('.btn-text');
        const btnSpinner = btn.querySelector('.btn-spinner');
        
        if (btnText && btnSpinner) {
            btnText.style.display = 'none';
            btnSpinner.style.display = 'inline';
            btn.disabled = true;
        }

        // Simular pequeño delay para que se vea la animación
        setTimeout(() => {
            this.generateReport();
            
            if (btnText && btnSpinner) {
                btnText.style.display = 'inline';
                btnSpinner.style.display = 'none';
                btn.disabled = false;
                this.showNotification('Reporte generado exitosamente', 'success');
            }
        }, 800);
    },

    // Mismo aviso que el resto del sistema (js/app.js).
    showNotification(mensaje, tipo = 'success') {
        showNotification(mensaje, tipo);
    },

    // Generar reporte consolidado
    async generateReport() {
        try {
            if (this.state.periodoSeleccionado === 'personalizado') {
                const startDate = document.getElementById('reportStartDate')?.value;
                const endDate = document.getElementById('reportEndDate')?.value;
                
                if (!startDate || !endDate) {
                    this.showNotification('Selecciona la fecha de inicio y la de fin.', 'warning');
                    return;
                }
                
                this.state.fechaInicio = new Date(startDate);
                this.state.fechaFin = new Date(endDate);
            } else {
                this.setDefaultDates();
            }

            // Formatear fechas para la API
            const startDateStr = this.formatDateForAPI(this.state.fechaInicio);
            const endDateStr = this.formatDateForAPI(this.state.fechaFin);

            // Obtener datos del servidor
            const token = localStorage.getItem('zentra_token');
            if (!token) {
                throw new Error('No hay token de autenticación');
            }
            const response = await fetch(`${authManager.apiBaseUrl}/api/reports/financial-summary?startDate=${startDateStr}&endDate=${endDateStr}`, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                const reportData = data.data;
                
                // Construir resumen compatible con el formato existente
                // Ganancia bruta = ventas − costo de lo vendido (misma regla que el Panel).
                const resumen = {
                    totalGastos: reportData.egresos,
                    totalIngresos: reportData.ingresos,
                    totalCostos: reportData.costoVentas || 0,
                    ganancia: reportData.gananciaBruta ?? reportData.ganancia,
                    margenNeto: reportData.margenBruto ?? reportData.margenNeto,
                    detalles: {
                        ventas: {
                            cantidad: reportData.numeroTransacciones || 0,
                            total: reportData.ingresos,
                            promedio: reportData.numeroTransacciones > 0 ? reportData.ingresos / reportData.numeroTransacciones : 0
                        },
                        compras: {
                            cantidad: reportData.numeroCompras || 0,
                            total: reportData.egresos,
                            promedio: reportData.numeroCompras > 0 ? reportData.egresos / reportData.numeroCompras : 0
                        }
                    }
                };

                this.state.reporteGenerado = {
                    datos: {},
                    resumen: resumen,
                    generadoEn: new Date()
                };

                this.renderReport();
            } else {
                this.showNotification('Error al generar reporte', 'error');
            }
        } catch (error) {
            console.debug('ℹ️ No se puede acceder a la API de reportes:', error.message);
            // Usar datos locales como fallback
            this.generarReporteLocal();
        }
    },

    generarReporteLocal() {
        try {
            console.log('📊 Generando reporte con datos locales');
            
            // Datos por defecto/vacíos para cuando no hay conexión
            const resumen = {
                totalGastos: 0,
                totalIngresos: 0,
                totalCostos: 0,
                ganancia: 0,
                margenNeto: 0,
                detalles: {
                    ventas: {
                        cantidad: 0,
                        total: 0,
                        promedio: 0
                    },
                    compras: {
                        cantidad: 0,
                        total: 0,
                        promedio: 0
                    }
                }
            };

            this.state.reporteGenerado = {
                datos: {},
                resumen: resumen,
                generadoEn: new Date()
            };

            this.renderReport();
        } catch (error) {
            console.error('Error generando reporte local:', error);
        }
    },

    // Formatear fecha para API (YYYY-MM-DD)
    formatDateForAPI(date) {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${year}-${month}-${day}`;
    },

    // Obtener headers de autenticación
    getAuthHeaders() {
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

    // Calcular resumen del reporte
    calcularResumen(datos) {
        const filtro = this.state.filtroConcepto;
        let totalGastos = 0;
        let totalIngresos = 0;
        let totalCostos = 0;
        let detalles = {};

        // Procesar compras
        if (filtro === 'todos' || filtro === 'compras') {
            const compras = datos.compras || [];
            const sumaCompras = compras.reduce((sum, item) => sum + Number(item.montoTotal ?? item.monto ?? item.total ?? 0), 0);
            totalGastos += sumaCompras;
            detalles.compras = {
                cantidad: compras.length,
                total: sumaCompras,
                promedio: compras.length > 0 ? sumaCompras / compras.length : 0
            };
        }

        // Procesar ventas
        if (filtro === 'todos' || filtro === 'ventas') {
            const ventas = datos.ventas || [];
            const sumaVentas = ventas.reduce((sum, item) => sum + Number(item.montoTotal ?? item.monto ?? item.total ?? 0), 0);
            totalIngresos += sumaVentas;
            detalles.ventas = {
                cantidad: ventas.length,
                total: sumaVentas,
                promedio: ventas.length > 0 ? sumaVentas / ventas.length : 0
            };
        }

        // Costo de lo vendido: unidades vendidas × precio de compra del artículo.
        // Es la misma regla que usa el margen bruto del Panel.
        if (filtro === 'todos' || filtro === 'ventas') {
            const articulos = new Map((VentasModule.state.articulos || []).map(a => [String(a.id), a]));
            let unidades = 0;
            const costoVentas = (datos.ventas || []).reduce((sum, venta) => sum + (venta.items || []).reduce((acc, item) => {
                const cantidad = Number(item.cantidad) || 0;
                unidades += cantidad;
                return acc + cantidad * (articulos.get(String(item.concepto_id))?.costo || 0);
            }, 0), 0);
            totalCostos += costoVentas;
            detalles.costoVentas = {
                cantidad: unidades,
                total: costoVentas,
                promedio: unidades > 0 ? costoVentas / unidades : 0
            };
        }

        // Procesar servicios
        if (filtro === 'todos' || filtro === 'servicios') {
            const servicios = datos.servicios || [];
            const sumaServicios = servicios.reduce((sum, item) => sum + (item.monto || 0), 0);
            totalIngresos += sumaServicios;
            detalles.servicios = {
                cantidad: servicios.length,
                total: sumaServicios,
                promedio: servicios.length > 0 ? sumaServicios / servicios.length : 0
            };
        }

        const ganancia = totalIngresos - totalCostos;
        const margenNeto = totalIngresos > 0 ? ((ganancia / totalIngresos) * 100).toFixed(2) : 0;

        return {
            totalGastos,
            totalIngresos,
            totalCostos,
            ganancia,
            margenNeto,
            detalles
        };
    },

    // Renderizar reporte
    renderReport() {
        const container = document.getElementById('reportResultContainer');
        if (!container) return;

        const resumen = this.state.reporteGenerado.resumen;
        const periodo = this.formatearPeriodo();

        let html = `
            <div class="report-container">
                <div class="report-header">
                    <h3>Reporte Consolidado: ${periodo}</h3>
                    <p class="report-date">Generado: ${new Date().toLocaleString('es-GT')}</p>
                </div>

                <div class="report-summary-grid">
                    <div class="summary-card gastos">
                        <h4>Compras del período</h4>
                        <p class="amount">${this.formatarMoneda(resumen.totalGastos)}</p>
                        <p class="details">${resumen.detalles.compras?.cantidad || 0} compras (pasan al inventario)</p>
                    </div>

                    <div class="summary-card costos">
                        <h4>Costo de lo vendido</h4>
                        <p class="amount">${this.formatarMoneda(resumen.totalCostos)}</p>
                        <p class="details">Precio de compra de lo que vendiste</p>
                    </div>

                    <div class="summary-card ingresos">
                        <h4>Ingresos totales</h4>
                        <p class="amount">${this.formatarMoneda(resumen.totalIngresos)}</p>
                        <p class="details">${Number(resumen.detalles.ventas?.cantidad || 0) + Number(resumen.detalles.servicios?.cantidad || 0)} ventas</p>
                    </div>

                    <div class="summary-card ganancia ${resumen.ganancia >= 0 ? 'positivo' : 'negativo'}">
                        <h4>Ganancia bruta</h4>
                        <p class="amount">${this.formatarMoneda(resumen.ganancia)}</p>
                        <p class="details">Margen bruto: ${(Number(resumen.margenNeto) || 0).toFixed(1)}%</p>
                    </div>
                </div>

                <div class="report-details">
                    <h4>Desglose Detallado</h4>
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th>Cantidad</th>
                                <th>Total</th>
                                <th>Promedio</th>
                                <th>% del Total</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Agregar detalles por concepto
        const totalGeneral = resumen.totalGastos + resumen.totalCostos + resumen.totalIngresos;
        
        for (const [concepto, datos] of Object.entries(resumen.detalles)) {
            if (datos.cantidad > 0) {
                const porcentaje = totalGeneral > 0 ? ((datos.total / totalGeneral) * 100).toFixed(2) : 0;
                html += `
                    <tr>
                        <td><strong>${this.getConceptoNombre(concepto)}</strong></td>
                        <td>${datos.cantidad}</td>
                        <td>${this.formatarMoneda(datos.total)}</td>
                        <td>${this.formatarMoneda(datos.promedio)}</td>
                        <td>${porcentaje}%</td>
                    </tr>
                `;
            }
        }

        html += `
                        </tbody>
                    </table>
                </div>

                <div class="report-chart-container">
                    <canvas id="reportChart"></canvas>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.renderChart();
    },

    // Renderizar gráfico
    renderChart() {
        const canvas = document.getElementById('reportChart');
        if (!canvas) return;
        if (typeof Chart === 'undefined') {
            loadLibrary('chart').then(() => this.renderChart()).catch(error => console.warn(error.message));
            return;
        }

        const resumen = this.state.reporteGenerado.resumen;
        const ctx = canvas.getContext('2d');

        // Destruir gráfico anterior si existe
        if (this.chart) {
            this.chart.destroy();
        }

        const datos = {
            gastos: resumen.totalGastos,
            costos: resumen.totalCostos,
            ingresos: resumen.totalIngresos
        };

        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Compras', 'Costo de lo vendido', 'Ingresos'],
                datasets: [{
                    data: [datos.gastos, datos.costos, datos.ingresos],
                    backgroundColor: ['#FF6B6B', '#FFA500', '#4CAF50'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return this.formatarMoneda(context.parsed);
                            }
                        }
                    }
                }
            }
        });
    },

    // Exportar a Excel
    exportToExcel() {
        if (!this.state.reporteGenerado) {
            alert('Genera un reporte primero');
            return;
        }

        const resumen = this.state.reporteGenerado.resumen;
        const periodo = this.formatearPeriodo();

        let csv = 'Reporte Consolidado: ' + periodo + '\r\n';
        csv += 'Generado: ' + new Date().toLocaleString('es-GT') + '\r\n\r\n';

        csv += 'RESUMEN\r\n';
        csv += 'Gastos Totales,' + resumen.totalGastos + '\r\n';
        csv += 'Costos (Inventario),' + resumen.totalCostos + '\r\n';
        csv += 'Ingresos Totales,' + resumen.totalIngresos + '\r\n';
        csv += 'Ganancia Neta,' + resumen.ganancia + '\r\n';
        csv += 'Margen Neto (%),' + resumen.margenNeto + '\r\n\r\n';

        csv += 'DESGLOSE\r\n';
        csv += 'Concepto,Cantidad,Total,Promedio\r\n';

        for (const [concepto, datos] of Object.entries(resumen.detalles)) {
            if (datos.cantidad > 0) {
                csv += `${this.getConceptoNombre(concepto)},${datos.cantidad},${datos.total},${datos.promedio}\r\n`;
            }
        }

        this.downloadCSV(csv, `Reporte_${periodo}_${new Date().getTime()}.csv`);
    },

    // Exportar a PDF
    async exportToPdf() {
        const element = document.getElementById('reportResultContainer');
        if (!element) {
            this.showNotification('Genera un reporte primero.', 'warning');
            return;
        }
        if (typeof html2pdf === 'undefined') {
            try {
                await loadLibrary('pdf');
            } catch (error) {
                this.showNotification(error.message, 'error');
                return;
            }
        }

        // Mostrar indicador de carga
        const btn = document.getElementById('exportPdfBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...';

        try {
            const opt = {
                margin: 10,
                filename: `Reporte_${this.formatearPeriodo().replace(/\//g, '-')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
            };

            if (typeof html2pdf !== 'undefined') {
                html2pdf().set(opt).from(element).save().then(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    this.showNotification('✅ PDF generado exitosamente', 'success');
                }).catch(error => {
                    console.error('Error generating PDF:', error);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    this.showNotification('❌ Error al generar PDF', 'error');
                });
            } else {
                // Fallback: usar jsPDF directamente
                if (typeof jsPDF !== 'undefined' && typeof html2canvas !== 'undefined') {
                    html2canvas(element, { useCORS: true, logging: false }).then(canvas => {
                        const imgData = canvas.toDataURL('image/png');
                        const pdf = new jsPDF('p', 'mm', 'a4');
                        const imgWidth = 190;
                        const imgHeight = (canvas.height * imgWidth) / canvas.width;
                        
                        pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                        pdf.save(opt.filename);
                        
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        this.showNotification('✅ PDF generado exitosamente', 'success');
                    }).catch(error => {
                        console.error('Error generating PDF with fallback:', error);
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        this.showNotification('❌ Error al generar PDF', 'error');
                    });
                } else {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    alert('⚠️ Librerías de PDF no disponibles. Por favor, recarga la página.');
                }
            }
        } catch (error) {
            console.error('Error in exportToPdf:', error);
            btn.disabled = false;
            btn.innerHTML = originalText;
            alert('❌ Error al generar PDF: ' + error.message);
        }
    },

    // Descargar CSV
    downloadCSV(csv, filename) {
        try {
            // Crear un Blob con el contenido CSV
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            
            // Agregar al DOM, hacer clic, y remover
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Liberar la URL del objeto Blob
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading CSV:', error);
            alert('Error al descargar el archivo: ' + error.message);
        }
    },

    // Formatear período
    formatearPeriodo() {
        const inicio = this.state.fechaInicio?.toLocaleDateString('es-GT') || 'N/A';
        const fin = this.state.fechaFin?.toLocaleDateString('es-GT') || 'N/A';
        
        if (this.state.periodoSeleccionado === 'personalizado') {
            return `${inicio} a ${fin}`;
        }
        return `${this.getNombrePeriodo()} (${fin})`;
    },

    // Obtener nombre del período
    getNombrePeriodo() {
        const periodo = {
            día: 'Día',
            semana: 'Última semana',
            mes: 'Mes actual',
            año: 'Año actual'
        };
        return periodo[this.state.periodoSeleccionado] || 'Personalizado';
    },

    // Obtener nombre del concepto
    getConceptoNombre(concepto) {
        const nombres = {
            compras: '🛒 Compras',
            ventas: '💳 Ventas',
            costoVentas: '📦 Costo de lo vendido (unidades)',
            servicios: '🧾 Servicios'
        };
        return nombres[concepto] || concepto;
    },

    // Formatear moneda
    formatarMoneda(valor) {
        const monto = Number(valor);
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2
        }).format(Number.isFinite(monto) ? monto : 0);
    },

    // Sin datos de ejemplo - Compras
    getDemoCompras() {
        return [];
    },

    // Sin datos de ejemplo - Ventas
    getDemoVentas() {
        return [];
    },

    // Sin datos de ejemplo - Medicinas
    getDemoMedicinas() {
        return [];
    },

    // Sin datos de ejemplo - Servicios
    getDemoServicios() {
        return [];
    }
};

// Inicializar módulo cuando el documento esté listo
document.addEventListener('DOMContentLoaded', function() {
    ReportsModule.init();
});
