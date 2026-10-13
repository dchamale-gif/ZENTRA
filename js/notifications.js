// ============================================
// NOTIFICACIONES (campana del encabezado)
// ============================================

const NotificationsModule = {
    POLL_MS: 5 * 60 * 1000,
    items: [],
    timer: null,

    init() {
        this.button = document.getElementById('notificationsBtn');
        this.badge = document.getElementById('notificationsBadge');
        this.panel = document.getElementById('notificationsPanel');
        if (!this.button || !this.panel) return;

        this.button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.panel.classList.toggle('open');
        });
        document.addEventListener('click', (event) => {
            if (!this.panel.contains(event.target)) this.panel.classList.remove('open');
        });
        this.panel.addEventListener('click', (event) => {
            const item = event.target.closest('[data-page]');
            if (item?.dataset.page && typeof navigateToPage === 'function') {
                navigateToPage(item.dataset.page);
                this.panel.classList.remove('open');
            }
        });

        this.refresh();
        this.timer = setInterval(() => this.refresh(), this.POLL_MS);
    },

    async refresh() {
        try {
            const response = await authManager.fetchWithAuth('/api/notifications');
            if (!response || !response.ok) return;
            const data = await response.json();
            this.items = data.notifications || [];
            this.render();
        } catch (error) {
            console.warn('No se pudieron cargar las notificaciones:', error);
        }
    },

    render() {
        const e = BulkImport.escapeHtml;
        this.badge.textContent = this.items.length;
        this.badge.style.display = this.items.length ? 'flex' : 'none';

        this.panel.innerHTML = `
            <div class="notif-header">Notificaciones</div>
            ${this.items.length === 0
                ? '<div class="notif-empty">No tienes notificaciones pendientes</div>'
                : this.items.map((n) => `
                    <div class="notif-item notif-${e(n.type)}" ${n.page ? `data-page="${e(n.page)}"` : ''}>
                        <i class="fas ${e(n.icon)}"></i>
                        <div>
                            <strong>${e(n.title)}</strong>
                            <span>${e(n.message)}</span>
                        </div>
                    </div>`).join('')}`;
    }
};
