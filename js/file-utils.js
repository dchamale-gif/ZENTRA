// ============================================
// UTILIDADES PARA MANEJO DE ARCHIVOS
// ============================================
// Conversión a base64, generación de documentos, etc.

const FileUtils = {
    // Convertir archivo a base64
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve({
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    base64Data: base64,
                    uploadDate: new Date().toISOString()
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    // Validar tipo de archivo
    isValidFileType(file, allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
        return allowedTypes.includes(file.type);
    },

    // Validar tamaño de archivo (en MB)
    isValidFileSize(file, maxSizeMB = 10) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return file.size <= maxSizeBytes;
    },

    // Generar documento Word con datos del paciente
    generateWordDocument(paciente, includeContent = {}) {
        // Usando una librería simple para generar documentos
        // En producción, usar docx o similar
        const docContent = this.buildWordContent(paciente, includeContent);
        
        // Crear blob y descargar
        const blob = new Blob([docContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Ficha_${paciente.nombre}_${paciente.apellido}_${new Date().getTime()}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    // Construir contenido del documento Word
    buildWordContent(paciente, content = {}) {
        // Estructura básica de un documento Word
        // En producción, usar una librería como docx-js o similar
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Calibri, sans-serif; margin: 20px; }
                    h1 { color: #1e3a8a; text-align: center; margin-bottom: 20px; }
                    h2 { color: #0891b2; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #0891b2; padding-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    td, th { border: 1px solid #ddd; padding: 8px; }
                    th { background-color: #f0f4f8; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <h1>FICHA DEL PACIENTE</h1>
                <h2>Información Personal</h2>
                <table>
                    <tr><td><strong>Cédula:</strong></td><td>${paciente.cedula}</td></tr>
                    <tr><td><strong>Nombre:</strong></td><td>${paciente.nombre} ${paciente.apellido}</td></tr>
                    <tr><td><strong>Email:</strong></td><td>${paciente.email}</td></tr>
                    <tr><td><strong>Teléfono:</strong></td><td>${paciente.telefono}</td></tr>
                    <tr><td><strong>Fecha de Nacimiento:</strong></td><td>${paciente.fechaNacimiento || 'N/A'}</td></tr>
                    <tr><td><strong>Género:</strong></td><td>${paciente.genero || 'N/A'}</td></tr>
                    <tr><td><strong>Dirección:</strong></td><td>${paciente.direccion || 'N/A'}</td></tr>
                    <tr><td><strong>Ciudad:</strong></td><td>${paciente.ciudad || 'N/A'}</td></tr>
                </table>

                ${content.includeDiagnostico ? `
                <h2>Diagnóstico</h2>
                <p>${content.diagnostico || 'N/A'}</p>
                ` : ''}

                ${content.includeMedicamentos ? `
                <h2>Medicamentos Prescritos</h2>
                <p>${content.medicamentos || 'N/A'}</p>
                ` : ''}

                ${content.includeNotas ? `
                <h2>Notas Médicas</h2>
                <p>${paciente.notas || 'N/A'}</p>
                ` : ''}

                ${content.includeHistoria ? `
                <h2>Historia Médica</h2>
                <p>${content.historia || 'N/A'}</p>
                ` : ''}

                <h2>Fecha de Generación</h2>
                <p>${new Date().toLocaleDateString('es-ES', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</p>
            </body>
            </html>
        `;

        return htmlContent;
    },

    // Crear entrada de archivo para el paciente
    createFileEntry(file, pacienteId, category = 'general') {
        return {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            pacienteId: pacienteId,
            fileName: file.fileName,
            fileType: file.fileType,
            fileSize: file.fileSize,
            base64Data: file.base64Data,
            category: category, // imagen, pdf, documento, etc.
            uploadDate: file.uploadDate,
            description: ''
        };
    },

    // Obtener vista previa según tipo de archivo
    getFilePreview(fileEntry) {
        const { fileType, base64Data, fileName } = fileEntry;

        if (fileType.startsWith('image/')) {
            return `
                <div style="margin: 10px 0; text-align: center;">
                    <img src="data:${fileType};base64,${base64Data}" 
                         style="max-width: 300px; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" 
                         alt="${fileName}">
                </div>
            `;
        } else if (fileType === 'application/pdf') {
            return `
                <div style="margin: 10px 0; padding: 20px; background: #f5f5f5; border-radius: 8px; text-align: center;">
                    <i class="fas fa-file-pdf" style="font-size: 48px; color: #ef4444; margin-bottom: 10px;"></i>
                    <p><strong>${fileName}</strong></p>
                    <p style="color: #999; font-size: 12px;">Tamaño: ${(fileEntry.fileSize / 1024).toFixed(2)} KB</p>
                    <button class="btn btn-sm btn-primary" onclick="FileUtils.downloadFile('${fileEntry.id}', '${fileName}')">
                        <i class="fas fa-download"></i> Descargar
                    </button>
                </div>
            `;
        }

        return `<p><strong>${fileName}</strong> - ${(fileEntry.fileSize / 1024).toFixed(2)} KB</p>`;
    },

    // Descargar archivo desde base64
    downloadFile(fileId, fileName) {
        // Esta función se llamaría desde el contexto donde se tiene acceso al archivo
        console.log(`Descargando archivo: ${fileName}`);
        // Implementación real dependerá de cómo se almacenen los archivos
    },

    // Formatear tamaño de archivo
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
};
