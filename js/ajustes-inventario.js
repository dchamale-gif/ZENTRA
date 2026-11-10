// ============================================
// AJUSTES DE INVENTARIO (regularizaciones)
// Carga inicial o conteo físico: se escribe cuántos hay y se aplica la diferencia.
// Muerte de animales y descuento de inventario: se escribe cuántos salen.
// Cada ajuste queda registrado con la existencia de antes y de después y se puede anular.
// ============================================

const AjustesInventarioModule = {
    state: {
        initialized: false,
        ajustes: [],
        tipos: {},
        motivos: {},
        filtro: '',
        articulos: [],
        // articuloId -> { articulo, valor, nota }
        lineas: new Map(),
        detalle: null
    },

    TEXTOS: {
        carga_inicial: { columna: 'Existencia contada', nota: 'Opcional' },
        mortalidad: { columna: 'Animales que murieron', nota: 'Causa (opcional)' },
        descuento: { columna: 'Cantidad a descontar', nota: 'Detalle (opcional)' }
    },

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        this.field('ajusteNuevoBtn').addEventListener('click', () => this.openNuevo());
        this.field('ajustesFiltros').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-tipo]');
            if (!chip) return;
            this.state.filtro = chip.dataset.tipo;
            this.field('ajustesFiltros').querySelectorAll('.pos-chip').forEach((element) => {
                element.classList.toggle('active', element === chip);
            });
            this.render();
        });
        this.field('ajustesBody').addEventListener('click', (event) => {
            const button = event.target.closest('[data-ajuste]');
            if (button) this.openDetalle(button.dataset.ajuste);
        });

        document.querySelectorAll('input[name="ajusteTipo"]').forEach((radio) => {
            radio.addEventListener('change', () => this.cambiarTipo());
        });
        this.field('ajusteForm').addEventListener('submit', (event) => {
            event.preventDefault();
            this.guardar();
        });
        const buscar = this.field('ajusteBuscar');
        buscar.addEventListener('input', () => this.renderResultados());
        buscar.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.field('ajusteResultados').querySelector('button:not(:disabled)')?.click();
        });
        this.field('ajusteResultados').addEventListener('click', (event) => {
            const button = event.target.closest('[data-articulo]');
            if (button) this.agregar(button.dataset.articulo, { enfocar: true });
        });
        this.field('ajusteAgregarTodos').addEventListener('click', () => this.agregarTodos());
        this.field('ajustePegarBtn').addEventListener('click', () => {
            const panel = this.field('ajustePegar');
            panel.hidden = !panel.hidden;
            if (!panel.hidden) this.field('ajustePegarTexto').focus();
        });
        this.field('ajustePegarAplicar').addEventListener('click', () => this.pegar());

        const lineas = this.field('ajusteLineas');
        lineas.addEventListener('input', (event) => {
            const fila = event.target.closest('[data-linea]');
            const linea = fila && this.state.lineas.get(fila.dataset.linea);
            if (!linea) return;
            if (event.target.dataset.campo === 'valor') {
                linea.valor = event.target.value;
                this.actualizarFila(fila, linea);
                this.renderTotal();
            } else if (event.target.dataset.campo === 'nota') {
                linea.nota = event.target.value;
            }
        });
        lineas.addEventListener('click', (event) => {
            const quitar = event.target.closest('[data-quitar]');
            if (!quitar) return;
            this.state.lineas.delete(quitar.dataset.quitar);
            this.renderLineas();
        });
    },

    field(id) {
        return document.getElementById(id);
    },

    puedeEditar() {
        return typeof AccessControl === 'undefined' || AccessControl.canEdit('articulos');
    },

    async request(path, options = {}) {
        const response = await authManager.fetchWithAuth(path, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (!response) throw new Error('La sesión expiró');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    },

    // ---------- Lista ----------

    async load() {
        this.init();
        this.field('ajusteNuevoBtn').hidden = !this.puedeEditar();
        try {
            const data = await this.request('/api/ajustes-inventario');
            this.state.ajustes = data.ajustes;
            this.state.tipos = data.tipos;
            this.state.motivos = data.motivos;
            this.render();
        } catch (error) {
            this.field('ajustesBody').innerHTML = `<tr><td colspan="9">${this.escape(error.message)}</td></tr>`;
        }
    },

    render() {
        this.renderResumen();
        const filas = this.state.ajustes.filter((ajuste) => !this.state.filtro || ajuste.tipo === this.state.filtro);
        const body = this.field('ajustesBody');
        if (!filas.length) {
            body.innerHTML = `<tr><td colspan="9" class="text-center">${this.state.ajustes.length
                ? 'No hay ajustes de este tipo.'
                : 'Aún no hay ajustes. Usa «Nuevo ajuste» para cargar la existencia inicial o registrar una baja.'}</td></tr>`;
            return;
        }
        body.innerHTML = filas.map((ajuste) => {
            const anulado = ajuste.estado === 'anulado';
            const unidades = Number(ajuste.unidades);
            return `<tr class="${anulado ? 'row-muted' : ''}">
                <td><strong>${this.escape(ajuste.numero)}</strong></td>
                <td>${this.fecha(ajuste.fecha)}</td>
                <td>${this.tipoTexto(ajuste)}</td>
                <td class="text-right">${Number(ajuste.lineas)}</td>
                <td class="text-right">${unidades > 0 ? '+' : ''}${unidades.toLocaleString('es-GT')}</td>
                <td class="text-right">${formatQ(Math.abs(Number(ajuste.valor)))}</td>
                <td>${this.escape(ajuste.usuario_nombre || '—')}</td>
                <td>${anulado ? '<span class="badge badge-danger">Anulado</span>' : '<span class="badge badge-success">Aplicado</span>'}</td>
                <td class="actions">
                    <button class="btn-icon" type="button" data-ajuste="${this.escape(ajuste.id)}" title="Ver detalle" aria-label="Ver detalle de ${this.escape(ajuste.numero)}">
                        <i class="fas fa-eye" aria-hidden="true"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    },

    // Pérdidas del mes: lo que sale por muerte y por descuentos, valorado al precio de compra.
    renderResumen() {
        const mes = this.hoy().slice(0, 7);
        const delMes = this.state.ajustes.filter((ajuste) => ajuste.estado === 'aplicado' && String(ajuste.fecha).slice(0, 7) === mes);
        const suma = (tipo, campo) => delMes.filter((ajuste) => ajuste.tipo === tipo)
            .reduce((total, ajuste) => total + Math.abs(Number(ajuste[campo])), 0);
        const tile = (label, value, cls = '') => `<div class="stat-tile ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
        this.field('ajustesResumen').innerHTML = this.state.ajustes.length ? [
            tile('Animales muertos este mes', suma('mortalidad', 'unidades').toLocaleString('es-GT'), suma('mortalidad', 'unidades') ? 'is-warning' : ''),
            tile('Pérdida por muerte este mes', formatQ(suma('mortalidad', 'valor'))),
            tile('Descuentos este mes', formatQ(suma('descuento', 'valor'))),
            tile('Ajustes este mes', delMes.length.toLocaleString('es-GT'))
        ].join('') : '';
    },

    tipoTexto(ajuste) {
        const tipo = this.state.tipos[ajuste.tipo] || ajuste.tipo;
        return ajuste.motivo ? `${this.escape(tipo)} · ${this.escape(this.state.motivos[ajuste.motivo] || ajuste.motivo)}` : this.escape(tipo);
    },

    // ---------- Nuevo ajuste ----------

    tipo() {
        return document.querySelector('input[name="ajusteTipo"]:checked')?.value || 'carga_inicial';
    },

    esCarga() {
        return this.tipo() === 'carga_inicial';
    },

    async openNuevo(tipo = 'carga_inicial') {
        this.field('ajusteForm').reset();
        document.querySelector(`input[name="ajusteTipo"][value="${tipo}"]`).checked = true;
        this.field('ajusteFecha').value = this.hoy();
        this.field('ajustePegar').hidden = true;
        this.field('ajustePegarAviso').textContent = '';
        this.state.lineas = new Map();
        this.mostrarError('');
        this.cambiarTipo();
        this.openModal('ajusteModal');
        this.field('ajusteBuscar').focus();
        try {
            const data = await this.request('/api/codigos-articulos?activo=true');
            this.state.articulos = data.articulos;
            const secciones = [...new Set(data.articulos.map((a) => a.categoria).filter(Boolean))].sort();
            this.field('ajusteSeccion').innerHTML = '<option value="">Todas las secciones</option>' +
                secciones.map((seccion) => `<option value="${this.escape(seccion)}">${this.escape(seccion)}</option>`).join('');
        } catch (error) {
            this.mostrarError(`No se pudieron cargar los artículos: ${error.message}`);
        }
    },

    // Al cambiar de tipo cambia el significado de la cantidad: se vacían los números escritos.
    cambiarTipo() {
        const tipo = this.tipo();
        this.field('ajusteMotivoGroup').hidden = tipo !== 'descuento';
        this.field('ajusteCargaTools').hidden = tipo !== 'carga_inicial';
        if (tipo !== 'carga_inicial') this.field('ajustePegar').hidden = true;
        this.field('ajusteColCantidad').textContent = this.TEXTOS[tipo].columna;
        this.state.lineas.forEach((linea) => { linea.valor = ''; });
        this.renderLineas();
    },

    renderResultados() {
        const texto = this.normalizar(this.field('ajusteBuscar').value);
        const resultados = this.field('ajusteResultados');
        if (!texto) {
            resultados.hidden = true;
            return;
        }
        const encontrados = this.state.articulos.filter((articulo) => this.normalizar(
            `${articulo.nombre_articulo} ${articulo.codigo} ${articulo.codigo_barras || ''}`
        ).includes(texto)).slice(0, 20);
        const salida = !this.esCarga();
        resultados.innerHTML = encontrados.length ? encontrados.map((articulo) => {
            const existencia = Number(articulo.cantidad_disponible || 0);
            const sinExistencia = salida && existencia <= 0;
            return `<button class="concept-search-result" type="button" data-articulo="${this.escape(articulo.id)}" ${sinExistencia ? 'disabled' : ''}>
                <strong>${this.escape(articulo.nombre_articulo)}</strong>
                <small>${this.escape(articulo.codigo)} · ${sinExistencia ? 'sin existencia' : `hay ${existencia}`}${this.state.lineas.has(articulo.id) ? ' · ya agregado' : ''}</small>
            </button>`;
        }).join('') : '<div class="concept-search-empty">No hay artículos activos con ese nombre o código.</div>';
        resultados.hidden = false;
    },

    // render: false cuando se agregan muchos de una vez (pegar desde Excel); se dibuja al final.
    agregar(articuloId, { enfocar = false, valor = '', render = true } = {}) {
        const articulo = this.state.articulos.find((entry) => entry.id === articuloId);
        if (!articulo) return;
        if (!this.state.lineas.has(articuloId)) {
            this.state.lineas.set(articuloId, { articulo, valor, nota: '' });
        } else if (valor !== '') {
            this.state.lineas.get(articuloId).valor = valor;
        }
        if (!render) return;
        this.field('ajusteBuscar').value = '';
        this.field('ajusteResultados').hidden = true;
        this.renderLineas();
        if (enfocar) {
            this.field('ajusteLineas').querySelector(`[data-linea="${CSS.escape(articuloId)}"] input[data-campo="valor"]`)?.focus();
        }
    },

    // Hoja de conteo: todos los artículos activos (o de una sección) con la cantidad vacía.
    agregarTodos() {
        const seccion = this.field('ajusteSeccion').value;
        const nuevos = this.state.articulos.filter((articulo) => (!seccion || articulo.categoria === seccion) && !this.state.lineas.has(articulo.id));
        nuevos.forEach((articulo) => this.state.lineas.set(articulo.id, { articulo, valor: '', nota: '' }));
        this.renderLineas();
        showNotification(nuevos.length
            ? `${nuevos.length} artículos agregados. Escribe lo que contaste; las filas vacías no se cambian.`
            : 'Esos artículos ya están en la lista.', 'info');
    },

    // Dos columnas copiadas de Excel (código y cantidad), separadas por tabulador, punto y coma o coma.
    pegar() {
        const texto = this.field('ajustePegarTexto').value;
        const porCodigo = new Map();
        this.state.articulos.forEach((articulo) => {
            [articulo.codigo, articulo.codigo_barras].filter(Boolean)
                .forEach((codigo) => porCodigo.set(String(codigo).trim().toLowerCase(), articulo));
        });
        let cargados = 0;
        const noEncontrados = [];
        const invalidos = [];
        texto.split(/\r?\n/).map((fila) => fila.trim()).filter(Boolean).forEach((fila, indice) => {
            const partes = fila.split(/\t|;|,(?=[^,]*$)/).map((parte) => parte.trim());
            if (partes.length < 2) return invalidos.push(fila);
            const codigo = partes[0].toLowerCase();
            const cantidad = partes[partes.length - 1].replace(/\s/g, '');
            const articulo = porCodigo.get(codigo);
            // La primera fila suele ser el encabezado («Código / Cantidad»): se ignora.
            if (indice === 0 && !articulo && !/^\d+$/.test(cantidad)) return;
            if (!articulo) return noEncontrados.push(partes[0]);
            if (!/^\d+$/.test(cantidad)) return invalidos.push(fila);
            this.agregar(articulo.id, { valor: String(Number(cantidad)), render: false });
            cargados += 1;
        });
        this.renderLineas();
        const avisos = [`${cargados} ${cargados === 1 ? 'artículo cargado' : 'artículos cargados'}`];
        if (noEncontrados.length) avisos.push(`sin coincidencia: ${noEncontrados.slice(0, 8).join(', ')}${noEncontrados.length > 8 ? ` y ${noEncontrados.length - 8} más` : ''}`);
        if (invalidos.length) avisos.push(`${invalidos.length} con cantidad no válida`);
        this.field('ajustePegarAviso').textContent = `${avisos.join(' · ')}.`;
        if (cargados) this.field('ajustePegarTexto').value = '';
    },

    renderLineas() {
        const body = this.field('ajusteLineas');
        const textos = this.TEXTOS[this.tipo()];
        if (!this.state.lineas.size) {
            body.innerHTML = `<tr><td colspan="6" class="text-center">${this.esCarga()
                ? 'Busca un artículo, agrega todos para contarlos o pega las cantidades desde Excel.'
                : 'Busca el artículo que vas a descontar.'}</td></tr>`;
            this.renderTotal();
            return;
        }
        body.innerHTML = [...this.state.lineas.entries()].map(([id, linea]) => {
            const articulo = linea.articulo;
            const existencia = Number(articulo.cantidad_disponible || 0);
            return `<tr data-linea="${this.escape(id)}">
                <td><strong>${this.escape(articulo.nombre_articulo)}</strong><small class="ajuste-codigo">${this.escape(articulo.codigo)}</small></td>
                <td class="text-right">${existencia.toLocaleString('es-GT')}</td>
                <td class="text-right"><input class="form-input ajuste-cantidad" type="number" min="${this.esCarga() ? 0 : 1}" ${this.esCarga() ? '' : `max="${existencia}"`} step="1" inputmode="numeric"
                    data-campo="valor" value="${this.escape(linea.valor)}" aria-label="${this.escape(textos.columna)} de ${this.escape(articulo.nombre_articulo)}"></td>
                <td class="text-right" data-quedara></td>
                <td><input class="form-input ajuste-nota" type="text" maxlength="200" data-campo="nota" value="${this.escape(linea.nota)}" placeholder="${this.escape(textos.nota)}" aria-label="Nota de ${this.escape(articulo.nombre_articulo)}"></td>
                <td><button class="btn-icon" type="button" data-quitar="${this.escape(id)}" title="Quitar" aria-label="Quitar ${this.escape(articulo.nombre_articulo)}"><i class="fas fa-xmark" aria-hidden="true"></i></button></td>
            </tr>`;
        }).join('');
        body.querySelectorAll('[data-linea]').forEach((fila) => this.actualizarFila(fila, this.state.lineas.get(fila.dataset.linea)));
        this.renderTotal();
    },

    // Diferencia que se aplicará en una línea, o null si está vacía o no es válida.
    diferencia(linea) {
        if (linea.valor === '' || linea.valor === null) return null;
        const valor = Number(linea.valor);
        if (!Number.isInteger(valor) || valor < 0) return null;
        const existencia = Number(linea.articulo.cantidad_disponible || 0);
        return this.esCarga() ? valor - existencia : -valor;
    },

    actualizarFila(fila, linea) {
        const celda = fila.querySelector('[data-quedara]');
        const existencia = Number(linea.articulo.cantidad_disponible || 0);
        const diferencia = this.diferencia(linea);
        fila.classList.remove('ajuste-sube', 'ajuste-baja', 'ajuste-falta');
        if (diferencia === null) {
            celda.textContent = linea.valor === '' ? '—' : 'No válida';
            return;
        }
        const nueva = existencia + diferencia;
        if (nueva < 0) {
            celda.textContent = `Solo hay ${existencia}`;
            fila.classList.add('ajuste-falta');
            return;
        }
        celda.textContent = diferencia === 0 ? `${nueva} (sin cambio)` : `${nueva} (${diferencia > 0 ? '+' : ''}${diferencia})`;
        if (diferencia) fila.classList.add(diferencia > 0 ? 'ajuste-sube' : 'ajuste-baja');
    },

    renderTotal() {
        let lineas = 0;
        let unidades = 0;
        let valor = 0;
        this.state.lineas.forEach((linea) => {
            const diferencia = this.diferencia(linea);
            if (!diferencia) return;
            lineas += 1;
            unidades += diferencia;
            valor += diferencia * Number(linea.articulo.precio_costo || 0);
        });
        this.field('ajusteTotal').textContent = lineas
            ? `${lineas} ${lineas === 1 ? 'artículo cambia' : 'artículos cambian'} · ${unidades > 0 ? '+' : ''}${unidades} unidades · ${valor < 0 ? 'pérdida' : 'valor'} al costo ${formatQ(Math.abs(valor))}`
            : '';
    },

    async guardar() {
        const tipo = this.tipo();
        const carga = tipo === 'carga_inicial';
        const items = [];
        const problemas = [];
        this.state.lineas.forEach((linea, id) => {
            if (linea.valor === '') return;
            const diferencia = this.diferencia(linea);
            const nombre = linea.articulo.nombre_articulo;
            if (diferencia === null || (!carga && Number(linea.valor) < 1)) return problemas.push(`«${nombre}»: escribe un número entero${carga ? '' : ' mayor que 0'}`);
            if (Number(linea.articulo.cantidad_disponible || 0) + diferencia < 0) return problemas.push(`«${nombre}»: solo hay ${linea.articulo.cantidad_disponible || 0}`);
            items.push(carga
                ? { articulo_id: id, existencia: Number(linea.valor), nota: linea.nota }
                : { articulo_id: id, cantidad: Number(linea.valor), nota: linea.nota });
        });
        if (problemas.length) return this.mostrarError(problemas.slice(0, 4).join('. ') + '.');
        if (!items.length) {
            return this.mostrarError(carga
                ? 'Escribe la existencia contada de al menos un artículo.'
                : 'Escribe cuántos se descuentan de al menos un artículo.');
        }
        const motivo = this.field('ajusteMotivo').value;
        const observaciones = this.field('ajusteObservaciones').value.trim();
        if (tipo === 'descuento' && motivo === 'otro' && !observaciones) {
            this.field('ajusteObservaciones').focus();
            return this.mostrarError('Escribe en observaciones el motivo del descuento.');
        }

        const button = this.field('ajusteGuardar');
        button.disabled = true;
        this.mostrarError('');
        try {
            const data = await this.request('/api/ajustes-inventario', {
                method: 'POST',
                body: JSON.stringify({ tipo, motivo, fecha: this.field('ajusteFecha').value, observaciones, items })
            });
            this.closeModal('ajusteModal');
            showNotification(data.message, 'success');
            await this.load();
        } catch (error) {
            this.mostrarError(error.message);
        } finally {
            button.disabled = false;
        }
    },

    mostrarError(mensaje) {
        const error = this.field('ajusteError');
        error.textContent = mensaje;
        error.hidden = !mensaje;
    },

    // ---------- Detalle y anulación ----------

    async openDetalle(id) {
        try {
            const { ajuste } = await this.request(`/api/ajustes-inventario/${encodeURIComponent(id)}`);
            this.state.detalle = ajuste;
            const anulado = ajuste.estado === 'anulado';
            this.field('ajusteDetalleTitle').textContent = `Ajuste ${ajuste.numero}`;
            this.field('ajusteDetalleBody').innerHTML = `
                <dl class="info-grid">
                    <div><dt>Tipo</dt><dd>${this.tipoTexto(ajuste)}</dd></div>
                    <div><dt>Fecha</dt><dd>${this.fecha(ajuste.fecha)}</dd></div>
                    <div><dt>Registró</dt><dd>${this.escape(ajuste.usuario_nombre || '—')}</dd></div>
                    <div><dt>Estado</dt><dd>${anulado ? '<span class="badge badge-danger">Anulado</span>' : '<span class="badge badge-success">Aplicado</span>'}</dd></div>
                    ${ajuste.observaciones ? `<div class="info-grid-wide"><dt>Observaciones</dt><dd>${this.escape(ajuste.observaciones)}</dd></div>` : ''}
                    ${anulado ? `<div class="info-grid-wide"><dt>Anulación</dt><dd>${this.escape(ajuste.anulado_por_nombre || '')} · ${this.escape(new Date(ajuste.anulado_at).toLocaleString('es-GT'))} · ${this.escape(ajuste.motivo_anulacion || '')}</dd></div>` : ''}
                </dl>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead><tr><th scope="col">Artículo</th><th scope="col" class="text-right">Antes</th><th scope="col" class="text-right">Cambio</th><th scope="col" class="text-right">Después</th><th scope="col" class="text-right">Valor al costo</th><th scope="col">Nota</th></tr></thead>
                        <tbody>${ajuste.items.map((item) => `<tr>
                            <td><strong>${this.escape(item.nombre_articulo)}</strong><small class="ajuste-codigo">${this.escape(item.codigo)}</small></td>
                            <td class="text-right">${item.existencia_anterior}</td>
                            <td class="text-right">${item.cantidad > 0 ? '+' : ''}${item.cantidad}</td>
                            <td class="text-right">${item.existencia_nueva}</td>
                            <td class="text-right">${item.costo_unitario === null ? '—' : formatQ(Math.abs(item.cantidad * Number(item.costo_unitario)))}</td>
                            <td>${this.escape(item.nota || '')}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
                ${!anulado && this.puedeEditar() ? `
                <div class="form-group" id="ajusteAnularGroup" hidden>
                    <label for="ajusteAnularMotivo">Motivo de la anulación</label>
                    <input id="ajusteAnularMotivo" class="form-input" maxlength="500" autocomplete="off" placeholder="Ej: se contó mal la sección de peces">
                    <small>Cada artículo vuelve a la existencia que tenía, sin perder las ventas y compras que hubo después.</small>
                </div>` : ''}
                <p id="ajusteDetalleError" class="form-error" role="alert" hidden></p>`;
            this.field('ajusteDetalleFooter').innerHTML = `
                ${!anulado && this.puedeEditar() ? '<button type="button" class="btn btn-secondary btn-danger-text" id="ajusteAnularBtn">Anular ajuste</button>' : ''}
                <button type="button" class="btn btn-primary" onclick="AjustesInventarioModule.closeModal('ajusteDetalleModal')">Cerrar</button>`;
            this.field('ajusteAnularBtn')?.addEventListener('click', () => this.anular());
            this.openModal('ajusteDetalleModal');
        } catch (error) {
            showNotification(error.message, 'error');
        }
    },

    async anular() {
        const group = this.field('ajusteAnularGroup');
        const motivo = this.field('ajusteAnularMotivo');
        const button = this.field('ajusteAnularBtn');
        const error = this.field('ajusteDetalleError');
        if (group.hidden) {
            group.hidden = false;
            button.textContent = 'Confirmar anulación';
            motivo.focus();
            return;
        }
        if (!motivo.value.trim()) {
            error.textContent = 'Escribe el motivo de la anulación.';
            error.hidden = false;
            motivo.focus();
            return;
        }
        button.disabled = true;
        error.hidden = true;
        try {
            const data = await this.request(`/api/ajustes-inventario/${encodeURIComponent(this.state.detalle.id)}/anular`, {
                method: 'POST', body: JSON.stringify({ motivo: motivo.value.trim() })
            });
            this.closeModal('ajusteDetalleModal');
            showNotification(data.message, 'success');
            await this.load();
        } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
        } finally {
            button.disabled = false;
        }
    },

    // ---------- Utilidades ----------

    openModal(id) {
        this.field(id).style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeModal(id) {
        this.field(id).style.display = 'none';
        document.body.style.overflow = '';
    },

    hoy() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },

    // Fechas 'YYYY-MM-DD' sin correrlas por la zona horaria.
    fecha(value) {
        const [anio, mes, dia] = String(value || '').slice(0, 10).split('-');
        return dia ? `${dia}/${mes}/${anio}` : '—';
    },

    normalizar(value) {
        return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
