// ============================================
// MÓDULO DE PROVEEDORES
// ============================================
// Gestión de proveedores de medicinas y artículos

const ProveedoresModule = {
    state: {
        proveedores: [],
        filtroActivo: 'activos', // todos, activos, inactivos
        searchTerm: ''
    },

    // Inicializar el módulo
    init() {
        this.setupEventListeners();
        this.loadData();
        console.log('✅ Módulo de Proveedores inicializado');
    },

    // Configurar event listeners
    setupEventListeners() {
        const newProviderBtn = document.getElementById('addProviderBtn');
        if (newProviderBtn) {
            newProviderBtn.addEventListener('click', () => this.openProviderModal());
        }

        const saveProviderBtn = document.getElementById('saveProviderBtn');
        if (saveProviderBtn) {
            saveProviderBtn.addEventListener('click', () => this.saveProvider());
        }

        const searchInput = document.getElementById('searchProvider');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderProviders();
            });
        }

        const filterSelect = document.getElementById('filterProvider');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.filtroActivo = e.target.value;
                this.renderProviders();
            });
        }

        const closeBtnModal = document.querySelector('#providerModal .close-btn');
        if (closeBtnModal) {
            closeBtnModal.addEventListener('click', () => this.closeProviderModal());
        }
    },

    // Cargar datos desde API
    async loadData() {
        try {
            const token = authManager.getToken();
            if (!token) {
                console.warn('⚠️ No hay token de autenticación');
                return;
            }

            const response = await fetch(`${authManager.apiBaseUrl}/api/proveedores`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.state.proveedores = data.proveedores || [];
            this.renderProviders();
            
            console.log(`✅ ${this.state.proveedores.length} proveedores cargados desde BD`);
        } catch (error) {
            console.error('❌ Error cargando proveedores:', error);
            this.showNotification('⚠️ Error cargando proveedores. Intenta más tarde.', 'error');
        }
    },

    // Abrir modal de nuevo proveedor
    openProviderModal() {
        const modal = document.getElementById('providerModal');
        const form = document.getElementById('editProviderForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('providerId').value = '';
        
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    // Cerrar modal
    closeProviderModal() {
        const modal = document.getElementById('providerModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    },

    // Guardar proveedor
    async saveProvider() {
        const form = document.getElementById('editProviderForm');
        if (!form) return;

        if (!this.validateProviderForm()) {
            this.showNotification('⚠️ Por favor completa los campos requeridos', 'warning');
            return;
        }

        const id = document.getElementById('providerId').value;
        const ruc = document.getElementById('providerRuc').value.trim();
        
        // Validar RUC único (si es nuevo)
        if (!id) {
            const existeRuc = this.state.proveedores.some(p => 
                p.ruc === ruc
            );
            if (existeRuc) {
                this.showNotification('❌ Este RUC ya está registrado', 'error');
                return;
            }
        }

        const providerData = {
            nombre: document.getElementById('providerName').value.trim(),
            razon_social: document.getElementById('providerRazonSocial').value.trim() || null,
            ruc: ruc,
            email: document.getElementById('providerEmail').value.trim() || null,
            telefono: document.getElementById('providerTelefono').value.trim() || null,
            direccion: document.getElementById('providerDireccion').value.trim() || null,
            ciudad: document.getElementById('providerCiudad').value.trim() || null,
            pais: document.getElementById('providerPais').value.trim() || null,
            contacto_principal: document.getElementById('providerContactoPrincipal').value.trim() || null,
            contacto_email: document.getElementById('providerContactoEmail').value.trim() || null,
            contacto_telefono: document.getElementById('providerContactoTelefono').value.trim() || null,
            terminos_pago: document.getElementById('providerTerminosPago').value.trim() || null,
            dias_credito: parseInt(document.getElementById('providerDiasCredito').value) || 0,
            activo: document.getElementById('providerActivo').checked
        };

        try {
            const token = authManager.getToken();
            if (!token) {
                this.showNotification('❌ No estás autenticado', 'error');
                return;
            }

            const url = id 
                ? `${authManager.apiBaseUrl}/api/proveedores/${id}`
                : `${authManager.apiBaseUrl}/api/proveedores`;

            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(providerData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            const result = await response.json();
            
            if (id) {
                this.showNotification('✅ Proveedor actualizado correctamente', 'success');
            } else {
                this.showNotification('✅ Proveedor creado correctamente', 'success');
            }

            this.closeProviderModal();
            this.loadData(); // Recargar desde BD
        } catch (error) {
            console.error('❌ Error guardando proveedor:', error);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
        }
    },

    // Editar proveedor
    editProvider(id) {
        const provider = this.state.proveedores.find(p => p.id === id);
        if (!provider) return;

        document.getElementById('providerId').value = provider.id;
        document.getElementById('providerName').value = provider.nombre;
        document.getElementById('providerRazonSocial').value = provider.razon_social || '';
        document.getElementById('providerRuc').value = provider.ruc;
        document.getElementById('providerEmail').value = provider.email || '';
        document.getElementById('providerTelefono').value = provider.telefono || '';
        document.getElementById('providerDireccion').value = provider.direccion || '';
        document.getElementById('providerCiudad').value = provider.ciudad || '';
        document.getElementById('providerPais').value = provider.pais || '';
        document.getElementById('providerContactoPrincipal').value = provider.contacto_principal || '';
        document.getElementById('providerContactoEmail').value = provider.contacto_email || '';
        document.getElementById('providerContactoTelefono').value = provider.contacto_telefono || '';
        document.getElementById('providerTerminosPago').value = provider.terminos_pago || '';
        document.getElementById('providerDiasCredito').value = provider.dias_credito || 0;
        document.getElementById('providerActivo').checked = provider.activo;

        this.openProviderModal();
    },

    // Eliminar proveedor
    async deleteProvider(id) {
        if (!confirm('¿Estás seguro de que quieres eliminar este proveedor?')) return;

        try {
            const token = authManager.getToken();
            if (!token) {
                this.showNotification('❌ No estás autenticado', 'error');
                return;
            }

            const response = await fetch(
                `${authManager.apiBaseUrl}/api/proveedores/${id}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}`);
            }

            this.showNotification('✅ Proveedor eliminado', 'success');
            this.loadData(); // Recargar desde BD
        } catch (error) {
            console.error('❌ Error eliminando proveedor:', error);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
        }
    },

    // Validar formulario
    validateProviderForm() {
        const nombre = document.getElementById('providerName').value.trim();
        const ruc = document.getElementById('providerRuc').value.trim();

        return nombre && ruc;
    },

    // Renderizar tabla de proveedores
    renderProviders() {
        const container = document.getElementById('providersTableContainer');
        if (!container) return;

        let filtered = [...this.state.proveedores];

        // Filtro por estado
        if (this.filtroActivo === 'activos') {
            filtered = filtered.filter(p => p.activo);
        } else if (this.filtroActivo === 'inactivos') {
            filtered = filtered.filter(p => !p.activo);
        }

        // Búsqueda
        if (this.searchTerm) {
            filtered = filtered.filter(p =>
                p.nombre.toLowerCase().includes(this.searchTerm) ||
                p.ruc.includes(this.searchTerm) ||
                (p.email && p.email.toLowerCase().includes(this.searchTerm))
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay proveedores registrados</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>RUC</th>
                            <th>Email</th>
                            <th>Teléfono</th>
                            <th>Ciudad</th>
                            <th>Contacto</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(provider => this.renderProviderRow(provider)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    // Renderizar fila de proveedor
    renderProviderRow(provider) {
        const estadoBadge = provider.activo 
            ? '<span class="badge badge-success">Activo</span>'
            : '<span class="badge badge-inactive">Inactivo</span>';

        return `
            <tr>
                <td><strong>${provider.nombre}</strong></td>
                <td>${provider.ruc}</td>
                <td>${provider.email || '-'}</td>
                <td>${provider.telefono || '-'}</td>
                <td>${provider.ciudad || '-'}</td>
                <td>${provider.contacto_principal || '-'}</td>
                <td>${estadoBadge}</td>
                <td class="actions">
                    <button class="btn-icon btn-edit" title="Editar" onclick="ProveedoresModule.editProvider('${provider.id}')">✏️</button>
                    <button class="btn-icon btn-delete" title="Eliminar" onclick="ProveedoresModule.deleteProvider('${provider.id}')">🗑️</button>
                </td>
            </tr>
        `;
    },

    // Mostrar notificación
    showNotification(message, type = 'info') {
        // Usar función global si existe
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
};

// Inicializar cuando el documento cargue
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('providerModal')) {
        ProveedoresModule.init();
    }
});
