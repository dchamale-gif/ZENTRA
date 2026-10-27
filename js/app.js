// ============================================
// STOCK FLOW - APLICACIÓN PRINCIPAL
// ============================================

// Global state
let currentPage = 'dashboard';
let charts = {};

// ============================================
// PROTECCIÓN DE AUTENTICACIÓN
// ============================================

// Verificar autenticación al cargar la página
if (!authManager.isAuthenticated() || authManager.isTokenExpired()) {
    authManager.clearToken();
    authManager.clearUser();
    window.location.href = '/login.html';
} else if (authManager.getUser()?.platformAdmin) {
    window.location.href = '/support.html';
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Cuenta recién creada con contraseña temporal: primero debe crear la suya.
    if (authManager.getUser()?.debeCambiarPassword) {
        showForcedPasswordChange();
        return;
    }
    initializeApp();
    initializeUserProfile();
    initializeTrialBanner();
    setupLogout();
});

function showForcedPasswordChange() {
    const user = authManager.getUser() || {};
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'forcedPasswordTitle');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h2 id="forcedPasswordTitle">Crea tu contraseña</h2></div>
            <form id="forcedPasswordForm" novalidate>
                <div class="modal-body">
                    <p>Bienvenido${user.nombre ? `, <span id="forcedPasswordName"></span>` : ''}. Entraste con la contraseña temporal del correo; crea una propia para continuar.</p>
                    <div class="form-group">
                        <label for="forcedCurrent">Contraseña temporal</label>
                        <input id="forcedCurrent" class="form-input" type="password" autocomplete="current-password" required>
                    </div>
                    <div class="form-group">
                        <label for="forcedNew">Nueva contraseña</label>
                        <input id="forcedNew" class="form-input" type="password" autocomplete="new-password" minlength="8" required aria-describedby="forcedHint">
                        <small id="forcedHint">Al menos 8 caracteres, con letras y números.</small>
                    </div>
                    <div class="form-group">
                        <label for="forcedConfirm">Repite la nueva contraseña</label>
                        <input id="forcedConfirm" class="form-input" type="password" autocomplete="new-password" required>
                    </div>
                    <p id="forcedError" class="form-error" role="alert" hidden></p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="forcedLogout">Salir</button>
                    <button type="submit" class="btn btn-primary" id="forcedSubmit">Guardar y continuar</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(modal);
    if (user.nombre) modal.querySelector('#forcedPasswordName').textContent = user.nombre;
    document.body.style.overflow = 'hidden';
    const error = modal.querySelector('#forcedError');
    const fail = (message, field) => {
        error.textContent = message;
        error.hidden = false;
        field?.focus();
    };
    modal.querySelector('#forcedLogout').addEventListener('click', () => authManager.logout?.().finally(() => { window.location.href = '/login.html'; }));
    modal.querySelector('#forcedPasswordForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const current = modal.querySelector('#forcedCurrent');
        const nueva = modal.querySelector('#forcedNew');
        const confirmacion = modal.querySelector('#forcedConfirm');
        error.hidden = true;
        if (!current.value) return fail('Escribe la contraseña temporal que recibiste por correo.', current);
        if (nueva.value.length < 8 || !/[a-zA-Z]/.test(nueva.value) || !/\d/.test(nueva.value)) {
            return fail('La nueva contraseña debe tener al menos 8 caracteres, con letras y números.', nueva);
        }
        if (nueva.value !== confirmacion.value) return fail('Las dos contraseñas nuevas no coinciden.', confirmacion);
        const button = modal.querySelector('#forcedSubmit');
        button.disabled = true;
        try {
            const response = await fetch(`${authManager.apiBaseUrl}/api/auth/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ currentPassword: current.value, newPassword: nueva.value })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo guardar la contraseña');
            authManager.saveUser({ ...authManager.getUser(), debeCambiarPassword: false });
            window.location.reload();
        } catch (requestError) {
            fail(friendlyError(requestError), current);
            button.disabled = false;
        }
    });
    modal.querySelector('#forcedCurrent').focus();
}

function initializeTrialBanner() {
    const organization = authManager.getUser()?.organization;
    const banner = document.getElementById('trialBanner');
    if (!banner || organization?.status !== 'trial') return;

    const days = Math.max(0, Math.ceil(
        (new Date(organization.trialEndsAt).getTime() - Date.now()) / 86400000
    ));
    banner.textContent = `${organization.name}: período de prueba, ${days} día${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}.`;
    banner.style.display = 'block';
}

async function initializeApp() {
    // Ocultar lo que la empresa o el usuario no tiene habilitado antes de cargar datos.
    AccessControl.apply();

    // Initialize event listeners
    setupNavigation();
    setupModals();
    setupSubtabs();
    setupDashboard();
    setupInventory();
    setupTransactions();
    setupResponsive();
    setupMobileListTables();
    updateCurrentDate();
    
    try { if (typeof ClientesModule !== 'undefined' && AccessControl.hasModule('clientes')) ClientesModule.init(); } catch(e) { console.warn('ClientesModule error:', e); }
    try { if (typeof ProveedoresModule !== 'undefined' && AccessControl.hasModule('proveedores')) ProveedoresModule.init(); } catch(e) { console.warn('ProveedoresModule error:', e); }
    try { if (typeof NotificationsModule !== 'undefined') NotificationsModule.init(); } catch(e) { console.warn('NotificationsModule error:', e); }
    try { if (typeof CodigosArticulosModule !== 'undefined' && AccessControl.hasModule('articulos')) CodigosArticulosModule.init(); } catch(e) { console.warn('CodigosArticulosModule error:', e); }
    try { if (typeof CajaIntegradaModule !== 'undefined' && AccessControl.hasModule('caja')) CajaIntegradaModule.init(); } catch(e) { console.warn('CajaIntegradaModule error:', e); }
    try { if (typeof ComprasModule !== 'undefined' && AccessControl.hasModule('compras')) ComprasModule.init(); } catch(e) { console.warn('ComprasModule error:', e); }
    try { if (typeof AlertasModule !== 'undefined') AlertasModule.init(); } catch(e) { console.warn('AlertasModule error:', e); }
    try { if (typeof VentasModule !== 'undefined' && AccessControl.hasModule('ventas')) VentasModule.init(); } catch(e) { console.warn('VentasModule error:', e); }
    try { if (typeof CajaModule !== 'undefined' && AccessControl.hasModule('caja')) CajaModule.init(); } catch(e) { console.warn('CajaModule error:', e); }
    try { if (typeof CuentasPorCobrarModule !== 'undefined' && AccessControl.hasModule('cobros')) CuentasPorCobrarModule.init(); } catch(e) { console.warn('CuentasPorCobrarModule error:', e); }
    try { if (typeof EstadosDeCuentaModule !== 'undefined' && AccessControl.hasModule('cobros')) EstadosDeCuentaModule.init(); } catch(e) { console.warn('EstadosDeCuentaModule error:', e); }
    if (typeof DashboardFinancieroModule !== 'undefined' && DashboardFinancieroModule.init && AccessControl.hasModule('finanzas')) {
        try { DashboardFinancieroModule.init(); } catch(e) { console.warn('DashboardFinancieroModule init error:', e); }
    }
    if (typeof ReportsModule !== 'undefined' && ReportsModule.init && AccessControl.hasModule('reportes')) {
        try { ReportsModule.init(); } catch(e) { console.warn('ReportsModule init error:', e); }
    }
    
    
    if (typeof UsuariosModule !== 'undefined') UsuariosModule.init();
    AccessControl.refresh().then(initializeUserProfile);
    restorePageFromHash();
    console.log('✅ Sistema inicializado correctamente');
}

// ============================================
// NAVEGACIÓN
// ============================================

// Rutas antiguas que ahora viven en otra página.
const PAGE_ALIASES = { inventory: 'codigos-articulos' };

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            navigateToPage(page);
        });
    });

    // Cada sección queda en el historial: "Atrás" cierra el formulario abierto
    // o vuelve a la sección anterior en lugar de salir de la aplicación.
    window.addEventListener('popstate', () => {
        if (closeOpenModals()) return;
        navigateToPage(pageFromHash(), { fromHistory: true });
    });
}

// Formularios con datos que se pierden al cerrarlos. Solo se pide confirmación si el
// usuario escribió algo desde que lo abrió.
const DRAFT_FORMS = ['saleModal', 'articuloModal', 'purchaseModal'];

function openDraftForm() {
    return DRAFT_FORMS.map(id => document.getElementById(id))
        .find(modal => modal && ['flex', 'block'].includes(modal.style.display) && modal.dataset.dirty === 'true');
}

document.addEventListener('input', event => {
    const modal = event.target.closest?.('.modal');
    if (modal && DRAFT_FORMS.includes(modal.id)) modal.dataset.dirty = 'true';
});

// Al cerrarse, el formulario vuelve a quedar "limpio" para la próxima vez.
const draftFormObserver = new MutationObserver(mutations => mutations.forEach(({ target }) => {
    if (target.style.display !== 'flex' && target.style.display !== 'block') target.dataset.dirty = '';
}));
DRAFT_FORMS.forEach(id => {
    const modal = document.getElementById(id);
    if (modal) draftFormObserver.observe(modal, { attributes: true, attributeFilter: ['style'] });
});

// La × también pregunta si hay datos escritos (Cancelar es una decisión explícita).
document.addEventListener('click', event => {
    const closeButton = event.target.closest?.('.modal .close-btn');
    if (!closeButton || closeButton.closest('.modal') !== openDraftForm()) return;
    if (!confirm('¿Cerrar el formulario? Se perderá lo que escribiste.')) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}, true);

window.addEventListener('beforeunload', event => {
    if (openDraftForm()) {
        event.preventDefault();
        event.returnValue = '';
    }
});

// Se llama al final de initializeApp, cuando los módulos ya están listos.
function restorePageFromHash() {
    const initialPage = pageFromHash();
    history.replaceState(null, '', `#${initialPage}`);
    if (initialPage !== 'dashboard') navigateToPage(initialPage, { fromHistory: true });
}

function pageFromHash() {
    let pageId;
    try {
        pageId = decodeURIComponent(location.hash.slice(1)) || 'dashboard';
    } catch {
        pageId = 'dashboard';
    }
    const resolved = PAGE_ALIASES[pageId] || pageId;
    return document.getElementById(`page-${resolved}`) ? resolved : 'dashboard';
}

// Cierra los formularios y ventanas abiertos; devuelve true si había alguno.
function closeOpenModals() {
    const open = [...document.querySelectorAll('.modal')].filter(modal =>
        modal.classList.contains('active') || modal.style.display === 'block' || modal.style.display === 'flex');
    const overlays = document.querySelectorAll('.modal-overlay');
    if (!open.length && !overlays.length) return false;
    if (openDraftForm() && !confirm('¿Salir del formulario? Se perderá lo que escribiste.')) {
        history.pushState(null, '', `#${currentPage}`);
        return true;
    }
    open.forEach(modal => {
        modal.classList.remove('active');
        modal.style.display = 'none';
    });
    overlays.forEach(overlay => overlay.remove());
    document.body.style.overflow = '';
    // Volver a dejar la sección actual en el historial que se acaba de consumir.
    history.pushState(null, '', `#${currentPage}`);
    return true;
}

function navigateToPage(pageId, { fromHistory = false } = {}) {
    pageId = PAGE_ALIASES[pageId] || pageId;
    if (!AccessControl.canOpenPage(pageId)) {
        showNotification('Este módulo no está disponible para tu usuario', 'warning');
        pageId = 'dashboard';
    }
    // Remove active class from all pages and nav items
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to selected page and nav item
    const page = document.getElementById(`page-${pageId}`);
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    
    if (page) {
        page.classList.add('active');
    }
    if (navItem) {
        navItem.classList.add('active');
    }

    const pagesContainer = document.querySelector('.pages-container');
    if (pagesContainer) {
        pagesContainer.scrollTop = 0;
    }

    // El título superior es el mismo texto del menú.
    const navLabel = document.querySelector(`.nav-item[data-page="${pageId}"] span`)?.textContent;
    document.getElementById('pageTitle').textContent = navLabel || 'Panel';

    currentPage = pageId;
    if (!fromHistory && location.hash !== `#${pageId}`) history.pushState(null, '', `#${pageId}`);

    // Cerrar el drawer después de navegar (en escritorio no hace nada).
    setSidebarOpen(false);

    // Re-initialize charts if on dashboard or financial dashboard
    if (pageId === 'dashboard') {
        setTimeout(() => {
            setupDashboard();
        }, 100);
    }
    
    if (pageId === 'dashboard-financiero') {
        setTimeout(() => {
            DashboardFinancieroModule.renderCharts();
        }, 100);
    }
    
    // Refresh module data on navigation
    if (pageId === 'compras') {
        ComprasModule.refreshTable();
    }
    if (pageId === 'ventas') {
        VentasModule.refreshTable();
    }
    if (pageId === 'punto-de-venta' && typeof PosModule !== 'undefined') {
        PosModule.refresh();
    }
    if (pageId === 'cuentas-por-cobrar') {
        CuentasPorCobrarModule.refreshTable();
    }
    // Ventas, compras y cobros cambian existencias y caja: recargar al entrar.
    if (pageId === 'caja' && typeof CajaModule !== 'undefined') {
        CajaModule.loadData();
    }
    if (pageId === 'caja-integrada' && typeof CajaIntegradaModule !== 'undefined') {
        CajaIntegradaModule.loadMovimientosFromAPI();
    }
    if (pageId === 'codigos-articulos' && typeof CodigosArticulosModule !== 'undefined') {
        CodigosArticulosModule.loadData();
        // Si la empresa conectó su página web, traer lo nuevo y volver a mostrar.
        if (typeof IntegracionModule !== 'undefined') {
            IntegracionModule.autoSync().then((changed) => changed && CodigosArticulosModule.loadData());
        }
    }
    if (pageId === 'clientes') {
        ClientesModule.load();
    }
    if (pageId === 'proveedores') {
        ProveedoresModule.load();
    }
    if (pageId === 'settings') {
        ClasificacionesConfig.load();
        if (typeof IntegracionModule !== 'undefined') IntegracionModule.load();
        if (typeof FelModule !== 'undefined') FelModule.loadConfig();
    }
    if (pageId === 'transactions') {
        loadTransactions();
    }
    if (pageId === 'estados-de-cuenta') {
        EstadosDeCuentaModule.loadClients();
    }
    
    if (pageId === 'alertas' && typeof AlertasModule !== 'undefined') {
        AlertasModule.renderAlertas();
    }
}

// ============================================
// SUBTABS DEL HISTORIAL MÉDICO
// ============================================

function setupSubtabs() {
    // Agregar event listeners a los botones de subtabs
    const subtabBtns = document.querySelectorAll('.subtab-btn');
    
    subtabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const subtabName = this.getAttribute('data-subtab');
            
            // Encontrar el contenedor padre de subtabs
            const subtabsContainer = this.closest('.subtabs-container');
            if (!subtabsContainer) return;
            
            // Ocultar solo los divs de contenido con data-subtab (no los botones)
            subtabsContainer.querySelectorAll('div[data-subtab]:not(.subtab-btn)').forEach(subtab => {
                subtab.style.display = 'none';
            });
            
            // Mostrar el subtab seleccionado
            const selectedSubtab = subtabsContainer.querySelector(`div[data-subtab="${subtabName}"]`);
            if (selectedSubtab) {
                selectedSubtab.style.display = 'block';
            }
            
            // Remover clase active de todos los botones en este contenedor
            subtabsContainer.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
            
            // Agregar clase active al botón clickeado
            this.classList.add('active');
            
            // Cambiar estilo visual
            subtabsContainer.querySelectorAll('.subtab-btn').forEach(b => {
                b.style.borderBottom = '3px solid transparent';
                b.style.color = '#666';
            });
            this.style.borderBottom = '3px solid #27ae60';
            this.style.color = '#27ae60';
        });
    });
    
    // Configurar tab inicial para cada contenedor
    document.querySelectorAll('.subtabs-container').forEach(container => {
        const firstBtn = container.querySelector('.subtab-btn');
        if (firstBtn) {
            firstBtn.style.borderBottom = '3px solid #27ae60';
            firstBtn.style.color = '#27ae60';
        }
    });
}

// ============================================
// DASHBOARD
// ============================================

let dashboardData = { salesByDay: [], inventoryByCategory: [], recent: [] };

async function setupDashboard() {
    try {
        const response = await authManager.fetchWithAuth('/api/dashboard');
        if (!response) return; // sesión cerrada: fetchWithAuth ya redirige al inicio
        const result = await response.json();
        if (result.success) {
            dashboardData = result.data;
            renderDashboardKpis(result.data.kpis);
            renderOnboarding(result.data.onboarding);
        }
    } catch (error) {
        console.error('Error cargando dashboard:', error);
    }
    populateRecentTransactions();
    initializeDashboardCharts();
}

function renderOnboarding(progress) {
    const card = document.getElementById('onboardingCard');
    if (!card || !progress) return;
    const steps = { articulo: progress.articulos > 0, venta: progress.ventas > 0 };
    card.hidden = steps.articulo && steps.venta;
    Object.entries(steps).forEach(([step, done]) => {
        const item = document.getElementById(`onboardingStep${step === 'articulo' ? 'Articulo' : 'Venta'}`);
        item?.classList.toggle('is-done', done);
        const button = item?.querySelector('button');
        if (button) button.hidden = done;
    });
    if (!card.dataset.bound) {
        card.dataset.bound = 'true';
        card.addEventListener('click', event => {
            const step = event.target.closest('[data-onboarding]')?.dataset.onboarding;
            if (step === 'articulo') {
                navigateToPage('codigos-articulos');
                CodigosArticulosModule.openArticuloModal();
            } else if (step === 'venta') {
                navigateToPage('ventas');
                VentasModule.openSaleModal();
            }
        });
    }
}

// Reemplaza una gráfica por un mensaje cuando no hay datos o Chart.js no cargó.
function setChartMessage(canvas, message) {
    const card = canvas.parentElement;
    let note = card.querySelector('.chart-empty');
    canvas.hidden = Boolean(message);
    if (!message) {
        note?.remove();
        return;
    }
    if (!note) {
        note = document.createElement('p');
        note.className = 'chart-empty';
        card.appendChild(note);
    }
    note.textContent = message;
}

function renderDashboardKpis(k) {
    const money = formatQ;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const change = (id, value, goodWhenUp, suffix) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (value === null || value === undefined) { el.innerHTML = ''; return; }
        if (Math.abs(value) < 0.05) {
            el.className = 'kpi-change';
            el.textContent = 'Sin cambio vs mes anterior';
            return;
        }
        const up = value > 0;
        const good = goodWhenUp ? up : !up;
        el.className = 'kpi-change ' + (good ? 'positive' : 'negative');
        el.innerHTML = `<i class="fas fa-arrow-${up ? 'up' : 'down'}" aria-hidden="true"></i> ${Math.abs(value).toFixed(1)}${suffix}`;
    };
    set('kpiIngresos', money(k.ingresos));
    set('kpiGastos', money(k.gastos));
    set('kpiInventario', money(k.inventario));
    set('kpiMargen', (Number(k.margen) || 0).toFixed(1) + '%');
    change('kpiIngresosChange', k.ingresosChange, true, '% vs mes anterior');
    change('kpiGastosChange', k.gastosChange, false, '% vs mes anterior');
    change('kpiInventarioChange', null);
    change('kpiMargenChange', k.margenChange, true, ' pts vs mes anterior');
}

function initializeDashboardCharts() {
    if (charts.sales) charts.sales.destroy();
    if (charts.inventory) charts.inventory.destroy();
    charts.sales = charts.inventory = null;

    const salesCtx = document.getElementById('salesChart');
    const inventoryCtx = document.getElementById('inventoryChart');
    if (typeof Chart === 'undefined') {
        // Chart.js se descarga después de que el panel ya es usable.
        loadLibrary('chart').then(initializeDashboardCharts).catch(() => {
            [salesCtx, inventoryCtx].forEach(canvas => canvas && setChartMessage(canvas, 'No se pudo cargar la gráfica. Recarga la página para intentarlo de nuevo.'));
        });
        return;
    }
    const salesData = dashboardData.salesByDay || [];
    const inventoryData = dashboardData.inventoryByCategory || [];
    if (salesCtx) setChartMessage(salesCtx, salesData.some(d => d.sales > 0) ? '' : 'Aún no hay ventas en los últimos 7 días.');
    if (inventoryCtx) setChartMessage(inventoryCtx, inventoryData.length ? '' : 'Aún no hay existencias registradas.');

    // Sales Chart
    if (salesCtx && !salesCtx.hidden) {
        charts.sales = new Chart(salesCtx, {
            type: 'line',
            data: {
                labels: salesData.map(d => d.day.slice(8, 10) + '/' + d.day.slice(5, 7)),
                datasets: [{
                    label: 'Ventas (Q)',
                    data: salesData.map(d => d.sales),
                    borderColor: '#1e3a8a',
                    backgroundColor: 'rgba(30, 58, 138, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#f97316',
                    pointBorderColor: '#1e3a8a',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#fb923c'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return legacyMoney(value);
                            }
                        }
                    }
                }
            }
        });
    }

    // Inventory Distribution Chart
    if (inventoryCtx && !inventoryCtx.hidden) {
        charts.inventory = new Chart(inventoryCtx, {
            type: 'doughnut',
            data: {
                labels: inventoryData.map(d => d.category),
                datasets: [{
                    data: inventoryData.map(d => d.value),
                    backgroundColor: [
                        '#1e3a8a',
                        '#0891b2',
                        '#f97316',
                        '#22c55e'
                    ],
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

function populateRecentTransactions() {
    const tbody = document.getElementById('recentTransactions');
    if (!tbody) return;

    tbody.innerHTML = '';
    const recentTransactions = (dashboardData.recent || []).map(t => ({ ...t, date: t.fecha, status: String(t.status || '').replace(/^./, c => c.toUpperCase()) }));

    if (recentTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Sin transacciones registradas</td></tr>';
        return;
    }

    recentTransactions.forEach(transaction => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(transaction.date)}</td>
            <td>${transaction.description}</td>
            <td>
                <span style="display: flex; align-items: center; gap: 5px;">
                    <i class="${getTransactionTypeIcon(transaction.type)}"></i>
                    ${transaction.type}
                </span>
            </td>
            <td ${transaction.type === 'Compra' ? 'style="color: #ef4444"' : 'style="color: #22c55e"'}>
                ${transaction.type === 'Compra' ? '-' : '+'}${formatCurrency(transaction.amount)}
            </td>
            <td>
                <span class="status-badge ${getStatusBadgeClass(transaction.status)}">
                    ${transaction.status}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ============================================
// ============================================
// INVENTARIO Y TRANSACCIONES (datos reales)
// ============================================

function formatDate(value) {
    if (!value) return 'Sin fecha';
    const d = value instanceof Date ? value : new Date(String(value).length === 10 ? value + 'T00:00:00' : value);
    return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatCurrency(v) { return legacyMoney(v); }
function getTransactionTypeIcon(type) {
    return type === 'Compra' ? 'fas fa-arrow-down' : 'fas fa-arrow-up';
}
const legacyMoney = formatQ;
const legacyEsc = v => BulkImport.escapeHtml(v);
const legacyStatusClass = status => {
    const s = String(status || '').toLowerCase();
    if (['completada', 'pagada', 'recibida', 'completed'].includes(s)) return 'status-completed';
    if (['anulada', 'cancelada', 'failed'].includes(s)) return 'status-failed';
    return 'status-pending';
};
let transactionItems = [];

function setupInventory() {
    ['addTransactionBtn', 'bulkTransactionBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function setupTransactions() {
    ['typeFilter', 'dateFromFilter', 'dateToFilter'].forEach(id =>
        document.getElementById(id)?.addEventListener('change', loadTransactions));
}

async function loadTransactions() {
    const qs = new URLSearchParams();
    const type = document.getElementById('typeFilter')?.value;
    const from = document.getElementById('dateFromFilter')?.value;
    const to = document.getElementById('dateToFilter')?.value;
    if (type) qs.set('type', type);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);

    try {
        const response = await authManager.fetchWithAuth(`/api/dashboard/transactions?${qs}`);
        const result = await response.json();
        transactionItems = result.success ? result.data : [];
    } catch (error) {
        console.error('Error cargando transacciones:', error);
        transactionItems = [];
    }

    const tbody = document.getElementById('transactionsTable');
    if (!tbody) return;
    if (transactionItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px;">No hay transacciones</td></tr>';
        return;
    }
    tbody.innerHTML = transactionItems.map(t => {
        const status = String(t.status || '').replace(/^./, c => c.toUpperCase());
        return `
            <tr>
                <td>${legacyEsc(t.number)}</td>
                <td>${legacyEsc(String(t.fecha).slice(0, 10))}</td>
                <td>${legacyEsc(t.type)}</td>
                <td>${legacyEsc(t.description)}</td>
                <td>${Number(t.quantity) || 0}</td>
                <td style="color:${t.type === 'Compra' ? '#ef4444' : '#22c55e'}">${t.type === 'Compra' ? '-' : '+'}${legacyMoney(t.amount)}</td>
                <td><span class="status-badge ${legacyStatusClass(status)}">${legacyEsc(status)}</span></td>
                <td></td>
            </tr>`;
    }).join('');
}

// ============================================
// MODALES
// ============================================

function setupModals() {
    document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) closeModal(modal);
        });
    });
}


function closeModal(modal) {
    modal.classList.remove('active');
}

function showNotification(message, type = 'info') {
    // Mapeo de iconos por tipo
    const icons = {
        'success': '✓',
        'error': '✕',
        'warning': '⚠',
        'info': 'ℹ'
    };

    // Mapeo de colores y gradientes por tipo
    const styles = {
        'success': {
            bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            icon: '✓',
            border: '#15803d'
        },
        'error': {
            bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            icon: '✕',
            border: '#7f1d1d'
        },
        'warning': {
            bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            icon: '⚠',
            border: '#92400e'
        },
        'info': {
            bg: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
            icon: 'ℹ',
            border: '#164e63'
        }
    };

    const style = styles[type] || styles.info;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type} show`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${style.icon}</span>
            <span class="notification-text"></span>
            <button type="button" class="notification-close" aria-label="Cerrar aviso">×</button>
        </div>
    `;
    // Los mensajes pueden incluir nombres escritos por usuarios: siempre como texto.
    // El aviso ya trae su propio icono, así que se quita un emoji inicial repetido.
    notification.querySelector('.notification-text').textContent =
        String(message ?? '').replace(/^\s*(?:✅|❌|⚠️|⚠|ℹ️)\s*/u, '');
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const narrow = window.innerWidth < 480;
    // Escritorio: arriba al centro (no tapa los botones de la página ni la × de los formularios).
    // Móvil: abajo, por encima del pie del formulario si hay uno abierto (no tapa el menú).
    const formOpen = [...document.querySelectorAll('.modal')].some(modal =>
        modal.classList.contains('active') || ['flex', 'block'].includes(modal.style.display));
    const mobileBottom = formOpen ? '96px' : '16px';

    notification.style.cssText = `
        position: fixed;
        top: ${narrow ? 'auto' : '72px'};
        bottom: ${narrow ? `calc(${mobileBottom} + env(safe-area-inset-bottom, 0px))` : 'auto'};
        height: auto;
        right: ${narrow ? '16px' : 'auto'};
        left: ${narrow ? '16px' : '50%'};
        transform: ${narrow ? 'none' : 'translateX(-50%)'};
        padding: 0;
        background: ${style.bg};
        color: white;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        animation: none;
        min-width: ${narrow ? '0' : '320px'};
        max-width: 450px;
        border-left: 4px solid ${style.border};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Estilos del contenido
    const contentDiv = notification.querySelector('.notification-content');
    contentDiv.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        width: 100%;
    `;

    const icon = notification.querySelector('.notification-icon');
    icon.style.cssText = `
        font-size: 20px;
        font-weight: bold;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: rgba(255, 255, 255, 0.25);
        border-radius: 6px;
    `;

    const text = notification.querySelector('.notification-text');
    text.style.cssText = `
        flex: 1;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.4;
        word-break: break-word;
    `;

    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: transform 0.2s ease;
        opacity: 0.7;
    `;

    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.opacity = '1';
        closeBtn.style.transform = 'scale(1.2)';
    });

    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.opacity = '0.7';
        closeBtn.style.transform = 'scale(1)';
    });

    closeBtn.addEventListener('click', () => {
        notification.style.transition = 'opacity 0.2s ease-out';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    });

    // Un aviso a la vez: los anteriores pueden contradecir al nuevo.
    document.querySelectorAll('body > .notification').forEach(previous => previous.remove());
    document.body.appendChild(notification);

    // Auto-remover después de 4 segundos (los errores se quedan 8 para poder leerlos)
    const autoRemoveTimeout = setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transition = 'opacity 0.2s ease-out';
        notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }
    }, type === 'error' ? 8000 : 4000);

    // Cancelar auto-remover si el usuario cierra manualmente
    notification.addEventListener('click', (e) => {
        if (e.target.classList.contains('notification-close')) {
            clearTimeout(autoRemoveTimeout);
        }
    });
}

// ============================================
// RESPONSIVE
// ============================================

function setupResponsive() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const closeBtn = document.getElementById('closeSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const sidebar = document.getElementById('mainSidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function() {
            setSidebarOpen(!sidebar.classList.contains('active'));
        });
    }

    closeBtn?.addEventListener('click', () => setSidebarOpen(false));
    backdrop?.addEventListener('click', () => setSidebarOpen(false));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && sidebar?.classList.contains('active')) {
            setSidebarOpen(false);
            toggleBtn?.focus();
        }
    });

    window.addEventListener('resize', () => setSidebarOpen(false));
    setSidebarOpen(false);
}

function setSidebarOpen(open) {
    const sidebar = document.getElementById('mainSidebar');
    const toggleBtn = document.getElementById('toggleSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar || !toggleBtn || !backdrop) return;

    // En escritorio el menú lateral queda fijo y siempre visible.
    const pinned = window.matchMedia('(min-width: 1024px)').matches;
    if (pinned) open = false;

    sidebar.classList.toggle('active', open);
    backdrop.classList.toggle('active', open);
    sidebar.setAttribute('aria-hidden', String(!open && !pinned));
    toggleBtn.setAttribute('aria-expanded', String(open));
    toggleBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    toggleBtn.setAttribute('title', open ? 'Cerrar menú' : 'Abrir menú');
}

function setupMobileListTables() {
    const pagesContainer = document.querySelector('.pages-container');
    if (!pagesContainer) return;

    labelMobileListTables(pagesContainer);
    const pendingRoots = new Set();
    let animationFrameId = null;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    pendingRoots.add(node.closest('table') || node);
                }
            });
        });

        if (pendingRoots.size && animationFrameId === null) {
            animationFrameId = requestAnimationFrame(() => {
                const roots = [...pendingRoots];
                pendingRoots.clear();
                animationFrameId = null;
                roots.forEach(root => labelMobileListTables(root));
            });
        }
    });

    observer.observe(pagesContainer, { childList: true, subtree: true });
}

function labelMobileListTables(root) {
    const selector = [
        '.table-container table',
        '.table-responsive table',
        'table.data-table',
        'table.tabla-datos',
        'table.report-table',
        'table.statement-table',
        '.transactions-table table'
    ].join(', ');
    const excludedSelector = [
        '.bulk-table',
        '.purchase-items-table',
        '.prescripcion-table',
        '[data-mobile-layout="grid"]'
    ].join(', ');
    const tables = [];

    const containingTable = root.closest?.(selector);
    if (containingTable) tables.push(containingTable);
    if (root.matches?.(selector)) tables.push(root);
    root.querySelectorAll?.(selector).forEach(table => tables.push(table));

    [...new Set(tables)].forEach(table => {
        if (table.matches(excludedSelector)) return;

        const headers = Array.from(table.querySelectorAll('thead th'))
            .map(header => header.textContent.trim());
        if (!headers.length) return;

        table.classList.add('mobile-card-table');
        table.parentElement?.classList.add('mobile-card-table-container');
        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = Array.from(row.children).filter(cell => cell.tagName === 'TD');
            const isMessageRow = cells.length === 1 && Number(cells[0].colSpan) > 1;

            cells.forEach((cell, index) => {
                cell.classList.toggle('mobile-card-message', isMessageRow);
                cell.classList.toggle('mobile-card-actions', !isMessageRow && /^acciones?$/i.test(headers[index]));
                if (!isMessageRow) {
                    cell.dataset.label = headers[index] || 'Detalle';
                }
            });
        });
    });
}

// ============================================
// UTILIDADES
// ============================================

function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const today = new Date();
        dateElement.textContent = formatDate(today);
    }
}

// Add CSS animations dynamically
const styleElement = document.createElement('style');
styleElement.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(styleElement);

// ============================================
// FUNCIONES PARA GASTOS Y SERVICIOS
// ============================================

function switchGastosTab(tabName) {
    // Ocultar todos los tabs
    document.querySelectorAll('#page-gastos-servicios .tab-content').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    document.querySelectorAll('#page-gastos-servicios .tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Mostrar el tab seleccionado
    const tabElement = document.getElementById('tab-' + tabName);
    if (tabElement) {
        tabElement.style.display = 'block';
        tabElement.classList.add('active');
    }

    // Marcar botón como activo
    event.target.closest('.tab-button').classList.add('active');

    // Cargar datos específicos según el tab
    if (tabName === 'cuentaspagar') {
        populateSelectsCuentasPorPagar();
        gastosModule.renderCuentasPorPagar();
        actualizarResumenCuentasPorPagar();
    }
}

function agregarPago() {
    const concepto = document.getElementById('selectConcepto').value;
    const proveedor = document.getElementById('selectProveedor').value;
    const monto = parseMonto(document.getElementById('inputMonto').value);
    const fecha = document.getElementById('inputFecha').value;
    const numeroFactura = document.getElementById('inputNumeroFactura').value;
    const requisicion = document.getElementById('inputRequisicion').value;
    const referencia = document.getElementById('inputReferencia').value;

    if (!concepto || !proveedor || !monto || !fecha || !numeroFactura) {
        showNotification('Por favor complete todos los campos requeridos (incluyendo número de factura).', 'warning');
        return;
    }
    if (!isValidMonto(monto)) {
        showNotification('Escribe un monto mayor que 0, por ejemplo 25.50 (máximo 99,999,999.99).', 'warning');
        return;
    }

    if (gastosModule.addPago(concepto, proveedor, monto, fecha, numeroFactura, requisicion, referencia)) {
        // Limpiar formulario
        document.getElementById('selectConcepto').value = '';
        document.getElementById('selectProveedor').value = '';
        document.getElementById('inputMonto').value = '';
        document.getElementById('inputFecha').value = '';
        document.getElementById('inputNumeroFactura').value = '';
        document.getElementById('inputRequisicion').value = '';
        document.getElementById('inputReferencia').value = '';

        // Actualizar vista
        gastosModule.render();
        showNotification('Pago registrado correctamente', 'success');
    }
}

function agregarProveedor() {
    const nombre = document.getElementById('inputProveedorNombre').value;
    const contacto = document.getElementById('inputProveedorContacto').value;
    const telefono = document.getElementById('inputProveedorTelefono').value;
    const referencia = document.getElementById('inputProveedorReferencia').value;

    if (!nombre || !contacto) {
        showNotification('Por favor ingrese el nombre del proveedor y el contacto.', 'warning');
        return;
    }

    if (gastosModule.addProveedor(nombre, contacto, referencia, telefono)) {
        // Limpiar formulario
        document.getElementById('inputProveedorNombre').value = '';
        document.getElementById('inputProveedorContacto').value = '';
        document.getElementById('inputProveedorTelefono').value = '';
        document.getElementById('inputProveedorReferencia').value = '';

        // Actualizar vista
        gastosModule.render();
        showNotification('Proveedor agregado correctamente', 'success');
    }
}

function agregarCuentaPorPagar() {
    const proveedor = document.getElementById('selectProveedorCPP').value;
    const concepto = document.getElementById('selectConceptoCPP').value;
    const monto = parseMonto(document.getElementById('inputMontoCPP').value);
    const numeroFactura = document.getElementById('inputNumeroFacturaCPP').value;
    const fecha = document.getElementById('inputFechaCPP').value;
    const vencimiento = document.getElementById('inputVencimientoCPP').value;

    if (!proveedor || !concepto || !monto || !numeroFactura || !fecha || !vencimiento) {
        showNotification('Por favor complete todos los campos requeridos.', 'warning');
        return;
    }
    if (!isValidMonto(monto)) {
        showNotification('Escribe un monto mayor que 0, por ejemplo 25.50 (máximo 99,999,999.99).', 'warning');
        return;
    }

    if (gastosModule.addCuentaPorPagar(proveedor, concepto, monto, fecha, vencimiento, numeroFactura)) {
        // Limpiar formulario
        document.getElementById('selectProveedorCPP').value = '';
        document.getElementById('selectConceptoCPP').value = '';
        document.getElementById('inputMontoCPP').value = '';
        document.getElementById('inputNumeroFacturaCPP').value = '';
        document.getElementById('inputFechaCPP').value = '';
        document.getElementById('inputVencimientoCPP').value = '';

        // Actualizar vista
        gastosModule.renderCuentasPorPagar();
        actualizarResumenCuentasPorPagar();
        showNotification('Cuenta por pagar registrada correctamente', 'success');
    }
}

function actualizarResumenCuentasPorPagar() {
    const cuentas = gastosModule.state.cuentasPorPagar || [];
    const vencidas = gastosModule.getCuentasVencidas();
    
    let totalPendiente = 0;
    let totalParcial = 0;
    let totalPagada = 0;
    let totalVencida = 0;

    cuentas.forEach(cuenta => {
        if (cuenta.estado === 'pendiente') {
            totalPendiente += cuenta.saldo;
        } else if (cuenta.estado === 'parcial') {
            totalParcial += cuenta.saldo;
        } else if (cuenta.estado === 'pagada') {
            totalPagada += cuenta.monto;
        }
    });

    vencidas.forEach(cuenta => {
        totalVencida += cuenta.saldo;
    });

    const formatarMoneda = (valor) => {
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2
        }).format(valor);
    };

    const elem1 = document.getElementById('totalPendiente');
    const elem2 = document.getElementById('totalParcial');
    const elem3 = document.getElementById('totalPagada');
    const elem4 = document.getElementById('totalVencidas');

    if (elem1) elem1.textContent = formatarMoneda(totalPendiente);
    if (elem2) elem2.textContent = formatarMoneda(totalParcial);
    if (elem3) elem3.textContent = formatarMoneda(totalPagada);
    if (elem4) elem4.textContent = formatarMoneda(totalVencida);
}

function populateSelectsCuentasPorPagar() {
    const selectProveedor = document.getElementById('selectProveedorCPP');
    const selectConcepto = document.getElementById('selectConceptoCPP');
    
    if (!selectProveedor || !selectConcepto) return;

    selectProveedor.innerHTML = '<option value="">-- Seleccionar Proveedor --</option>';
    selectConcepto.innerHTML = '<option value="">-- Seleccionar Concepto --</option>';

    if (gastosModule && gastosModule.state) {
        gastosModule.state.proveedores.forEach(proveedor => {
            selectProveedor.innerHTML += `<option value="${escGastos(proveedor.id)}">${escGastos(proveedor.nombre)}</option>`;
        });

        gastosModule.state.conceptos.forEach(concepto => {
            selectConcepto.innerHTML += `<option value="${escGastos(concepto.id)}">${escGastos(concepto.nombre)}</option>`;
        });
    }
}

function setGastosPeriodo(periodo) {
    gastosModule.setPeriodo(periodo);
    gastosModule.render();

    // Actualizar botones activos
    document.querySelectorAll('.periodo-buttons .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.btn').classList.add('active');
}

// Variable global para almacenar el proveedor a dar de baja
let proveedorEnBaja = null;

function abrirModalBajaProveedor(proveedorId, proveedorNombre) {
    proveedorEnBaja = proveedorId;
    document.getElementById('bajaProveedorNombre').textContent = `¿Dar de baja a: ${proveedorNombre}?`;
    document.getElementById('inputFechaBaja').value = new Date().toISOString().split('T')[0];
    document.getElementById('selectMotivoBaja').value = '';
    document.getElementById('inputDetallesBaja').value = '';
    
    const modal = document.getElementById('bajaProveedorModal');
    modal.style.display = 'flex';
}

function confirmarBajaProveedor() {
    if (!proveedorEnBaja) {
        showNotification('Error: No se especificó el proveedor.', 'warning');
        return;
    }

    const fechaBaja = document.getElementById('inputFechaBaja').value;
    const motivo = document.getElementById('selectMotivoBaja').value;
    const detalles = document.getElementById('inputDetallesBaja').value;

    if (!fechaBaja || !motivo) {
        showNotification('Por favor complete la fecha y el motivo de la baja.', 'warning');
        return;
    }

    const motivoCompleto = detalles ? `${motivo} - ${detalles}` : motivo;

    if (gastosModule.darDeBajaProveedor(proveedorEnBaja, motivoCompleto, fechaBaja)) {
        gastosModule.render();
        showNotification('Proveedor dado de baja correctamente', 'success');
        document.getElementById('bajaProveedorModal').style.display = 'none';
        proveedorEnBaja = null;
    }
}

// ============================================
// AUTENTICACIÓN - FUNCIONES DE USUARIO
// ============================================

/**
 * Inicializar perfil de usuario en la UI
 */
function initializeUserProfile() {
    const user = authManager.getUser();
    
    if (!user) return;

    // Buscar elemento para mostrar el nombre del usuario
    const userNameElement = document.getElementById('userName');
    const userEmailElement = document.getElementById('userEmail');
    const userRoleElement = document.getElementById('userRole');

    if (userNameElement) {
        userNameElement.textContent = user.nombre || 'Usuario';
    }

    if (userEmailElement) {
        userEmailElement.textContent = user.email || '';
    }

    if (userRoleElement) {
        userRoleElement.textContent = AccessControl.isAdmin() ? 'Administrador' : 'Usuario';
    }

    console.log('✓ Perfil de usuario cargado:', user.nombre);
}

/**
 * Configurar funcionalidad de logout
 */
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutLink = document.querySelector('[data-action="logout"]');
    const userMenu = document.getElementById('userMenu');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', performLogout);
    }

    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            performLogout();
        });
    }

    // Toggle user menu
    if (userMenu) {
        const toggleUserMenu = function(e) {
            e.stopPropagation();
            const menu = document.getElementById('userDropdown');
            if (menu) {
                const open = menu.classList.toggle('active');
                userMenu.setAttribute('aria-expanded', String(open));
            }
        };
        userMenu.addEventListener('click', toggleUserMenu);
        userMenu.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleUserMenu(e);
            }
        });
        document.getElementById('userDropdown')?.addEventListener('click', e => {
            e.stopPropagation();
            const action = e.target.closest('[data-user-action]')?.dataset.userAction;
            if (!action) return;
            e.preventDefault();
            closeUserMenu();
            navigateToPage('settings');
            if (action === 'password') {
                const field = document.getElementById('currentPassword');
                field?.scrollIntoView({ block: 'center' });
                field?.focus();
            }
        });
    }

    const closeUserMenu = () => {
        document.getElementById('userDropdown')?.classList.remove('active');
        userMenu?.setAttribute('aria-expanded', 'false');
    };
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('userDropdown')?.classList.contains('active')) {
            closeUserMenu();
            userMenu?.focus();
        }
    });

    // Cerrar menú al hacer click fuera
    document.addEventListener('click', function() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.classList.remove('active');
            userMenu?.setAttribute('aria-expanded', 'false');
        }
    });
}

/**
 * Ejecutar logout
 */
async function performLogout() {
    if (!confirm('¿Estás seguro que deseas cerrar sesión?')) {
        return;
    }

    const result = await authManager.logout();

    if (result.success) {
        showNotification('Sesión cerrada correctamente', 'success');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1500);
    }
}

/**
 * Actualizar información del usuario en tiempo real
 */
async function refreshUserProfile() {
    const result = await authManager.getProfile();

    if (result.success) {
        initializeUserProfile();
        console.log('✓ Perfil de usuario actualizado');
    } else {
        console.error('Error actualizando perfil:', result.error);
    }
}

// Initialize the application
console.log('BotEngine ERP v1.0');
console.log('Demo Mode - All transactions are simulated');
