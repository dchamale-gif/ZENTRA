// ============================================
// SUSCRIPCIÓN A BOTENGINE (solo el administrador de la empresa)
// · La primera vez elige cómo pagará: transferencia o tarjeta.
// · Si hay una factura pendiente, un aviso arriba lleva a pagarla con el enlace (tarjeta) o a
//   adjuntar el comprobante (transferencia). Soporte decide si se cobra cada mes o cada año.
// · En Configuración ve sus facturas, cambia la forma de pago y sube comprobantes.
// ============================================

const SuscripcionModule = {
    MAX_BYTES: 5 * 1024 * 1024,
    state: { datos: null, facturas: [], subiendo: null },

    puedeVer() {
        return typeof AccessControl !== 'undefined' && AccessControl.isAdmin();
    },

    // Soporte dentro de la empresa no elige por el cliente.
    esSoporte() {
        return Boolean(authManager.getUser()?.soporte);
    },

    async init() {
        if (!this.puedeVer() || this.state.iniciado) return;
        this.state.iniciado = true;
        document.querySelectorAll('#formaPagoModal [data-forma]').forEach((button) => {
            button.addEventListener('click', () => this.elegir(button.dataset.forma, button));
        });
        document.getElementById('suscripcionFormas')?.addEventListener('change', (event) => {
            if (event.target.name === 'suscripcionForma') this.elegir(event.target.value);
        });
        document.getElementById('comprobanteSubirForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.subir();
        });
        document.getElementById('suscripcionFacturas')?.addEventListener('click', (event) => this.accion(event));
        document.getElementById('suscripcionBanner')?.addEventListener('click', (event) => this.accion(event));
        await this.load();
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(`/api/suscripcion${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    },

    async load() {
        try {
            const { suscripcion, facturas } = await this.request('');
            this.state.datos = suscripcion;
            this.state.facturas = facturas;
            this.renderBanner();
            this.renderConfiguracion();
            if (!suscripcion.formaPago && !this.esSoporte()) this.abrirElegir();
        } catch (error) {
            console.warn('Suscripción:', error.message);
        }
    },

    // ---------- Forma de pago ----------

    abrirElegir() {
        document.getElementById('formaPagoModal').style.display = 'flex';
        document.querySelector('#formaPagoModal [data-forma]')?.focus();
    },

    async elegir(formaPago, button = null) {
        const error = document.getElementById('formaPagoError');
        if (button) button.disabled = true;
        try {
            const data = await this.request('/forma-pago', { method: 'PUT', body: JSON.stringify({ formaPago }) });
            document.getElementById('formaPagoModal').style.display = 'none';
            if (error) error.hidden = true;
            showNotification(data.message, 'success');
            await this.load();
        } catch (err) {
            if (error && document.getElementById('formaPagoModal').style.display === 'flex') {
                error.textContent = err.message;
                error.hidden = false;
            } else {
                showNotification(err.message, 'error');
                this.renderConfiguracion();
            }
        } finally {
            if (button) button.disabled = false;
        }
    },

    // ---------- Aviso de factura pendiente ----------

    // La factura pendiente más antigua (la que vence primero).
    pendiente() {
        return this.state.facturas
            .filter((factura) => ['pendiente', 'vencida'].includes(factura.estado))
            .sort((a, b) => String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento)))[0] || null;
    },

    // Qué puede hacer el cliente con una factura pendiente, según su forma de pago.
    accionesFactura(factura, { compacto = false } = {}) {
        const forma = this.state.datos?.formaPago;
        const ultimo = factura.comprobantes[0];
        const enRevision = factura.comprobantes.some((c) => c.estado === 'pendiente');
        const botones = [];
        if (forma === 'tarjeta' && factura.enlacePago) {
            botones.push(`<a class="btn btn-primary btn-sm" href="${this.escape(factura.enlacePago)}" target="_blank" rel="noopener"><i class="fas fa-credit-card" aria-hidden="true"></i> Pagar con tarjeta</a>`);
        }
        if (forma !== 'tarjeta' || !factura.enlacePago) {
            if (!enRevision) {
                botones.push(`<button class="btn btn-primary btn-sm" type="button" data-suscripcion="subir" data-id="${factura.id}"><i class="fas fa-paperclip" aria-hidden="true"></i> ${ultimo?.estado === 'rechazado' ? 'Subir otro comprobante' : 'Adjuntar comprobante'}</button>`);
            }
        }
        if (!compacto) {
            botones.push(`<button class="btn btn-secondary btn-sm" type="button" data-suscripcion="pdf" data-id="${factura.id}"><i class="fas fa-file-pdf" aria-hidden="true"></i> PDF</button>`);
        }
        return botones.join(' ');
    },

    estadoComprobante(factura) {
        const ultimo = factura.comprobantes[0];
        if (factura.estado === 'pagada') return '';
        if (factura.comprobantes.some((c) => c.estado === 'pendiente')) return 'Recibimos tu comprobante; lo estamos revisando.';
        if (ultimo?.estado === 'rechazado') return `Tu comprobante fue rechazado: ${ultimo.motivoRechazo || 'sin motivo'}. Sube otro.`;
        if (this.state.datos?.formaPago === 'tarjeta' && !factura.enlacePago) return 'Pronto verás aquí el enlace de pago; mientras, puedes transferir y adjuntar el comprobante.';
        return '';
    },

    renderBanner() {
        const banner = document.getElementById('suscripcionBanner');
        if (!banner) return;
        const factura = this.pendiente();
        if (!factura) {
            banner.hidden = true;
            banner.innerHTML = '';
            return;
        }
        const vencida = factura.estado === 'vencida';
        const estado = this.estadoComprobante(factura);
        banner.classList.toggle('is-vencida', vencida);
        banner.innerHTML = `
            <span><i class="fas ${vencida ? 'fa-triangle-exclamation' : 'fa-file-invoice-dollar'}" aria-hidden="true"></i>
                <strong>${vencida ? 'Factura vencida' : 'Factura por pagar'}:</strong> ${this.escape(factura.numero)} por ${formatQ(factura.total)} · ${vencida ? 'venció' : 'vence'} el ${this.fecha(factura.fechaVencimiento)}.${estado ? ` ${this.escape(estado)}` : ''}</span>
            <span class="suscripcion-banner-acciones">${this.accionesFactura(factura, { compacto: true })}</span>`;
        banner.hidden = false;
    },

    // ---------- Configuración ----------

    renderConfiguracion() {
        const datos = this.state.datos;
        const seccion = document.getElementById('settingsSuscripcion');
        if (!seccion || !datos) return;
        const periodo = datos.periodicidad === 'anual'
            ? `Se cobra una vez al año${datos.mesCobroAnual ? ` en ${this.MESES[datos.mesCobroAnual - 1]}` : ''}`
            : 'Se cobra cada mes';
        document.getElementById('suscripcionPlan').textContent =
            `${periodo}${datos.cuota ? `: ${formatQ(datos.cuota)} con IVA` : ''}. Las facturas te llegan también por correo.`;
        document.querySelectorAll('input[name="suscripcionForma"]').forEach((input) => {
            input.checked = input.value === datos.formaPago;
        });
        const cuenta = document.getElementById('suscripcionCuenta');
        cuenta.hidden = datos.formaPago !== 'transferencia' || !datos.datosTransferencia;
        cuenta.textContent = datos.datosTransferencia ? `Para transferir: ${datos.datosTransferencia}` : '';
        const tbody = document.getElementById('suscripcionFacturas');
        if (!this.state.facturas.length) {
            tbody.innerHTML = '<tr><td colspan="6">Aún no tienes facturas.</td></tr>';
            return;
        }
        const etiquetas = { pendiente: ['badge-warning', 'Por pagar'], vencida: ['badge-danger', 'Vencida'], pagada: ['badge-success', 'Pagada'] };
        tbody.innerHTML = this.state.facturas.map((factura) => {
            const [clase, texto] = etiquetas[factura.estado] || ['', factura.estado];
            const estado = this.estadoComprobante(factura);
            const porPagar = ['pendiente', 'vencida'].includes(factura.estado);
            return `<tr>
                <td><strong>${this.escape(factura.numero)}</strong></td>
                <td>${this.escape(factura.concepto)}</td>
                <td class="text-right">${formatQ(factura.total)}</td>
                <td>${this.fecha(factura.fechaVencimiento)}</td>
                <td><span class="badge ${clase}">${texto}</span>${factura.estado === 'pagada' && factura.pagadaEn ? `<small class="cierre-sub">el ${this.fecha(factura.pagadaEn)}</small>` : ''}${estado ? `<small class="cierre-sub">${this.escape(estado)}</small>` : ''}</td>
                <td class="text-right suscripcion-acciones">${porPagar ? this.accionesFactura(factura) : `<button class="btn btn-secondary btn-sm" type="button" data-suscripcion="pdf" data-id="${factura.id}"><i class="fas fa-file-pdf" aria-hidden="true"></i> PDF</button>`}</td>
            </tr>`;
        }).join('');
    },

    accion(event) {
        const button = event.target.closest('[data-suscripcion]');
        if (!button) return;
        const id = button.dataset.id;
        if (button.dataset.suscripcion === 'subir') this.abrirSubir(id);
        if (button.dataset.suscripcion === 'pdf') this.abrirPdf(id, button);
    },

    async abrirPdf(id, button) {
        const tab = window.open('', '_blank');
        button.disabled = true;
        try {
            const response = await authManager.fetchWithAuth(`/api/suscripcion/facturas/${encodeURIComponent(id)}/pdf`);
            if (!response?.ok) throw new Error('No se pudo abrir el PDF de la factura');
            const url = URL.createObjectURL(await response.blob());
            if (tab) tab.location.href = url;
            else window.location.href = url;
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            tab?.close();
            showNotification(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    // ---------- Subir comprobante de transferencia ----------

    abrirSubir(id) {
        const factura = this.state.facturas.find((entry) => String(entry.id) === String(id));
        if (!factura) return;
        this.state.subiendo = factura;
        document.getElementById('comprobanteSubirForm').reset();
        document.getElementById('comprobanteFecha').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
        const datos = this.state.datos;
        document.getElementById('comprobanteSubirFactura').textContent =
            `Factura ${factura.numero} por ${formatQ(factura.total)}.${datos?.datosTransferencia ? ` Transfiere a: ${datos.datosTransferencia.replace(/\.$/, '')}.` : ''}`;
        this.error('');
        document.getElementById('comprobanteSubirModal').style.display = 'flex';
        document.getElementById('comprobanteArchivo').focus();
    },

    cerrarSubir() {
        document.getElementById('comprobanteSubirModal').style.display = 'none';
        this.state.subiendo = null;
    },

    error(mensaje) {
        const el = document.getElementById('comprobanteError');
        el.textContent = mensaje;
        el.hidden = !mensaje;
    },

    leerArchivo(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('No se pudo leer el archivo; vuelve a elegirlo'));
            reader.readAsDataURL(file);
        });
    },

    async subir() {
        const factura = this.state.subiendo;
        const file = document.getElementById('comprobanteArchivo').files[0];
        if (!factura) return;
        if (!file) return this.error('Elige la foto o el PDF del comprobante.');
        if (file.size > this.MAX_BYTES) return this.error('El archivo pesa más de 5 MB; toma la foto con menos resolución.');
        const button = document.getElementById('comprobanteEnviar');
        button.disabled = true;
        this.error('');
        try {
            const data = await this.request(`/facturas/${encodeURIComponent(factura.id)}/comprobantes`, {
                method: 'POST',
                body: JSON.stringify({
                    archivo: await this.leerArchivo(file),
                    nombreArchivo: file.name,
                    referencia: document.getElementById('comprobanteReferencia').value.trim(),
                    fechaPago: document.getElementById('comprobanteFecha').value,
                    nota: document.getElementById('comprobanteNota').value.trim()
                })
            });
            this.cerrarSubir();
            showNotification(data.message, 'success');
            await this.load();
        } catch (error) {
            this.error(error.message);
        } finally {
            button.disabled = false;
        }
    },

    // ---------- Utilidades ----------

    MESES: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],

    fecha(value) {
        const [anio, mes, dia] = String(value || '').slice(0, 10).split('-');
        return dia ? `${dia}/${mes}/${anio}` : '—';
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
