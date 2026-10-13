// ============================================
// DATA NORMALIZER - Convierte snake_case a camelCase
// ============================================

const DataNormalizer = {
    // Convertir snake_case a camelCase
    snakeToCamel(str) {
        return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    },

    // Convertir objeto con claves snake_case a camelCase
    normalizePaciente(paciente) {
        if (!paciente) return null;

        // Helper para convertir fechas a formato YYYY-MM-DD para input type="date"
        const formatDateForInput = (dateValue) => {
            if (!dateValue) return '';
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
        };
        
        const normalized = {
            // Datos básicos
            id: paciente.id,
            nombre: paciente.nombre,
            apellidoPaterno: paciente.apellido_paterno,
            apellidoMaterno: paciente.apellido_materno,
            edad: paciente.edad,
            fechaNacimiento: formatDateForInput(paciente.fecha_nacimiento),
            genero: paciente.genero,
            dpi: paciente.dpi,
            pasaporte: paciente.pasaporte,
            cedula: paciente.dpi, // Alias para búsqueda
            
            // Ubicación
            direccion: paciente.direccion,
            colonia: paciente.colonia,
            zona: paciente.zona,
            municipio: paciente.municipio,
            departamento: paciente.departamento,
            
            // Contacto
            telefono: paciente.telefono,
            email: paciente.email,
            
            // Información personal
            estadoCivil: paciente.estado_civil,
            profesion: paciente.profesion,
            ocupacion: paciente.ocupacion,
            nacionalidad: paciente.nacionalidad || '',
            gradoAcademico: paciente.grado_academico || '',
            tieneHijos: paciente.tiene_hijos === true ? 'si' : (paciente.tiene_hijos === false ? 'no' : ''),
            
            // Datos de consulta
            fechaPrimerConsulta: formatDateForInput(paciente.fecha_primer_consulta),
            motivoConsulta: paciente.motivo_consulta || '',
            referencia: paciente.referencia || '',
            pacienteRefierenombre: paciente.paciente_refiere_nombre || '',
            
            // Estado
            estado: paciente.estado,
            isCliente: paciente.is_cliente || false,
            tipoServicio: paciente.tipo_servicio || '',
            clasificacion: paciente.clasificacion || '',
            segmentoCOEX: paciente.segmento_coex || '',
            
            // Documentos
            documentoIdentificacion: paciente.documento_identificacion || '',
            foto: paciente.foto,
            documentos: paciente.documentos || [],
            archivos: paciente.archivos || [],
            
            // Datos de familia
            familia: paciente.familia || null,
            responsable: paciente.responsable || null,
            
            // Notas
            notas: paciente.notas || '',
            clienteId: paciente.cliente_id || '',
            
            // Datos de timestamp
            fechaRegistro: paciente.created_at || new Date().toISOString().split('T')[0],
            createdAt: paciente.created_at,
            updatedAt: paciente.updated_at,
            
            // Alias para compatibilidad
            apellido: paciente.apellido_paterno
        };
        
        return normalized;
    },

    // Normalizar array de pacientes
    normalizePacientes(pacientes) {
        if (!Array.isArray(pacientes)) return [];
        return pacientes.map(p => this.normalizePaciente(p));
    },

    // Convertir camelCase a snake_case para enviar al backend
    camelToSnake(str) {
        return str.replace(/([A-Z])/g, '_$1').toLowerCase();
    },

    // Convertir objeto camelCase a snake_case para el backend
    denormalizePaciente(paciente) {
        if (!paciente) return null;
        
        // 🔍 DEBUG: Log dirección en la entrada
        console.log('%c🔍 denormalizePaciente() recibe direccion:', 'color: purple;', 
                   'INPUT:', JSON.stringify(paciente.direccion));
        
        const result = {
            id: paciente.id,
            nombre: paciente.nombre,
            apellido_paterno: paciente.apellidoPaterno,
            apellido_materno: paciente.apellidoMaterno,
            edad: paciente.edad,
            fecha_nacimiento: paciente.fechaNacimiento,
            genero: paciente.genero,
            dpi: paciente.dpi,
            telefono: paciente.telefono,
            email: paciente.email,
            direccion: paciente.direccion,
            colonia: paciente.colonia,
            zona: paciente.zona,
            municipio: paciente.municipio,
            departamento: paciente.departamento,
            nacionalidad: paciente.nacionalidad,
            estado_civil: paciente.estadoCivil,
            profesion: paciente.profesion,
            ocupacion: paciente.ocupacion,
            grado_academico: paciente.gradoAcademico,
            tiene_hijos: paciente.tieneHijos === 'si' ? true : (paciente.tieneHijos === 'no' ? false : null),
            fecha_primer_consulta: paciente.fechaPrimerConsulta,
            motivo_consulta: paciente.motivoConsulta,
            referencia: paciente.referencia,
            estado: paciente.estado,
            is_cliente: paciente.isCliente,
            tipo_servicio: paciente.tipoServicio,
            clasificacion: paciente.clasificacion,
            segmento_coex: paciente.segmentoCOEX,
            foto: paciente.foto,
            notas: paciente.notas
        };
        
        // 🔍 DEBUG: Log dirección en la salida
        console.log('%c🔍 denormalizePaciente() devuelve direccion:', 'color: purple;', 
                   'OUTPUT:', JSON.stringify(result.direccion));
        
        return result;
    }
};

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.DataNormalizer = DataNormalizer;
}
