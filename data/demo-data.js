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
