// ============================================
// CONFIGURACIÓN: EMPRESA, USUARIOS Y MI CUENTA
// ============================================

const UsuariosModule = {
    state: { users: [], seats: null, modules: [], currentUserId: null, loaded: false },

    statusLabels: { trial: 'Prueba', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada' },

    init() {
        document.getElementById('addUserBtn')?.addEventListener('click', () => this.openForm());
        document.getElementById('changePasswordForm')?.addEventListener('submit', (event) => this.changePassword(event));
        document.getElementById('usersTable')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-user-action]');
            if (!button) return;
            const user = this.state.users.find((entry) => String(entry.id) === button.dataset.id);
            if (!user) return;
            const actions = {
                edit: () => this.openForm(user),
                password: () => this.resetPassword(user),
                toggle: () => this.toggleActive(user)
            };
            actions[button.dataset.userAction]?.();
        });
        document.querySelector('.nav-item[data-page="settings"]')?.addEventListener('click', () => this.load());
        this.renderCompany();
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || data.message || `Error ${response.status}`);
        return data;
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    },

    formatDate(value) {
        return value ? new Date(value).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    },

    async load() {
        this.renderCompany();
        const user = authManager.getUser() || {};
        const summary = document.getElementById('accountSummary');
        if (summary) summary.textContent = `${user.nombre || ''} ${user.apellido || ''} · ${user.email || ''}`.trim();
        if (!AccessControl.isAdmin()) return;
        try {
            const data = await this.request('/api/users');
            Object.assign(this.state, {
                users: data.users,
                seats: data.seats,
                modules: data.modules,
                currentUserId: data.currentUserId,
                loaded: true
            });
            this.renderUsers();
            this.renderCompany();
        } catch (error) {
            document.getElementById('seatsSummary').textContent = error.message;
        }
    },

    renderCompany() {
        const container = document.getElementById('companyInfo');
        const organization = authManager.getUser()?.organization;
        if (!container || !organization) return;
        const endsAt = organization.status === 'trial' ? organization.trialEndsAt : organization.subscriptionEndsAt;
        const seats = this.state.seats;
        const rows = [
            ['Empresa', organization.name],
            ['Plan', organization.plan || '—'],
            ['Estado', this.statusLabels[organization.status] || organization.status || '—'],
            [organization.status === 'trial' ? 'Prueba vence' : 'Licencia vence', this.formatDate(endsAt)],
            ['Clave de licencia', organization.licenseKey ? `<code>${this.escape(organization.licenseKey)}</code>` : '—'],
            ['Usuarios', seats ? `${seats.used} de ${seats.max} en uso` : `Hasta ${organization.maxUsers ?? '—'}`]
        ];
        container.innerHTML = rows.map(([label, value]) => `
            <div><dt>${label}</dt><dd>${label === 'Clave de licencia' ? value : this.escape(value)}</dd></div>`).join('');
    },

    renderUsers() {
        const { seats, users } = this.state;
        const free = seats.available;
        document.getElementById('seatsSummary').innerHTML =
            `<strong>${seats.used} de ${seats.max}</strong> usuarios activos · ` +
            (free > 0 ? `te ${free === 1 ? 'queda' : 'quedan'} <strong>${free}</strong>` : '<strong>sin cupos disponibles</strong>');
        const fill = document.getElementById('seatsMeterFill');
        fill.style.width = `${Math.min(100, (seats.used / Math.max(seats.max, 1)) * 100)}%`;
        fill.classList.toggle('is-full', free === 0);

        const addButton = document.getElementById('addUserBtn');
        addButton.disabled = free === 0;
        addButton.title = free === 0 ? 'Ya usas todos los usuarios de tu licencia. Pide a soporte ampliar el límite.' : '';

        const moduleLabel = (key) => this.state.modules.find((module) => module.key === key)?.label || key;
        document.querySelector('#usersTable tbody').innerHTML = users.map((user) => {
            const isSelf = user.id === this.state.currentUserId;
            const access = user.rol === 'admin'
                ? '<span class="muted">Todos los módulos</span>'
                : (user.modulos.length
                    ? user.modulos.map((m) => `<span class="chip">${this.escape(moduleLabel(m.modulo))}${m.nivel === 'ver' ? ' · ver' : ''}</span>`).join('')
                    : '<span class="muted">Sin módulos</span>');
            return `
                <tr class="${user.activo ? '' : 'is-inactive'}">
                    <td>
                        <div class="cell-title">${this.escape(`${user.nombre} ${user.apellido}`)}${isSelf ? ' <span class="chip chip-accent">Tú</span>' : ''}</div>
                        <div class="cell-sub">${this.escape(user.email)}</div>
                    </td>
                    <td>${user.rol === 'admin' ? 'Administrador' : 'Usuario'}</td>
                    <td><div class="chip-list">${access}</div></td>
                    <td><span class="status-pill ${user.activo ? 'is-ok' : 'is-off'}">${user.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>${this.formatDate(user.ultimo_login)}</td>
                    <td class="text-right">
                        <div class="row-actions">
                            <button class="icon-btn" type="button" data-user-action="edit" data-id="${user.id}" title="Editar acceso" aria-label="Editar acceso de ${this.escape(user.email)}"><i class="fas fa-pen"></i></button>
                            <button class="icon-btn" type="button" data-user-action="password" data-id="${user.id}" title="Restablecer contraseña" aria-label="Restablecer contraseña de ${this.escape(user.email)}"><i class="fas fa-key"></i></button>
                            ${isSelf ? '' : `<button class="icon-btn ${user.activo ? 'is-danger' : ''}" type="button" data-user-action="toggle" data-id="${user.id}" title="${user.activo ? 'Desactivar' : 'Activar'}" aria-label="${user.activo ? 'Desactivar' : 'Activar'} a ${this.escape(user.email)}"><i class="fas ${user.activo ? 'fa-user-slash' : 'fa-user-check'}"></i></button>`}
                        </div>
                    </td>
                </tr>`;
        }).join('');
    },

    openForm(user = null) {
        const isNew = !user;
        const accessByModule = new Map((user?.modulos || []).map((m) => [m.modulo, m.nivel]));
        const rol = user?.rol || 'usuario';
        document.getElementById('userFormModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'userFormModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="userFormTitle">
                <div class="modal-header">
                    <h2 id="userFormTitle">${isNew ? 'Agregar usuario' : `Editar ${this.escape(user.nombre)}`}</h2>
                    <button class="modal-close" type="button" data-close aria-label="Cerrar">&times;</button>
                </div>
                <form class="modal-body" id="userForm" novalidate>
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="userNombre">Nombre</label>
                            <input class="form-input" id="userNombre" name="nombre" required value="${this.escape(user?.nombre || '')}">
                        </div>
                        <div class="form-group">
                            <label for="userApellido">Apellido</label>
                            <input class="form-input" id="userApellido" name="apellido" required value="${this.escape(user?.apellido || '')}">
                        </div>
                        ${isNew ? `
                        <div class="form-group">
                            <label for="userEmail">Correo</label>
                            <input class="form-input" id="userEmail" name="email" type="email" required autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label for="userPassword">Contraseña inicial</label>
                            <input class="form-input" id="userPassword" name="password" type="password" minlength="8" required autocomplete="new-password">
                            <small class="field-hint">Mínimo 8 caracteres. Compártela con la persona para su primer ingreso.</small>
                        </div>` : ''}
                    </div>

                    <fieldset class="role-picker">
                        <legend>Rol</legend>
                        <label class="role-option">
                            <input type="radio" name="rol" value="admin" ${rol === 'admin' ? 'checked' : ''}>
                            <span><strong>Administrador</strong><small>Acceso a todos los módulos y a la gestión de usuarios.</small></span>
                        </label>
                        <label class="role-option">
                            <input type="radio" name="rol" value="usuario" ${rol === 'usuario' ? 'checked' : ''}>
                            <span><strong>Usuario</strong><small>Solo los módulos que elijas abajo.</small></span>
                        </label>
                    </fieldset>

                    <div class="module-access" id="moduleAccess" ${rol === 'admin' ? 'hidden' : ''}>
                        <div class="module-access-head"><span>Módulo</span><span>Acceso</span></div>
                        ${this.state.modules.map((module) => {
                            const nivel = accessByModule.get(module.key) || '';
                            return `
                            <div class="module-access-row">
                                <label for="access-${module.key}">${this.escape(module.label)}</label>
                                <select class="form-input" id="access-${module.key}" data-module-key="${module.key}">
                                    <option value="" ${nivel === '' ? 'selected' : ''}>Sin acceso</option>
                                    <option value="ver" ${nivel === 'ver' ? 'selected' : ''}>Solo ver</option>
                                    <option value="editar" ${nivel === 'editar' ? 'selected' : ''}>Ver y editar</option>
                                </select>
                            </div>`;
                        }).join('')}
                    </div>
                    <p class="form-error" id="userFormError" role="alert"></p>
                </form>
                <div class="modal-footer">
                    <button class="btn btn-secondary" type="button" data-close>Cancelar</button>
                    <button class="btn btn-primary" type="submit" form="userForm">${isNew ? 'Crear usuario' : 'Guardar cambios'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-close]')) close();
        });
        modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
        modal.querySelectorAll('input[name="rol"]').forEach((radio) => radio.addEventListener('change', () => {
            modal.querySelector('#moduleAccess').hidden = modal.querySelector('input[name="rol"]:checked').value === 'admin';
        }));
        modal.querySelector('#userForm').addEventListener('submit', (event) => this.saveUser(event, user));
        modal.querySelector('#userNombre').focus();
    },

    async saveUser(event, user) {
        event.preventDefault();
        const form = event.target;
        const errorBox = form.querySelector('#userFormError');
        const value = (name) => form.querySelector(`[name="${name}"]`)?.value.trim();
        const rol = form.querySelector('input[name="rol"]:checked').value;
        const modulos = [...form.querySelectorAll('[data-module-key]')]
            .filter((select) => select.value)
            .map((select) => ({ modulo: select.dataset.moduleKey, nivel: select.value }));

        if (!value('nombre') || !value('apellido')) {
            errorBox.textContent = 'Escribe nombre y apellido.';
            return;
        }
        if (!user && (value('password') || '').length < 8) {
            errorBox.textContent = 'La contraseña inicial debe tener al menos 8 caracteres.';
            return;
        }
        if (rol === 'usuario' && modulos.length === 0) {
            errorBox.textContent = 'Elige al menos un módulo, o marca el rol Administrador.';
            return;
        }

        const submit = document.querySelector('#userFormModal button[type="submit"]');
        submit.disabled = true;
        try {
            const body = { nombre: value('nombre'), apellido: value('apellido'), rol, modulos };
            if (!user) Object.assign(body, { email: value('email'), password: value('password') });
            const data = await this.request(user ? `/api/users/${user.id}` : '/api/users', {
                method: user ? 'PUT' : 'POST',
                body: JSON.stringify(body)
            });
            document.getElementById('userFormModal').remove();
            showNotification(data.message, 'success');
            await this.load();
        } catch (error) {
            errorBox.textContent = error.message;
            submit.disabled = false;
        }
    },

    async toggleActive(user) {
        const action = user.activo ? 'Desactivar' : 'Activar';
        const detail = user.activo
            ? 'No podrá ingresar y se libera un cupo de la licencia.'
            : 'Volverá a ocupar un cupo de la licencia.';
        if (!confirm(`¿${action} a ${user.nombre} ${user.apellido} (${user.email})? ${detail}`)) return;
        try {
            const data = await this.request(`/api/users/${user.id}`, {
                method: 'PUT',
                body: JSON.stringify({ activo: !user.activo })
            });
            showNotification(data.message, 'success');
            await this.load();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    },

    async resetPassword(user) {
        const password = prompt(`Nueva contraseña para ${user.email} (mínimo 8 caracteres):`);
        if (password === null) return;
        if (password.length < 8) {
            showNotification('La contraseña debe tener al menos 8 caracteres', 'error');
            return;
        }
        try {
            const data = await this.request(`/api/users/${user.id}/password`, {
                method: 'POST',
                body: JSON.stringify({ password })
            });
            showNotification(data.message, 'success');
        } catch (error) {
            showNotification(error.message, 'error');
        }
    },

    async changePassword(event) {
        event.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        if (newPassword.length < 8) {
            showNotification('La nueva contraseña debe tener al menos 8 caracteres', 'error');
            return;
        }
        if (newPassword !== document.getElementById('confirmPassword').value) {
            showNotification('Las contraseñas nuevas no coinciden', 'error');
            return;
        }
        try {
            const data = await this.request('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });
            event.target.reset();
            showNotification(data.message, 'success');
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
};
