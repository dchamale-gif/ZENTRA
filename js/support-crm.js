// Panel de soporte como CRM: inicio con indicadores, facturas a clientes, ficha de cada
// empresa (datos, licencia, usuarios, facturas, notas) y entrada al ERP como el cliente.
// Usa apiRequest, showMessage, escapeHtml, money y state de support.js.

const crm = {
    view: 'inicio',
    invoiceFilter: 'pendiente',
    drawerId: null,
    drawerTab: 'general',
    ficha: null,
    paymentId: null,
    enterId: null,
    lastFocus: null
};
const invoiceLabels = { pendiente: 'Pendiente', vencida: 'Vencida', pagada: 'Pagada', anulada: 'Anulada' };
const roleLabels = { admin: 'Administrador', usuario: 'Usuario' };

document.addEventListener('DOMContentLoaded', () => {
    if (!authManager.getUser()?.platformAdmin) return;

    document.querySelectorAll('.views button').forEach(button => {
        button.addEventListener('click', () => showView(button.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.estado) setInvoiceFilter(button.dataset.estado);
            if (button.dataset.filtro) setCompanyFilter(button.dataset.filtro);
            showView(button.dataset.goto);
        });
    });
    document.querySelectorAll('#invoiceFilters button').forEach(button => {
        button.addEventListener('click', () => { setInvoiceFilter(button.dataset.estado); loadInvoices(); });
    });
    document.querySelectorAll('.modal [data-close]').forEach(button => {
        button.addEventListener('click', () => closeModal(button.closest('.modal').id));
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
        if (open) closeModal(open.id);
        else if (!document.getElementById('drawer').hidden) closeDrawer();
    });

    document.getElementById('newInvoiceButton').addEventListener('click', () => openInvoice());
    document.getElementById('monthlyButton').addEventListener('click', openMonthly);
    document.getElementById('invoiceForm').addEventListener('submit', saveInvoice);
    document.getElementById('invoiceAddItem').addEventListener('click', () => addInvoiceItem());
    document.getElementById('invoiceSend').addEventListener('change', event => {
        document.getElementById('invoiceToGroup').hidden = !event.target.checked;
    });
    document.getElementById('invoiceCompany').addEventListener('change', fillInvoiceDefaults);
    document.getElementById('monthlyForm').addEventListener('submit', saveMonthly);
    document.getElementById('erpForm').addEventListener('submit', saveActivarErp);
    document.getElementById('movimientosForm').addEventListener('submit', saveMovimientos);
    document.getElementById('movimientosDesde').addEventListener('change', previewMovimientos);
    document.getElementById('paymentForm').addEventListener('submit', savePayment);

    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    document.getElementById('drawer').addEventListener('click', event => {
        if (event.target.id === 'drawer') closeDrawer();
    });
    document.getElementById('drawerEnter').addEventListener('click', () => openEnter(crm.drawerId));
    document.querySelectorAll('#drawerTabs button').forEach(button => {
        button.addEventListener('click', () => { crm.drawerTab = button.dataset.tab; renderDrawer(); });
    });
    document.getElementById('enterForm').addEventListener('submit', enterCompany);
    document.getElementById('userForm').addEventListener('submit', saveUser);
    document.getElementById('userRole').addEventListener('change', toggleUserModules);
    document.getElementById('credentialsCopy').addEventListener('click', copyCredentials);

    // Primero las empresas: el inicio y los formularios las usan.
    const initial = (window.location.hash || '').slice(1);
    setView(['inicio', 'empresas', 'facturas', 'sitio', 'automatizaciones', 'equipo'].includes(initial) ? initial : 'inicio');
    refreshData();
});

// ---------- Navegación, modales y utilidades ----------

function showView(view) {
    setView(view);
    if (view === 'inicio') loadSummary();
    if (view === 'facturas') loadInvoices();
    if (view === 'automatizaciones') cargarAutomatizaciones();
    if (view === 'equipo') cargarEquipo();
}

function setView(view) {
    crm.view = view;
    document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
    document.querySelectorAll('.views button').forEach(button => {
        if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    history.replaceState(null, '', `#${view}`);
}

async function refreshData() {
    await loadOrganizations();
    if (crm.view === 'inicio') await loadSummary();
    if (crm.view === 'facturas') await loadInvoices();
    if (crm.drawerId) await loadFicha();
}

function openModal(id) {
    crm.lastFocus = document.activeElement;
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    modal.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, button.primary')?.focus();
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (id === 'modulesModal') state.editingId = null;
    crm.lastFocus?.focus?.();
}

// Fechas 'YYYY-MM-DD' sin correrlas por la zona horaria.
const formatDueDate = (value) => {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
};
const formatDateTime = (value) => value ? new Date(value).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const todayInput = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
const addDaysInput = (date, days) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};
const nextMonthInput = () => {
    const [year, month] = todayInput().split('-').map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
};
const organizationById = (id) => state.organizations.find(entry => String(entry.id) === String(id));

async function withButton(button, task) {
    if (button) button.disabled = true;
    try {
        return await task();
    } finally {
        if (button) button.disabled = false;
    }
}

// ---------- Inicio ----------

async function loadSummary() {
    try {
        const [{ resumen }, { facturas }] = await Promise.all([apiRequest('/resumen'), apiRequest('/facturas?estado=vencida')]);
        const tile = (label, value, sub, tone = '') => `
            <div class="card stat ${tone}"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
        document.getElementById('kpis').innerHTML = [
            tile('Ingreso mensual', money(resumen.ingresoMensual), resumen.activasSinCuota
                ? `${resumen.activasSinCuota} activa${resumen.activasSinCuota === 1 ? '' : 's'} sin cuota` : 'Cuotas de empresas activas'),
            tile('Pendiente de cobro', money(resumen.pendiente), `${resumen.facturasPendientes} factura${resumen.facturasPendientes === 1 ? '' : 's'}${resumen.comprobantesPorRevisar ? ` · ${resumen.comprobantesPorRevisar} comprobante${resumen.comprobantesPorRevisar === 1 ? '' : 's'} por revisar` : ''}`, resumen.comprobantesPorRevisar ? 'is-danger' : ''),
            tile('Vencido', money(resumen.vencido), `${resumen.facturasVencidas} factura${resumen.facturasVencidas === 1 ? '' : 's'}`, resumen.vencido > 0 ? 'is-danger' : ''),
            tile('Cobrado este mes', money(resumen.cobradoMes), '', 'is-good'),
            tile('Empresas activas', resumen.activas, `${resumen.enPrueba} en prueba · ${resumen.suspendidas} suspendidas${resumen.sinErp ? ` · ${resumen.sinErp} cliente${resumen.sinErp === 1 ? '' : 's'} sin ERP` : ''}`),
            tile('Por vencer', resumen.porVencer, 'Licencias o pruebas en 15 días', resumen.porVencer > 0 ? 'is-danger' : '')
        ].join('');

        document.getElementById('overdueList').innerHTML = facturas.length
            ? `<ul class="mini-list">${facturas.slice(0, 8).map(factura => `
                <li><span><button class="row-link" type="button" data-ficha="${factura.organizationId}">${escapeHtml(factura.empresa)}</button><small>${escapeHtml(factura.numero)} · venció ${formatDueDate(factura.fechaVencimiento)}</small></span>
                <span class="owes">${money(factura.total)}</span></li>`).join('')}</ul>`
            : '<p class="empty-note">Ningún cobro vencido.</p>';

        const expiring = state.organizations.filter(expiresSoon);
        document.getElementById('expiringList').innerHTML = expiring.length
            ? `<ul class="mini-list">${expiring.slice(0, 8).map(organization => `
                <li><span><button class="row-link" type="button" data-ficha="${organization.id}">${escapeHtml(organization.name)}</button><small>${escapeHtml(statusLabel(organization))} · vence ${formatDate(organization.status === 'trial' ? organization.trialEndsAt : organization.subscriptionEndsAt)}</small></span>
                <span>${organization.daysRemaining} días</span></li>`).join('')}</ul>`
            : '<p class="empty-note">Ninguna licencia vence en los próximos 15 días.</p>';
        document.querySelectorAll('#view-inicio [data-ficha]').forEach(button => {
            button.addEventListener('click', () => openDrawer(button.dataset.ficha));
        });
    } catch (error) {
        document.getElementById('kpis').innerHTML = `<div class="card empty-note">${escapeHtml(error.message)}</div>`;
    }
}

// ---------- Facturas ----------

function setInvoiceFilter(estado) {
    crm.invoiceFilter = estado;
    document.querySelectorAll('#invoiceFilters button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.estado === estado));
    });
}

const conceptOf = (factura) => factura.items.map(item => item.descripcion).join(' · ');

const invoiceActions = (factura) => [
    factura.comprobantes?.length ? `<button class="${factura.comprobantesPorRevisar ? 'primary' : 'secondary'}" type="button" data-invoice="comprobantes" data-id="${factura.id}"><i class="fas fa-receipt" aria-hidden="true"></i> ${factura.comprobantesPorRevisar ? 'Revisar comprobante' : `Comprobantes (${factura.comprobantes.length})`}</button>` : '',
    `<button class="secondary" type="button" data-invoice="pdf" data-id="${factura.id}" title="Ver PDF"><i class="fas fa-file-pdf" aria-hidden="true"></i> PDF</button>`,
    factura.estado !== 'anulada' ? `<button class="secondary" type="button" data-invoice="enviar" data-id="${factura.id}">${factura.estado === 'vencida' ? 'Recordar pago' : (factura.enviadaEn ? 'Reenviar' : 'Enviar')}</button>` : '',
    ['pendiente', 'vencida'].includes(factura.estado) ? `<button class="primary" type="button" data-invoice="pago" data-id="${factura.id}">Registrar pago</button>` : '',
    ['pendiente', 'vencida'].includes(factura.estado) ? `<button class="danger" type="button" data-invoice="anular" data-id="${factura.id}">Anular</button>` : ''
].join('');

// Comprobante de transferencia que subió el cliente y espera revisión.
const voucherBadge = (factura) => {
    if (factura.comprobantesPorRevisar) return `<br><span class="status revisar">Comprobante por revisar</span>`;
    const ultimo = factura.comprobantes?.[0];
    return ultimo?.estado === 'rechazado' && factura.estado !== 'pagada' ? '<br><small>Comprobante rechazado</small>' : '';
};

const invoiceStatus = (factura) => `<span class="status ${factura.estado}">${invoiceLabels[factura.estado]}</span>${voucherBadge(factura)}${
    factura.estado === 'pagada' ? `<br><small>${formatDueDate(factura.pagadaEn)}${factura.referenciaPago ? ` · ${escapeHtml(factura.referenciaPago)}` : ''}</small>`
        : factura.enviadaEn ? `<br><small>Enviada ${formatDateTime(factura.enviadaEn)}</small>` : '<br><small>Sin enviar</small>'}`;

async function loadInvoices() {
    const body = document.getElementById('invoicesBody');
    try {
        const { facturas } = await apiRequest(`/facturas${crm.invoiceFilter ? `?estado=${crm.invoiceFilter}` : ''}`);
        recordarFacturas(facturas);
        if (!facturas.length) {
            body.innerHTML = `<tr><td colspan="8">${crm.invoiceFilter ? `No hay facturas ${invoiceLabels[crm.invoiceFilter].toLowerCase()}s.` : 'Aún no hay facturas. Crea una o genera las mensualidades del mes.'}</td></tr>`;
            return;
        }
        body.innerHTML = facturas.map(factura => `
            <tr>
                <td class="key">${escapeHtml(factura.numero)}</td>
                <td><button class="row-link" type="button" data-ficha="${factura.organizationId}">${escapeHtml(factura.empresa)}</button></td>
                <td>${escapeHtml(conceptOf(factura))}</td>
                <td class="num">${money(factura.total)}</td>
                <td>${formatDueDate(factura.fechaEmision)}</td>
                <td>${formatDueDate(factura.fechaVencimiento)}</td>
                <td>${invoiceStatus(factura)}</td>
                <td class="actions">${invoiceActions(factura)}</td>
            </tr>`).join('');
        bindInvoiceButtons(body);
        body.querySelectorAll('[data-ficha]').forEach(button => button.addEventListener('click', () => openDrawer(button.dataset.ficha)));
    } catch (error) {
        body.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
    }
}

function bindInvoiceButtons(container) {
    container.querySelectorAll('button[data-invoice]').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.dataset.id;
            if (button.dataset.invoice === 'pdf') return openInvoicePdf(id, button);
            if (button.dataset.invoice === 'enviar') return sendInvoice(id, button);
            if (button.dataset.invoice === 'pago') return openPayment(id);
            if (button.dataset.invoice === 'comprobantes') return openVouchers(id);
            return voidInvoice(id, button);
        });
    });
}

// Facturas vistas por última vez (lista o ficha), para abrir sus comprobantes.
const facturasPorId = new Map();
const recordarFacturas = (facturas) => facturas.forEach((factura) => facturasPorId.set(String(factura.id), factura));

const voucherLabels = { pendiente: 'Por revisar', aceptado: 'Aceptado', rechazado: 'Rechazado' };

function openVouchers(id) {
    const factura = facturasPorId.get(String(id));
    if (!factura) return;
    crm.voucherInvoiceId = String(id);
    document.getElementById('vouchersTitle').textContent = `Comprobantes de ${factura.numero} · ${money(factura.total)}`;
    const revisable = ['pendiente', 'vencida'].includes(factura.estado);
    document.getElementById('vouchersList').innerHTML = factura.comprobantes.map((c) => `
        <li>
            <div class="voucher-head">
                <strong>${c.referencia ? `Referencia ${escapeHtml(c.referencia)}` : 'Sin referencia'}</strong>
                <span class="status ${c.estado === 'pendiente' ? 'revisar' : c.estado === 'aceptado' ? 'pagada' : 'anulada'}">${voucherLabels[c.estado]}</span>
            </div>
            <p>${c.fechaPago ? `Pagó el ${formatDueDate(c.fechaPago)} · ` : ''}Subido por ${escapeHtml(c.subidoPor || 'el cliente')} el ${formatDateTime(c.subidoAt)}${c.nota ? ` · ${escapeHtml(c.nota)}` : ''}</p>
            ${c.motivoRechazo ? `<p>Motivo del rechazo: ${escapeHtml(c.motivoRechazo)}</p>` : ''}
            <div class="section-actions">
                <button class="secondary" type="button" data-voucher="ver" data-id="${c.id}"><i class="fas fa-eye" aria-hidden="true"></i> Ver ${c.mime === 'application/pdf' ? 'PDF' : 'foto'}</button>
                ${c.estado === 'pendiente' && revisable ? `
                <button class="primary" type="button" data-voucher="aceptar" data-id="${c.id}"><i class="fas fa-check" aria-hidden="true"></i> Aceptar: factura pagada</button>
                <button class="danger" type="button" data-voucher="rechazar" data-id="${c.id}">Rechazar</button>` : ''}
            </div>
        </li>`).join('');
    document.querySelectorAll('#vouchersList button[data-voucher]').forEach((button) => {
        button.addEventListener('click', () => voucherAction(button.dataset.voucher, button.dataset.id, button));
    });
    openModal('vouchersModal');
}

async function voucherAction(accion, id, button) {
    if (accion === 'ver') return openBlob(`${platformApi}/comprobantes/${id}/archivo`, button, 'No se pudo abrir el comprobante');
    let body = {};
    if (accion === 'aceptar') {
        if (!confirm('¿Confirmas que la transferencia está en la cuenta? La factura quedará pagada.')) return null;
    } else {
        const motivo = prompt('¿Por qué rechazas el comprobante? El cliente verá este motivo.', 'No aparece en la cuenta');
        if (motivo === null) return null;
        if (!motivo.trim()) return alert('Escribe el motivo del rechazo.');
        body = { motivo: motivo.trim() };
    }
    return withButton(button, async () => {
        try {
            const data = await apiRequest(`/comprobantes/${id}/${accion}`, { method: 'POST', body: JSON.stringify(body) });
            closeModal('vouchersModal');
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

// Archivo pedido con la sesión y abierto en otra pestaña (PDF de factura o comprobante).
async function openBlob(url, button, errorMessage) {
    const tab = window.open('', '_blank');
    await withButton(button, async () => {
        const response = await authManager.fetchWithAuth(url);
        if (!response) return;
        if (!response.ok) {
            tab?.close();
            const data = await response.json().catch(() => ({}));
            showMessage(data.error || errorMessage, 'error');
            return;
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        if (tab) tab.location.href = blobUrl;
        else window.location.href = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    });
}

// El PDF se pide con la sesión (cookie) y se abre en otra pestaña.
async function openInvoicePdf(id, button) {
    const tab = window.open('', '_blank');
    await withButton(button, async () => {
        const response = await authManager.fetchWithAuth(`${platformApi}/facturas/${id}/pdf`);
        if (!response) return;
        if (!response.ok) {
            tab?.close();
            const data = await response.json().catch(() => ({}));
            showMessage(data.error || 'No se pudo generar el PDF', 'error');
            return;
        }
        const url = URL.createObjectURL(await response.blob());
        if (tab) tab.location.href = url;
        else window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
}

async function sendInvoice(id, button) {
    const para = prompt('Enviar la factura a (deja vacío para usar el correo de la empresa):', '');
    if (para === null) return;
    await withButton(button, async () => {
        try {
            const data = await apiRequest(`/facturas/${id}/enviar`, { method: 'POST', body: JSON.stringify({ para: para.trim() || undefined }) });
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });
}

async function voidInvoice(id, button) {
    if (!confirm('¿Anular esta factura? Deja de contar como pendiente y no se puede revertir. Si era una mensualidad, podrás crear otra para ese mes.')) return;
    await withButton(button, async () => {
        try {
            const data = await apiRequest(`/facturas/${id}/anular`, { method: 'POST', body: '{}' });
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });
}

function openPayment(id) {
    crm.paymentId = id;
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentDate').value = todayInput();
    openModal('paymentModal');
}

async function savePayment(event) {
    event.preventDefault();
    try {
        const data = await apiRequest(`/facturas/${crm.paymentId}/pago`, {
            method: 'POST',
            body: JSON.stringify({
                metodo: document.getElementById('paymentMethod').value,
                fecha: document.getElementById('paymentDate').value,
                referencia: document.getElementById('paymentRef').value.trim()
            })
        });
        closeModal('paymentModal');
        showMessage(data.message);
        await refreshData();
    } catch (error) {
        alert(error.message);
    }
}

function addInvoiceItem(item = {}) {
    const row = document.createElement('div');
    row.className = 'invoice-item';
    row.innerHTML = `
        <input aria-label="Descripción" placeholder="Descripción" maxlength="200" required data-field="descripcion">
        <input aria-label="Cantidad" type="number" min="0.01" step="any" value="1" required data-field="cantidad">
        <input aria-label="Precio con IVA" type="number" min="0.01" step="0.01" placeholder="Precio" required data-field="precio">
        <button class="icon" type="button" aria-label="Quitar concepto" title="Quitar concepto"><i class="fas fa-trash" aria-hidden="true"></i></button>`;
    row.querySelector('[data-field="descripcion"]').value = item.descripcion || '';
    if (item.cantidad) row.querySelector('[data-field="cantidad"]').value = item.cantidad;
    if (item.precio) row.querySelector('[data-field="precio"]').value = item.precio;
    row.querySelector('button').addEventListener('click', () => {
        if (document.querySelectorAll('#invoiceItems .invoice-item').length > 1) row.remove();
        updateInvoiceTotal();
    });
    row.addEventListener('input', updateInvoiceTotal);
    document.getElementById('invoiceItems').appendChild(row);
    updateInvoiceTotal();
}

const invoiceItems = () => [...document.querySelectorAll('#invoiceItems .invoice-item')].map(row => ({
    descripcion: row.querySelector('[data-field="descripcion"]').value.trim(),
    cantidad: Number(row.querySelector('[data-field="cantidad"]').value),
    precio: Number(row.querySelector('[data-field="precio"]').value)
}));

function updateInvoiceTotal() {
    const total = invoiceItems().reduce((sum, item) => sum + (item.cantidad || 0) * (item.precio || 0), 0);
    document.getElementById('invoiceTotal').textContent = money(total);
}

// Con una empresa elegida, propone su cuota mensual y su correo.
function fillInvoiceDefaults() {
    const organization = organizationById(document.getElementById('invoiceCompany').value);
    document.getElementById('invoiceTo').placeholder = organization?.email || 'correo@empresa.com';
    const rows = document.querySelectorAll('#invoiceItems .invoice-item');
    const first = rows[0];
    if (rows.length === 1 && organization?.cuotaMensual && !first.querySelector('[data-field="precio"]').value) {
        const month = nextMonthInput();
        const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
        first.querySelector('[data-field="descripcion"]').value = `Licencia de uso BotEngine ERP · ${label}`;
        first.querySelector('[data-field="precio"]').value = organization.cuotaMensual;
        document.getElementById('invoicePeriod').value = month;
        updateInvoiceTotal();
    }
}

function openInvoice(organizationId) {
    document.getElementById('invoiceForm').reset();
    document.getElementById('invoiceItems').innerHTML = '';
    document.getElementById('invoiceToGroup').hidden = false;
    const select = document.getElementById('invoiceCompany');
    const options = state.organizations.filter(organization => organization.status !== 'cancelled' || String(organization.id) === String(organizationId));
    select.innerHTML = '<option value="">Elige una empresa</option>' + options
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(organization => `<option value="${organization.id}">${escapeHtml(organization.name)}</option>`).join('');
    if (organizationId) select.value = organizationId;
    document.getElementById('invoiceDue').value = addDaysInput(todayInput(), 10);
    addInvoiceItem();
    fillInvoiceDefaults();
    openModal('invoiceModal');
}

async function saveInvoice(event) {
    event.preventDefault();
    const button = document.getElementById('invoiceSubmit');
    const send = document.getElementById('invoiceSend').checked;
    await withButton(button, async () => {
        try {
            const data = await apiRequest('/facturas', {
                method: 'POST',
                body: JSON.stringify({
                    organizationId: Number(document.getElementById('invoiceCompany').value),
                    items: invoiceItems(),
                    fechaVencimiento: document.getElementById('invoiceDue').value,
                    periodo: document.getElementById('invoicePeriod').value || undefined,
                    enviar: send,
                    para: send ? document.getElementById('invoiceTo').value.trim() || undefined : undefined
                })
            });
            closeModal('invoiceModal');
            showMessage(data.message, data.envio?.enviado === false ? 'error' : 'success');
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

function openMonthly() {
    const pending = state.organizations.filter(organization => organization.status === 'active' && !organization.cuotaMensual);
    document.getElementById('monthlyHint').textContent = 'Crea la factura de cada empresa activa con cobro ese mes: las mensuales y las anuales cuyo mes de cobro sea ese.' +
        (pending.length ? ` ${pending.length} empresa${pending.length === 1 ? '' : 's'} activa${pending.length === 1 ? '' : 's'} sin cuota quedará${pending.length === 1 ? '' : 'n'} fuera (${pending.map(organization => organization.name).join(', ')}); ponle la cuota en su ficha.` : '');
    document.getElementById('monthlyPeriod').value = nextMonthInput();
    openModal('monthlyModal');
}

async function saveMonthly(event) {
    event.preventDefault();
    await withButton(document.getElementById('monthlySubmit'), async () => {
        try {
            const data = await apiRequest('/facturas/mensualidades', {
                method: 'POST',
                body: JSON.stringify({
                    periodo: document.getElementById('monthlyPeriod').value,
                    diasCredito: Number(document.getElementById('monthlyDays').value),
                    enviar: document.getElementById('monthlySend').checked
                })
            });
            closeModal('monthlyModal');
            showMessage(data.message, data.fallidas?.length ? 'error' : 'success');
            setInvoiceFilter('pendiente');
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

// ---------- Ficha de la empresa ----------

async function openDrawer(id) {
    crm.lastFocus = document.activeElement;
    crm.drawerId = id;
    crm.drawerTab = 'general';
    crm.ficha = null;
    const organization = organizationById(id);
    document.getElementById('drawerTitle').textContent = organization?.name || 'Empresa';
    document.getElementById('drawerSub').textContent = '';
    document.getElementById('drawerBody').innerHTML = '<p class="empty-note">Cargando ficha...</p>';
    document.getElementById('drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('drawerClose').focus();
    await loadFicha();
}

function closeDrawer() {
    document.getElementById('drawer').hidden = true;
    document.body.style.overflow = '';
    crm.drawerId = null;
    crm.ficha = null;
    crm.lastFocus?.focus?.();
}

async function loadFicha() {
    try {
        crm.ficha = await apiRequest(`/organizations/${crm.drawerId}/ficha`);
        renderDrawer();
    } catch (error) {
        document.getElementById('drawerBody').innerHTML = `<p class="empty-note">${escapeHtml(error.message)}</p>`;
    }
}

function renderDrawer() {
    const ficha = crm.ficha;
    // Sin ERP no hay usuarios ni forma de entrar como el cliente.
    const conErp = ficha?.empresa.usaErp !== false;
    if (!conErp && crm.drawerTab === 'usuarios') crm.drawerTab = 'general';
    document.querySelectorAll('#drawerTabs button').forEach(button => {
        button.setAttribute('aria-selected', String(button.dataset.tab === crm.drawerTab));
        if (button.dataset.tab === 'usuarios') button.hidden = !conErp;
    });
    if (!ficha) return;
    const empresa = ficha.empresa;
    const organization = organizationById(empresa.id) || {};
    document.getElementById('drawerTitle').textContent = empresa.nombre;
    document.getElementById('drawerSub').innerHTML = `<span class="status ${empresa.estado}">${escapeHtml(statusLabel({ status: empresa.estado, usaErp: empresa.usaErp }))}</span>${conErp ? '' : ' <span class="kind-tag">Sin ERP</span>'} · ${escapeHtml(empresa.sector || 'Sin sector')} · cliente desde ${formatDate(empresa.creada)}`;
    document.getElementById('drawerEnter').hidden = !conErp || dadaDeBaja(organization);
    const body = document.getElementById('drawerBody');
    const render = { general: drawerGeneral, usuarios: drawerUsers, facturas: drawerInvoices, notas: drawerNotes, actividad: drawerActivity }[crm.drawerTab];
    body.innerHTML = render(ficha, organization);
    bindDrawer(body, ficha, organization);
}

// Cliente de otros servicios: lo que contrata, su cuota y lo que debe.
function clientSummary(empresa, organization) {
    const activo = empresa.estado === 'active';
    return `
        <h3>Servicios</h3>
        <dl class="facts">
            <div><dt>Contrata</dt><dd>${escapeHtml(empresa.servicios || 'Sin detallar')}</dd></div>
            <div><dt>${empresa.periodicidad === 'anual' ? 'Cuota anual' : 'Cuota mensual'}</dt><dd>${empresa.cuotaMensual ? money(empresa.cuotaMensual) : 'Sin cuota'}</dd></div>
            <div><dt>Saldo pendiente</dt><dd class="${organization.saldoVencido > 0 ? 'owes' : ''}">${money(organization.saldoPendiente)}</dd></div>
        </dl>
        <p class="modal-hint">No usa BotEngine ERP: aquí llevas sus facturas, cobros y notas.${activo ? '' : ' Está inactivo: no entra en las mensualidades.'}</p>
        <div class="section-actions">
            <button class="primary" type="button" data-drawer="activarerp">Activar BotEngine ERP</button>
            <button class="secondary" type="button" data-drawer="${activo ? 'inactivar' : 'reactivar'}">${activo ? 'Marcar inactivo' : 'Marcar activo'}</button>
            <button class="danger" type="button" data-drawer="eliminar">Eliminar cliente</button>
        </div>`;
}

function drawerGeneral(ficha, organization) {
    const empresa = ficha.empresa;
    if (empresa.usaErp === false) return clientSummary(empresa, organization) + companyDataForm(empresa);
    const vence = empresa.estado === 'trial' ? empresa.pruebaHasta : empresa.suscripcionHasta;
    const baja = dadaDeBaja(organization);
    return `
        <h3>Licencia</h3>
        <dl class="facts">
            <div><dt>Plan</dt><dd>${escapeHtml(empresa.plan || '—')}</dd></div>
            <div><dt>Clave</dt><dd class="key">${escapeHtml(empresa.licencia || 'Sin licencia')}</dd></div>
            <div><dt>Vence</dt><dd>${formatDate(vence)} (${organization.daysRemaining ?? 0} días)</dd></div>
            <div><dt>Usuarios activos</dt><dd>${organization.activeUsers ?? 0} de ${empresa.maxUsuarios}</dd></div>
            <div><dt>Módulos</dt><dd>${modulesSummary(organization)}</dd></div>
            <div><dt>Saldo pendiente</dt><dd class="${organization.saldoVencido > 0 ? 'owes' : ''}">${money(organization.saldoPendiente)}</dd></div>
        </dl>
        ${baja ? `<p class="modal-hint">Empresa dada de baja: sus correos quedaron libres y no se puede reactivar.</p>
        <div class="section-actions"><button class="danger" type="button" data-drawer="eliminar">Eliminar empresa</button></div>` : `
        <div class="section-actions">
            <button class="primary" type="button" data-drawer="license">${empresa.estado === 'active' ? 'Renovar licencia' : 'Activar licencia'}</button>
            <button class="secondary" type="button" data-drawer="newkey">Generar clave nueva</button>
            <button class="secondary" type="button" data-drawer="modules">Módulos</button>
            <button class="secondary" type="button" data-drawer="movimientos">Borrar movimientos anteriores</button>
            ${organization.admin?.pendienteCambio ? '<button class="secondary" type="button" data-drawer="correo">Reenviar correo de alta</button>' : ''}
            ${['suspended', 'cancelled'].includes(empresa.estado)
                ? `<button class="danger" type="button" data-drawer="baja">Dar de baja</button>
                   <button class="danger" type="button" data-drawer="eliminar">Eliminar empresa</button>`
                : '<button class="danger" type="button" data-drawer="suspend">Suspender</button>'}
        </div>`}
        ${companyDataForm(empresa)}`;
}

// Datos de contacto, servicios y cuota; igual para clientes con y sin ERP.
const MESES_COBRO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function companyDataForm(empresa) {
    return `
        <h3>Datos de la empresa y facturación</h3>
        <form id="companyDataForm">
            <div class="form-row">
                <div class="form-group"><label for="dataName">Nombre</label><input id="dataName" required maxlength="150" value="${escapeHtml(empresa.nombre)}"></div>
                <div class="form-group"><label for="dataSector">Sector comercial</label><input id="dataSector" maxlength="150" value="${escapeHtml(empresa.sector || '')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label for="dataEmail">Correo de facturación</label><input id="dataEmail" type="email" maxlength="150" value="${escapeHtml(empresa.email || '')}"></div>
                <div class="form-group"><label for="dataPhone">Teléfono</label><input id="dataPhone" type="tel" maxlength="30" value="${escapeHtml(empresa.telefono || '')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label for="dataNit">NIT</label><input id="dataNit" maxlength="30" value="${escapeHtml(empresa.nit || '')}"></div>
                ${empresa.usaErp && empresa.dominioBase ? `<div class="form-group"><label for="dataSubdomain">Dirección del ERP</label><input id="dataSubdomain" maxlength="42" autocomplete="off" spellcheck="false" pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?" value="${escapeHtml(empresa.subdominio || '')}" aria-describedby="dataSubdomainHint"><small class="field-hint" id="dataSubdomainHint">${empresa.url ? `Entran por <a href="${escapeHtml(empresa.url)}" target="_blank" rel="noopener">${escapeHtml(empresa.url.replace('https://', ''))}</a>. Si la cambias, la anterior deja de funcionar.` : `Quedará como <em>nombre</em>.${escapeHtml(empresa.dominioBase)}`}</small></div>` : ''}
            </div>
            <fieldset class="billing-fieldset">
                <legend>Cobro de la suscripción</legend>
                <div class="form-row">
                    <div class="form-group"><label for="dataPeriodicity">Se cobra</label>
                        <select id="dataPeriodicity">
                            <option value="mensual" ${empresa.periodicidad !== 'anual' ? 'selected' : ''}>Cada mes</option>
                            <option value="anual" ${empresa.periodicidad === 'anual' ? 'selected' : ''}>Una vez al año</option>
                        </select></div>
                    <div class="form-group" id="dataYearMonthGroup" ${empresa.periodicidad === 'anual' ? '' : 'hidden'}><label for="dataYearMonth">Mes del cobro anual</label>
                        <select id="dataYearMonth"><option value="">El del inicio de la suscripción</option>${MESES_COBRO.map((mes, indice) => `<option value="${indice + 1}" ${Number(empresa.mesCobroAnual) === indice + 1 ? 'selected' : ''}>${mes}</option>`).join('')}</select></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label for="dataFee" id="dataFeeLabel">${empresa.periodicidad === 'anual' ? 'Cuota anual con IVA (Q)' : 'Cuota mensual con IVA (Q)'}</label><input id="dataFee" type="number" min="0" step="0.01" value="${empresa.cuotaMensual ?? ''}"><small class="field-hint">Se usa al generar los cobros del mes.</small></div>
                    ${empresa.usaErp === false ? '' : `<div class="form-group"><label for="dataPayMethod">Forma de pago del cliente</label>
                        <select id="dataPayMethod">
                            <option value="" ${!empresa.formaPago ? 'selected' : ''}>Aún no la elige</option>
                            <option value="transferencia" ${empresa.formaPago === 'transferencia' ? 'selected' : ''}>Transferencia (sube el comprobante)</option>
                            <option value="tarjeta" ${empresa.formaPago === 'tarjeta' ? 'selected' : ''}>Tarjeta (paga con el enlace)</option>
                        </select><small class="field-hint">${empresa.formaPagoElegidaEn ? `Elegida el ${formatDate(empresa.formaPagoElegidaEn)}.` : 'La elige el administrador al entrar al ERP.'}</small></div>`}
                </div>
                <div class="form-group"><label for="dataPayLink">Enlace de pago con tarjeta</label><input id="dataPayLink" type="url" maxlength="500" placeholder="https://…" value="${escapeHtml(empresa.enlacePago || '')}"><small class="field-hint">El cliente lo ve en cada factura pendiente si paga con tarjeta.</small></div>
            </fieldset>
            <div class="form-group"><label for="dataServices">Servicios que contrata</label><input id="dataServices" maxlength="255" placeholder="Ej.: Chatbot de WhatsApp y página web" value="${escapeHtml(empresa.servicios || '')}">${empresa.usaErp === false ? '<small class="field-hint">Es el concepto de su factura mensual.</small>' : ''}</div>
            <div class="form-group"><label for="dataAddress">Dirección</label><input id="dataAddress" maxlength="255" value="${escapeHtml(empresa.direccion || '')}"></div>
            <div class="modal-actions"><button class="primary" type="submit">Guardar datos</button></div>
        </form>`;
}

// ---------- Borrar movimientos anteriores a una fecha ----------

const movimientosRequest = (ejecutar) => apiRequest(`/organizations/${crm.drawerId}/borrar-movimientos`, {
    method: 'POST',
    body: JSON.stringify({
        desde: document.getElementById('movimientosDesde').value,
        confirmacion: document.getElementById('movimientosConfirm').value,
        ejecutar
    })
});

function openMovimientos(empresa) {
    crm.movimientosEmpresa = empresa.nombre;
    document.getElementById('movimientosTitle').textContent = `Borrar movimientos de ${empresa.nombre}`;
    document.getElementById('movimientosForm').reset();
    const desde = document.getElementById('movimientosDesde');
    desde.value = todayInput();
    desde.max = todayInput();
    openModal('movimientosModal');
    previewMovimientos();
}

// Cuenta lo que se borraría con la fecha elegida, sin borrar nada.
async function previewMovimientos() {
    const box = document.getElementById('movimientosConteo');
    const submit = document.getElementById('movimientosSubmit');
    submit.disabled = true;
    if (!document.getElementById('movimientosDesde').value) { box.textContent = ''; return; }
    box.textContent = 'Contando...';
    try {
        const { conteo: c } = await movimientosRequest(false);
        const filas = [
            [c.ventas, 'venta', 'ventas'], [c.cobros, 'cobro', 'cobros'], [c.compras, 'compra', 'compras'],
            [c.caja, 'movimiento de caja', 'movimientos de caja'], [c.depositos, 'depósito', 'depósitos'],
            [c.ajustes, 'ajuste de inventario', 'ajustes de inventario'], [c.cierres, 'cierre de caja', 'cierres de caja'],
            [c.cuentasPos, 'cuenta del punto de venta', 'cuentas del punto de venta'], [c.facturasFel, 'documento FEL', 'documentos FEL']
        ].filter(([n]) => n > 0);
        if (!filas.length) {
            box.innerHTML = `No hay movimientos anteriores al ${formatDueDate(c.desde)}.`;
            return;
        }
        box.innerHTML = `Se borrarán:<ul>${filas.map(([n, uno, varios]) => `<li>${n} ${n === 1 ? uno : varios}</li>`).join('')}</ul>${
            c.cobrosRecientes > 0 ? `<p class="aviso">${c.cobrosRecientes} cobro${c.cobrosRecientes === 1 ? '' : 's'} desde esa fecha ${c.cobrosRecientes === 1 ? 'es' : 'son'} de ventas anteriores y también se ${c.cobrosRecientes === 1 ? 'borra' : 'borran'}.</p>` : ''}`;
        submit.disabled = false;
    } catch (error) {
        box.textContent = error.message;
    }
}

async function saveMovimientos(event) {
    event.preventDefault();
    const confirmacion = document.getElementById('movimientosConfirm').value.trim().toLowerCase();
    if (confirmacion !== String(crm.movimientosEmpresa || '').trim().toLowerCase()) {
        alert('El nombre escrito no coincide con el de la empresa.');
        return;
    }
    await withButton(document.getElementById('movimientosSubmit'), async () => {
        try {
            const data = await movimientosRequest(true);
            closeModal('movimientosModal');
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

// ---------- Clientes sin ERP ----------

function openActivarErp(empresa) {
    document.getElementById('erpTitle').textContent = `Activar BotEngine ERP para ${empresa.nombre}`;
    document.getElementById('erpForm').reset();
    document.getElementById('erpEmail').value = empresa.email || '';
    openModal('erpModal');
}

async function saveActivarErp(event) {
    event.preventDefault();
    await withButton(document.getElementById('erpSubmit'), async () => {
        try {
            const data = await apiRequest(`/organizations/${crm.drawerId}/activar-erp`, {
                method: 'POST',
                body: JSON.stringify({
                    adminName: document.getElementById('erpAdminName').value.trim(),
                    email: document.getElementById('erpEmail').value.trim(),
                    plan: document.getElementById('erpPlan').value.trim(),
                    maxUsers: Number(document.getElementById('erpMaxUsers').value),
                    durationDays: Number(document.getElementById('erpDays').value)
                })
            });
            closeModal('erpModal');
            showMessage(data.message, data.correo?.enviado === false ? 'error' : 'success');
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function setClientActive(id, activo, button) {
    await withButton(button, async () => {
        try {
            const data = await apiRequest(`/organizations/${id}/estado-cliente`, { method: 'POST', body: JSON.stringify({ activo }) });
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

function drawerUsers(ficha, organization) {
    const usuarios = ficha.usuarios;
    const baja = dadaDeBaja(organization);
    return `
        <div class="card-head"><h3>Usuarios (${organization.activeUsers ?? 0} de ${ficha.empresa.maxUsuarios} activos)</h3>
        ${baja ? '' : '<button class="primary" type="button" data-drawer="newuser"><i class="fas fa-user-plus" aria-hidden="true"></i> Nuevo usuario</button>'}</div>
        <div class="table-wrap"><table>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Último ingreso</th><th>Acciones</th></tr></thead>
            <tbody>${usuarios.length ? usuarios.map(usuario => `
                <tr class="${usuario.activo ? '' : 'inactive-row'}">
                    <td><strong>${escapeHtml(usuario.nombre)}</strong>${usuario.activo ? '' : '<span class="user-tag">Inactivo</span>'}<br><small>${escapeHtml(usuario.email)}</small>
                        ${usuario.pendienteCambio ? `<br><small class="mail-state pending">${usuario.verificado ? 'Aún no crea su contraseña' : 'Correo sin verificar'}</small>` : ''}</td>
                    <td>${roleLabels[usuario.rol]}${usuario.rol === 'usuario' ? `<br><small>${usuario.modulos.length} módulo${usuario.modulos.length === 1 ? '' : 's'}</small>` : ''}</td>
                    <td>${formatDateTime(usuario.ultimoLogin)}</td>
                    <td class="actions">${baja ? '' : `
                        <button class="secondary" type="button" data-user="ver" data-id="${usuario.id}" title="Entrar al ERP como este usuario"><i class="fas fa-eye" aria-hidden="true"></i> Ver como</button>
                        <button class="secondary" type="button" data-user="editar" data-id="${usuario.id}">Rol y módulos</button>
                        <button class="secondary" type="button" data-user="password" data-id="${usuario.id}">Restablecer contraseña</button>
                        <button class="${usuario.activo ? 'danger' : 'secondary'}" type="button" data-user="activo" data-id="${usuario.id}">${usuario.activo ? 'Desactivar' : 'Activar'}</button>`}
                    </td>
                </tr>`).join('') : '<tr><td colspan="4">La empresa no tiene usuarios.</td></tr>'}
            </tbody>
        </table></div>`;
}

function drawerInvoices(ficha) {
    recordarFacturas(ficha.facturas);
    return `
        <div class="card-head"><h3>Facturas</h3><button class="primary" type="button" data-drawer="newinvoice"><i class="fas fa-plus" aria-hidden="true"></i> Nueva factura</button></div>
        <div class="table-wrap"><table>
            <thead><tr><th>Número</th><th>Concepto</th><th class="num">Total</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${ficha.facturas.length ? ficha.facturas.map(factura => `
                <tr>
                    <td class="key">${escapeHtml(factura.numero)}</td>
                    <td>${escapeHtml(conceptOf(factura))}</td>
                    <td class="num">${money(factura.total)}</td>
                    <td>${formatDueDate(factura.fechaVencimiento)}</td>
                    <td>${invoiceStatus(factura)}</td>
                    <td class="actions">${invoiceActions(factura)}</td>
                </tr>`).join('') : '<tr><td colspan="6">Aún no hay facturas para esta empresa.</td></tr>'}
            </tbody>
        </table></div>`;
}

function drawerNotes(ficha) {
    return `
        <h3>Notas de seguimiento</h3>
        <form id="noteForm">
            <div class="form-group"><label for="noteText" class="sr-only">Nueva nota</label><textarea id="noteText" maxlength="4000" placeholder="Llamada, acuerdo, solicitud del cliente, próximo paso..." required></textarea></div>
            <div class="modal-actions"><button class="primary" type="submit">Guardar nota</button></div>
        </form>
        ${ficha.notas.length ? `<ul class="notes">${ficha.notas.map(nota => `
            <li><p>${escapeHtml(nota.texto)}</p><small>${escapeHtml(nota.autor)} · ${formatDateTime(nota.fecha)}</small><button class="link" type="button" data-note="${nota.id}">Borrar</button></li>`).join('')}</ul>`
            : '<p class="empty-note">Sin notas todavía.</p>'}`;
}

function drawerActivity(ficha) {
    return `
        <h3>Entradas de soporte</h3>
        ${ficha.accesos.length ? `<ul class="mini-list">${ficha.accesos.map(acceso => `
            <li><span>${escapeHtml(acceso.autor)} entró como ${escapeHtml(acceso.comoUsuario || 'usuario eliminado')}<small>${acceso.modo === 'editar' ? 'Con cambios' : 'Solo lectura'}</small></span><span>${formatDateTime(acceso.fecha)}</span></li>`).join('')}</ul>`
            : '<p class="empty-note">Soporte no ha entrado a esta empresa.</p>'}
        <h3>Contratos</h3>
        ${ficha.contratos.length ? `<ul class="mini-list">${ficha.contratos.map(contrato => `
            <li><span class="key">${escapeHtml(contrato.numero)}<small>${contrato.mensualidad ? `${money(contrato.mensualidad)} al mes · ` : ''}${contrato.enviado ? `enviado ${formatDateTime(contrato.enviado)}` : 'no se envió'}</small></span><span>${formatDate(contrato.fecha)}</span></li>`).join('')}</ul>`
            : '<p class="empty-note">Sin contratos generados desde el panel.</p>'}`;
}

function bindDrawer(body, ficha) {
    const id = ficha.empresa.id;
    body.querySelectorAll('button[data-drawer]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.drawer;
            if (action === 'license') return openLicense(id);
            if (action === 'newkey') return openLicense(id, { newKey: true });
            if (action === 'modules') return openModules(id);
            if (action === 'correo') return resendEmail(id, button);
            if (action === 'suspend') return suspendOrganization(id, button);
            if (action === 'baja') return deactivateOrganization(id, button);
            if (action === 'eliminar') return deleteOrganization(id, button);
            if (action === 'activarerp') return openActivarErp(ficha.empresa);
            if (action === 'movimientos') return openMovimientos(ficha.empresa);
            if (action === 'inactivar' || action === 'reactivar') return setClientActive(id, action === 'reactivar', button);
            if (action === 'newuser') return openUser();
            if (action === 'newinvoice') return openInvoice(id);
            return null;
        });
    });
    bindInvoiceButtons(body);
    body.querySelectorAll('button[data-user]').forEach(button => {
        button.addEventListener('click', () => {
            const usuario = ficha.usuarios.find(entry => String(entry.id) === button.dataset.id);
            if (button.dataset.user === 'ver') return openEnter(id, usuario.id);
            if (button.dataset.user === 'editar') return openUser(usuario);
            if (button.dataset.user === 'password') return resetUserPassword(usuario, button);
            return toggleUserActive(usuario, button);
        });
    });
    body.querySelector('#companyDataForm')?.addEventListener('submit', saveCompanyData);
    // Anual: se elige el mes del cobro y la cuota es por año.
    body.querySelector('#dataPeriodicity')?.addEventListener('change', (event) => {
        const anual = event.target.value === 'anual';
        body.querySelector('#dataYearMonthGroup').hidden = !anual;
        body.querySelector('#dataFeeLabel').textContent = anual ? 'Cuota anual con IVA (Q)' : 'Cuota mensual con IVA (Q)';
    });
    body.querySelector('#noteForm')?.addEventListener('submit', saveNote);
    body.querySelectorAll('button[data-note]').forEach(button => {
        button.addEventListener('click', () => deleteNote(button.dataset.note, button));
    });
}

const fichaEmpresa = () => crm.ficha?.empresa || {};

async function saveCompanyData(event) {
    event.preventDefault();
    const button = event.submitter;
    await withButton(button, async () => {
        try {
            const data = await apiRequest(`/organizations/${crm.drawerId}/datos`, {
                method: 'POST',
                body: JSON.stringify({
                    nombre: document.getElementById('dataName').value.trim(),
                    sector: document.getElementById('dataSector').value.trim(),
                    email: document.getElementById('dataEmail').value.trim(),
                    telefono: document.getElementById('dataPhone').value.trim(),
                    nit: document.getElementById('dataNit').value.trim(),
                    cuotaMensual: document.getElementById('dataFee').value,
                    direccion: document.getElementById('dataAddress').value.trim(),
                    servicios: document.getElementById('dataServices').value.trim(),
                    periodicidad: document.getElementById('dataPeriodicity').value,
                    mesCobroAnual: document.getElementById('dataYearMonth').value,
                    enlacePago: document.getElementById('dataPayLink').value.trim(),
                    formaPago: document.getElementById('dataPayMethod')?.value || fichaEmpresa().formaPago || '',
                    ...(document.getElementById('dataSubdomain') ? { subdominio: document.getElementById('dataSubdomain').value.trim().toLowerCase() } : {})
                })
            });
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function saveNote(event) {
    event.preventDefault();
    await withButton(event.submitter, async () => {
        try {
            await apiRequest(`/organizations/${crm.drawerId}/notas`, {
                method: 'POST',
                body: JSON.stringify({ texto: document.getElementById('noteText').value })
            });
            await loadFicha();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function deleteNote(noteId, button) {
    if (!confirm('¿Borrar esta nota?')) return;
    await withButton(button, async () => {
        try {
            await apiRequest(`/organizations/${crm.drawerId}/notas/${noteId}`, { method: 'DELETE' });
            await loadFicha();
        } catch (error) {
            alert(error.message);
        }
    });
}

// ---------- Usuarios de la empresa ----------

function openUser(usuario = null) {
    const form = document.getElementById('userForm');
    form.reset();
    form.dataset.userId = usuario ? usuario.id : '';
    document.getElementById('userTitle').textContent = usuario ? `Rol y módulos de ${usuario.nombre}` : `Nuevo usuario en ${crm.ficha.empresa.nombre}`;
    ['userName', 'userLastName', 'userEmail'].forEach(fieldId => {
        const field = document.getElementById(fieldId);
        field.disabled = Boolean(usuario);
        field.closest('.form-group, .form-row').hidden = Boolean(usuario);
    });
    document.getElementById('userSendRow').hidden = Boolean(usuario);
    document.getElementById('userSubmit').textContent = usuario ? 'Guardar cambios' : 'Crear usuario';
    document.getElementById('userRole').value = usuario?.rol || 'usuario';
    const levels = new Map((usuario?.modulos || []).map(entry => [entry.modulo, entry.nivel]));
    document.getElementById('userModules').innerHTML = crm.ficha.empresa.modulosAsignables.map(module => `
        <div class="level-row">
            <span id="lvl-${module.key}">${escapeHtml(module.label)}</span>
            <select data-module="${module.key}" aria-labelledby="lvl-${module.key}">
                <option value="">Sin acceso</option>
                <option value="ver" ${levels.get(module.key) === 'ver' ? 'selected' : ''}>Solo ver</option>
                <option value="editar" ${levels.get(module.key) === 'editar' ? 'selected' : ''}>Ver y editar</option>
            </select>
        </div>`).join('') || '<p class="empty-note">La empresa no tiene módulos habilitados.</p>';
    toggleUserModules();
    openModal('userModal');
}

function toggleUserModules() {
    document.getElementById('userModulesGroup').hidden = document.getElementById('userRole').value === 'admin';
}

async function saveUser(event) {
    event.preventDefault();
    const userId = event.target.dataset.userId;
    const modulos = [...document.querySelectorAll('#userModules select')]
        .filter(select => select.value)
        .map(select => ({ modulo: select.dataset.module, nivel: select.value }));
    const rol = document.getElementById('userRole').value;
    await withButton(document.getElementById('userSubmit'), async () => {
        try {
            const data = userId
                ? await apiRequest(`/organizations/${crm.drawerId}/usuarios/${userId}`, { method: 'POST', body: JSON.stringify({ rol, modulos }) })
                : await apiRequest(`/organizations/${crm.drawerId}/usuarios`, {
                    method: 'POST',
                    body: JSON.stringify({
                        nombre: document.getElementById('userName').value.trim(),
                        apellido: document.getElementById('userLastName').value.trim(),
                        email: document.getElementById('userEmail').value.trim(),
                        rol,
                        modulos,
                        enviarCorreo: document.getElementById('userSend').checked
                    })
                });
            closeModal('userModal');
            showMessage(data.message, data.correoEnviado === false && document.getElementById('userSend').checked ? 'error' : 'success');
            if (data.credenciales) showCredentials(data);
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

// Las cuentas de soporte (pestaña Equipo) pasan sus propios textos: no hay correo ni cambio obligatorio.
function showCredentials(data, textos = {}) {
    document.getElementById('credentialsHint').textContent = textos.hint || (data.correoEnviado
        ? 'También se enviaron por correo. Guárdalos solo si necesitas compartirlos por otro medio.'
        : 'El correo no salió: compártelos con el cliente por WhatsApp o en persona.');
    document.getElementById('credentialsNote').textContent = textos.note
        || 'Esta contraseña no se vuelve a mostrar. Al entrar, el usuario debe crear la suya.';
    document.getElementById('credentialsPasswordLabel').textContent = textos.passwordLabel || 'Contraseña temporal';
    document.getElementById('credentialsEmail').textContent = data.credenciales.email;
    document.getElementById('credentialsPassword').textContent = data.credenciales.password;
    openModal('credentialsModal');
}

async function copyCredentials() {
    const text = `Usuario: ${document.getElementById('credentialsEmail').textContent}\n${document.getElementById('credentialsPasswordLabel').textContent}: ${document.getElementById('credentialsPassword').textContent}\nEntra en: ${window.location.origin}/login.html`;
    try {
        await navigator.clipboard.writeText(text);
        document.getElementById('credentialsCopy').innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copiado';
    } catch {
        alert(text);
    }
    setTimeout(() => { document.getElementById('credentialsCopy').innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copiar'; }, 2000);
}

async function resetUserPassword(usuario, button) {
    if (!confirm(`¿Restablecer la contraseña de ${usuario.email}? Se genera una temporal nueva (se le envía por correo) y la actual deja de funcionar.`)) return;
    await withButton(button, async () => {
        try {
            const data = await apiRequest(`/organizations/${crm.drawerId}/usuarios/${usuario.id}/password`, { method: 'POST', body: '{}' });
            showMessage(data.message, data.correoEnviado ? 'success' : 'error');
            showCredentials(data);
            await loadFicha();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function toggleUserActive(usuario, button) {
    const activar = !usuario.activo;
    if (!activar && !confirm(`¿Desactivar a ${usuario.email}? No podrá entrar y libera un lugar de la licencia.`)) return;
    await withButton(button, async () => {
        try {
            const data = await apiRequest(`/organizations/${crm.drawerId}/usuarios/${usuario.id}`, {
                method: 'POST',
                body: JSON.stringify({ activo: activar })
            });
            showMessage(data.message);
            await refreshData();
        } catch (error) {
            alert(error.message);
        }
    });
}

// ---------- Entrar como cliente ----------

async function openEnter(organizationId, userId) {
    crm.enterId = organizationId;
    const select = document.getElementById('enterUser');
    select.innerHTML = '<option value="">Cargando usuarios...</option>';
    document.getElementById('enterTitle').textContent = `Entrar a ${organizationById(organizationId)?.name || 'la empresa'}`;
    document.querySelector('input[name="enterMode"][value="ver"]').checked = true;
    openModal('enterModal');
    try {
        const ficha = String(crm.ficha?.empresa.id) === String(organizationId)
            ? crm.ficha
            : await apiRequest(`/organizations/${organizationId}/ficha`);
        const usuarios = ficha.usuarios.filter(usuario => !usuario.email.startsWith('baja-'));
        select.innerHTML = usuarios.map(usuario => `<option value="${usuario.id}">${escapeHtml(usuario.nombre)} · ${escapeHtml(usuario.email)} (${roleLabels[usuario.rol]}${usuario.activo ? '' : ', inactivo'})</option>`).join('')
            || '<option value="">La empresa no tiene usuarios</option>';
        const admin = usuarios.find(usuario => usuario.rol === 'admin' && usuario.activo);
        select.value = userId ? String(userId) : String(admin?.id || usuarios[0]?.id || '');
    } catch (error) {
        select.innerHTML = '<option value="">No se pudieron cargar los usuarios</option>';
        showMessage(error.message, 'error');
    }
}

async function enterCompany(event) {
    event.preventDefault();
    const userId = document.getElementById('enterUser').value;
    if (!userId) {
        alert('La empresa no tiene usuarios para entrar; crea uno en la ficha.');
        return;
    }
    await withButton(document.getElementById('enterSubmit'), async () => {
        try {
            const data = await apiRequest(`/organizations/${crm.enterId}/entrar`, {
                method: 'POST',
                body: JSON.stringify({ userId: Number(userId), modo: document.querySelector('input[name="enterMode"]:checked').value })
            });
            // Con dirección por empresa se abre en su subdominio y esta sesión de soporte sigue intacta.
            if (data.traspaso) {
                irConTraspaso(data.traspaso);
                return;
            }
            // Desde aquí la sesión es la del cliente; «Volver al panel» recupera la de soporte.
            authManager.saveUser(data.user);
            authManager.saveSessionExpiry(data.sessionExpiresAt);
            window.location.href = '/index.html';
        } catch (error) {
            alert(error.message);
        }
    });
}
