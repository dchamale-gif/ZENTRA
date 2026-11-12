// ============================================
// CIERRE DE CAJA
// Cajera: en el inicio ve lo que lleva cobrado (efectivo, tarjeta, transferencia) desde su
// último cierre y cierra su propia caja; el cierre queda por aprobar. Quien tiene «Cierre de caja»: en Caja compara lo cobrado por cada cajera con lo
// que recibió y registra el cierre. El administrador (o quien tenga «Aprobar cierres y
// depósitos») lo aprueba o lo rechaza; si él mismo lo registra, queda aprobado de una vez.
// ============================================

const CierresCajaModule = {
    METODOS: [
        { key: 'efectivo', label: 'Efectivo', icon: 'fa-money-bill-wave', recibido: 'Efectivo entregado' },
        { key: 'tarjeta', label: 'Tarjeta', icon: 'fa-credit-card', recibido: 'Total de vouchers' },
        { key: 'transferencia', label: 'Transferencia', icon: 'fa-building-columns', recibido: 'Confirmado en la cuenta' },
        { key: 'otros', label: 'Otros', icon: 'fa-receipt', recibido: 'Comprobado' }
    ],
    state: { initialized: false, pendientes: [], cierres: [], cierre: null, miPendiente: null },

    // Inicio de cajera: no es administrador, cobra (punto de venta o ventas) y no tiene el panel financiero.
    esCajera() {
        return typeof AccessControl !== 'undefined' && !AccessControl.isAdmin()
            && (AccessControl.hasModule('pos') || AccessControl.hasModule('ventas')) && !AccessControl.hasModule('finanzas');
    },

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        document.getElementById('miCajaActualizar')?.addEventListener('click', () => this.loadMiCaja());
        document.getElementById('miCajaCerrar')?.addEventListener('click', () => {
            if (this.state.miPendiente) this.openCierreCaja(this.state.miPendiente);
        });
        document.getElementById('cierresActualizar')?.addEventListener('click', () => this.load());
        document.getElementById('cierresPendientes')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-cerrar]');
            if (button) this.openCierre(Number(button.dataset.cerrar));
        });
        const filas = document.getElementById('cierreFilas');
        filas?.addEventListener('input', () => this.renderDiferencias());
        filas?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-igualar]');
            if (!button) return;
            const input = document.getElementById(`cierreRecibido-${button.dataset.igualar}`);
            input.value = Number(this.state.cierre[button.dataset.igualar]).toFixed(2);
            this.renderDiferencias();
        });
        document.getElementById('cierreForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.registrar();
        });
        document.getElementById('cierresPorAprobar')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-revisar]');
            if (button) this.revisar(button.dataset.id, button.dataset.revisar);
        });
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(`/api/cierres-caja${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    },

    // ---------- Inicio de la cajera ----------

    async loadMiCaja() {
        this.init();
        const seccion = document.getElementById('miCaja');
        seccion.hidden = false;
        try {
            const { pendiente, ultimoCierre, enRevision, rechazado } = await this.request('/mi-caja');
            // La cajera cierra solo su caja: los cobros que lleva desde su último cierre.
            this.state.miPendiente = pendiente.cobros ? { ...pendiente, propio: true, cajeroNombre: 'tu caja' } : null;
            const cerrar = document.getElementById('miCajaCerrar');
            if (cerrar) cerrar.hidden = !pendiente.cobros;
            const periodo = document.getElementById('miCajaPeriodo');
            periodo.textContent = pendiente.cobros
                ? `Cobrado desde ${ultimoCierre ? `tu último cierre (${this.fechaHora(ultimoCierre.aprobadoAt)})` : `el ${this.fecha(pendiente.desde)}`}: ${pendiente.ventas} ${pendiente.ventas === 1 ? 'venta' : 'ventas'}${pendiente.abonos ? ` y ${pendiente.abonos} ${pendiente.abonos === 1 ? 'abono' : 'abonos'}` : ''}.`
                : 'Aún no has cobrado nada desde tu último cierre.';
            const metodos = this.METODOS.filter((metodo) => metodo.key !== 'otros' || pendiente.otros);
            document.getElementById('miCajaMetodos').innerHTML = metodos.map((metodo) => `
                <div class="mi-caja-metodo">
                    <span class="mi-caja-label"><i class="fas ${metodo.icon}" aria-hidden="true"></i> ${metodo.label}</span>
                    <strong>${formatQ(pendiente[metodo.key])}</strong>
                </div>`).join('') + `
                <div class="mi-caja-metodo mi-caja-total">
                    <span class="mi-caja-label">Total</span>
                    <strong>${formatQ(pendiente.total)}</strong>
                </div>`;
            document.getElementById('miCajaEntrega').textContent = pendiente.cobros
                ? `Al cerrar, entrega ${formatQ(pendiente.efectivo)} en efectivo${pendiente.tarjeta ? ` y los vouchers de tarjeta por ${formatQ(pendiente.tarjeta)}` : ''}. El administrador revisa las transferencias en la cuenta.`
                : '';
            document.getElementById('miCajaUltimo').innerHTML = [
                rechazado ? `<span class="mi-caja-rechazo">Tu cierre <strong>${this.escape(rechazado.numero)}</strong> fue rechazado: ${this.escape(rechazado.motivoRechazo || 'sin motivo')}. Vuelve a contar y cierra tu caja de nuevo.</span>` : '',
                enRevision ? `Cierre <strong>${this.escape(enRevision.numero)}</strong> por ${formatQ(enRevision.sistema.total)}: en revisión del administrador.` : '',
                ultimoCierre ? `Último cierre aprobado: <strong>${this.escape(ultimoCierre.numero)}</strong>, por ${this.escape(ultimoCierre.aprobadoPor || 'el administrador')} el ${this.fechaHora(ultimoCierre.aprobadoAt)} · ${this.resultadoBadge(ultimoCierre.diferencia.total, ultimoCierre)}` : ''
            ].filter(Boolean).join('<br>');
        } catch (error) {
            document.getElementById('miCajaPeriodo').textContent = error.message;
            document.getElementById('miCajaMetodos').innerHTML = '';
        }
    },

    // ---------- Página Caja: registrar y aprobar cierres ----------

    // El administrador o quien tenga «Aprobar cierres y depósitos».
    puedeAprobar() {
        return AccessControl.isAdmin() || AccessControl.canEdit('aprobaciones');
    },

    puedeCerrar() {
        return AccessControl.isAdmin() || AccessControl.canEdit('cierres');
    },

    async load() {
        this.init();
        if (!AccessControl.hasModule('cierres') && !AccessControl.hasModule('aprobaciones')) return;
        const pendientesEl = document.getElementById('cierresPendientes');
        const ayuda = document.getElementById('cierresAyuda');
        if (ayuda) {
            ayuda.textContent = this.puedeAprobar()
                ? 'Compara lo que cobró cada cajera con lo que se entregó y aprueba los cierres que registró el encargado.'
                : 'Compara lo que cobró cada cajera con el efectivo que te entregó, los vouchers de tarjeta y las transferencias. El cierre queda pendiente hasta que el administrador lo apruebe.';
        }
        try {
            const [{ pendientes }, { cierres }] = await Promise.all([this.request('/pendientes'), this.request('')]);
            this.state.pendientes = pendientes;
            this.state.cierres = cierres;
            this.renderPorAprobar(cierres.filter((cierre) => cierre.estado === 'pendiente'));
            this.renderPendientes();
            this.renderHistorial(cierres.filter((cierre) => cierre.estado !== 'pendiente'));
        } catch (error) {
            pendientesEl.innerHTML = `<p class="cierres-vacio">${this.escape(error.message)}</p>`;
        }
    },

    // Cierres registrados que esperan aprobación.
    renderPorAprobar(cierres) {
        const contenedor = document.getElementById('cierresPorAprobar');
        if (!contenedor) return;
        contenedor.hidden = !cierres.length;
        if (!cierres.length) { contenedor.innerHTML = ''; return; }
        const aprueba = this.puedeAprobar();
        contenedor.innerHTML = `<h3 class="cierres-subtitulo">${aprueba ? 'Por aprobar' : 'En revisión del administrador'} (${cierres.length})</h3>
        <table class="data-table">
            <thead><tr><th scope="col">Cierre</th><th scope="col">Cajera</th><th scope="col">Cobros del</th><th scope="col" class="text-right">Sistema</th><th scope="col" class="text-right">Recibido</th><th scope="col">Resultado</th><th scope="col">Registró</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${cierres.map((cierre) => `<tr>
                <td><strong>${this.escape(cierre.numero)}</strong></td>
                <td>${this.escape(cierre.cajeroNombre || '—')}</td>
                <td>${this.fecha(cierre.desde)}${cierre.hasta && cierre.hasta !== cierre.desde ? ` al ${this.fecha(cierre.hasta)}` : ''}</td>
                <td class="text-right">${formatQ(cierre.sistema.total)}</td>
                <td class="text-right">${formatQ(cierre.recibido.total)}</td>
                <td>${this.resultadoBadge(cierre.diferencia.total, cierre)}${this.detalleDiferencias(cierre)}${cierre.nota ? `<small class="cierre-sub">${this.escape(cierre.nota)}</small>` : ''}</td>
                <td>${this.escape(cierre.registradoPor || '—')}<small class="cierre-sub">${this.fechaHora(cierre.registradoAt)}</small></td>
                <td class="text-right cierre-acciones">${aprueba
                    ? `<button class="btn btn-primary btn-sm" type="button" data-revisar="aprobar" data-id="${this.escape(cierre.id)}"><i class="fas fa-check" aria-hidden="true"></i> Aprobar</button>
                       <button class="btn btn-secondary btn-sm" type="button" data-revisar="rechazar" data-id="${this.escape(cierre.id)}">Rechazar</button>`
                    : '<span class="badge badge-warning">En revisión</span>'}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    },

    // Por método, solo lo que no cuadró: así quien aprueba ve dónde está la diferencia.
    detalleDiferencias(cierre) {
        const partes = this.METODOS
            .filter((metodo) => cierre.diferencia[metodo.key])
            .map((metodo) => `${metodo.label}: ${cierre.diferencia[metodo.key] < 0 ? 'falta' : 'sobra'} ${formatQ(Math.abs(cierre.diferencia[metodo.key]))}`);
        return partes.length ? `<small class="cierre-sub">${partes.join(' · ')}</small>` : '';
    },

    async revisar(id, accion) {
        const cierre = (this.state.cierres || []).find((entry) => entry.id === id);
        if (!cierre) return;
        const detalle = `${cierre.numero} de ${cierre.cajeroNombre} (${formatQ(cierre.recibido.total)} recibido)`;
        let body = {};
        if (accion === 'aprobar') {
            const diferencia = cierre.diferencia.efectivo;
            const aviso = diferencia ? ` El ${diferencia < 0 ? 'faltante' : 'sobrante'} de efectivo de ${formatQ(Math.abs(diferencia))} se registrará en Caja.` : '';
            if (!confirm(`¿Aprobar el cierre ${detalle}?${aviso}`)) return;
        } else {
            const motivo = prompt(`¿Por qué rechazas el cierre ${detalle}? Sus cobros volverán a quedar por cerrar para que se cuenten de nuevo.`, '');
            if (motivo === null) return;
            if (!motivo.trim()) return showNotification('Escribe el motivo del rechazo.', 'error');
            body = { motivo: motivo.trim() };
        }
        try {
            const data = await this.request(`/${encodeURIComponent(id)}/${accion}`, { method: 'POST', body: JSON.stringify(body) });
            showNotification(data.message, 'success');
            await this.load();
            if (typeof CajaModule !== 'undefined') CajaModule.loadData();
            if (typeof NotificationsModule !== 'undefined') NotificationsModule.refresh();
        } catch (error) {
            showNotification(`No se pudo ${accion} el cierre: ${error.message}`, 'error');
            this.load();
        }
    },

    renderPendientes() {
        const puedeCerrar = this.puedeCerrar();
        const contenedor = document.getElementById('cierresPendientes');
        if (!this.state.pendientes.length) {
            contenedor.innerHTML = '<p class="cierres-vacio">No hay cobros por cerrar: todas las cajas están cerradas.</p>';
            return;
        }
        contenedor.innerHTML = `<h3 class="cierres-subtitulo cierres-subtitulo-neutro">Cajas por cerrar</h3>
        <table class="data-table">
            <thead><tr><th scope="col">Cajera</th><th scope="col">Desde</th><th scope="col" class="text-right">Efectivo</th><th scope="col" class="text-right">Tarjeta</th><th scope="col" class="text-right">Transferencia</th><th scope="col" class="text-right">Total</th><th scope="col"><span class="sr-only">Cerrar</span></th></tr></thead>
            <tbody>${this.state.pendientes.map((caja, indice) => `<tr>
                <td><strong>${this.escape(caja.cajeroNombre)}</strong><small class="cierre-sub">${caja.ventas} ${caja.ventas === 1 ? 'venta' : 'ventas'}${caja.abonos ? ` · ${caja.abonos} ${caja.abonos === 1 ? 'abono' : 'abonos'}` : ''}${caja.otros ? ` · otros ${formatQ(caja.otros)}` : ''}</small></td>
                <td>${this.fecha(caja.desde)}${caja.hastaFecha !== caja.desde ? ` al ${this.fecha(caja.hastaFecha)}` : ''}</td>
                <td class="text-right">${formatQ(caja.efectivo)}</td>
                <td class="text-right">${formatQ(caja.tarjeta)}</td>
                <td class="text-right">${formatQ(caja.transferencia)}</td>
                <td class="text-right"><strong>${formatQ(caja.total)}</strong></td>
                <td class="text-right">${puedeCerrar ? `<button class="btn btn-primary btn-sm" type="button" data-cerrar="${indice}"><i class="fas fa-lock" aria-hidden="true"></i> Cerrar caja</button>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    },

    renderHistorial(cierres) {
        const contenedor = document.getElementById('cierresHistorial');
        if (!cierres.length) {
            contenedor.innerHTML = '<p class="cierres-vacio">Aún no hay cierres.</p>';
            return;
        }
        contenedor.innerHTML = `<table class="data-table">
            <thead><tr><th scope="col">Cierre</th><th scope="col">Cajera</th><th scope="col">Cobros del</th><th scope="col" class="text-right">Sistema</th><th scope="col" class="text-right">Recibido</th><th scope="col">Resultado</th><th scope="col">Registró</th><th scope="col">Aprobó o rechazó</th></tr></thead>
            <tbody>${cierres.map((cierre) => `<tr>
                <td><strong>${this.escape(cierre.numero)}</strong></td>
                <td>${this.escape(cierre.cajeroNombre || '—')}</td>
                <td>${this.fecha(cierre.desde)}${cierre.hasta && cierre.hasta !== cierre.desde ? ` al ${this.fecha(cierre.hasta)}` : ''}</td>
                <td class="text-right">${formatQ(cierre.sistema.total)}</td>
                <td class="text-right">${formatQ(cierre.recibido.total)}</td>
                <td>${cierre.estado === 'inicial' ? '<span class="badge">Inicial, sin revisar</span>'
                    : cierre.estado === 'rechazado' ? `<span class="badge badge-danger">Rechazado</span><small class="cierre-sub">${this.escape(cierre.motivoRechazo || '')}</small>`
                    : this.resultadoBadge(cierre.diferencia.total, cierre)}${cierre.nota && cierre.estado !== 'inicial' ? `<small class="cierre-sub">${this.escape(cierre.nota)}</small>` : ''}</td>
                <td>${cierre.registradoPor && cierre.estado !== 'inicial' ? this.escape(cierre.registradoPor) : '—'}</td>
                <td>${cierre.estado === 'rechazado'
                    ? `${this.escape(cierre.rechazadoPor || '—')}<small class="cierre-sub">${this.fechaHora(cierre.rechazadoAt)}</small>`
                    : cierre.aprobadoPor ? `${this.escape(cierre.aprobadoPor)}<small class="cierre-sub">${this.fechaHora(cierre.aprobadoAt)}</small>` : '—'}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    },

    openCierre(indice) {
        const caja = this.state.pendientes[indice];
        if (caja) this.openCierreCaja(caja);
    },

    // caja.propio: la cajera cierra la suya y escribe lo que entrega; si no, quien cierra escribe lo que recibió.
    openCierreCaja(caja) {
        this.state.cierre = caja;
        document.getElementById('cierreForm').reset();
        document.getElementById('cierreModalTitle').textContent = caja.propio ? 'Cerrar mi caja' : `Cerrar caja de ${caja.cajeroNombre}`;
        const th = document.getElementById('cierreRecibidoTh');
        if (th) th.textContent = caja.propio ? 'Lo que entregas' : 'Lo que recibiste';
        document.getElementById('cierrePeriodo').textContent =
            `Cobros del ${this.fecha(caja.desde)}${caja.hastaFecha !== caja.desde ? ` al ${this.fecha(caja.hastaFecha)}` : ''}: ${caja.ventas} ${caja.ventas === 1 ? 'venta' : 'ventas'}${caja.abonos ? ` y ${caja.abonos} ${caja.abonos === 1 ? 'abono' : 'abonos'}` : ''}. ${caja.propio
                ? 'Cuenta el efectivo y los vouchers que entregas y escribe lo que de verdad hay. El administrador lo revisa y confirma.'
                : 'Escribe lo que de verdad recibiste.'}`;
        const metodos = this.METODOS.filter((metodo) => metodo.key !== 'otros' || caja.otros);
        document.getElementById('cierreFilas').innerHTML = metodos.map((metodo) => `<tr>
            <th scope="row"><i class="fas ${metodo.icon}" aria-hidden="true"></i> ${metodo.label}</th>
            <td class="text-right">${formatQ(caja[metodo.key])}</td>
            <td class="text-right">
                <div class="cierre-recibido">
                    <label class="sr-only" for="cierreRecibido-${metodo.key}">${metodo.recibido}</label>
                    <input id="cierreRecibido-${metodo.key}" class="form-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${metodo.recibido}" data-metodo="${metodo.key}">
                    <button class="btn btn-secondary btn-sm" type="button" data-igualar="${metodo.key}" title="Recibí lo mismo que dice el sistema">Igual</button>
                </div>
            </td>
            <td class="text-right" data-diferencia="${metodo.key}">—</td>
        </tr>`).join('');
        this.mostrarError('');
        this.renderDiferencias();
        document.getElementById('cierreAprobar').innerHTML = this.puedeAprobar()
            ? '<i class="fas fa-check" aria-hidden="true"></i> Aprobar cierre'
            : '<i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar a aprobación';
        document.getElementById('cierreModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('cierreRecibido-efectivo').focus();
    },

    // Diferencia = recibido − sistema: negativa es faltante, positiva sobrante.
    leerRecibidos() {
        const recibido = {};
        document.querySelectorAll('#cierreFilas [data-metodo]').forEach((input) => {
            recibido[input.dataset.metodo] = input.value === '' ? null : Number(input.value);
        });
        return recibido;
    },

    renderDiferencias() {
        const caja = this.state.cierre;
        const recibido = this.leerRecibidos();
        let completas = true;
        let total = 0;
        Object.entries(recibido).forEach(([metodo, valor]) => {
            const celda = document.querySelector(`#cierreFilas [data-diferencia="${metodo}"]`);
            if (valor === null || !Number.isFinite(valor)) {
                completas = false;
                celda.textContent = '—';
                celda.className = 'text-right';
                return;
            }
            const diferencia = Math.round((valor - caja[metodo]) * 100) / 100;
            total += diferencia;
            celda.textContent = diferencia === 0 ? 'Cuadra' : `${diferencia < 0 ? 'Falta' : 'Sobra'} ${formatQ(Math.abs(diferencia))}`;
            celda.className = `text-right ${diferencia === 0 ? 'cierre-ok' : diferencia < 0 ? 'cierre-falta' : 'cierre-sobra'}`;
        });
        total = Math.round(total * 100) / 100;
        document.getElementById('cierreResultado').textContent = !completas
            ? ''
            : total === 0 && Object.entries(recibido).every(([metodo, valor]) => Math.round((valor - caja[metodo]) * 100) === 0)
                ? 'Todo cuadra.'
                : `Diferencia total: ${total < 0 ? 'faltan' : total > 0 ? 'sobran' : ''} ${formatQ(Math.abs(total))}. Explícala en la nota.`;
    },

    async registrar() {
        const caja = this.state.cierre;
        const recibido = this.leerRecibidos();
        const faltante = this.METODOS.find((metodo) => metodo.key in recibido && (recibido[metodo.key] === null || !Number.isFinite(recibido[metodo.key]) || recibido[metodo.key] < 0));
        if (faltante) {
            document.getElementById(`cierreRecibido-${faltante.key}`).focus();
            return this.mostrarError(`Escribe ${faltante.recibido.toLowerCase()} (0 si no hubo).`);
        }
        const hayDiferencia = Object.entries(recibido).some(([metodo, valor]) => Math.round((valor - caja[metodo]) * 100) !== 0);
        const nota = document.getElementById('cierreNota').value.trim();
        if (hayDiferencia && !nota) {
            document.getElementById('cierreNota').focus();
            return this.mostrarError('Algo no cuadra: escribe en la nota qué pasó con la diferencia.');
        }
        const button = document.getElementById('cierreAprobar');
        button.disabled = true;
        this.mostrarError('');
        try {
            const data = caja.propio
                ? await this.request('/mi-cierre', { method: 'POST', body: JSON.stringify({ hasta: caja.hasta, recibido, nota }) })
                : await this.request('', { method: 'POST', body: JSON.stringify({ cajeroId: caja.cajeroId, hasta: caja.hasta, recibido, nota }) });
            this.closeModal();
            showNotification(data.message, hayDiferencia ? 'warning' : 'success');
            if (caja.propio) {
                await this.loadMiCaja();
                return;
            }
            await this.load();
            if (typeof CajaModule !== 'undefined') CajaModule.loadData();
            if (typeof NotificationsModule !== 'undefined') NotificationsModule.refresh();
        } catch (error) {
            this.mostrarError(error.message);
        } finally {
            button.disabled = false;
        }
    },

    closeModal() {
        document.getElementById('cierreModal').style.display = 'none';
        document.body.style.overflow = '';
    },

    mostrarError(mensaje) {
        const error = document.getElementById('cierreError');
        error.textContent = mensaje;
        error.hidden = !mensaje;
    },

    // ---------- Utilidades ----------

    resultadoBadge(diferenciaTotal, cierre = null) {
        const tieneDiferencias = cierre
            ? ['efectivo', 'tarjeta', 'transferencia', 'otros'].some((metodo) => cierre.diferencia[metodo] !== 0)
            : diferenciaTotal !== 0;
        if (!tieneDiferencias) return '<span class="badge badge-success">Cuadró</span>';
        if (diferenciaTotal < 0) return `<span class="badge badge-danger">Faltante ${formatQ(Math.abs(diferenciaTotal))}</span>`;
        if (diferenciaTotal > 0) return `<span class="badge badge-warning">Sobrante ${formatQ(diferenciaTotal)}</span>`;
        return '<span class="badge badge-warning">Con diferencias</span>';
    },

    fecha(value) {
        const [anio, mes, dia] = String(value || '').slice(0, 10).split('-');
        return dia ? `${dia}/${mes}/${anio}` : '—';
    },

    fechaHora(value) {
        return value ? new Date(value).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
