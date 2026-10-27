// ============================================
// MÓDULO DE CÓDIGOS DE ARTÍCULOS
// ============================================
// Sistema dual: Código de venta (interno) + Código de compra (externo)
// Búsqueda por sección, familia, subfamilia y concepto

const CodigosArticulosModule = {
    state: {
        articulos: [],
        secciones: [],
        familias: [],
        subfamilias: [],
        catalogo: [],
        searchTerm: '',
        filterSeccion: 'todos',
        filterFamilia: 'todos',
        selectedArticulo: null
    },

    // Inicializar
    init() {
        this.setupEventListeners();
        this.loadData();
        this.renderSecciones();
        console.log('Módulo de Códigos de Artículos inicializado');
    },

    // Setup event listeners
    setupEventListeners() {
        const searchInput = document.getElementById('searchArticulos');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.state.searchTerm = e.target.value.toLowerCase();
                this.renderArticulos();
            });
        }

        const seccionFilter = document.getElementById('filterSeccion');
        if (seccionFilter) {
            seccionFilter.addEventListener('change', (e) => {
                this.state.filterSeccion = e.target.value;
                this.renderFamilias();
                this.renderArticulos();
            });
        }

        const familiaFilter = document.getElementById('filterFamilia');
        if (familiaFilter) {
            familiaFilter.addEventListener('change', (e) => {
                this.state.filterFamilia = e.target.value;
                this.renderArticulos();
            });
        }

        const addArticuloBtn = document.getElementById('addArticuloBtn');
        document.getElementById('importArticulosBtn')?.addEventListener('click', () => {
            BulkImport.open({
                title: 'Importar artículos desde Excel',
                endpoint: '/api/codigos-articulos/import',
                templateName: 'plantilla_articulos',
                columns: [
                    { key: 'nombre_articulo', label: 'Nombre', required: true, example: 'Cuaderno profesional', aliases: ['nombre', 'articulo', 'producto'] },
                    { key: 'codigo', label: 'Código', example: 'ART-001' },
                    { key: 'descripcion', label: 'Descripción', example: '100 hojas' },
                    { key: 'categoria', label: 'Categoría', example: 'Papelería' },
                    { key: 'familia', label: 'Familia', example: 'Escolar' },
                    { key: 'subfamilia', label: 'Subfamilia', example: '' },
                    { key: 'precio_unitario', label: 'Precio venta', example: 25.5, aliases: ['precio'] },
                    { key: 'precio_costo', label: 'Precio costo', example: 15, aliases: ['costo'] },
                    { key: 'cantidad_disponible', label: 'Cantidad', example: 100, aliases: ['stock', 'existencia'] },
                    { key: 'unidad_medida', label: 'Unidad de medida', example: 'unidad' },
                    { key: 'codigo_barras', label: 'Código de barras', example: '' },
                    { key: 'tipo', label: 'Tipo', example: 'producto' }
                ],
                onDone: () => this.loadData()
            });
        });
        if (addArticuloBtn) {
            addArticuloBtn.addEventListener('click', () => this.openArticuloModal());
        }

        const saveArticuloBtn = document.getElementById('saveArticuloBtn');
        if (saveArticuloBtn) {
            saveArticuloBtn.addEventListener('click', () => this.saveArticulo());
        }

        const closeModal = document.querySelector('#articuloModal .close-btn');
        if (closeModal) {
            closeModal.addEventListener('click', () => this.closeArticuloModal());
        }
    },

    normalizeArticulo(articulo) {
        const normalized = {
            id: String(articulo.id),
            nombre: articulo.nombre_articulo || '',
            concepto: articulo.descripcion2 || articulo.nombre_articulo || '',
            codigoVenta: articulo.codigo || '',
            codigoCompra: articulo.codigo_barras || articulo.codigo_alternativo || '',
            seccionId: articulo.categoria || '',
            familiaId: articulo.familia || '',
            subfamiliaId: articulo.subfamilia || '',
            precioCompra: Number(articulo.precio_costo) || 0,
            precioVenta: Number(articulo.precio_unitario) || 0,
            cantidadDisponible: Number(articulo.cantidad_disponible) || 0,
            unidadMedida: articulo.unidad_medida || '',
            codigoAlternativo: articulo.codigo_alternativo || '',
            tipo: articulo.tipo || 'producto',
            estado: articulo.activo === false ? 'inactivo' : 'activo',
            descripcion: articulo.descripcion || '',
            descripcion2: articulo.descripcion2 || '',
            fotoVersion: articulo.foto_version || '',
            activo: articulo.activo !== false
        };

        return {
            ...articulo,
            ...normalized,
            nombre_articulo: normalized.nombre,
            codigo: normalized.codigoVenta,
            codigo_barras: normalized.codigoCompra,
            categoria: normalized.seccionId,
            familia: normalized.familiaId,
            subfamilia: normalized.subfamiliaId,
            precio_costo: normalized.precioCompra,
            precio_unitario: normalized.precioVenta,
            cantidad_disponible: normalized.cantidadDisponible,
            unidad_medida: normalized.unidadMedida
        };
    },

    buildClasificaciones() {
        const secciones = new Map(this.getDefaultSecciones().map(item => [item.id, item]));
        const familias = new Map();
        const subfamilias = new Map();

        this.getDefaultFamilias().forEach(item => familias.set(`${item.seccionId}|${item.id}`, item));
        this.getDefaultSubfamilias().forEach(item => subfamilias.set(`${item.familiaId}|${item.id}`, item));

        this.state.articulos.forEach(articulo => {
            if (articulo.seccionId && !secciones.has(articulo.seccionId)) {
                secciones.set(articulo.seccionId, { id: articulo.seccionId, nombre: articulo.seccionId });
            }
            if (articulo.familiaId) {
                const familiaKey = `${articulo.seccionId}|${articulo.familiaId}`;
                if (!familias.has(familiaKey)) {
                    familias.set(familiaKey, {
                        id: articulo.familiaId,
                        seccionId: articulo.seccionId,
                        nombre: articulo.familiaId
                    });
                }
            }
            if (articulo.subfamiliaId) {
                const subfamiliaKey = `${articulo.familiaId}|${articulo.subfamiliaId}`;
                if (!subfamilias.has(subfamiliaKey)) {
                    subfamilias.set(subfamiliaKey, {
                        id: articulo.subfamiliaId,
                        familiaId: articulo.familiaId,
                        nombre: articulo.subfamiliaId
                    });
                }
            }
        });

        this.state.secciones = [...secciones.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.state.familias = [...familias.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.state.subfamilias = [...subfamilias.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    },

    // Cargar datos desde API
    async loadData() {
        try {
            const token = authManager.getToken();
            if (!token) {
                console.warn('No hay token de autenticación');
                return;
            }

            const response = await fetch(`${authManager.apiBaseUrl}/api/codigos-articulos`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            await this.loadCatalogo();
            this.state.articulos = (data.articulos || []).map(articulo => this.normalizeArticulo(articulo));
            this.buildClasificaciones();
            this.renderSecciones();
            this.renderFamilias();
            this.renderArticulos();
            
            console.log(`✅ ${this.state.articulos.length} artículos cargados desde BD`);
        } catch (error) {
            console.error('❌ Error cargando artículos:', error);
            this.showNotification('❌ Error: No se puede acceder a la base de datos de artículos. Verifica tu conexión.', 'error');
            this.state.articulos = [];
            this.renderArticulos();
        }
    },

    // Catálogo configurado en Configuración (el nombre se guarda en el artículo)
    getDefaultSecciones() {
        return this.state.catalogo
            .filter(c => c.nivel === 'seccion')
            .map(c => ({ id: c.nombre, nombre: c.nombre }));
    },

    getDefaultFamilias() {
        const byId = new Map(this.state.catalogo.map(c => [c.id, c]));
        return this.state.catalogo
            .filter(c => c.nivel === 'familia' && byId.has(c.padre_id))
            .map(c => ({ id: c.nombre, seccionId: byId.get(c.padre_id).nombre, nombre: c.nombre }));
    },

    getDefaultSubfamilias() {
        const byId = new Map(this.state.catalogo.map(c => [c.id, c]));
        return this.state.catalogo
            .filter(c => c.nivel === 'subfamilia' && byId.has(c.padre_id))
            .map(c => ({ id: c.nombre, familiaId: byId.get(c.padre_id).nombre, nombre: c.nombre }));
    },

    async loadCatalogo() {
        try {
            const response = await authManager.fetchWithAuth('/api/clasificaciones');
            const data = await response.json();
            this.state.catalogo = response.ok ? (data.clasificaciones || []) : [];
        } catch (error) {
            console.warn('No se pudo cargar el catálogo de clasificaciones:', error);
            this.state.catalogo = [];
        }
    },

    // Renderizar secciones en filtro
    renderSecciones() {
        const select = document.getElementById('filterSeccion');
        if (!select) return;

        select.innerHTML = '<option value="todos">Todas las secciones</option>' + this.optionsHtml(this.state.secciones);

        const modalSelect = document.getElementById('articuloSeccion');
        if (modalSelect) {
            modalSelect.innerHTML = '<option value="">Sin sección</option>' + this.optionsHtml(this.state.secciones);
        }
    },

    // Renderizar familias según sección
    renderFamilias() {
        const select = document.getElementById('filterFamilia');
        if (!select) return;

        const familiasFiltradas = this.state.filterSeccion === 'todos'
            ? this.state.familias
            : this.state.familias.filter(f => f.seccionId === this.state.filterSeccion);

        select.innerHTML = '<option value="todos">Todas las familias</option>' + this.optionsHtml(familiasFiltradas);
    },

    optionsHtml(items) {
        return items.map(item => `<option value="${this.escapeHtml(item.id)}">${this.escapeHtml(item.nombre)}</option>`).join('');
    },

    // Renderizar artículos
    renderArticulos() {
        const container = document.getElementById('articulosTableContainer');
        if (!container) return;

        let filtered = [...this.state.articulos];

        // Filtro por sección
        if (this.state.filterSeccion !== 'todos') {
            filtered = filtered.filter(a => a.seccionId === this.state.filterSeccion);
        }

        // Filtro por familia
        if (this.state.filterFamilia !== 'todos') {
            filtered = filtered.filter(a => a.familiaId === this.state.filterFamilia);
        }

        // Búsqueda
        if (this.state.searchTerm) {
            filtered = filtered.filter(a =>
                a.nombre.toLowerCase().includes(this.state.searchTerm) ||
                a.concepto.toLowerCase().includes(this.state.searchTerm) ||
                a.codigoVenta.toLowerCase().includes(this.state.searchTerm) ||
                a.codigoCompra.toLowerCase().includes(this.state.searchTerm)
            );
        }

        this.renderResumen();

        if (filtered.length === 0) {
            const sinArticulos = this.state.articulos.length === 0;
            container.innerHTML = `
                <div class="empty-block">
                    <i class="fas ${sinArticulos ? 'fa-box-open' : 'fa-magnifying-glass'}" aria-hidden="true"></i>
                    <h3>${sinArticulos ? 'Aún no tienes artículos' : 'Ningún artículo coincide'}</h3>
                    <p>${sinArticulos
                        ? 'Crea tu primer artículo o impórtalos desde Excel para empezar a vender y comprar.'
                        : 'Prueba con otro nombre o código, o quita los filtros de sección y familia.'}</p>
                    ${sinArticulos ? '<button class="btn btn-primary" type="button" onclick="CodigosArticulosModule.openArticuloModal()"><i class="fas fa-plus"></i> Nuevo artículo</button>' : ''}
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="table-card">
                <table class="data-table articles-table">
                    <thead>
                        <tr>
                            <th>Artículo</th>
                            <th>Clasificación</th>
                            <th class="text-right">Existencia</th>
                            <th class="text-right">Costo</th>
                            <th class="text-right">Precio</th>
                            <th class="text-right">Margen</th>
                            <th class="text-right"><span class="sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(art => this.renderArticuloRow(art)).join('')}
                    </tbody>
                </table>
                <div class="table-foot">${filtered.length} de ${this.state.articulos.length} artículos</div>
            </div>
        `;
    },

    // Totales del inventario sobre todos los artículos activos.
    renderResumen() {
        const container = document.getElementById('articulosResumen');
        if (!container) return;
        const activos = this.state.articulos.filter(a => a.activo);
        // A costo: los artículos sin precio de compra no suman (igual que el Panel).
        const valor = activos.reduce((sum, a) => sum + Math.max(0, a.cantidadDisponible) * (a.precioCompra || 0), 0);
        const agotados = activos.filter(a => a.cantidadDisponible <= 0).length;
        const bajos = activos.filter(a => a.cantidadDisponible > 0 && a.cantidadDisponible <= this.stockBajo).length;
        const stat = (label, value, tone = '') => `
            <div class="stat-tile ${tone}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
        container.innerHTML = [
            stat('Artículos activos', activos.length.toLocaleString('es-GT')),
            stat('Valor del inventario (a costo)', formatQ(valor)),
            stat(`Existencia baja (≤ ${this.stockBajo})`, bajos, bajos ? 'is-warning' : ''),
            stat('Agotados', agotados, agotados ? 'is-danger' : '')
        ].join('');
    },

    stockBajo: 5,

    renderArticuloRow(articulo) {
        const esc = (value) => this.escapeHtml(value);
        const clasificacion = [articulo.seccionId, articulo.familiaId, articulo.subfamiliaId].filter(Boolean);
        const costo = articulo.precioCompra || 0;
        const precio = articulo.precioVenta || 0;
        const margen = costo > 0 && precio > 0 ? ((precio - costo) / precio) * 100 : null;
        const stock = articulo.cantidadDisponible;
        const stockTone = stock <= 0 ? 'is-danger' : (stock <= this.stockBajo ? 'is-warning' : 'is-ok');
        const stockLabel = stock <= 0 ? 'Agotado' : `${stock.toLocaleString('es-GT')}${articulo.unidadMedida ? ` ${esc(articulo.unidadMedida)}` : ''}`;
        const codigos = [
            articulo.codigoVenta ? `<span title="Código de venta (interno)">${esc(articulo.codigoVenta)}</span>` : '',
            articulo.codigoCompra ? `<span title="Código de compra o de barras">${esc(articulo.codigoCompra)}</span>` : ''
        ].filter(Boolean).join('<span class="sep">·</span>');

        return `
            <tr class="${articulo.activo ? '' : 'is-inactive'}">
                <td>
                    <button class="cell-link" type="button" onclick="CodigosArticulosModule.viewArticuloDetails('${esc(articulo.id)}')">${esc(articulo.nombre || articulo.concepto)}</button>
                    <div class="cell-sub mono">${codigos || 'Sin código'}${articulo.activo ? '' : ' <span class="chip">Inactivo</span>'}</div>
                </td>
                <td>${clasificacion.length ? `<span class="breadcrumb-text">${clasificacion.map(esc).join('<i class="fas fa-chevron-right" aria-hidden="true"></i>')}</span>` : '<span class="muted">Sin clasificar</span>'}</td>
                <td class="text-right"><span class="stock-pill ${stockTone}">${stockLabel}</span></td>
                <td class="text-right num">${formatQ(costo)}</td>
                <td class="text-right num"><strong>${formatQ(precio)}</strong></td>
                <td class="text-right num ${margen === null ? 'muted' : (margen < 0 ? 'text-danger' : '')}">${margen === null ? '—' : `${margen.toFixed(1)}%`}</td>
                <td class="text-right">
                    <div class="row-actions">
                        <button class="icon-btn" type="button" title="Ver detalles" aria-label="Ver ${esc(articulo.nombre)}" onclick="CodigosArticulosModule.viewArticuloDetails('${esc(articulo.id)}')"><i class="fas fa-eye"></i></button>
                        <button class="icon-btn" type="button" title="Editar" aria-label="Editar ${esc(articulo.nombre)}" onclick="CodigosArticulosModule.editArticulo('${esc(articulo.id)}')"><i class="fas fa-pen"></i></button>
                        <button class="icon-btn is-danger" type="button" title="Eliminar" aria-label="Eliminar ${esc(articulo.nombre)}" onclick="CodigosArticulosModule.deleteArticulo('${esc(articulo.id)}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    },

    // Ver detalles
    viewArticuloDetails(articuloId) {
        const articulo = this.state.articulos.find(a => String(a.id) === String(articuloId));
        if (!articulo) return;

        const familia = this.state.familias.find(f => f.id === articulo.familiaId);
        const subfamilia = this.state.subfamilias.find(s => s.id === articulo.subfamiliaId);
        const seccion = this.state.secciones.find(s => s.id === articulo.seccionId);

        const esc = (value) => this.escapeHtml(value);
        const precioCompra = articulo.precioCompra || 0;
        const precioVenta = articulo.precioVenta || 0;
        const margen = precioCompra > 0 && precioVenta > 0 ? ((precioVenta - precioCompra) / precioVenta * 100).toFixed(1) : null;
        const ganancia = (precioVenta - precioCompra).toFixed(2);
        const existencia = Number(articulo.cantidadDisponible) || 0;

        const detailsHTML = `
            <div class="codigo-details-card">
                <div class="header-section">
                    <div>
                        <h3>${esc(articulo.nombre)}</h3>
                        ${articulo.concepto && articulo.concepto !== articulo.nombre ? `<p class="subtitle">En facturas: ${esc(articulo.concepto)}</p>` : ''}
                    </div>
                    <span class="badge badge-${articulo.estado === 'activo' ? 'success' : 'secondary'}">
                        ${articulo.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </span>
                </div>

                <div class="pricing-section">
                    <div class="price-item">
                        <label>Existencia</label>
                        <p class="price">${existencia <= 0 ? 'Agotado' : `${existencia.toLocaleString('es-GT')} ${esc(articulo.unidadMedida || 'unidades')}`}</p>
                    </div>
                    <div class="price-item">
                        <label>Precio de compra</label>
                        <p class="price">${formatQ(precioCompra)}</p>
                    </div>
                    <div class="price-item">
                        <label>Precio de venta</label>
                        <p class="price">${formatQ(precioVenta)}</p>
                    </div>
                    <div class="price-item">
                        <label>Ganancia por unidad</label>
                        <p class="price">${formatQ(ganancia)}${margen === null ? '' : ` (${margen}% del precio)`}</p>
                    </div>
                </div>

                <div class="coding-section">
                    <div class="code-box codigo-venta">
                        <label>Código interno</label>
                        <code>${esc(articulo.codigoVenta || '—')}</code>
                    </div>
                    <div class="code-box codigo-compra">
                        <label>Código de barras o del proveedor</label>
                        <code>${esc(articulo.codigoCompra || '—')}</code>
                    </div>
                </div>

                <div class="classification-section">
                    <div class="class-item">
                        <label>Sección:</label>
                        <p>${esc(seccion ? seccion.nombre : '-')}</p>
                    </div>
                    <div class="class-item">
                        <label>Familia:</label>
                        <p>${esc(familia ? familia.nombre : '-')}</p>
                    </div>
                    <div class="class-item">
                        <label>Subfamilia:</label>
                        <p>${esc(subfamilia ? subfamilia.nombre : '-')}</p>
                    </div>
                </div>

                ${articulo.descripcion ? `
                    <div class="description-section">
                        <label>Descripción</label>
                        <p>${esc(articulo.descripcion)}</p>
                    </div>
                ` : ''}

                <div class="details-actions">
                    <button type="button" class="btn btn-primary" data-edit-articulo="${esc(articulo.id)}">
                        <i class="fas fa-pen" aria-hidden="true"></i> Editar artículo
                    </button>
                </div>
            </div>
        `;

        const overlay = this.showDetailsModal('Detalles del artículo', detailsHTML);
        overlay.querySelector('[data-edit-articulo]')?.addEventListener('click', () => {
            overlay.remove();
            this.editArticulo(articulo.id);
        });
    },

    // Mostrar modal de detalles
    showDetailsModal(title, content) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>${this.escapeHtml(title)}</h2>
                    <button type="button" class="close-btn" aria-label="Cerrar">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        overlay.querySelector('.close-btn').addEventListener('click', () => {
            overlay.remove();
            document.body.style.overflow = 'auto';
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                document.body.style.overflow = 'auto';
            }
        });

        const closeOnEscape = (event) => {
            if (event.key !== 'Escape' || !overlay.isConnected) return;
            overlay.remove();
            document.body.style.overflow = 'auto';
        };
        document.addEventListener('keydown', closeOnEscape);
        new MutationObserver((_, observer) => {
            if (overlay.isConnected) return;
            document.removeEventListener('keydown', closeOnEscape);
            observer.disconnect();
        }).observe(document.body, { childList: true });

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        overlay.querySelector('.close-btn').focus();
        return overlay;
    },

    // Editar artículo
    editArticulo(articuloId) {
        const articulo = this.state.articulos.find(a => String(a.id) === String(articuloId));
        if (!articulo) return;

        this.state.selectedArticulo = articulo;
        this.openArticuloModal(articulo);
    },

    // Abrir modal
    async openArticuloModal(articulo = null) {
        const modal = document.getElementById('articuloModal');
        const form = document.getElementById('editArticuloForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('articuloModalTitle').textContent = articulo ? 'Editar artículo' : 'Nuevo artículo';
        form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        form.querySelectorAll('.field-error').forEach(error => error.remove());
        form.querySelector('details.form-more').open = false;

        this.resetFoto(articulo);

        if (articulo) {
            document.getElementById('articuloId').value = articulo.id;
            document.getElementById('articuloNombre').value = articulo.nombre;
            document.getElementById('articuloConcepto').value = articulo.concepto && articulo.concepto !== articulo.nombre ? articulo.concepto : '';
            document.getElementById('codigoVenta').value = articulo.codigoVenta;
            document.getElementById('codigoCompra').value = articulo.codigoCompra;
            document.getElementById('articuloSeccion').value = articulo.seccionId;
            this.renderFamiliasForModal();
            document.getElementById('articuloFamilia').value = articulo.familiaId;
            this.renderSubfamiliasForModal();
            document.getElementById('precioCompra').value = articulo.precioCompra;
            document.getElementById('precioVenta').value = articulo.precioVenta;
            document.getElementById('articuloCantidad').value = articulo.cantidadDisponible;
            document.getElementById('articuloUnidadMedida').value = articulo.unidadMedida;
            document.getElementById('articuloSubfamilia').value = articulo.subfamiliaId;
            document.getElementById('articuloTipo').value = articulo.tipo;
            document.getElementById('articuloEstado').value = articulo.estado;
            document.getElementById('articuloDescripcion').value = articulo.descripcion || '';
        } else {
            this.renderFamiliasForModal();
            document.getElementById('codigoVenta').value = 'Cargando...';
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        if (!articulo) {
            await this.loadNextCodigo();
        }
    },

    // ---------- Foto ----------
    // undefined: sin cambios · null: quitarla · texto: foto nueva en base64.

    resetFoto(articulo) {
        this.state.fotoPendiente = undefined;
        const url = articulo?.fotoVersion
            ? `${authManager.apiBaseUrl}/api/codigos-articulos/${encodeURIComponent(articulo.id)}/foto?v=${encodeURIComponent(articulo.fotoVersion)}`
            : '';
        this.showFotoPreview(url);
    },

    showFotoPreview(src) {
        const preview = document.getElementById('articuloFotoPreview');
        const img = preview.querySelector('img');
        preview.hidden = !src;
        if (src) img.src = src;
        else img.removeAttribute('src');
        document.getElementById('articuloFotoInput').value = '';
        document.getElementById('articuloFotoLabel').textContent = src ? 'Cambiar foto' : 'Agregar foto';
    },

    async onFotoSelected(input) {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await this.resizeImage(file, 800);
            this.state.fotoPendiente = dataUrl;
            this.showFotoPreview(dataUrl);
            document.getElementById('articuloModal').dataset.dirty = 'true';
        } catch (error) {
            input.value = '';
            this.showNotification('No se pudo leer la imagen. Prueba con una foto JPG o PNG.', 'error');
        }
    },

    removeFoto() {
        this.state.fotoPendiente = null;
        this.showFotoPreview('');
        document.getElementById('articuloModal').dataset.dirty = 'true';
    },

    // Achica la foto en el navegador (las del celular pesan varios MB) y la devuelve en base64.
    resizeImage(file, maxSide) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(url);
                const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);
                const context = canvas.getContext('2d');
                context.fillStyle = '#fff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Imagen no válida'));
            };
            image.src = url;
        });
    },

    async loadNextCodigo() {
        const codigoInput = document.getElementById('codigoVenta');

        try {
            const token = authManager.getToken();
            const response = await fetch(`${authManager.apiBaseUrl}/api/codigos-articulos/siguiente-codigo`, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}`);
            }

            const data = await response.json();
            codigoInput.value = data.codigo;
        } catch (error) {
            console.error('Error obteniendo el siguiente código:', error);
            codigoInput.value = '';
            this.showNotification('No se pudo previsualizar el correlativo. Se generará al guardar.', 'warning');
        }
    },

    // Renderizar familias en modal
    renderFamiliasForModal() {
        const seccionId = document.getElementById('articuloSeccion').value;
        const select = document.getElementById('articuloFamilia');

        const familiasFiltradas = seccionId === ''
            ? this.state.familias
            : this.state.familias.filter(f => f.seccionId === seccionId);

        select.innerHTML = '<option value="">Sin familia</option>' + this.optionsHtml(familiasFiltradas);
        this.renderSubfamiliasForModal();
    },

    renderSubfamiliasForModal() {
        const familiaId = document.getElementById('articuloFamilia')?.value || '';
        const select = document.getElementById('articuloSubfamilia');
        if (!select) return;
        const currentValue = select.value;
        const subfamilias = familiaId
            ? this.state.subfamilias.filter(item => item.familiaId === familiaId)
            : this.state.subfamilias;
        select.innerHTML = '<option value="">Sin subfamilia</option>' + this.optionsHtml(subfamilias);
        select.value = subfamilias.some(item => item.id === currentValue) ? currentValue : '';
    },

    // Cerrar modal
    closeArticuloModal() {
        const modal = document.getElementById('articuloModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            this.state.selectedArticulo = null;
        }
    },

    // Misma lectura de montos que el resto de la app (parseMonto en js/auth-utils.js).
    parseDecimal(value) {
        return parseMonto(value);
    },

    setFieldError(input, message) {
        input.setAttribute('aria-invalid', 'true');
        const error = document.createElement('small');
        error.className = 'field-error';
        error.textContent = message;
        input.closest('.form-group').appendChild(error);
    },

    // Devuelve los valores numéricos del formulario o null si hay errores (ya marcados en pantalla).
    readArticuloNumbers() {
        const form = document.getElementById('editArticuloForm');
        form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        form.querySelectorAll('.field-error').forEach(error => error.remove());

        const MAX_PRICE = 99999999.99;
        const fields = {
            precioVenta: document.getElementById('precioVenta'),
            precioCompra: document.getElementById('precioCompra'),
            cantidad: document.getElementById('articuloCantidad')
        };
        const values = {
            precioVenta: this.parseDecimal(fields.precioVenta.value),
            precioCompra: fields.precioCompra.value.trim() ? this.parseDecimal(fields.precioCompra.value) : 0,
            cantidad: this.parseDecimal(fields.cantidad.value)
        };
        const errors = [];
        const check = (key, invalid, message) => {
            if (invalid && !errors.some(([name]) => name === key)) errors.push([key, message]);
        };
        if (!document.getElementById('articuloNombre').value.trim()) {
            errors.push(['nombre', 'Escribe el nombre del artículo.']);
        }
        check('precioVenta', Number.isNaN(values.precioVenta), 'Escribe el precio de venta, por ejemplo 25.50.');
        check('precioVenta', values.precioVenta <= 0, 'El precio de venta debe ser mayor que 0.');
        check('precioVenta', values.precioVenta > MAX_PRICE, 'El precio es demasiado grande.');
        check('precioCompra', Number.isNaN(values.precioCompra), 'Escribe un número, por ejemplo 18.00, o déjalo vacío.');
        check('precioCompra', values.precioCompra < 0, 'El precio de compra no puede ser negativo.');
        check('precioCompra', values.precioCompra > MAX_PRICE, 'El precio es demasiado grande.');
        check('cantidad', Number.isNaN(values.cantidad), 'Escribe cuántas unidades tienes hoy (0 si no tienes).');
        check('cantidad', values.cantidad < 0, 'La existencia no puede ser negativa.');
        check('cantidad', !Number.isInteger(values.cantidad), 'La existencia debe ser un número entero.');
        check('cantidad', values.cantidad > 2147483647, 'La existencia es demasiado grande.');

        if (!errors.length) return values;
        errors.forEach(([key, message]) => {
            this.setFieldError(key === 'nombre' ? document.getElementById('articuloNombre') : fields[key], message);
        });
        const [firstKey] = errors[0];
        (firstKey === 'nombre' ? document.getElementById('articuloNombre') : fields[firstKey]).focus();
        return null;
    },

    // Guardar artículo
    async saveArticulo() {
        if (this.state.saving) return;
        const id = document.getElementById('articuloId').value;
        const nombre = document.getElementById('articuloNombre').value.trim();
        const concepto = document.getElementById('articuloConcepto')?.value.trim();
        const codigoVenta = document.getElementById('codigoVenta').value.trim();
        const codigoCompra = document.getElementById('codigoCompra').value.trim();
        const seccionId = document.getElementById('articuloSeccion')?.value;
        const familiaId = document.getElementById('articuloFamilia')?.value;
        const estado = document.getElementById('articuloEstado')?.value;
        const descripcion = document.getElementById('articuloDescripcion').value.trim();
        const subfamilia = document.getElementById('articuloSubfamilia')?.value.trim();
        const unidadMedida = document.getElementById('articuloUnidadMedida')?.value.trim();
        const tipo = document.getElementById('articuloTipo')?.value.trim();

        const numbers = this.readArticuloNumbers();
        if (!numbers) {
            this.showNotification('Revisa los campos marcados en rojo.', 'warning');
            return;
        }
        const { precioVenta, precioCompra, cantidad } = numbers;

        const saveButton = document.getElementById('saveArticuloBtn');
        this.state.saving = true;
        saveButton.disabled = true;
        try {
            // Mapear datos del formulario a la API
            const apiData = {
                codigo: codigoVenta,
                nombre_articulo: nombre,
                descripcion: descripcion || null,
                categoria: seccionId || null,
                familia: familiaId || null,
                subfamilia: subfamilia || null,
                precio_unitario: precioVenta,
                precio_costo: precioCompra,
                cantidad_disponible: cantidad,
                unidad_medida: unidadMedida || null,
                codigo_barras: codigoCompra || null,
                codigo_alternativo: this.state.selectedArticulo?.codigoAlternativo || null,
                descripcion2: concepto || null,
                tipo: tipo || 'producto',
                activo: estado !== 'inactivo'
            };
            if (this.state.fotoPendiente !== undefined) apiData.foto = this.state.fotoPendiente;

            const url = id 
                ? `${authManager.apiBaseUrl}/api/codigos-articulos/${id}`
                : `${authManager.apiBaseUrl}/api/codigos-articulos`;

            const response = await fetch(url, {
                method: id ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            await response.json();

            const primerArticulo = !id && this.state.articulos.length === 0;
            if (primerArticulo && cantidad > 0) {
                this.showNotification('Artículo creado. Siguiente paso: registra tu primera venta en Ventas → Nueva venta.', 'success');
            } else if (cantidad === 0) {
                this.showNotification(`${id ? 'Artículo actualizado' : 'Artículo creado'} con existencia 0: para venderlo, edítalo y escribe cuántas unidades tienes o registra una compra.`, 'warning');
            } else {
                this.showNotification(id ? 'Artículo actualizado correctamente.' : 'Artículo creado correctamente.', 'success');
            }

            this.closeArticuloModal();
            this.loadData(); // Recargar desde BD
        } catch (error) {
            console.error('Error guardando artículo:', error);
            this.showNotification(`No se pudo guardar el artículo. ${friendlyError(error)}`, 'error');
        } finally {
            this.state.saving = false;
            saveButton.disabled = false;
        }
    },

    // Eliminar artículo
    async deleteArticulo(articuloId) {
        if (!confirm('¿Estás seguro de que deseas eliminar este artículo?')) return;

        try {
            const token = authManager.getToken();
            if (!token) {
                this.showNotification('❌ No estás autenticado', 'error');
                return;
            }

            const response = await fetch(`${authManager.apiBaseUrl}/api/codigos-articulos/${articuloId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            this.showNotification('✅ Artículo eliminado correctamente', 'success');
            this.loadData(); // Recargar desde BD
        } catch (error) {
            console.error('Error eliminando artículo:', error);
            this.showNotification(`No se pudo completar la acción. ${friendlyError(error)}`, 'error');
        }
    },

    // Generar ID
    generateId(prefix) {
        const timestamp = Date.now().toString(36);
        return `${prefix}-${timestamp}`;
    },

    // Mismo aviso que el resto del sistema (js/app.js).
    showNotification(message, type = 'info') {
        showNotification(message, type);
    }
};
