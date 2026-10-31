const platformApi = '/api/platform';
const state = { organizations: [], modules: [], editingId: null, previewUrls: [], companyFilter: 'todas', licenseId: null };
const statusLabels = { trial: 'Prueba', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada' };

document.addEventListener('DOMContentLoaded', () => {
    const user = authManager.getUser();
    // Soporte dentro de una empresa: su sesión actual es la del cliente.
    if (user?.soporte && authManager.isAuthenticated()) {
        window.location.href = '/index.html';
        return;
    }
    if (!authManager.isAuthenticated() || authManager.isTokenExpired() || !user?.platformAdmin) {
        window.location.href = '/login.html';
        return;
    }

    document.getElementById('refreshButton').addEventListener('click', refreshData);
    document.getElementById('companySearch').addEventListener('input', renderOrganizations);
    document.querySelectorAll('#companyFilters button').forEach(button => {
        button.addEventListener('click', () => setCompanyFilter(button.dataset.filtro));
    });
    document.getElementById('licenseForm').addEventListener('submit', saveLicense);
    document.getElementById('addCompanyButton').addEventListener('click', () => {
        openModal('companyModal');
    });
    document.getElementById('companyContract').addEventListener('change', toggleContractFields);
    document.getElementById('previewBackButton').addEventListener('click', () => {
        closePreview();
        document.getElementById('companyModal').classList.remove('hidden');
    });
    document.getElementById('previewSendButton').addEventListener('click', createCompany);
    document.getElementById('cancelCompanyButton').addEventListener('click', closeCompanyModal);
    document.getElementById('cancelModulesButton').addEventListener('click', closeModules);
    document.getElementById('modulesForm').addEventListener('submit', saveModules);
    document.getElementById('modulesSelectAll').addEventListener('click', () => {
        document.querySelectorAll('#modulesChecks input').forEach(input => { input.checked = true; });
    });
    // Con contrato, primero se revisan los documentos; la empresa se crea desde la vista previa.
    document.getElementById('companyForm').addEventListener('submit', event => {
        event.preventDefault();
        return document.getElementById('companyContract').checked ? openPreview() : createCompany();
    });
    document.getElementById('logoutButton').addEventListener('click', async () => {
        await authManager.logout();
        window.location.href = '/login.html';
    });
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'El servidor no respondió como se esperaba; intenta de nuevo');
    return data;
};

const money = (value) => `Q${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => value ? new Date(value).toLocaleDateString('es-GT') : 'Sin fecha';

async function loadOrganizations() {
    try {
        if (!state.modules.length) state.modules = (await apiRequest('/modules'))?.modules || [];
        const data = await apiRequest('/organizations');
        if (!data) return;
        state.organizations = data.organizations;
        renderOrganizations();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

const expiresSoon = (organization) => ['trial', 'active'].includes(organization.status) && organization.daysRemaining <= 15;

const companyFilters = {
    todas: () => true,
    active: (organization) => organization.status === 'active',
    trial: (organization) => organization.status === 'trial',
    vence: expiresSoon,
    saldo: (organization) => organization.saldoPendiente > 0,
    suspended: (organization) => organization.status === 'suspended',
    cancelled: (organization) => organization.status === 'cancelled'
};

function setCompanyFilter(filter) {
    state.companyFilter = companyFilters[filter] ? filter : 'todas';
    document.querySelectorAll('#companyFilters button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.filtro === state.companyFilter));
    });
    renderOrganizations();
}

function renderOrganizations() {
    const body = document.getElementById('organizationsBody');
    const query = document.getElementById('companySearch').value.trim().toLowerCase();
    document.querySelectorAll('#companyFilters button').forEach(button => {
        const total = state.organizations.filter(companyFilters[button.dataset.filtro]).length;
        button.innerHTML = `${escapeHtml(button.textContent.replace(/\s*\d+$/, ''))}<span class="count">${total}</span>`;
    });
    const rows = state.organizations
        .filter(companyFilters[state.companyFilter])
        .filter(organization => !query || [organization.name, organization.email, organization.nit, organization.admin?.email]
            .some(value => String(value || '').toLowerCase().includes(query)));
    if (!state.organizations.length) {
        body.innerHTML = '<tr><td colspan="8">Aún no hay empresas. Usa «Agregar empresa» para crear la primera.</td></tr>';
        return;
    }
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8">Ninguna empresa coincide con la búsqueda o el filtro.</td></tr>';
        return;
    }
    body.innerHTML = rows.map((organization) => `
        <tr>
            <td><button class="row-link" type="button" data-action="ficha" data-id="${organization.id}">${escapeHtml(organization.name)}</button><br><small>${escapeHtml(organization.email || 'Sin correo')}</small><br>${mailState(organization)}</td>
            <td><span class="status ${organization.status}">${escapeHtml(statusLabels[organization.status] || organization.status)}</span><br><small>${organization.daysRemaining} días</small></td>
            <td><span class="key">${escapeHtml(organization.licenseKey || 'Sin licencia')}</span><br><small>${escapeHtml(organization.plan || '')} · ${modulesSummary(organization)}</small></td>
            <td class="${organization.activeUsers >= organization.maxUsers ? 'users-full' : ''}">${organization.activeUsers} / ${organization.maxUsers}</td>
            <td class="num">${organization.cuotaMensual ? money(organization.cuotaMensual) : '<small>Sin cuota</small>'}</td>
            <td class="num ${organization.saldoVencido > 0 ? 'owes' : ''}">${organization.saldoPendiente ? money(organization.saldoPendiente) : '—'}${organization.saldoVencido > 0 ? '<br><small>vencido</small>' : ''}</td>
            <td>${formatDate(organization.status === 'trial' ? organization.trialEndsAt : organization.subscriptionEndsAt)}</td>
            <td class="actions">
                <button class="secondary" type="button" data-action="ficha" data-id="${organization.id}">Ficha</button>
                ${dadaDeBaja(organization) ? '' : `<button class="secondary" type="button" data-action="entrar" data-id="${organization.id}" title="Ver el ERP como lo ve el cliente"><i class="fas fa-eye" aria-hidden="true"></i> Entrar</button>`}
            </td>
        </tr>
    `).join('');
    body.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', () => button.dataset.action === 'entrar'
            ? openEnter(button.dataset.id)
            : openDrawer(button.dataset.id));
    });
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
        await refreshData();
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
        await refreshData();
    } catch (error) {
        showMessage(error.message, 'error');
        button.disabled = false;
    }
}

// Activa la licencia (plan, vigencia y usuarios), con o sin clave nueva.
function openLicense(id, { newKey = false } = {}) {
    const organization = state.organizations.find(entry => String(entry.id) === String(id));
    if (!organization) return;
    state.licenseId = id;
    document.getElementById('licenseTitle').textContent = `Licencia de ${organization.name}`;
    document.getElementById('licensePlan').value = organization.plan && !['Demo', 'Trial', 'Suspendida'].includes(organization.plan) ? organization.plan : 'Pro';
    document.getElementById('licenseDays').value = 365;
    document.getElementById('licenseUsers').value = organization.maxUsers || 3;
    document.getElementById('licenseNewKey').checked = newKey || !organization.licenseKey;
    openModal('licenseModal');
}

async function saveLicense(event) {
    event.preventDefault();
    try {
        const data = await apiRequest(`/organizations/${state.licenseId}/license`, {
            method: 'POST',
            body: JSON.stringify({
                status: 'active',
                plan: document.getElementById('licensePlan').value.trim(),
                durationDays: Number(document.getElementById('licenseDays').value),
                maxUsers: Number(document.getElementById('licenseUsers').value),
                generateNewKey: document.getElementById('licenseNewKey').checked
            })
        });
        closeModal('licenseModal');
        showMessage(data.message);
        await refreshData();
    } catch (error) {
        alert(error.message);
    }
}

async function suspendOrganization(id, button) {
    const organization = state.organizations.find(entry => String(entry.id) === String(id));
    if (!organization || !confirm(`¿Suspender ${organization.name}? Sus usuarios dejarán de poder entrar hasta que actives la licencia otra vez. Los datos se conservan.`)) return;
    button.disabled = true;
    try {
        const data = await apiRequest(`/organizations/${id}/license`, {
            method: 'POST',
            body: JSON.stringify({ status: 'suspended', plan: 'Suspendida', durationDays: 1, generateNewKey: false })
        });
        showMessage(data.message);
        await refreshData();
    } catch (error) {
        showMessage(error.message, 'error');
        button.disabled = false;
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
    document.getElementById('saveCompanyButton').textContent = enabled ? 'Revisar documentos' : 'Guardar empresa';
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

const companyData = () => ({
    name: document.getElementById('companyName').value.trim(),
    sector: document.getElementById('companySector').value.trim(),
    email: document.getElementById('companyEmail').value.trim(),
    adminName: document.getElementById('companyAdminName').value.trim(),
    nit: document.getElementById('companyNit').value.trim(),
    plan: document.getElementById('companyPlan').value.trim(),
    durationDays: Number(document.getElementById('companyDays').value),
    maxUsers: Number(document.getElementById('companyMaxUsers').value),
    contrato: contractData()
});

const pdfTitles = { COT: 'Propuesta', CTR: 'Contrato', ANX: 'Anexo A', ACT: 'Acta de entrega' };

// Genera en el servidor el correo y los PDF con los datos del formulario, sin crear ni enviar nada.
async function openPreview() {
    const button = document.getElementById('saveCompanyButton');
    button.disabled = true;
    button.textContent = 'Generando documentos...';
    try {
        const data = await apiRequest('/contratos/vista-previa', { method: 'POST', body: JSON.stringify(companyData()) });
        releasePreviewUrls();
        const tabs = [{ label: 'Correo', email: data.correo }, ...data.documentos.map(documento => {
            const bytes = Uint8Array.from(atob(documento.pdf), char => char.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            state.previewUrls.push(url);
            const code = documento.nombre.replace(/\.pdf$/, '').split('-').pop();
            return { label: pdfTitles[code] || code, nombre: documento.nombre, url };
        })];
        document.getElementById('previewHint').textContent = `Número ${data.numero}: se confirma al crear la empresa (cambia si otra empresa con contrato se crea antes). Nada se ha enviado todavía.`;
        document.getElementById('previewTabs').innerHTML = tabs.map((tab, index) =>
            `<button type="button" role="tab" data-index="${index}">${escapeHtml(tab.label)}</button>`).join('');
        document.querySelectorAll('#previewTabs button').forEach(tabButton => {
            tabButton.addEventListener('click', () => showPreviewTab(tabs, Number(tabButton.dataset.index)));
        });
        showPreviewTab(tabs, 0);
        closeCompanyModal();
        document.getElementById('previewSendButton').disabled = false;
        document.getElementById('previewModal').classList.remove('hidden');
    } catch (error) {
        showMessage(error.message, 'error');
        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Revisar documentos';
    }
}

function showPreviewTab(tabs, index) {
    const tab = tabs[index];
    const frame = document.getElementById('previewFrame');
    document.querySelectorAll('#previewTabs button').forEach(button => {
        button.setAttribute('aria-selected', String(Number(button.dataset.index) === index));
    });
    const meta = document.getElementById('previewMeta');
    const download = document.getElementById('previewDownload');
    if (tab.email) {
        meta.innerHTML = `Para: <strong>${escapeHtml(tab.email.para)}</strong> · Asunto: <strong>${escapeHtml(tab.email.asunto)}</strong> · 4 PDF adjuntos`;
        download.innerHTML = '';
        // El correo se muestra aislado: sin scripts ni acceso a esta página.
        frame.setAttribute('sandbox', '');
        frame.srcdoc = tab.email.html;
    } else {
        meta.innerHTML = `Adjunto: <strong>${escapeHtml(tab.nombre)}</strong>`;
        download.innerHTML = `<a href="${tab.url}" download="${escapeHtml(tab.nombre)}">Descargar ${escapeHtml(tab.nombre)}</a> · si no se ve aquí, ábrelo descargado.`;
        // El visor de PDF del navegador no carga dentro de un iframe con sandbox.
        frame.removeAttribute('sandbox');
        frame.removeAttribute('srcdoc');
        frame.src = tab.url;
    }
}

function releasePreviewUrls() {
    state.previewUrls.forEach(url => URL.revokeObjectURL(url));
    state.previewUrls = [];
}

function closePreview() {
    document.getElementById('previewModal').classList.add('hidden');
    const frame = document.getElementById('previewFrame');
    frame.removeAttribute('srcdoc');
    frame.src = 'about:blank';
}

async function createCompany() {
    const sendButton = document.getElementById('previewSendButton');
    sendButton.disabled = true;
    try {
        const data = await apiRequest('/organizations', { method: 'POST', body: JSON.stringify(companyData()) });
        closePreview();
        releasePreviewUrls();
        closeCompanyModal();
        document.getElementById('companyForm').reset();
        document.getElementById('contractModules').innerHTML = '';
        toggleContractFields();
        const fallo = data.correo?.enviado === false || data.documentos?.enviado === false;
        showMessage(`${data.message} Licencia: ${data.organization.licenseKey}`, fallo ? 'error' : 'success');
        await refreshData();
    } catch (error) {
        showMessage(error.message, 'error');
        sendButton.disabled = false;
        // Si falló desde la vista previa, el mensaje de la página queda tapado.
        if (!document.getElementById('previewModal').classList.contains('hidden')) alert(error.message);
    }
}

const modulesSummary = (organization) => {
    const total = state.modules.length || 10;
    const modules = organization.modules ? `${organization.modules.length} de ${total}` : 'todos los';
    return organization.fel ? `${modules} módulos + FEL` : `${modules} módulos`;
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
        await refreshData();
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
