// ============================================
// ACCESO POR MÓDULOS
// Oculta en el menú y el dashboard lo que la empresa no tiene habilitado
// o el usuario no tiene asignado. El backend aplica las mismas reglas.
// ============================================

const AccessControl = {
    user() {
        return authManager.getUser() || {};
    },

    // null cuando la sesión es anterior a los módulos: se muestra todo hasta refrescar el perfil.
    modules() {
        const modules = this.user().modules;
        return Array.isArray(modules) ? modules : null;
    },

    hasModule(key) {
        if (!key) return true;
        const modules = this.modules();
        return !modules || modules.some((entry) => entry.modulo === key);
    },

    canEdit(key) {
        const modules = this.modules();
        return !modules || modules.some((entry) => entry.modulo === key && entry.nivel === 'editar');
    },

    isAdmin() {
        const user = this.user();
        return user.isAdmin ?? (user.roles || []).includes('admin');
    },

    pageModule(pageId) {
        return document.querySelector(`.nav-item[data-page="${pageId}"]`)?.dataset.module || null;
    },

    canOpenPage(pageId) {
        if (pageId === 'settings') return true;
        return this.hasModule(this.pageModule(pageId));
    },

    apply() {
        document.querySelectorAll('[data-module]').forEach((element) => {
            element.hidden = !this.hasModule(element.dataset.module);
        });
        document.querySelectorAll('[data-nav-section]').forEach((section) => {
            section.hidden = !section.querySelector('.nav-item:not([hidden])');
        });
        document.querySelectorAll('[data-admin-only]').forEach((element) => {
            element.hidden = !this.isAdmin();
        });
        const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
        if (activePage && !this.canOpenPage(activePage) && typeof navigateToPage === 'function') {
            navigateToPage('dashboard');
        }
    },

    // Trae del servidor rol, módulos y permisos vigentes (pueden cambiar sin volver a iniciar sesión).
    async refresh() {
        try {
            const response = await authManager.fetchWithAuth('/api/auth/profile');
            if (!response?.ok) return;
            const { user } = await response.json();
            const stored = this.user();
            authManager.saveUser({
                ...stored,
                nombre: user.nombre,
                apellido: user.apellido,
                roles: user.roles,
                permissions: user.permissions,
                modules: user.modules,
                isAdmin: user.isAdmin,
                organization: { ...stored.organization, ...user.organization }
            });
            this.apply();
        } catch (error) {
            console.warn('No se pudo actualizar el acceso del usuario:', error);
        }
    }
};
