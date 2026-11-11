// ============================================
// DESCUENTOS AL VENDER
// Se escriben en quetzales («25») o en porcentaje («10%»); siempre se guardan en quetzales.
// Darlos requiere el módulo Descuentos con nivel editar.
// ============================================

const Descuento = {
    puede() {
        return typeof AccessControl !== 'undefined' && AccessControl.canEdit('descuentos');
    },

    // Devuelve { monto } en quetzales (redondeado a centavos) o { error }. Vacío = 0.
    leer(texto, base) {
        const limpio = String(texto ?? '').trim().replace(/\s/g, '');
        if (!limpio) return { monto: 0 };
        const porcentaje = limpio.endsWith('%');
        const numero = typeof parseMonto === 'function' ? parseMonto(porcentaje ? limpio.slice(0, -1) : limpio) : Number(limpio.replace('%', ''));
        if (!Number.isFinite(numero) || numero < 0) return { error: 'Escribe el descuento en quetzales (25) o en porcentaje (10%).' };
        if (porcentaje && numero > 100) return { error: 'El porcentaje de descuento no puede pasar de 100%.' };
        const monto = Math.round((porcentaje ? (base * numero) / 100 : numero) * 100) / 100;
        if (monto > Math.round(base * 100) / 100 + 0.000001) {
            return { error: `El descuento (${formatQ(monto)}) no puede ser mayor que el importe (${formatQ(base)}).` };
        }
        return { monto };
    },

    // Texto para volver a mostrar un descuento guardado.
    texto(monto) {
        return Number(monto) > 0 ? Number(monto).toFixed(2) : '';
    }
};
