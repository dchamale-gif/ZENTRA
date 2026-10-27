const platformApi = '/api/platform';
const state = { organizations: [], modules: [], editingId: null };
const statusLabels = { trial: 'Prueba', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada' };

document.addEventListener('DOMContentLoaded', () => {
    const user = authManager.getUser();
    if (!authManager.isAuthenticated() || authManager.isTokenExpired() || !user?.platformAdmin) {
        window.location.href = '/login.html';
        return;
    }

    document.getElementById('refreshButton').addEventListener('click', loadOrganizations);
    document.getElementById('expiringDays').addEventListener('change', loadOrganizations);
    document.getElementById('addCompanyButton').addEventListener('click', () => {
        document.getElementById('companyModal').classList.remove('hidden');
    });
    document.getElementById('companyContract').addEventListener('change', toggleContractFields);
    document.getElementById('cancelCompanyButton').addEventListener('click', closeCompanyModal);
    document.getElementById('cancelModulesButton').addEventListener('click', closeModules);
    document.getElementById('modulesForm').addEventListener('submit', saveModules);
    document.getElementById('modulesSelectAll').addEventListener('click', () => {
        document.querySelectorAll('#modulesChecks input').forEach(input => { input.checked = true; });
    });
    document.getElementById('companyForm').addEventListener('submit', createCompany);
    document.getElementById('logoutButton').addEventListener('click', async () => {
        await authManager.logout();
        window.location.href = '/login.html';
    });
    loadOrganizations();
});

const showMessage = (message, type = 'success') => {
    const container = document.getElementById('message');
    container.textContent = message;
    container.style.color = type === 'error' ? '#b91c1c' : '#166534';
};

const apiRequest = async (url, options = {}) => {
    const response = await authManager.fetchWithAuth(`${platformApi}${url}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!response) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error en el panel');
    return data;
};

const formatDate = (value) => value ? new Date(value).toLocaleDateString('es-GT') : 'Sin fecha';

async function loadOrganizations() {
    try {
        if (!state.modules.length) state.modules = (await apiRequest('/modules'))?.modules || [];
        const days = document.getElementById('expiringDays').value;
        const data = await apiRequest(`/organizations?expiringIn=${days}`);
        if (!data) return;
        const body = document.getElementById('organizationsBody');
        if (!data.organizations.length) {
            body.innerHTML = '<tr><td colspan="8">No hay empresas registradas.</td></tr>';
            return;
        }
        body.innerHTML = data.organizations.map((organization) => `
            <tr>
                <td><strong>${escapeHtml(organization.name)}</strong><br><small>${escapeHtml(organization.sector || 'Sin sector')}</small></td>
                <td>${escapeHtml(organization.email || 'Sin correo')}<br><small>${escapeHtml(organization.nit || 'Sin NIT')}</small><br>${mailState(organization)}</td>
                <td><span class="status ${organization.status}">${escapeHtml(statusLabels[organization.status] || organization.status)}</span><br><small>${organization.daysRemaining} días</small></td>
                <td class="key">${escapeHtml(organization.licenseKey || 'Sin licencia')}</td>
                <td class="${organization.activeUsers >= organization.maxUsers ? 'users-full' : ''}">${organization.activeUsers} / ${organization.maxUsers}<br><small>activos / permitidos</small></td>
                <td>${modulesSummary(organization)}</td>
                <td>${formatDate(organization.status === 'trial' ? organization.trialEndsAt : organization.subscriptionEndsAt)}</td>
                <td class="actions">
                    <button class="primary" type="button" data-action="activate" data-id="${organization.id}">Habilitar</button>
                    <button class="secondary" type="button" data-action="generate" data-id="${organization.id}">Generar clave</button>
                    <button class="secondary" type="button" data-action="users" data-id="${organization.id}" data-max-users="${organization.maxUsers}">Usuarios</button>
                    <button class="secondary" type="button" data-action="modules" data-id="${organization.id}">Módulos</button>
                    ${organization.admin && organization.admin.pendienteCambio && !dadaDeBaja(organization) ? `<button class="secondary" type="button" data-action="correo" data-id="${organization.id}">Reenviar correo</button>` : ''}
                    ${organization.status === 'suspended' || organization.status === 'cancelled'
                        ? (dadaDeBaja(organization) ? '' : `<button class="danger" type="button" data-action="baja" data-id="${organization.id}">Dar de baja</button>`)
                        : `<button class="danger" type="button" data-action="suspend" data-id="${organization.id}">Suspender</button>`}
                </td>
            </tr>
        `).join('');
        state.organizations = data.organizations;
        body.querySelectorAll('button[data-action]').forEach(button => {
            button.addEventListener('click', () => {
                if (button.dataset.action === 'modules') return openModules(button.dataset.id);
                if (button.dataset.action === 'correo') return resendEmail(button.dataset.id, button);
                if (button.dataset.action === 'baja') return deactivateOrganization(button.dataset.id, button);
                return updateLicense(button.dataset.id, button.dataset.action, button);
            });
        });
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

// Al dar de baja, los correos de los usuarios se renombran a baja-<id>-correo.
const dadaDeBaja = (organization) => organization.status === 'cancelled' && Boolean(organization.admin?.email?.startsWith('baja-'));

// Estado del alta del administrador: verificación de correo y primer ingreso.
const mailState = (organization) => {
    const admin = organization.admin;
    if (!admin) return '<span class="mail-state pending">Sin administrador</span>';
    if (dadaDeBaja(organization)) return '<span class="mail-state pending">Dada de baja · correos libres</span>';
    if (!admin.verificado) return '<span class="mail-state pending">Correo sin verificar</span>';
    if (admin.pendienteCambio) return '<span class="mail-state pending">Verificado · aún no entra</span>';
    return '<span class="mail-state ok">Cuenta activada</span>';
};

async function resendEmail(id, button) {
    const organization = state.organizations.find(entry => String(entry.id) === String(id));
    const pendiente = organization?.admin?.verificado
        ? 'Se enviará una contraseña temporal nueva y la anterior dejará de funcionar.'
        : 'Se enviará un enlace de verificación nuevo y el anterior dejará de funcionar.';
    if (!confirm(`¿Reenviar el correo a ${organization?.admin?.email || 'la empresa'}? ${pendiente}`)) return;
    button.disabled = true;
    try {
        const data = await apiRequest(`/organizations/${id}/correo`, { method: 'POST', body: '{}' });
        showMessage(data.message);
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message, 'error');
        button.disabled = false;
    }
}

// Cancela la empresa, desactiva sus usuarios y libera sus correos. Pide escribir el nombre para confirmar.
async function deactivateOrganization(id, button) {
    const organization = state.organizations.find(entry => String(entry.id) === String(id));
    if (!organization) return;
    const answer = window.prompt(`Dar de baja ${organization.name}: sus usuarios ya no podrán entrar y sus correos quedarán libres para crear otra empresa. Los datos no se borran.\n\nEscribe el nombre de la empresa para confirmar:`);
    if (answer === null) return;
    if (answer.trim().toLowerCase() !== organization.name.trim().toLowerCase()) {
        showMessage('El nombre escrito no coincide; la empresa no se dio de baja.', 'error');
        return;
    }
    button.disabled = true;
    try {
        const data = await apiRequest(`/organizations/${id}/baja`, { method: 'POST', body: JSON.stringify({ confirmacion: answer }) });
        showMessage(data.message);
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message, 'error');
        button.disabled = false;
    }
}

const askMaxUsers = (current = 3) => {
    const answer = window.prompt('Usuarios permitidos por la licencia:', String(current));
    if (answer === null) return null;
    const maxUsers = Number(answer);
    if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 1000) {
        showMessage('Los usuarios permitidos deben ser un número entre 1 y 1000.', 'error');
        return null;
    }
    return maxUsers;
};

async function updateLicense(id, action, button) {
    const currentMaxUsers = Number(button?.dataset.maxUsers) || 3;
    if (action === 'users') {
        const maxUsers = askMaxUsers(currentMaxUsers);
        if (!maxUsers) return;
        try {
            const data = await apiRequest(`/organizations/${id}/users-limit`, {
                method: 'POST',
                body: JSON.stringify({ maxUsers })
            });
            showMessage(data.message);
            await loadOrganizations();
        } catch (error) {
            showMessage(error.message, 'error');
        }
        return;
    }

    if (action === 'generate') {
        const confirmGen = window.confirm('¿Deseas generar una nueva clave de licencia XXXX-XXXX-XXXX para esta empresa?');
        if (!confirmGen) return;
        const plan = window.prompt('Plan de la licencia:', 'Pro') || 'Pro';
        const duration = Number(window.prompt('Duración en días:', '365') || 365);
        const maxUsers = askMaxUsers(currentMaxUsers);
        if (!maxUsers) return;
        try {
            const data = await apiRequest(`/organizations/${id}/license`, {
                method: 'POST',
                body: JSON.stringify({
                    status: 'active',
                    plan,
                    durationDays: duration,
                    generateNewKey: true,
                    maxUsers
                })
            });
            showMessage(data.message);
            await loadOrganizations();
        } catch (error) {
            showMessage(error.message, 'error');
        }
        return;
    }

    const plan = action === 'activate' ? (window.prompt('Plan de la licencia:', 'Pro') || 'Pro') : 'Suspendida';
    if (action === 'activate' && !plan.trim()) return;
    const duration = action === 'activate'
        ? Number(window.prompt('Duración en días:', '365') || 365)
        : 1;
    const maxUsers = action === 'activate' ? askMaxUsers(currentMaxUsers) : undefined;
    if (action === 'activate' && !maxUsers) return;
    try {
        const data = await apiRequest(`/organizations/${id}/license`, {
            method: 'POST',
            body: JSON.stringify({
                status: action === 'activate' ? 'active' : 'suspended',
                plan,
                durationDays: duration,
                generateNewKey: false,
                maxUsers
            })
        });
        showMessage(data.message);
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}
// Primer día del mes siguiente, en formato del campo de fecha.
const firstOfNextMonth = () => {
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
};

// Muestra los datos del contrato y carga la lista de módulos la primera vez.
async function toggleContractFields() {
    const enabled = document.getElementById('companyContract').checked;
    const fields = document.getElementById('contractFields');
    fields.classList.toggle('hidden', !enabled);
    ['contractPrice', 'contractPos', 'contractStart'].forEach(id => { document.getElementById(id).required = enabled; });
    if (!enabled) return;
    const start = document.getElementById('contractStart');
    if (!start.value) start.value = firstOfNextMonth();
    const container = document.getElementById('contractModules');
    if (container.children.length) return;
    try {
        if (!state.modules.length) state.modules = (await apiRequest('/modules')).modules;
    } catch (error) {
        showMessage(error.message, 'error');
        return;
    }
    container.innerHTML = state.modules.map(module => `
        <label><input type="checkbox" value="${module.key}" checked> ${escapeHtml(module.label)}</label>
    `).join('') + '<label><input type="checkbox" value="fel" checked> Facturación electrónica (FEL)</label>';
}

const contractData = () => {
    if (!document.getElementById('companyContract').checked) return undefined;
    const selected = [...document.querySelectorAll('#contractModules input:checked')].map(input => input.value);
    return {
        enviar: true,
        mensualidad: Number(document.getElementById('contractPrice').value),
        puntosVenta: Number(document.getElementById('contractPos').value),
        inicioCobro: document.getElementById('contractStart').value,
        certificador: document.getElementById('contractCertifier').value.trim(),
        modulos: selected.filter(key => key !== 'fel'),
        fel: selected.includes('fel')
    };
};

async function createCompany(event) {
    event.preventDefault();
    try {
        const data = await apiRequest('/organizations', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('companyName').value.trim(),
                sector: document.getElementById('companySector').value.trim(),
                email: document.getElementById('companyEmail').value.trim(),
                adminName: document.getElementById('companyAdminName').value.trim(),
                nit: document.getElementById('companyNit').value.trim(),
                plan: document.getElementById('companyPlan').value.trim(),
                durationDays: Number(document.getElementById('companyDays').value),
                maxUsers: Number(document.getElementById('companyMaxUsers').value),
                contrato: contractData()
            })
        });
        closeCompanyModal();
        document.getElementById('companyForm').reset();
        document.getElementById('contractModules').innerHTML = '';
        toggleContractFields();
        const fallo = data.correo?.enviado === false || data.documentos?.enviado === false;
        showMessage(`${data.message} Licencia: ${data.organization.licenseKey}`, fallo ? 'error' : 'success');
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

const modulesSummary = (organization) => {
    const total = state.modules.length || 10;
    const modules = organization.modules ? `${organization.modules.length} de ${total}` : 'Todos';
    return organization.fel ? `${modules}<br><small>+ FEL</small>` : modules;
};

async function openModules(id) {
    const organization = state.organizations.find(entry => String(entry.id) === String(id));
    if (!organization) return;
    try {
        if (!state.modules.length) state.modules = (await apiRequest('/modules')).modules;
    } catch (error) {
        showMessage(error.message, 'error');
        return;
    }
    state.editingId = id;
    const enabled = organization.modules || state.modules.map(module => module.key);
    document.getElementById('modulesTitle').textContent = `Módulos de ${organization.name}`;
    document.getElementById('modulesChecks').innerHTML = state.modules.map(module => `
        <label><input type="checkbox" value="${module.key}" ${enabled.includes(module.key) ? 'checked' : ''}> ${escapeHtml(module.label)}</label>
    `).join('');
    document.getElementById('modulesFel').checked = Boolean(organization.fel);
    document.getElementById('modulesModal').classList.remove('hidden');
}

function closeModules() {
    document.getElementById('modulesModal').classList.add('hidden');
    state.editingId = null;
}

async function saveModules(event) {
    event.preventDefault();
    const modules = [...document.querySelectorAll('#modulesChecks input:checked')].map(input => input.value);
    if (modules.length === 0 && !confirm('La empresa quedará solo con el Dashboard y la Configuración. ¿Continuar?')) return;
    try {
        const data = await apiRequest(`/organizations/${state.editingId}/modules`, {
            method: 'POST',
            body: JSON.stringify({ modules, fel: document.getElementById('modulesFel').checked })
        });
        closeModules();
        showMessage(data.message);
        await loadOrganizations();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

function closeCompanyModal() {
    document.getElementById('companyModal').classList.add('hidden');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
}
