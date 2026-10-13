// ============================================
// DEMO DATA FOR STOCK FLOW
// ============================================

const demoData = {
    // Products in inventory
    products: [
        {
            id: 'PRD001',
            name: 'Laptop Dell XPS 15',
            category: 'Electrónica',
            price: 9360.00,
            stock: 15,
            minStock: 5,
            lastUpdated: '2026-03-22'
        },
        {
            id: 'PRD002',
            name: 'Monitor LG 27"',
            category: 'Electrónica',
            price: 2730.00,
            stock: 8,
            minStock: 3,
            lastUpdated: '2026-03-21'
        },
        {
            id: 'PRD003',
            name: 'Teclado Mecánico RGB',
            category: 'Electrónica',
            price: 936.00,
            stock: 45,
            minStock: 10,
            lastUpdated: '2026-03-20'
        },
        {
            id: 'PRD004',
            name: 'Ratón Logitech',
            category: 'Electrónica',
            price: 507.00,
            stock: 120,
            minStock: 20,
            lastUpdated: '2026-03-22'
        },
        {
            id: 'PRD005',
            name: 'Camiseta Premium Talla M',
            category: 'Ropa',
            price: 234.00,
            stock: 250,
            minStock: 50,
            lastUpdated: '2026-03-22'
        },
        {
            id: 'PRD006',
            name: 'Pantalón Vaquero Azul',
            category: 'Ropa',
            price: 429.00,
            stock: 180,
            minStock: 40,
            lastUpdated: '2026-03-21'
        },
        {
            id: 'PRD007',
            name: 'Café Premium 250g',
            category: 'Alimentos',
            price: 66.30,
            stock: 500,
            minStock: 100,
            lastUpdated: '2026-03-22'
        },
        {
            id: 'PRD008',
            name: 'Aceite Oliva Extra Virgen',
            category: 'Alimentos',
            price: 93.60,
            stock: 300,
            minStock: 50,
            lastUpdated: '2026-03-20'
        },
        {
            id: 'PRD009',
            name: 'Taladro Eléctrico 20V',
            category: 'Herramientas',
            price: 1170.00,
            stock: 12,
            minStock: 3,
            lastUpdated: '2026-03-19'
        },
        {
            id: 'PRD010',
            name: 'Set de Destornilladores',
            category: 'Herramientas',
            price: 273.00,
            stock: 45,
            minStock: 15,
            lastUpdated: '2026-03-22'
        }
    ],

    // Recent transactions
    transactions: [
        {
            id: 'TRN001',
            date: '2026-05-15',
            type: 'Venta',
            description: 'Venta a cliente Juan García - Laptop',
            quantity: 2,
            amount: 18720.00,
            status: 'Completada',
            productId: 'PRD001',
            referencia: 'FAC-2026-001'
        },
        {
            id: 'TRN002',
            date: '2026-05-15',
            type: 'Compra',
            description: 'Compra a proveedor Tech Supply - Teclados',
            quantity: 50,
            amount: 46800.00,
            status: 'Completada',
            productId: 'PRD003',
            referencia: 'OC-2026-001'
        },
        {
            id: 'TRN003',
            date: '2026-05-14',
            type: 'Venta',
            description: 'Venta a cliente María López - Monitores',
            quantity: 5,
            amount: 13650.00,
            status: 'Completada',
            productId: 'PRD002',
            referencia: 'FAC-2026-002'
        },
        {
            id: 'TRN004',
            date: '2026-05-14',
            type: 'Devolución',
            description: 'Devolución cliente Pedro Rodríguez - Defecto',
            quantity: 1,
            amount: 936.00,
            status: 'Completada',
            productId: 'PRD003',
            referencia: 'DEV-2026-001'
        },
        {
            id: 'TRN005',
            date: '2026-05-13',
            type: 'Compra',
            description: 'Compra a proveedor Fashion Store - Ropa',
            quantity: 100,
            amount: 23400.00,
            status: 'Completada',
            productId: 'PRD005',
            referencia: 'OC-2026-002'
        },
        {
            id: 'TRN006',
            date: '2026-05-13',
            type: 'Venta',
            description: 'Venta en línea - Ratones',
            quantity: 3,
            amount: 1521.00,
            status: 'Completada',
            productId: 'PRD004',
            referencia: 'FAC-2026-003'
        },
        {
            id: 'TRN007',
            date: '2026-05-12',
            type: 'Venta',
            description: 'Venta a cliente Ana Martínez - Pantalones',
            quantity: 2,
            amount: 858.00,
            status: 'Completada',
            productId: 'PRD006',
            referencia: 'FAC-2026-004'
        },
        {
            id: 'TRN008',
            date: '2026-05-12',
            type: 'Compra',
            description: 'Compra a distribuidor Food Co - Café',
            quantity: 200,
            amount: 13260.00,
            status: 'Completada',
            productId: 'PRD007',
            referencia: 'OC-2026-003'
        },
        {
            id: 'TRN009',
            date: '2026-05-11',
            type: 'Venta',
            description: 'Venta corporativa Empresa XYZ - Laptops',
            quantity: 10,
            amount: 93600.00,
            status: 'Completada',
            productId: 'PRD001',
            referencia: 'FAC-2026-005'
        },
        {
            id: 'TRN010',
            date: '2026-05-11',
            type: 'Compra',
            description: 'Compra a herramientas Tools Plus - Taladros',
            quantity: 8,
            amount: 9360.00,
            status: 'Completada',
            productId: 'PRD009',
            referencia: 'OC-2026-004'
        },
        {
            id: 'TRN011',
            date: '2026-05-10',
            type: 'Venta',
            description: 'Venta al mayorista - Electrodomésticos',
            quantity: 15,
            amount: 40950.00,
            status: 'Completada',
            productId: 'PRD002',
            referencia: 'FAC-2026-006'
        },
        {
            id: 'TRN012',
            date: '2026-05-10',
            type: 'Compra',
            description: 'Compra a proveedor Aceites Premium - Aceite',
            quantity: 50,
            amount: 4680.00,
            status: 'Completada',
            productId: 'PRD008',
            referencia: 'OC-2026-005'
        },
        {
            id: 'TRN013',
            date: '2026-05-09',
            type: 'Venta',
            description: 'Venta a tienda minorista - Destornilladores',
            quantity: 20,
            amount: 5460.00,
            status: 'Completada',
            productId: 'PRD010',
            referencia: 'FAC-2026-007'
        },
        {
            id: 'TRN014',
            date: '2026-05-09',
            type: 'Devolución',
            description: 'Devolución por defecto de fabricación',
            quantity: 3,
            amount: 2808.00,
            status: 'Completada',
            productId: 'PRD004',
            referencia: 'DEV-2026-002'
        },
        {
            id: 'TRN015',
            date: '2026-05-08',
            type: 'Venta',
            description: 'Venta especial cliente frecuente',
            quantity: 4,
            amount: 21840.00,
            status: 'Pendiente',
            productId: 'PRD001',
            referencia: 'FAC-2026-008'
        }
    ],

    // Sales data for chart (7 days)
    salesByDay: [
        { day: 'Lun', sales: 24960 },
        { day: 'Mar', sales: 21840 },
        { day: 'Mié', sales: 31980 },
        { day: 'Jue', sales: 29640 },
        { day: 'Vie', sales: 40560 },
        { day: 'Sab', sales: 35880 },
        { day: 'Dom', sales: 24180 }
    ],

    // Inventory distribution
    inventoryByCategory: [
        { category: 'Electrónica', value: 975000 },
        { category: 'Ropa', value: 195000 },
        { category: 'Alimentos', value: 62400 },
        { category: 'Herramientas', value: 93600 }
    ],

    // Clients data
    clientes: [
        {
            id: 'CLI-0001',
            nombre: 'Distribuidora Centro',
            email: 'contacto@distribuidora-centro.com',
            telefono: '+57 301 234 5678',
            ciudad: 'Bogotá',
            direccion: 'Carrera 5 # 10-20',
            estado: 'activo',
            fechaRegistro: '2026-01-15'
        },
        {
            id: 'CLI-0002',
            nombre: 'Tienda Premium',
            email: 'ventas@tienda-premium.com',
            telefono: '+57 302 345 6789',
            ciudad: 'Medellín',
            direccion: 'Calle 50 # 45-30',
            estado: 'activo',
            fechaRegistro: '2026-02-01'
        }
    ],

    // Datos de ejemplo: Pacientes
    pacientes: [
        {
            id: 1001,
            nombre: 'Juan',
            apellido_paterno: 'López',
            apellido_materno: 'Rodríguez',
            edad: 45,
            fecha_nacimiento: '1981-03-15',
            genero: 'M',
            dpi: '1234567890101',
            telefono: '7856-1234',
            email: 'juan.lopez@email.com',
            direccion: 'Calle Principal 123',
            colonia: 'Zona 10',
            zona: '10',
            municipio: 'Guatemala',
            departamento: 'Guatemala',
            estado_civil: 'Casado',
            profesion: 'Ingeniero',
            ocupacion: 'Empleado Público',
            estado: 'activo'
        },
        {
            id: 1002,
            nombre: 'María',
            apellido_paterno: 'García',
            apellido_materno: 'Morales',
            edad: 38,
            fecha_nacimiento: '1988-07-22',
            genero: 'F',
            dpi: '2345678901012',
            telefono: '7865-5678',
            email: 'maria.garcia@email.com',
            direccion: 'Avenida Central 456',
            colonia: 'Zona 12',
            zona: '12',
            municipio: 'Guatemala',
            departamento: 'Guatemala',
            estado_civil: 'Soltera',
            profesion: 'Médica',
            ocupacion: 'Autónoma',
            estado: 'activo'
        },
        {
            id: 1003,
            nombre: 'Carlos',
            apellido_paterno: 'Pérez',
            apellido_materno: 'López',
            edad: 52,
            fecha_nacimiento: '1974-11-08',
            genero: 'M',
            dpi: '3456789012123',
            telefono: '7834-9012',
            email: 'carlos.perez@email.com',
            direccion: 'Boulevard los Próceres 789',
            colonia: 'Zona 15',
            zona: '15',
            municipio: 'Guatemala',
            departamento: 'Guatemala',
            estado_civil: 'Divorciado',
            profesion: 'Abogado',
            ocupacion: 'Profesional Independiente',
            estado: 'activo'
        },
        {
            id: 1004,
            nombre: 'Ana',
            apellido_paterno: 'Martínez',
            apellido_materno: 'Díaz',
            edad: 29,
            fecha_nacimiento: '1997-05-10',
            genero: 'F',
            dpi: '4567890123234',
            telefono: '7812-3456',
            email: 'ana.martinez@email.com',
            direccion: 'Paseo Montufar 321',
            colonia: 'Zona 3',
            zona: '3',
            municipio: 'Guatemala',
            departamento: 'Guatemala',
            estado_civil: 'Casada',
            profesion: 'Psicóloga',
            ocupacion: 'Clínica Privada',
            estado: 'activo'
        },
        {
            id: 1005,
            nombre: 'Roberto',
            apellido_paterno: 'Sánchez',
            apellido_materno: 'Gómez',
            edad: 61,
            fecha_nacimiento: '1965-12-25',
            genero: 'M',
            dpi: '5678901234345',
            telefono: '7843-7890',
            email: 'robert.sanchez@email.com',
            direccion: 'Carrera 8 654',
            colonia: 'Zona 9',
            zona: '9',
            municipio: 'Guatemala',
            departamento: 'Guatemala',
            estado_civil: 'Viudo',
            profesion: 'Contador',
            ocupacion: 'Jubilado',
            estado: 'activo'
        }
    ],

    // Datos de ejemplo: Saldos de Pacientes
    saldosPacientes: [
        {
            pacienteId: 1001,
            saldoPendiente: 1250.00,
            totalAcumulado: 3500.00,
            abonosRealizados: 2250.00,
            ultimaTransaccion: '2026-06-28',
            estado: 'deudor'
        },
        {
            pacienteId: 1002,
            saldoPendiente: 0.00,
            totalAcumulado: 850.00,
            abonosRealizados: 850.00,
            ultimaTransaccion: '2026-06-25',
            estado: 'pagado'
        },
        {
            pacienteId: 1003,
            saldoPendiente: 3750.50,
            totalAcumulado: 5200.50,
            abonosRealizados: 1450.00,
            ultimaTransaccion: '2026-06-29',
            estado: 'deudor'
        },
        {
            pacienteId: 1004,
            saldoPendiente: 450.75,
            totalAcumulado: 1200.75,
            abonosRealizados: 750.00,
            ultimaTransaccion: '2026-06-26',
            estado: 'deudor'
        },
        {
            pacienteId: 1005,
            saldoPendiente: 0.00,
            totalAcumulado: 2100.00,
            abonosRealizados: 2100.00,
            ultimaTransaccion: '2026-06-20',
            estado: 'pagado'
        }
    ],

    // Datos de ejemplo: Movimientos de Pacientes
    movimientosPaciente: [
        {
            id: 'MOV_001',
            pacienteId: 1001,
            tipo: 'cargo',
            descripcion: 'Consulta Psiquiátrica',
            monto: 500.00,
            saldoAnterior: 750.00,
            saldoNuevo: 1250.00,
            referenciaId: 'FAC_001',
            fecha: '2026-06-28'
        },
        {
            id: 'MOV_002',
            pacienteId: 1001,
            tipo: 'abono',
            descripcion: 'Pago parcial',
            monto: 500.00,
            saldoAnterior: 1250.00,
            saldoNuevo: 750.00,
            referenciaId: 'PAG_001',
            fecha: '2026-06-27'
        },
        {
            id: 'MOV_003',
            pacienteId: 1003,
            tipo: 'cargo',
            descripcion: 'Internamiento (3 días)',
            monto: 2000.00,
            saldoAnterior: 1750.50,
            saldoNuevo: 3750.50,
            referenciaId: 'FAC_002',
            fecha: '2026-06-29'
        },
        {
            id: 'MOV_004',
            pacienteId: 1003,
            tipo: 'abono',
            descripcion: 'Abono a cuenta',
            monto: 1000.00,
            saldoAnterior: 3750.50,
            saldoNuevo: 2750.50,
            referenciaId: 'PAG_002',
            fecha: '2026-06-24'
        },
        {
            id: 'MOV_005',
            pacienteId: 1002,
            tipo: 'cargo',
            descripcion: 'Medicamentos',
            monto: 350.00,
            saldoAnterior: 500.00,
            saldoNuevo: 850.00,
            referenciaId: 'FAC_003',
            fecha: '2026-06-23'
        },
        {
            id: 'MOV_006',
            pacienteId: 1002,
            tipo: 'abono',
            descripcion: 'Pago completo',
            monto: 850.00,
            saldoAnterior: 850.00,
            saldoNuevo: 0.00,
            referenciaId: 'PAG_003',
            fecha: '2026-06-25'
        },
        {
            id: 'MOV_007',
            pacienteId: 1004,
            tipo: 'cargo',
            descripcion: 'Consulta + Laboratorio',
            monto: 450.75,
            saldoAnterior: 0.00,
            saldoNuevo: 450.75,
            referenciaId: 'FAC_004',
            fecha: '2026-06-26'
        },
        {
            id: 'MOV_008',
            pacienteId: 1005,
            tipo: 'abono',
            descripcion: 'Pago total',
            monto: 2100.00,
            saldoAnterior: 2100.00,
            saldoNuevo: 0.00,
            referenciaId: 'PAG_004',
            fecha: '2026-06-20'
        }
    ]
};

// Make data globally available
window.DemoData = demoData;

// ============================================
// UTILITY FUNCTIONS FOR DEMO DATA
// ============================================

function getProduct(productId) {
    return demoData.products.find(p => p.id === productId);
}

function getTransactionsByType(type) {
    return demoData.transactions.filter(t => t.type === type);
}

function getTotalSales() {
    return demoData.transactions
        .filter(t => t.type === 'Venta' && t.status === 'Completada')
        .reduce((sum, t) => sum + t.amount, 0);
}

function getTotalExpenses() {
    return demoData.transactions
        .filter(t => t.type === 'Compra' && t.status === 'Completada')
        .reduce((sum, t) => sum + t.amount, 0);
}

function getTotalInventoryValue() {
    return demoData.products.reduce((sum, p) => sum + (p.price * p.stock), 0);
}

function getLowStockProducts() {
    return demoData.products.filter(p => p.stock <= p.minStock);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ'
    }).format(value);
}

function formatDate(date) {
    return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(date));
}

function getStatusBadgeClass(status) {
    switch(status) {
        case 'Completada':
            return 'status-completed';
        case 'Pendiente':
            return 'status-pending';
        case 'Fallida':
            return 'status-failed';
        default:
            return 'status-pending';
    }
}

function getTransactionTypeIcon(type) {
    switch(type) {
        case 'Venta':
            return 'fas fa-arrow-down';
        case 'Compra':
            return 'fas fa-arrow-up';
        case 'Devolución':
            return 'fas fa-undo';
        default:
            return 'fas fa-exchange-alt';
    }
}

function getProductStatus(stock, minStock) {
    if (stock === 0) return 'Agotado';
    if (stock <= minStock) return 'Stock Bajo';
    return 'Disponible';
}

function getProductStatusClass(stock, minStock) {
    if (stock === 0) return 'status-failed';
    if (stock <= minStock) return 'status-low-stock';
    return 'status-active';
}
