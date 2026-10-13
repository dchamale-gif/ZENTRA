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
                error: error.message
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
                error: error.message
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
            return { success: false, error: error.message };
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

/**
 * Mostrar alerta
 */
function showAlert(message, type = 'info', duration = 5000) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    
    let icon = 'fas fa-info-circle';
    if (type === 'error') icon = 'fas fa-exclamation-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';

    alert.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;

    alertContainer.appendChild(alert);

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
    // Solo ejecutar si no estamos en login.html
    if (!window.location.pathname.includes('login.html')) {
        if (!authManager.isAuthenticated()) {
            window.location.href = '/login.html';
        }
    }
});
