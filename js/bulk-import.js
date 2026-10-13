// ============================================
// CARGA MASIVA DESDE EXCEL / CSV
// ============================================
// Requiere SheetJS (window.XLSX) cargado desde CDN.

const BulkImport = {
    MAX_ROWS: 5000,

    normalizeHeader(value) {
        return String(value || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    },

    /**
     * config: {
     *   title, endpoint, templateName,
     *   columns: [{ key, label, example, required?, aliases? }],
     *   onDone?: () => void
     * }
     */
    open(config) {
        if (typeof XLSX === 'undefined') {
            alert('No se pudo cargar el lector de Excel. Revise su conexión a internet e intente de nuevo.');
            return;
        }

        document.getElementById('bulkImportModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'bulkImportModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content modal-content-lg">
                <div class="modal-header">
                    <h2>${this.escapeHtml(config.title)}</h2>
                    <button class="modal-close" type="button" data-bulk="close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Suba un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con una fila por registro.
                    La primera fila debe contener los encabezados.</p>
                    <p><strong>Columnas:</strong> ${config.columns.map(c =>
                        `${this.escapeHtml(c.key)}${c.required ? '*' : ''}`).join(', ')}</p>
                    <div class="button-group" style="margin: 12px 0;">
                        <button class="btn btn-secondary" type="button" data-bulk="template">
                            <i class="fas fa-download"></i> Descargar plantilla
                        </button>
                        <input type="file" id="bulkImportFile" accept=".xlsx,.xls,.csv" class="form-input">
                    </div>
                    <div id="bulkImportPreview"></div>
                    <div id="bulkImportResult"></div>
                </div>
                <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px;">
                    <button class="btn btn-secondary" type="button" data-bulk="close">Cerrar</button>
                    <button class="btn btn-primary" type="button" data-bulk="import" disabled>
                        <i class="fas fa-upload"></i> Importar
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        let rows = [];
        const preview = modal.querySelector('#bulkImportPreview');
        const result = modal.querySelector('#bulkImportResult');
        const importBtn = modal.querySelector('[data-bulk="import"]');

        modal.addEventListener('click', async (event) => {
            const action = event.target.closest('[data-bulk]')?.dataset.bulk;
            if (event.target === modal || action === 'close') {
                modal.remove();
            } else if (action === 'template') {
                this.downloadTemplate(config);
            } else if (action === 'import') {
                importBtn.disabled = true;
                importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
                result.innerHTML = '';
                try {
                    const summary = await this.send(config.endpoint, rows);
                    result.innerHTML = this.renderSummary(summary);
                    preview.innerHTML = '';
                    rows = [];
                    if (summary.created + summary.updated > 0 && typeof config.onDone === 'function') {
                        config.onDone(summary);
                    }
                } catch (error) {
                    result.innerHTML = `<p style="color:var(--danger-color)">${this.escapeHtml(error.message)}</p>`;
                    importBtn.disabled = false;
                }
                importBtn.innerHTML = '<i class="fas fa-upload"></i> Importar';
            }
        });

        modal.querySelector('#bulkImportFile').addEventListener('change', async (event) => {
            const file = event.target.files[0];
            result.innerHTML = '';
            preview.innerHTML = '';
            importBtn.disabled = true;
            rows = [];
            if (!file) return;

            try {
                rows = await this.parseFile(file, config.columns);
                if (rows.length === 0) throw new Error('El archivo no contiene filas con datos');
                if (rows.length > this.MAX_ROWS) {
                    throw new Error(`El archivo supera el máximo de ${this.MAX_ROWS} filas`);
                }
                preview.innerHTML = this.renderPreview(rows, config.columns);
                importBtn.disabled = false;
            } catch (error) {
                rows = [];
                preview.innerHTML = `<p style="color:var(--danger-color)">${this.escapeHtml(error.message)}</p>`;
            }
        });
    },

    async parseFile(file, columns) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        const lookup = {};
        columns.forEach((column) => {
            lookup[this.normalizeHeader(column.key)] = column.key;
            lookup[this.normalizeHeader(column.label)] = column.key;
            (column.aliases || []).forEach((alias) => { lookup[this.normalizeHeader(alias)] = column.key; });
        });

        const rows = raw.map((row) => {
            const mapped = {};
            Object.entries(row).forEach(([header, value]) => {
                const key = lookup[this.normalizeHeader(header)];
                if (key) mapped[key] = typeof value === 'string' ? value.trim() : value;
            });
            return mapped;
        }).filter((row) => Object.values(row).some((value) => String(value).trim() !== ''));

        const recognized = new Set(rows.flatMap((row) => Object.keys(row)));
        const missing = columns.filter((c) => c.required && !recognized.has(c.key));
        if (rows.length > 0 && missing.length > 0) {
            throw new Error(`Faltan columnas obligatorias: ${missing.map((c) => c.key).join(', ')}`);
        }
        return rows;
    },

    renderPreview(rows, columns) {
        const keys = columns.map((c) => c.key).filter((key) => rows.some((row) => key in row));
        const sample = rows.slice(0, 5);
        return `
            <p><strong>${rows.length}</strong> fila(s) listas para importar. Vista previa:</p>
            <div class="table-responsive"><table>
                <thead><tr>${keys.map((k) => `<th>${this.escapeHtml(k)}</th>`).join('')}</tr></thead>
                <tbody>${sample.map((row) => `<tr>${keys.map((k) =>
                    `<td>${this.escapeHtml(row[k])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>`;
    },

    renderSummary(summary) {
        const errors = (summary.errors || []).slice(0, 50);
        return `
            <p><strong>Resultado:</strong> ${summary.created} creados, ${summary.updated} actualizados,
            ${summary.failed} con error.</p>
            ${errors.length ? `<ul style="max-height:160px;overflow:auto;color:var(--danger-color)">
                ${errors.map((e) => `<li>Fila ${e.row}: ${this.escapeHtml(e.message)}</li>`).join('')}
            </ul>` : ''}`;
    },

    async send(endpoint, rows) {
        const response = await authManager.fetchWithAuth(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows })
        });
        if (!response) throw new Error('Sesión expirada');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
        return data;
    },

    downloadTemplate(config) {
        const headers = config.columns.map((c) => c.key);
        const example = config.columns.map((c) => c.example ?? '');
        const worksheet = XLSX.utils.aoa_to_sheet([headers, example]);
        worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
        XLSX.writeFile(workbook, `${config.templateName}.xlsx`);
    }
};

window.BulkImport = BulkImport;
