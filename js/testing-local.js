// ============================================
// TESTING LOCAL - FACTURACIÓN MEJORADA
// Simular datos locales para pruebas sin servidor
// ============================================

const FacturacionTestingLocal = {
    // Base de datos simulada
    db: {
        pacientes: [
            {
                id: 'PAC-001',
                nombre: 'Juan',
                apellidoPaterno: 'Pérez',
                apellidoMaterno: 'García',
                dpi: '12345678-9',
                telefono: '+502 7777-8888',
                email: 'juan@example.com'
            },
            {
                id: 'PAC-002',
                nombre: 'María',
                apellidoPaterno: 'López',
                apellidoMaterno: 'Rodríguez',
                dpi: '87654321-0',
                telefono: '+502 6666-7777',
                email: 'maria@example.com'
            },
            {
                id: 'PAC-003',
                nombre: 'Carlos',
                apellidoPaterno: 'González',
                apellidoMaterno: 'Martínez',
                dpi: '11111111-1',
                telefono: '+502 5555-6666',
                email: 'carlos@example.com'
            }
        ],
        saldosPacientes: [
            {
                id: 'SALDO-001',
                paciente_id: 'PAC-001',
                saldo_pendiente: 500.00,
                total_deuda: 1000.00,
                ultima_transaccion: '2026-06-20'
            },
            {
                id: 'SALDO-002',
                paciente_id: 'PAC-002',
                saldo_pendiente: 0.00,
                total_deuda: 750.00,
                ultima_transaccion: '2026-06-25'
            },
            {
                id: 'SALDO-003',
                paciente_id: 'PAC-003',
                saldo_pendiente: 250.00,
                total_deuda: 250.00,
                ultima_transaccion: '2026-06-15'
            }
        ],
        facturas: [],
        movimientos: []
    },

    // Inicializar datos locales
    init() {
        console.log('🧪 Testing Local iniciado');
        this.guardarDatos();
    },

    // Guardar datos en localStorage
    guardarDatos() {
        localStorage.setItem('pacientes', JSON.stringify(this.db.pacientes));
        localStorage.setItem('saldosPacientes', JSON.stringify(this.db.saldosPacientes));
        localStorage.setItem('facturas_test', JSON.stringify(this.db.facturas));
        localStorage.setItem('movimientos_test', JSON.stringify(this.db.movimientos));
    },

    // ============================================
    // SIMULACIÓN DE API - ENDPOINT FACTURA
    // ============================================

    async crearFacturaLocal(datos) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const facturaId = 'FAC-' + Date.now();
                const numero_factura = `FAC-2026-${(this.db.facturas.length + 1).toString().padStart(6, '0')}`;

                const factura = {
                    id: facturaId,
                    numero_factura: numero_factura,
                    paciente_id: datos.paciente_id,
                    items: datos.items,
                    descuentos: datos.descuentos,
                    totales: datos.totales,
                    metodo_pago: datos.metodo_pago,
                    fecha: new Date().toISOString(),
                    estado: 'completada'
                };

                this.db.facturas.push(factura);

                // Actualizar saldo del paciente
                const saldo = this.db.saldosPacientes.find(s => s.paciente_id === datos.paciente_id);
                if (saldo) {
                    const montoAnterior = saldo.saldo_pendiente;
                    saldo.saldo_pendiente += datos.totales.total_neto;
                    saldo.total_deuda += datos.totales.total_neto;
                    saldo.ultima_transaccion = new Date().toISOString();

                    // Registrar movimiento
                    const movimiento = {
                        id: 'MOV-' + Date.now(),
                        paciente_id: datos.paciente_id,
                        tipo: 'factura',
                        descripcion: `Factura ${numero_factura}`,
                        monto: datos.totales.total_neto,
                        saldo_anterior: montoAnterior,
                        saldo_nuevo: saldo.saldo_pendiente,
                        referencia_id: facturaId,
                        fecha: new Date().toISOString()
                    };

                    this.db.movimientos.push(movimiento);
                }

                this.guardarDatos();

                resolve({
                    success: true,
                    message: 'Factura creada exitosamente',
                    data: {
                        id: facturaId,
                        numero_factura: numero_factura,
                        paciente_id: datos.paciente_id,
                        totales: datos.totales,
                        fecha: new Date().toISOString(),
                        metodo_pago: datos.metodo_pago
                    }
                });
            }, 300);
        });
    },

    // ============================================
    // SIMULACIÓN DE API - ENDPOINT ESTADO CUENTA
    // ============================================

    async obtenerEstadoCuentaLocal(pacienteId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const paciente = this.db.pacientes.find(p => p.id === pacienteId);
                const saldo = this.db.saldosPacientes.find(s => s.paciente_id === pacienteId);
                const movimientos = this.db.movimientos.filter(m => m.paciente_id === pacienteId);

                if (!paciente || !saldo) {
                    resolve({
                        success: false,
                        message: 'Paciente o saldo no encontrado'
                    });
                    return;
                }

                const totalCargos = movimientos
                    .filter(m => m.tipo === 'factura')
                    .reduce((sum, m) => sum + m.monto, 0);

                const totalAbonos = movimientos
                    .filter(m => m.tipo === 'pago')
                    .reduce((sum, m) => sum + m.monto, 0);

                resolve({
                    success: true,
                    data: {
                        paciente: paciente,
                        movimientos: movimientos,
                        facturas: this.db.facturas.filter(f => f.paciente_id === pacienteId),
                        totales: {
                            total_cargos: totalCargos,
                            total_abonos: totalAbonos,
                            saldo_actual: saldo.saldo_pendiente
                        },
                        saldo: saldo
                    }
                });
            }, 200);
        });
    },

    // ============================================
    // SIMULACIÓN DE API - ENDPOINT SALDO
    // ============================================

    async obtenerSaldoLocal(pacienteId) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const saldo = this.db.saldosPacientes.find(s => s.paciente_id === pacienteId);

                if (!saldo) {
                    resolve({
                        success: true,
                        data: {
                            paciente_id: pacienteId,
                            saldo_pendiente: 0,
                            total_deuda: 0,
                            ultima_transaccion: null
                        }
                    });
                } else {
                    resolve({
                        success: true,
                        data: saldo
                    });
                }
            }, 100);
        });
    },

    // ============================================
    // SIMULACIÓN DE API - ENDPOINT PAGO
    // ============================================

    async registrarPagoLocal(pacienteId, monto) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const saldo = this.db.saldosPacientes.find(s => s.paciente_id === pacienteId);

                if (!saldo) {
                    resolve({
                        success: false,
                        message: 'No hay saldo registrado'
                    });
                    return;
                }

                const saldoAnterior = saldo.saldo_pendiente;
                const saldoNuevo = Math.max(0, saldoAnterior - monto);

                // Actualizar saldo
                saldo.saldo_pendiente = saldoNuevo;
                saldo.ultima_transaccion = new Date().toISOString();

                // Registrar movimiento
                const movimiento = {
                    id: 'MOV-' + Date.now(),
                    paciente_id: pacienteId,
                    tipo: 'pago',
                    descripcion: 'Pago de paciente',
                    monto: monto,
                    saldo_anterior: saldoAnterior,
                    saldo_nuevo: saldoNuevo,
                    referencia_id: null,
                    fecha: new Date().toISOString()
                };

                this.db.movimientos.push(movimiento);
                this.guardarDatos();

                resolve({
                    success: true,
                    message: 'Pago registrado',
                    data: {
                        saldo_anterior: saldoAnterior,
                        monto_pagado: monto,
                        saldo_nuevo: saldoNuevo
                    }
                });
            }, 200);
        });
    },

    // ============================================
    // UTILIDADES DE PRUEBA
    // ============================================

    // Crear factura de prueba
    async crearFacturaPrueba() {
        const factura = {
            paciente_id: 'PAC-001',
            items: [
                {
                    id: 'ITEM-1',
                    descripcion: 'Consulta General',
                    cantidad: 1,
                    precio_unitario: 150.00,
                    subtotal: 150.00,
                    descuentos: [],
                    descuento_total: 0,
                    total_item: 150.00
                },
                {
                    id: 'ITEM-2',
                    descripcion: 'Laboratorio',
                    cantidad: 2,
                    precio_unitario: 75.00,
                    subtotal: 150.00,
                    descuentos: [],
                    descuento_total: 0,
                    total_item: 150.00
                }
            ],
            descuentos: [
                {
                    id: 'DESC-1',
                    tipo: 'porcentaje',
                    valor: 10,
                    motivo: 'Descuento por antigüedad',
                    monto_aplicado: 30.00
                }
            ],
            totales: {
                subtotal: 300.00,
                total_descuentos: 30.00,
                base_impuesto: 270.00,
                total_impuestos: 32.40,
                total_neto: 302.40
            },
            metodo_pago: 'efectivo'
        };

        const resultado = await this.crearFacturaLocal(factura);
        console.log('✅ Factura de prueba creada:', resultado);
        return resultado;
    },

    // Obtener todos los datos
    obtenerTodosDatos() {
        return {
            pacientes: this.db.pacientes,
            saldosPacientes: this.db.saldosPacientes,
            facturas: this.db.facturas,
            movimientos: this.db.movimientos
        };
    },

    // Limpiar datos de prueba
    limpiarDatos() {
        this.db.facturas = [];
        this.db.movimientos = [];
        this.guardarDatos();
        console.log('🗑️ Datos de prueba limpiados');
    },

    // Mostrar reporte
    mostrarReporte() {
        console.log('\n' + '='.repeat(60));
        console.log('REPORTE LOCAL DE TESTING');
        console.log('='.repeat(60));

        console.log('\n📋 PACIENTES:', this.db.pacientes.length);
        this.db.pacientes.forEach((p, i) => {
            const saldo = this.db.saldosPacientes.find(s => s.paciente_id === p.id);
            console.log(`  ${i + 1}. ${p.nombre} ${p.apellidoPaterno} - Saldo: Q${saldo?.saldo_pendiente || 0}`);
        });

        console.log('\n💰 FACTURAS CREADAS:', this.db.facturas.length);
        this.db.facturas.forEach((f, i) => {
            console.log(`  ${i + 1}. ${f.numero_factura} - Q${f.totales.total_neto.toFixed(2)} (${f.metodo_pago})`);
        });

        console.log('\n📊 MOVIMIENTOS REGISTRADOS:', this.db.movimientos.length);
        this.db.movimientos.slice(-5).forEach(m => {
            const tipo = m.tipo === 'factura' ? '📄' : '✓';
            console.log(`  ${tipo} ${m.descripcion} - Q${m.monto.toFixed(2)} (Saldo: Q${m.saldo_nuevo.toFixed(2)})`);
        });

        console.log('\n' + '='.repeat(60) + '\n');
    }
};

// Comandos para consola:
console.log(`
🧪 TESTING LOCAL - Facturación Mejorada

Comandos disponibles en la consola:

1. Inicializar:
   FacturacionTestingLocal.init()

2. Crear factura de prueba:
   FacturacionTestingLocal.crearFacturaPrueba()

3. Obtener estado de cuenta:
   FacturacionTestingLocal.obtenerEstadoCuentaLocal('PAC-001')

4. Registrar pago:
   FacturacionTestingLocal.registrarPagoLocal('PAC-001', 200)

5. Ver reporte:
   FacturacionTestingLocal.mostrarReporte()

6. Obtener todos los datos:
   FacturacionTestingLocal.obtenerTodosDatos()

7. Limpiar datos:
   FacturacionTestingLocal.limpiarDatos()

Ejemplo de uso:
  await FacturacionTestingLocal.crearFacturaPrueba()
  await FacturacionTestingLocal.obtenerEstadoCuentaLocal('PAC-001')
`);

// Exportar para uso en navegador
if (typeof window !== 'undefined') {
    window.FacturacionTestingLocal = FacturacionTestingLocal;
}
