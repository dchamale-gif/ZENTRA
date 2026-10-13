// ============================================
// UTILIDADES GENERALES
// ============================================

/**
 * Generar ID único basado en prefijo
 * @param {string} prefix - Prefijo para el ID
 * @returns {string} ID generado
 */
function generateId(prefix = 'ID') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
}

/**
 * Redondear a 2 decimales
 * @param {number} valor
 * @returns {number}
 */
function redondear(valor) {
    return Math.round(valor * 100) / 100;
}

/**
 * Validar email
 * @param {string} email
 * @returns {boolean}
 */
function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * Validar teléfono
 * @param {string} telefono
 * @returns {boolean}
 */
function validarTelefono(telefono) {
    return telefono && telefono.length >= 7;
}

/**
 * Formatear fecha a YYYY-MM-DD
 * @param {Date} fecha
 * @returns {string}
 */
function formatearFecha(fecha) {
    const date = new Date(fecha);
    const año = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const día = String(date.getDate()).padStart(2, '0');
    return `${año}-${mes}-${día}`;
}

/**
 * Obtener fecha actual en formato YYYY-MM-DD
 * @returns {string}
 */
function fechaActual() {
    return formatearFecha(new Date());
}

/**
 * Paginar array
 * @param {Array} array
 * @param {number} page - Número de página (1-indexed)
 * @param {number} limit - Límite de items por página
 * @returns {Object} {datos, total, page, limit, pages}
 */
function paginar(array, page = 1, limit = 50) {
    const total = array.length;
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    
    return {
        datos: array.slice(start, end),
        total,
        page,
        limit,
        pages
    };
}

/**
 * Ordenar array de objetos
 * @param {Array} array
 * @param {string} campo
 * @param {string} orden - 'asc' o 'desc'
 * @returns {Array}
 */
function ordenar(array, campo, orden = 'asc') {
    return array.sort((a, b) => {
        if (a[campo] < b[campo]) return orden === 'asc' ? -1 : 1;
        if (a[campo] > b[campo]) return orden === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * Filtrar array de objetos
 * @param {Array} array
 * @param {Object} filtros - {campo: valor}
 * @returns {Array}
 */
function filtrar(array, filtros) {
    return array.filter(item => {
        for (const [campo, valor] of Object.entries(filtros)) {
            if (item[campo] != valor) return false;
        }
        return true;
    });
}

/**
 * Validar objeto requerido
 * @param {Object} obj
 * @param {Array} campos - Array de campos requeridos
 * @returns {Object} {valido, faltantes}
 */
function validarCamposRequeridos(obj, campos = []) {
    const faltantes = campos.filter(campo => !obj[campo]);
    return {
        valido: faltantes.length === 0,
        faltantes
    };
}

/**
 * Convertir array a objeto con clave
 * @param {Array} array
 * @param {string} clave
 * @returns {Object}
 */
function agruparPorClave(array, clave) {
    return array.reduce((acc, item) => {
        const key = item[clave];
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

module.exports = {
    generateId,
    redondear,
    validarEmail,
    validarTelefono,
    formatearFecha,
    fechaActual,
    paginar,
    ordenar,
    filtrar,
    validarCamposRequeridos,
    agruparPorClave
};
