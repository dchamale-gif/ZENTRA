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

        select.innerHTML = '<option value="todos">-- Todas las Secciones --</option>' +
            this.state.secciones.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

        const modalSelect = document.getElementById('articuloSeccion');
        if (modalSelect) {
            modalSelect.innerHTML = '<option value="">-- Selecciona sección --</option>' +
                this.state.secciones.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
        }
    },

    // Renderizar familias según sección
    renderFamilias() {
        const select = document.getElementById('filterFamilia');
        if (!select) return;

        const familiasFiltradas = this.state.filterSeccion === 'todos'
            ? this.state.familias
            : this.state.familias.filter(f => f.seccionId === this.state.filterSeccion);

        select.innerHTML = '<option value="todos">-- Todas las Familias --</option>' +
            familiasFiltradas.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
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

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay artículos registrados</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Concepto</th>
                            <th>Código de Venta (Interno)</th>
                            <th>Código de Compra (Externo)</th>
                            <th>Sección</th>
                            <th>Familia</th>
                            <th>Subfamilia</th>
                            <th>Precio Compra</th>
                            <th>Precio Venta</th>
                            <th>Margen</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(art => this.renderArticuloRow(art)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    // Renderizar fila de artículo
    renderArticuloRow(articulo) {
        const seccion = this.state.secciones.find(s => s.id === articulo.seccionId);
        const familia = this.state.familias.find(f => f.id === articulo.familiaId);
        const subfamilia = this.state.subfamilias.find(s => s.id === articulo.subfamiliaId);
        const precioCompra = articulo.precioCompra || 0;
        const precioVenta = articulo.precioVenta || 0;
        const margen = precioCompra > 0 ? ((precioVenta - precioCompra) / precioCompra * 100).toFixed(1) : '-';
        const estadoBadge = articulo.estado === 'activo'
            ? '<span class="badge badge-success">Activo</span>'
            : '<span class="badge badge-secondary">Inactivo</span>';

        return `
            <tr>
                <td><strong>${articulo.concepto}</strong></td>
                <td><code class="codigo-venta">${articulo.codigoVenta}</code></td>
                <td><code class="codigo-compra">${articulo.codigoCompra}</code></td>
                <td>${seccion ? seccion.nombre : '-'}</td>
                <td>${familia ? familia.nombre : '-'}</td>
                <td>${subfamilia ? subfamilia.nombre : '-'}</td>
                <td>Q${(articulo.precioCompra || 0).toFixed(2)}</td>
                <td>Q${(articulo.precioVenta || 0).toFixed(2)}</td>
                <td><span class="badge badge-info">${margen}${margen !== '-' ? '%' : ''}</span></td>
                <td>${estadoBadge}</td>
                <td class="actions">
                    <button class="btn-icon btn-view" title="Ver Detalles" onclick="CodigosArticulosModule.viewArticuloDetails('${articulo.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-edit" title="Editar" onclick="CodigosArticulosModule.editArticulo('${articulo.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Eliminar" onclick="CodigosArticulosModule.deleteArticulo('${articulo.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    },

    // Ver detalles
    viewArticuloDetails(articuloId) {
        const articulo = this.state.articulos.find(a => String(a.id) === String(articuloId));
        if (!articulo) return;

        const familia = this.state.familias.find(f => f.id === articulo.familiaId);
        const subfamilia = this.state.subfamilias.find(s => s.id === articulo.subfamiliaId);
        const seccion = this.state.secciones.find(s => s.id === articulo.seccionId);

        const precioCompra = articulo.precioCompra || 0;
        const precioVenta = articulo.precioVenta || 0;
        const margen = precioCompra > 0 ? ((precioVenta - precioCompra) / precioCompra * 100).toFixed(2) : '0';
        const margenPeso = (precioVenta - precioCompra).toFixed(2);

        const detailsHTML = `
            <div class="codigo-details-card">
                <div class="header-section">
                    <div>
                        <h3>${articulo.concepto}</h3>
                        <p class="subtitle">${articulo.nombre}</p>
                    </div>
                    <span class="badge badge-${articulo.estado === 'activo' ? 'success' : 'secondary'}">
                        ${articulo.estado.toUpperCase()}
                    </span>
                </div>

                <div class="coding-section">
                    <div class="code-box codigo-venta">
                        <label>Código de Venta (Sistema Interno)</label>
                        <code>${articulo.codigoVenta}</code>
                        <small>Código para facturas y ventas locales</small>
                    </div>
                    <div class="code-box codigo-compra">
                        <label>Código de Compra (Sistema Externo)</label>
                        <code>${articulo.codigoCompra}</code>
                        <small>Código del proveedor/externa</small>
                    </div>
                </div>

                <div class="classification-section">
                    <div class="class-item">
                        <label>Sección:</label>
                        <p>${seccion ? seccion.nombre : '-'}</p>
                    </div>
                    <div class="class-item">
                        <label>Familia:</label>
                        <p>${familia ? familia.nombre : '-'}</p>
                    </div>
                    <div class="class-item">
                        <label>Subfamilia:</label>
                        <p>${subfamilia ? subfamilia.nombre : '-'}</p>
                    </div>
                </div>

                <div class="pricing-section">
                    <div class="price-item">
                        <label>Precio de Compra</label>
                        <p class="price">Q${precioCompra.toFixed(2)}</p>
                    </div>
                    <div class="price-item">
                        <label>Precio de Venta</label>
                        <p class="price">Q${precioVenta.toFixed(2)}</p>
                    </div>
                    <div class="price-item">
                        <label>Margen</label>
                        <p class="price">${margen}% | Q${margenPeso}</p>
                    </div>
                </div>

                ${articulo.descripcion ? `
                    <div class="description-section">
                        <label>Descripción</label>
                        <p>${articulo.descripcion}</p>
                    </div>
                ` : ''}
            </div>
        `;

        this.showDetailsModal('Detalles del Artículo', detailsHTML);
    },

    // Mostrar modal de detalles
    showDetailsModal(title, content) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="close-btn">&times;</button>
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

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
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

        if (articulo) {
            document.getElementById('articuloId').value = articulo.id;
            document.getElementById('articuloNombre').value = articulo.nombre;
            document.getElementById('articuloConcepto').value = articulo.concepto;
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

        select.innerHTML = '<option value="">-- Selecciona familia --</option>' +
            familiasFiltradas.map(f => `<option value="${f.id}">${f.nombre}</option>`).join('');
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
        select.innerHTML = '<option value="">-- Selecciona subfamilia --</option>' +
            subfamilias.map(item => `<option value="${item.id}">${item.nombre}</option>`).join('');
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

    // Guardar artículo
    async saveArticulo() {
        const id = document.getElementById('articuloId').value;
        const nombre = document.getElementById('articuloNombre').value.trim();
        const concepto = document.getElementById('articuloConcepto')?.value.trim();
        const codigoVenta = document.getElementById('codigoVenta').value.trim();
        const codigoCompra = document.getElementById('codigoCompra').value.trim();
        const seccionId = document.getElementById('articuloSeccion')?.value;
        const familiaId = document.getElementById('articuloFamilia')?.value;
        const precioCompra = parseFloat(document.getElementById('precioCompra').value) || 0;
        const precioVenta = parseFloat(document.getElementById('precioVenta').value) || 0;
        const estado = document.getElementById('articuloEstado')?.value;
        const descripcion = document.getElementById('articuloDescripcion').value.trim();
        const cantidad = parseInt(document.getElementById('articuloCantidad')?.value) || 0;
        const subfamilia = document.getElementById('articuloSubfamilia')?.value.trim();
        const unidadMedida = document.getElementById('articuloUnidadMedida')?.value.trim();
        const tipo = document.getElementById('articuloTipo')?.value.trim();

        if (!nombre || precioVenta <= 0) {
            this.showNotification('⚠️ Nombre y precio de venta son requeridos', 'warning');
            return;
        }

        try {
            const token = authManager.getToken();
            if (!token) {
                this.showNotification('❌ No estás autenticado', 'error');
                return;
            }

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

            const url = id 
                ? `${authManager.apiBaseUrl}/api/codigos-articulos/${id}`
                : `${authManager.apiBaseUrl}/api/codigos-articulos`;

            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            const result = await response.json();
            
            if (id) {
                this.showNotification('✅ Artículo actualizado correctamente', 'success');
            } else {
                this.showNotification('✅ Artículo creado correctamente', 'success');
            }

            this.closeArticuloModal();
            this.loadData(); // Recargar desde BD
        } catch (error) {
            console.error('Error guardando artículo:', error);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
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
            this.showNotification(`❌ Error: ${error.message}`, 'error');
        }
    },

    // Generar ID
    generateId(prefix) {
        const timestamp = Date.now().toString(36);
        return `${prefix}-${timestamp}`;
    },

    // Guardar en DB
    saveToDB() {
        localStorage.setItem('articulos', JSON.stringify(this.state.articulos));
        localStorage.setItem('secciones', JSON.stringify(this.state.secciones));
        localStorage.setItem('familias', JSON.stringify(this.state.familias));
        localStorage.setItem('subfamilias', JSON.stringify(this.state.subfamilias));
    },

    // Notificación
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};
