// ============================================
// CONFIGURACIÓN: sección, familia y subfamilia de artículos
// ============================================

const ClasificacionesConfig = {
    items: [],

    async load() {
        const container = document.getElementById('clasificacionesConfig');
        if (!container) return;
        try {
            const response = await authManager.fetchWithAuth('/api/clasificaciones');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
            this.items = data.clasificaciones || [];
        } catch (error) {
            this.items = [];
            showNotification(`No se pudo cargar el catálogo: ${error.message}`, 'error');
        }
        this.render();
    },

    childrenOf(parentId, level) {
        return this.items.filter(i => i.nivel === level && (i.padre_id || null) === (parentId || null));
    },

    renderLevel(parentId, level, depth) {
        const next = { seccion: 'familia', familia: 'subfamilia' }[level];
        const label = { seccion: 'sección', familia: 'familia', subfamilia: 'subfamilia' }[level];
        const nodes = this.childrenOf(parentId, level).map(node => `
            <li style="margin-left:${depth * 18}px;list-style:none;margin-bottom:6px">
                <strong>${BulkImport.escapeHtml(node.nombre)}</strong>
                <button class="btn btn-secondary btn-sm" onclick="ClasificacionesConfig.remove('${BulkImport.escapeHtml(node.id)}')" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
                ${next ? `
                    <div style="margin:4px 0 6px 18px">
                        <input type="text" class="form-input" id="clasif-add-${BulkImport.escapeHtml(node.id)}"
                            placeholder="Nueva ${next}" style="display:inline-block;width:220px"
                            onkeydown="if(event.key==='Enter'){ClasificacionesConfig.add('${next}','${BulkImport.escapeHtml(node.id)}')}">
                        <button class="btn btn-primary btn-sm" onclick="ClasificacionesConfig.add('${next}','${BulkImport.escapeHtml(node.id)}')">Agregar ${next}</button>
                    </div>
                    ${this.renderLevel(node.id, next, depth + 1)}` : ''}
            </li>`).join('');
        return nodes ? `<ul style="padding:0;margin:0">${nodes}</ul>` : (depth === 0 ? `<p style="color:#6b7280">Aún no hay ${label}s configuradas.</p>` : '');
    },

    render() {
        const container = document.getElementById('clasificacionesConfig');
        if (!container) return;
        container.innerHTML = `
            <div style="margin-bottom:12px">
                <input type="text" class="form-input" id="clasif-add-root" placeholder="Nueva sección"
                    style="display:inline-block;width:220px"
                    onkeydown="if(event.key==='Enter'){ClasificacionesConfig.add('seccion', null)}">
                <button class="btn btn-primary btn-sm" onclick="ClasificacionesConfig.add('seccion', null)">Agregar sección</button>
            </div>
            ${this.renderLevel(null, 'seccion', 0)}`;
    },

    async add(level, parentId) {
        const input = document.getElementById(parentId ? `clasif-add-${parentId}` : 'clasif-add-root');
        const nombre = input?.value.trim();
        if (!nombre) return showNotification('Escribe un nombre', 'warning');
        await this.request('/api/clasificaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nivel: level, nombre, padre_id: parentId })
        });
    },

    async remove(id) {
        if (!confirm('¿Eliminar este elemento y todo lo que contiene? Los artículos existentes conservan su clasificación.')) return;
        await this.request(`/api/clasificaciones/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async request(url, options) {
        try {
            const response = await authManager.fetchWithAuth(url, options);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
            await this.load();
            if (typeof CodigosArticulosModule !== 'undefined') CodigosArticulosModule.loadData();
        } catch (error) {
            showNotification(error.message, 'error');
        }
    }
};
