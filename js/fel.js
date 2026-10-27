// ============================================
// FACTURACIÓN ELECTRÓNICA (FEL)
// Configuración por empresa (emisor, régimen y certificador), estado para el cobro
// y la ventana para emitir, ver o anular la factura de una venta.
// ============================================

const FelModule = {
    state: { estado: null, admin: null, venta: null, busy: false },

    // Estado mínimo para el cobro: si la facturación está activa y qué comprobante va marcado.
    async loadEstado() {
        try {
            const response = await fetch(`${authManager.apiBaseUrl}/api/fel/estado`, { headers: { 'Content-Type': 'application/json' } });
            this.state.estado = response.ok ? (await response.json()).fel : null;
        } catch {
            this.state.estado = null;
        }
        return this.state.estado;
    },

    activa() {
        return Boolean(this.state.estado?.activa);
    },

    async request(path, options = {}) {
        let response;
        try {
            response = await fetch(`${authManager.apiBaseUrl}${path}`, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
            });
        } catch (error) {
            throw new Error(friendlyError(error));
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok && !data.documento) {
            throw Object.assign(new Error(data.error || `Error ${response.status}`), { status: response.status });
        }
        return data;
    },

    // ---------- Configuración (solo administrador) ----------

    initConfig() {
        if (this.state.configInitialized) return;
        this.state.configInitialized = true;
        document.getElementById('felForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveConfig();
        });
        document.getElementById('felCertificador')?.addEventListener('change', () => this.renderCredenciales());
        document.getElementById('felAfiliacion')?.addEventListener('change', () => this.renderFrasesHint());
    },

    async loadConfig() {
        if (!AccessControl.isAdmin()) return;
        this.initConfig();
        try {
            const data = await this.request('/api/fel/config');
            this.state.admin = data.fel;
            this.fillConfig();
        } catch (error) {
            this.showConfigError(error.message);
        }
    },

    fillConfig() {
        const fel = this.state.admin;
        const config = fel.config || {};
        const emisor = config.emisor || {};
        const direccion = emisor.direccion || {};
        const set = (id, value) => { document.getElementById(id).value = value ?? ''; };

        document.getElementById('felCertificador').innerHTML = fel.catalogo.map((c) =>
            `<option value="${this.escape(c.id)}" ${c.disponible ? '' : 'disabled'}>${this.escape(c.nombre)}${c.disponible ? '' : ' (pendiente de conectar)'}</option>`).join('');
        set('felCertificador', config.certificador || 'prueba');
        set('felAmbiente', config.ambiente || 'pruebas');
        set('felNit', emisor.nit);
        set('felAfiliacion', emisor.afiliacionIVA || 'GEN');
        set('felEstablecimiento', emisor.codigoEstablecimiento || 1);
        set('felNombre', emisor.nombre);
        set('felNombreComercial', emisor.nombreComercial);
        set('felCorreo', emisor.correo);
        set('felDireccion', direccion.direccion);
        set('felMunicipio', direccion.municipio);
        set('felDepartamento', direccion.departamento);
        set('felCodigoPostal', direccion.codigoPostal || '01001');
        set('felPorDefecto', config.comprobantePorDefecto || 'ticket');
        document.getElementById('felActiva').checked = fel.configurada ? fel.activa : true;
        this.renderCredenciales();
        this.renderFrasesHint();

        const pill = document.getElementById('felPill');
        pill.hidden = !fel.configurada;
        pill.textContent = !fel.activa ? 'Pausada' : (config.certificador === 'prueba' ? 'Modo de prueba' : (config.ambiente === 'produccion' ? 'Activa' : 'Activa · pruebas'));
        pill.className = `status-pill ${fel.activa && config.certificador !== 'prueba' ? 'is-ok' : 'is-off'}`;

        const aviso = document.getElementById('felAviso');
        const motivo = !fel.habilitada
            ? 'La facturación aún no está habilitada en este servidor. Pide a soporte que la active.'
            : (config.certificador === 'prueba' || !fel.configurada)
                ? 'En modo de prueba las facturas se generan con el formato de la SAT pero no se envían a ningún certificador: no tienen validez fiscal.'
                : '';
        aviso.hidden = !motivo;
        aviso.querySelector('span').textContent = motivo;
        this.showConfigError('');
    },

    renderCredenciales() {
        const fel = this.state.admin;
        const id = document.getElementById('felCertificador').value;
        const certificador = fel.catalogo.find((c) => c.id === id);
        const guardadas = fel.config?.certificador === id ? fel.credencialesGuardadas : [];
        document.getElementById('felCredenciales').innerHTML = (certificador?.campos || []).map((campo) => `
            <div class="form-group">
                <label for="felCred-${this.escape(campo.id)}">${this.escape(campo.label)}</label>
                <input type="${campo.secreto ? 'password' : 'text'}" id="felCred-${this.escape(campo.id)}" class="form-input" data-credencial="${this.escape(campo.id)}" autocomplete="${campo.secreto ? 'new-password' : 'off'}"
                    placeholder="${guardadas.includes(campo.id) ? 'Guardada (cifrada) · escribe para cambiarla' : ''}">
            </div>`).join('');
    },

    renderFrasesHint() {
        const afiliacion = document.getElementById('felAfiliacion').value;
        document.getElementById('felFrasesHint').textContent = afiliacion === 'PEQ'
            ? 'Se emitirá factura de pequeño contribuyente (FPEQ), sin desglose de IVA, con la frase «No genera derecho a crédito fiscal».'
            : 'Se emitirá factura (FACT) con IVA del 12 % incluido en el precio y la frase «Sujeto a pagos trimestrales ISR». Si tu régimen de ISR es otro, pide a soporte que ajuste la frase.';
    },

    async saveConfig() {
        const button = document.getElementById('felGuardarBtn');
        const value = (id) => document.getElementById(id).value.trim();
        const credenciales = {};
        document.querySelectorAll('[data-credencial]').forEach((input) => {
            if (input.value.trim()) credenciales[input.dataset.credencial] = input.value.trim();
        });
        const payload = {
            certificador: value('felCertificador'),
            ambiente: value('felAmbiente'),
            comprobantePorDefecto: value('felPorDefecto'),
            activa: document.getElementById('felActiva').checked,
            credenciales,
            emisor: {
                nit: value('felNit'),
                afiliacionIVA: value('felAfiliacion'),
                codigoEstablecimiento: value('felEstablecimiento'),
                nombre: value('felNombre'),
                nombreComercial: value('felNombreComercial'),
                correo: value('felCorreo'),
                direccion: {
                    direccion: value('felDireccion'),
                    municipio: value('felMunicipio'),
                    departamento: value('felDepartamento'),
                    codigoPostal: value('felCodigoPostal')
                },
                frases: this.state.admin?.config?.emisor?.frases || null
            }
        };
        button.disabled = true;
        this.showConfigError('');
        try {
            const data = await this.request('/api/fel/config', { method: 'PUT', body: JSON.stringify(payload) });
            this.state.admin = data.fel;
            this.fillConfig();
            this.loadEstado();
            showNotification('Configuración de facturación guardada.', 'success');
        } catch (error) {
            this.showConfigError(error.message);
        } finally {
            button.disabled = false;
        }
    },

    showConfigError(message) {
        const error = document.getElementById('felError');
        if (!error) return;
        error.textContent = message;
        error.hidden = !message;
    },

    // ---------- Receptor (NIT, CUI o CF) ----------

    // Mismo cálculo que el servidor: avisa del NIT mal escrito antes de cobrar.
    nitValido(value) {
        const nit = String(value || '').toUpperCase().replace(/[\s-]/g, '');
        if (!/^[1-9]\d*[\dK]$/.test(nit)) return false;
        const cuerpo = nit.slice(0, -1);
        const suma = [...cuerpo].reduce((total, digit, index) => total + Number(digit) * (cuerpo.length + 1 - index), 0);
        const resto = (11 - (suma % 11)) % 11;
        return nit.slice(-1) === (resto === 10 ? 'K' : String(resto));
    },

    // Devuelve { receptor } o { error, focus } con lo que hay que corregir.
    leerReceptor(idInput, nombreInput) {
        const raw = idInput.value.trim();
        const id = raw.toUpperCase().replace(/[\s-]/g, '');
        const nombre = nombreInput.value.trim();
        if (!id || id === 'CF') return { receptor: { id: 'CF', nombre: nombre || 'Consumidor Final' } };
        if (/^\d{13}$/.test(id) && !this.nitValido(id)) {
            if (!nombre) return { error: 'Escribe el nombre del cliente como aparece en su DPI.', focus: nombreInput };
            return { receptor: { id, tipo: 'CUI', nombre } };
        }
        if (!this.nitValido(id)) return { error: `El NIT ${raw} no es válido: revisa el último dígito o usa CF.`, focus: idInput };
        if (!nombre) return { error: 'Escribe el nombre del cliente como aparece en su NIT.', focus: nombreInput };
        return { receptor: { id, nombre } };
    },

    // ---------- Factura de una venta (desde Ventas) ----------

    open(venta) {
        this.state.venta = venta;
        const factura = venta.factura;
        const esc = (value) => this.escape(value);
        const body = document.getElementById('felModalBody');
        const footer = document.getElementById('felModalFooter');
        document.getElementById('felModalTitle').textContent = `Factura · venta ${venta.numero_venta}`;

        if (factura && ['certificado', 'anulado', 'pendiente'].includes(factura.estado)) {
            const anulada = factura.estado === 'anulado';
            body.innerHTML = `
                <dl class="info-grid">
                    <div><dt>Estado</dt><dd>${this.estadoBadge(factura)}</dd></div>
                    <div><dt>Serie</dt><dd>${esc(factura.serie || '—')}</dd></div>
                    <div><dt>Número</dt><dd>${esc(factura.numero || '—')}</dd></div>
                    <div><dt>Autorización</dt><dd class="fel-uuid">${esc(factura.uuid || '—')}</dd></div>
                    <div><dt>Cliente</dt><dd>${esc(factura.receptor_nombre)} · ${esc(factura.receptor_id)}</dd></div>
                    <div><dt>Total</dt><dd>${formatQ(Number(venta.total))}</dd></div>
                </dl>
                ${factura.ambiente !== 'produccion' ? '<p class="inline-notice"><span>Emitida en ambiente de pruebas: no tiene validez fiscal.</span></p>' : ''}
                ${!anulada && factura.estado === 'certificado' ? `
                <div class="form-group fel-anular" hidden id="felAnularGroup">
                    <label for="felMotivo">Motivo de la anulación</label>
                    <input id="felMotivo" class="form-input" maxlength="255" placeholder="Ej: error en el NIT del cliente">
                </div>` : ''}
                <p id="felModalError" class="form-error" role="alert" hidden></p>`;
            footer.innerHTML = `
                <a class="btn btn-secondary" href="${authManager.apiBaseUrl}/api/fel/documentos/${encodeURIComponent(factura.id)}/xml" download><i class="fas fa-download" aria-hidden="true"></i> XML</a>
                ${anulada ? `<a class="btn btn-secondary" href="${authManager.apiBaseUrl}/api/fel/documentos/${encodeURIComponent(factura.id)}/xml?tipo=anulacion" download>XML de anulación</a>` : ''}
                ${factura.estado === 'certificado' ? '<button type="button" class="btn btn-secondary btn-danger-text" id="felAnularBtn">Anular factura</button>' : ''}
                <button type="button" class="btn btn-primary" onclick="FelModule.closeModal()">Cerrar</button>`;
            document.getElementById('felAnularBtn')?.addEventListener('click', () => this.anular());
        } else {
            body.innerHTML = `
                ${factura?.estado === 'error' ? `<p class="inline-notice fel-error-notice"><span>El intento anterior falló: ${esc(factura.error)}</span></p>` : ''}
                <p>La venta se registró como ticket. Escribe los datos del cliente para emitir la factura por ${formatQ(Number(venta.total))}.</p>
                <div class="fel-receptor">
                    <div class="form-group">
                        <label for="felReceptorId">NIT o CUI</label>
                        <div class="fel-receptor-id">
                            <input id="felReceptorId" class="form-input" autocomplete="off" placeholder="CF" value="${esc(factura?.receptor_id && factura.receptor_id !== 'CF' ? factura.receptor_id : '')}">
                            <button type="button" class="btn btn-secondary btn-sm" data-fel-cf="felReceptorId">CF</button>
                        </div>
                        <small>Vacío o CF = consumidor final.</small>
                    </div>
                    <div class="form-group">
                        <label for="felReceptorNombre">Nombre</label>
                        <input id="felReceptorNombre" class="form-input" maxlength="400" autocomplete="off" placeholder="Consumidor Final" value="${esc(factura?.receptor_nombre && factura.receptor_id !== 'CF' ? factura.receptor_nombre : '')}">
                    </div>
                </div>
                <p id="felModalError" class="form-error" role="alert" hidden></p>`;
            footer.innerHTML = `
                <button type="button" class="btn btn-secondary" onclick="FelModule.closeModal()">Cancelar</button>
                <button type="button" class="btn btn-primary" id="felEmitirBtn"><i class="fas fa-file-invoice" aria-hidden="true"></i> Emitir factura</button>`;
            document.getElementById('felEmitirBtn').addEventListener('click', () => this.emitir());
        }
        document.getElementById('felModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('felReceptorId')?.focus();
    },

    closeModal() {
        document.getElementById('felModal').style.display = 'none';
        document.body.style.overflow = '';
    },

    showModalError(message) {
        const error = document.getElementById('felModalError');
        error.textContent = message;
        error.hidden = !message;
    },

    async emitir() {
        const venta = this.state.venta;
        const { receptor, error, focus } = this.leerReceptor(
            document.getElementById('felReceptorId'), document.getElementById('felReceptorNombre'));
        if (error) {
            this.showModalError(error);
            focus?.focus();
            return;
        }
        const button = document.getElementById('felEmitirBtn');
        button.disabled = true;
        this.showModalError('');
        try {
            const data = await this.request(`/api/fel/ventas/${encodeURIComponent(venta.id)}/factura`, {
                method: 'POST', body: JSON.stringify({ receptor })
            });
            if (data.documento?.estado === 'certificado') {
                this.closeModal();
                showNotification(`Factura certificada: serie ${data.documento.serie}, número ${data.documento.numero}.`, 'success');
            } else {
                this.showModalError(`No se certificó: ${data.error || data.documento?.error}. Puedes intentarlo de nuevo.`);
            }
            await VentasModule.loadData();
        } catch (requestError) {
            this.showModalError(requestError.message);
        } finally {
            button.disabled = false;
        }
    },

    async anular() {
        const group = document.getElementById('felAnularGroup');
        const motivo = document.getElementById('felMotivo');
        const button = document.getElementById('felAnularBtn');
        if (group.hidden) {
            group.hidden = false;
            button.textContent = 'Confirmar anulación';
            motivo.focus();
            return;
        }
        if (!motivo.value.trim()) {
            this.showModalError('Escribe el motivo de la anulación.');
            motivo.focus();
            return;
        }
        button.disabled = true;
        try {
            await this.request(`/api/fel/documentos/${encodeURIComponent(this.state.venta.factura.id)}/anular`, {
                method: 'POST', body: JSON.stringify({ motivo: motivo.value.trim() })
            });
            this.closeModal();
            showNotification('Factura anulada. Ahora puedes modificar la venta o emitir otra factura.', 'success');
            await VentasModule.loadData();
        } catch (error) {
            this.showModalError(error.message);
            button.disabled = false;
        }
    },

    // Celda de la tabla de Ventas.
    comprobanteCell(venta) {
        const factura = venta.factura;
        if (!factura) return '<span class="badge">Ticket</span>';
        if (factura.estado === 'error') return '<span class="badge badge-warning">Ticket · factura con error</span>';
        return this.estadoBadge(factura, true);
    },

    estadoBadge(factura, conNumero = false) {
        const numero = conNumero && factura.serie ? ` ${this.escape(factura.serie)}-${this.escape(factura.numero)}` : '';
        const prueba = factura.ambiente !== 'produccion' ? ' (prueba)' : '';
        return {
            certificado: `<span class="badge badge-success">Factura${numero}${prueba}</span>`,
            anulado: `<span class="badge badge-danger">Anulada${numero}</span>`,
            pendiente: '<span class="badge badge-warning">Certificando…</span>',
            error: '<span class="badge badge-warning">Error</span>'
        }[factura.estado] || '';
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};

// Botón «CF» junto a los campos de NIT.
document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fel-cf]');
    if (!button) return;
    const input = document.getElementById(button.dataset.felCf);
    input.value = 'CF';
    const nombre = input.closest('.fel-receptor')?.querySelector('input:not([id$="Id"])');
    if (nombre) nombre.value = '';
    input.focus();
});
