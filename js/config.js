// ============================================
// CONFIGURACIÓN DE STOCK FLOW
// ============================================

const CONFIG = {
    // ============================================
    // INFORMACIÓN DE LA APLICACIÓN
    // ============================================
    APP: {
        name: 'Zentra',
        version: '1.0.0',
        description: 'Zentra - Sistema Médico Integral',
        author: 'Tu Empresa',
        releaseDate: '2026-03-23'
    },

    // ============================================
    // CONFIGURACIÓN DEL SERVIDOR/API (FUTURO)
    // ============================================
    API: {
        // Cambiar a true cuando se implemente el backend
        useAPI: true,
        
        // URL base del servidor (ajustar cuando tengas backend)
        baseURL: `${window.location.origin}/api`,
        
        // Endpoints de la API
        endpoints: {
            products: '/products',
            transactions: '/transactions',
            reports: '/reports',
            users: '/users',
            auth: '/auth',
            inventory: '/inventory',
            analytics: '/analytics'
        },
        
        // Timeout en milisegundos
        timeout: 10000,
        
        // Headers por defecto
        defaultHeaders: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    },

    // ============================================
    // CONFIGURACIÓN DE TEMA
    // ============================================
    THEME: {
        // Modo oscuro habilitado por defecto
        darkMode: false,
        
        // Colores principales
        colors: {
            primary: '#1e3a8a',
            secondary: '#0891b2',
            accent: '#f97316',
            danger: '#ef4444',
            success: '#22c55e',
            warning: '#eab308',
            light: '#f8fafc',
            dark: '#0f172a'
        },
        
        // Animaciones
        animations: {
            enabled: true,
            duration: 300  // ms
        }
    },

    // ============================================
    // CONFIGURACIÓN DE TRANSACCIONES
    // ============================================
    TRANSACTIONS: {
        types: ['Venta', 'Compra', 'Devolución', 'Ajuste'],
        statuses: ['Completada', 'Pendiente', 'Cancelada', 'En Proceso'],
        
        // Campos requeridos
        requiredFields: ['type', 'description', 'amount', 'date'],
        
        // Validaciones
        validation: {
            minAmount: 0.01,
            maxAmount: 999999.99,
            maxDescriptionLength: 255
        }
    },

    // ============================================
    // CONFIGURACIÓN DE PRODUCTOS
    // ============================================
    PRODUCTS: {
        categories: ['Electrónica', 'Ropa', 'Alimentos', 'Herramientas', 'Otros'],
        
        // Campos requeridos
        requiredFields: ['name', 'category', 'price', 'stock'],
        
        // Validaciones
        validation: {
            minPrice: 0.01,
            maxPrice: 999999.99,
            minStock: 0,
            maxNameLength: 100,
            minNameLength: 3
        },
        
        // Stock mínimo por defecto
        defaultMinStock: 10
    },

    // ============================================
    // CONFIGURACIÓN DE REPORTES
    // ============================================
    REPORTS: {
        types: ['Ventas', 'Inventario', 'Balance', 'Márgenes', 'Análisis'],
        
        // Formatos de exportación (para futuro)
        formats: ['PDF', 'Excel', 'CSV', 'JSON'],
        
        // Período predeterminado
        defaultPeriod: 'month'  // 'week', 'month', 'quarter', 'year'
    },

    // ============================================
    // CONFIGURACIÓN DE USUARIO
    // ============================================
    USER: {
        // Roles disponibles (para futuro sistema de permisos)
        roles: ['Admin', 'Manager', 'Vendedor', 'Viewer'],
        
        // Permisos por rol
        permissions: {
            'Admin': ['create', 'read', 'update', 'delete', 'export'],
            'Manager': ['read', 'update', 'export'],
            'Vendedor': ['create', 'read'],
            'Viewer': ['read']
        }
    },

    // ============================================
    // CONFIGURACIÓN DE FORMATO
    // ============================================
    FORMAT: {
        // Formato de moneda
        currency: {
            code: 'GTQ',
            symbol: 'Q.',
            locale: 'es-GT'
        },
        
        // Formato de fecha
        date: {
            locale: 'es-ES',
            format: 'DD/MM/YYYY'
        },
        
        // Formato de números
        number: {
            locale: 'es-ES',
            decimals: 2,
            separator: ','
        },
        
        // Formato de hora
        time: {
            locale: 'es-ES',
            format: '24h'  // '12h' o '24h'
        }
    },

    // ============================================
    // CONFIGURACIÓN DE ALMACENAMIENTO
    // ============================================
    STORAGE: {
        // Usar localStorage para cache local
        enabled: true,
        
        // Clave de prefijo para localStorage
        prefix: 'StockFlow_',
        
        // Tiempo de expiración en minutos
        cacheExpiration: 60,
        
        // Items a cachear
        cachedItems: ['products', 'categories', 'userPreferences']
    },

    // ============================================
    // CONFIGURACIÓN DE VALIDACIONES
    // ============================================
    VALIDATION: {
        // Email
        email: {
            pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            minLength: 5,
            maxLength: 255
        },
        
        // Teléfono
        phone: {
            pattern: /^\+?[\d\s\-()]{10,}$/,
            minLength: 10
        },
        
        // Contraseña (para futura autenticación)
        password: {
            minLength: 8,
            requireUppercase: true,
            requireNumbers: true,
            requireSpecialChars: true
        },
        
        // Campos de texto
        text: {
            maxLength: 255,
            allowSpecialChars: true
        }
    },

    // ============================================
    // CONFIGURACIÓN DE PAGINACIÓN
    // ============================================
    PAGINATION: {
        defaultPageSize: 50,
        maxPageSize: 500,
        pageSizeOptions: [25, 50, 100, 500]
    },

    // ============================================
    // CONFIGURACIÓN DE LOGS
    // ============================================
    LOGGING: {
        // Habilitar logs en consola
        enabled: true,
        
        // Nivel de log
        level: 'info',  // 'debug', 'info', 'warn', 'error'
        
        // Logs a guardar (para futuro)
        trackEvents: ['login', 'create', 'update', 'delete', 'export', 'error']
    },

    // ============================================
    // CONFIGURACIÓN DE NOTIFICACIONES
    // ============================================
    NOTIFICATIONS: {
        // Duración en ms
        displayDuration: 3000,
        
        // Máximo de notificaciones simultáneas
        maxNotifications: 3,
        
        // Tipos habilitados
        types: {
            success: true,
            error: true,
            warning: true,
            info: true
        }
    }
};

// ============================================
// FUNCIONES DE CONFIGURACIÓN
// ============================================

/**
 * Obtener valor de configuración
 * @param {string} path - Ruta de la propiedad (ej: 'API.baseURL')
 * @param {*} defaultValue - Valor por defecto si la ruta no existe
 */
function getConfig(path, defaultValue = null) {
    const keys = path.split('.');
    let value = CONFIG;
    
    for (let key of keys) {
        value = value?.[key];
        if (value === undefined) return defaultValue;
    }
    
    return value;
}

/**
 * Establecer valor de configuración
 * @param {string} path - Ruta de la propiedad
 * @param {*} value - Nuevo valor
 */
function setConfig(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let obj = CONFIG;
    
    for (let key of keys) {
        if (!obj[key]) obj[key] = {};
        obj = obj[key];
    }
    
    obj[lastKey] = value;
}

/**
 * Validar configuración de API
 */
function validateAPIConfig() {
    const apiConfig = getConfig('API');
    if (!apiConfig.baseURL) {
        console.warn('⚠️ API baseURL no configurada');
        return false;
    }
    return true;
}

/**
 * Obtener todas las categorías de productos
 */
function getProductCategories() {
    return getConfig('PRODUCTS.categories', []);
}

/**
 * Obtener todos los tipos de transacción
 */
function getTransactionTypes() {
    return getConfig('TRANSACTIONS.types', []);
}

/**
 * Obtener permisos para un rol
 */
function getRolePermissions(role) {
    return getConfig(`USER.permissions.${role}`, []);
}

/**
 * Formatear valor con configuración de moneda
 */
function formatWithConfig(value) {
    const currencyConfig = getConfig('FORMAT.currency');
    return new Intl.NumberFormat(currencyConfig.locale, {
        style: 'currency',
        currency: currencyConfig.code
    }).format(value);
}

// ============================================
// EXPORTAR CONFIGURACIÓN
// ============================================

// Hacer disponible globalmente
window.CONFIG = CONFIG;
window.getConfig = getConfig;
window.setConfig = setConfig;
window.validateAPIConfig = validateAPIConfig;
window.getProductCategories = getProductCategories;
window.getTransactionTypes = getTransactionTypes;
window.getRolePermissions = getRolePermissions;
window.formatWithConfig = formatWithConfig;

console.log('✅ Configuración de Stock Flow cargada');
