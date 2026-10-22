// ============================================
// AUTH UTILS - UTILIDADES DE AUTENTICACIÓN
// ============================================

class AuthManager {
    constructor() {
        this.tokenKey = 'zentra_token';
        this.userKey = 'zentra_user';
        this.sessionExpiryKey = 'zentra_session_expiry';
        this.apiBaseUrl = this.getApiBaseUrl();
    }

    /**
     * Obtener la URL base de la API
     */
    getApiBaseUrl() {
        return window.location.origin;
    }

    /**
     * Hacer login con email y password
     */
    async login(email, password) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error en login');
            }

            // El JWT queda en una cookie HttpOnly; el navegador no puede leerlo.
            this.saveUser(data.user);
            this.saveSessionExpiry(data.sessionExpiresAt);

            return {
                success: true,
                user: data.user,
                platformAdmin: data.platformAdmin === true,
                sessionExpiresAt: data.sessionExpiresAt
            };
        } catch (error) {
            console.error('Error en login:', error);
            return {
                success: false,
                error: friendlyError(error)
            };
        }
    }

    /**
     * Hacer logout
     */
    async logout() {
        try {
            await fetch(`${this.apiBaseUrl}/api/auth/logout`, {
                method: 'POST',
                credentials: 'same-origin'
            });
        } finally {
            this.clearToken();
            this.clearUser();
            this.clearSessionExpiry();
        }
        return { success: true };
    }

    /**
     * Registrar nuevo usuario
     */
    async register(userData) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error en registro');
            }

            this.saveUser(data.user);
            this.saveSessionExpiry(data.sessionExpiresAt);

            return {
                success: true,
                user: data.user,
                sessionExpiresAt: data.sessionExpiresAt,
                organization: data.organization,
                message: data.message
            };
        } catch (error) {
            console.error('Error en registro:', error);
            return {
                success: false,
                error: friendlyError(error)
            };
        }
    }

    /**
     * Obtener perfil del usuario autenticado
     */
    async getProfile() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/profile`, {
                method: 'GET',
                credentials: 'same-origin'
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 403 &&
                    (data.code === 'TRIAL_EXPIRED' || data.code === 'ORGANIZATION_BLOCKED')) {
                    this.clearUser();
                    this.clearSessionExpiry();
                    window.location.href = `/login.html?access=${data.code.toLowerCase()}`;
                }
                throw new Error(data.error || 'Error obteniendo perfil');
            }
            this.saveUser(data.user);
            return { success: true, user: data.user };
        } catch (error) {
            console.error('Error obteniendo perfil:', error);
            return { success: false, error: friendlyError(error) };
        }
    }

    /**
     * Guardar token en localStorage
     */
    saveToken(token) {
        localStorage.setItem(this.tokenKey, token);
    }

    /**
     * Obtener token de localStorage
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * Limpiar token
     */
    clearToken() {
        localStorage.removeItem(this.tokenKey);
    }

    /**
     * Guardar datos del usuario
     */
    saveUser(user) {
        localStorage.setItem(this.userKey, JSON.stringify(user));
    }

    /**
     * Obtener datos del usuario
     */
    getUser() {
        const user = localStorage.getItem(this.userKey);
        return user ? JSON.parse(user) : null;
    }

    /**
     * Limpiar datos del usuario
     */
    clearUser() {
        localStorage.removeItem(this.userKey);
    }

    /**
     * Verificar si hay token
     */
    isAuthenticated() {
        return !!this.getUser() && !this.isTokenExpired();
    }

    /**
     * Verificar si la sesión está expirada
     */
    isTokenExpired() {
        const expiry = localStorage.getItem(this.sessionExpiryKey);
        return !expiry || Date.now() >= new Date(expiry).getTime();
    }

    /**
     * Verificar si el usuario tiene un rol específico
     */
    hasRole(role) {
        const user = this.getUser();
        return user && user.roles && user.roles.includes(role);
    }

    /**
     * Verificar si el usuario tiene un permiso específico
     */
    hasPermission(permission) {
        const user = this.getUser();
        return user && user.permissions && user.permissions.includes(permission);
    }

    /**
     * Hacer request autenticado
     */
    async fetchWithAuth(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${this.apiBaseUrl}${url}`;
        const response = await fetch(fullUrl, {
            ...options,
            headers: { ...options.headers },
            credentials: 'same-origin'
        });
        if (response.status === 403) {
            const data = await response.clone().json().catch(() => ({}));
            if (data.code === 'TRIAL_EXPIRED' || data.code === 'ORGANIZATION_BLOCKED') {
                this.clearUser();
                this.clearSessionExpiry();
                window.location.href = `/login.html?access=${data.code.toLowerCase()}`;
            }
        }
        if (response.status === 401) {
            this.clearUser();
            this.clearSessionExpiry();
            window.location.href = '/login.html';
            return null;
        }
        return response;
    }

    saveSessionExpiry(expiry) {
        localStorage.setItem(this.sessionExpiryKey, expiry);
        // Marcador no sensible para módulos heredados; el JWT real solo vive en la cookie HttpOnly.
        localStorage.setItem(this.tokenKey, 'cookie-session');
    }

    clearSessionExpiry() {
        localStorage.removeItem(this.sessionExpiryKey);
    }
}

// Crear instancia global
const authManager = new AuthManager();

// ============================================
// UTILIDADES DE UI
// ============================================

// Librerías pesadas que solo se usan en algunas acciones: se descargan al necesitarlas
// para que el panel cargue rápido en conexiones lentas.
const LAZY_LIBRARIES = {
    chart: '/vendor/chartjs/chart.umd.js',
    xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
};
const lazyLibraryLoads = {};

function loadLibrary(name) {
    if (!lazyLibraryLoads[name]) {
        lazyLibraryLoads[name] = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = LAZY_LIBRARIES[name];
            script.async = true;
            script.onload = resolve;
            script.onerror = () => {
                delete lazyLibraryLoads[name];
                script.remove();
                reject(new Error('No se pudo descargar un componente necesario. Revisa tu conexión e inténtalo de nuevo.'));
            };
            document.head.appendChild(script);
        });
    }
    return lazyLibraryLoads[name];
}

// Lee montos como se escriben en Guatemala ("1,500.50") y también "1,5", "0,500" o "1.5".
// Devuelve NaN si el texto no es un número, para que el formulario lo marque.
function parseMonto(value) {
    const text = String(value ?? '').trim().replace(/\s/g, '');
    if (!text) return NaN;
    let normalized;
    if (/^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text)) {
        normalized = text.replace(/,/g, '');           // 1,500 · 1,500.50 → miles con coma
    } else if (/^-?\d+,\d{1,2}$/.test(text) || /^-?0,\d+$/.test(text)) {
        normalized = text.replace(',', '.');            // 1,5 · 10,50 · 0,500 → coma decimal
    } else {
        normalized = text;
    }
    return /^-?\d*\.?\d+$/.test(normalized) ? Number(normalized) : NaN;
}

// Monto de dinero válido para guardar: número, mayor que 0 y dentro del límite de la base de datos.
function isValidMonto(amount) {
    return Number.isFinite(amount) && amount > 0 && amount <= 99999999.99;
}

// Un solo formato de moneda en toda la app: Q1,234.50
function formatQ(value) {
    const amount = Number(value);
    return 'Q' + (Number.isFinite(amount) ? amount : 0).toLocaleString('es-GT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Traduce errores de red del navegador ("Failed to fetch") a un mensaje accionable.
 */
function friendlyError(error) {
    const message = error?.message || String(error || '');
    if (error instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
        return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    }
    return message || 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/**
 * Mostrar alerta
 */
function showAlert(message, type = 'info', duration = 5000) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    // Un solo aviso a la vez: los anteriores pueden contradecir al nuevo.
    alertContainer.innerHTML = '';
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.setAttribute('role', type === 'error' ? 'alert' : 'status');
    
    let icon = 'fas fa-info-circle';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';

    alert.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span></span>`;
    alert.querySelector('span').textContent = message;

    alertContainer.appendChild(alert);
    const { top, bottom } = alert.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) alert.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (duration > 0) {
        setTimeout(() => {
            alert.style.animation = 'slideDown 0.3s ease-out reverse';
            setTimeout(() => alert.remove(), 300);
        }, duration);
    }

    return alert;
}

/**
 * Deshabilitar botón de forma
 */
function setButtonLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
    } else {
        button.disabled = false;
        button.classList.remove('loading');
    }
}

/**
 * Validar email
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Redirigir al dashboard después del login
 */
function redirectToDashboard() {
    // Intentar ir a index.html, si no existe, ir a donde corresponda
    window.location.href = '/index.html';
}

function redirectToSupportPanel() {
    window.location.href = '/support.html';
}

/**
 * Redirigir al login si no está autenticado
 */
function requireAuth() {
    if (!authManager.isAuthenticated() || authManager.isTokenExpired()) {
        authManager.clearToken();
        authManager.clearUser();
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// ============================================
// PROTECCIÓN AUTOMÁTICA DE RUTAS
// ============================================

// Proteger index.html y otras páginas
document.addEventListener('DOMContentLoaded', function() {
    // Solo en páginas protegidas: "/" también es el inicio de sesión (Caddy sirve login.html ahí),
    // y redirigir desde ahí recargaba la página y cerraba el registro recién abierto.
    const path = window.location.pathname;
    if (path !== '/' && !path.includes('login.html')) {
        if (!authManager.isAuthenticated()) {
            window.location.href = '/login.html';
        }
    }
});
