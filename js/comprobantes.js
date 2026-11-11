// ============================================
// COMPROBANTES DE VENTA
// Un mismo comprobante en ticket (80 o 58 mm) o en hoja completa (carta u oficio, sirve
// también como guía de envío). Se imprime, se descarga en PDF o se envía por WhatsApp.
// Lo usan Ventas (cualquier venta) y el punto de venta (al cobrar).
// ============================================

const ComprobanteModule = {
    FORMATO_KEY: 'comprobante.formato',
    FORMATOS: { 80: 'Ticket 80 mm', 58: 'Ticket 58 mm', carta: 'Hoja carta', oficio: 'Hoja oficio' },
    // Medidas en mm. Oficio es el de Guatemala: 8.5 × 13 pulgadas.
    HOJAS: { carta: { ancho: 215.9, alto: 279.4, css: 'letter' }, oficio: { ancho: 215.9, alto: 330.2, css: '8.5in 13in' } },
    TICKETS: { 80: 72, 58: 48 },
    MARGEN_HOJA: 12,
    METODOS: { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito: 'Crédito', mixto: 'Pago dividido' },

    state: { empresa: null, cargandoEmpresa: null, actual: null, pdf: null, initialized: false },

    // ---------- Datos ----------

    // Encabezado del comprobante. Si falla, se usa al menos el nombre de la empresa.
    cargarEmpresa() {
        if (this.state.empresa) return Promise.resolve(this.state.empresa);
        if (!this.state.cargandoEmpresa) {
            this.state.cargandoEmpresa = fetch(`${authManager.apiBaseUrl}/api/ventas/empresa`, { headers: { 'Content-Type': 'application/json' } })
                .then(response => (response.ok ? response.json() : null))
                .then(data => {
                    if (data?.empresa) this.state.empresa = data.empresa;
                    return this.state.empresa || this.empresaMinima();
                })
                .catch(() => this.empresaMinima())
                .finally(() => { this.state.cargandoEmpresa = null; });
        }
        return this.state.cargandoEmpresa;
    },

    empresaMinima() {
        return { nombre: authManager.getUser()?.organization?.name || '' };
    },

    esHoja(formato) {
        return Boolean(this.HOJAS[formato]);
    },

    esCui(id) {
        return /^\d{13}$/.test(String(id || '')) && !(typeof FelModule !== 'undefined' && FelModule.nitValido(id));
    },

    // Comprobante de una venta guardada (lista de Ventas).
    deVenta(venta) {
        const factura = venta.factura?.estado === 'certificado' ? venta.factura : null;
        let cuentaNombre = venta.cuenta_nombre || '';
        let observaciones = venta.observaciones || '';
        // El punto de venta anota de qué cuenta salió la venta; eso no es una nota para el cliente.
        const pos = observaciones.match(/^Punto de venta · (.*)$/);
        if (pos) {
            cuentaNombre ||= pos[1];
            observaciones = '';
        }
        const total = Number(venta.total) || 0;
        return {
            tipo: 'venta',
            numero: venta.numero_venta,
            fecha: this.fechaVenta(venta),
            cuentaNombre,
            lineas: (venta.items || []).map(item => ({
                nombre: item.concepto_nombre,
                codigo: item.concepto_codigo || '',
                cantidad: Number(item.cantidad) || 0,
                precio: Number(item.precio_unitario) || 0,
                descuento: Number(item.descuento) || 0
            })),
            total,
            subtotal: Number(venta.subtotal) || 0,
            descuento: Number(venta.descuento) || 0,
            descuentoGeneral: Number(venta.descuento_general) || 0,
            metodo: venta.metodo_pago,
            pagos: venta.metodo_pago === 'mixto' ? (venta.pagos_contado || []) : null,
            pagado: Number(venta.pagado) || 0,
            pendiente: venta.metodo_pago === 'credito' ? Number(venta.pendiente) || 0 : 0,
            factura,
            facturaExterna: !factura ? venta.factura_externa || '' : '',
            facturaPendiente: !factura && !venta.factura_externa && Boolean(venta.factura_solicitada),
            cliente: this.clienteDeVenta(venta, factura),
            observaciones,
            atendio: venta.vendedor_nombre || ''
        };
    },

    clienteDeVenta(venta, factura) {
        let nombre = '';
        let id = '';
        let idTipo = 'NIT';
        if (factura) {
            nombre = factura.receptor_nombre;
            id = factura.receptor_id;
            idTipo = this.esCui(id) ? 'CUI' : 'NIT';
        } else if (venta.factura_receptor_id) {
            nombre = venta.factura_receptor_nombre;
            id = venta.factura_receptor_id;
            idTipo = venta.factura_receptor_tipo === 'CUI' ? 'CUI' : 'NIT';
        }
        if (venta.cliente_id) {
            if (!nombre || id === 'CF') nombre = venta.receptor_nombre;
            if ((!id || id === 'CF') && venta.cliente_nit) {
                id = venta.cliente_nit;
                idTipo = 'NIT';
            }
        }
        const consumidorFinal = !venta.cliente_id && (!nombre || id === 'CF');
        return {
            nombre: consumidorFinal ? (nombre && id === 'CF' ? nombre : 'Consumidor final') : nombre,
            id: id || (consumidorFinal ? 'CF' : ''),
            idTipo,
            telefono: venta.cliente_telefono || '',
            direccion: venta.cliente_direccion || '',
            consumidorFinal
        };
    },

    // La fecha llega como día (UTC a medianoche) y la hora aparte.
    fechaVenta(venta) {
        const dia = venta.fecha ? new Date(venta.fecha).toLocaleDateString('es-GT', { timeZone: 'UTC' }) : '';
        const hora = String(venta.hora || '').slice(0, 5);
        return [dia, hora].filter(Boolean).join(' ');
    },

    // ---------- Contenido ----------

    // Subtotal antes de descuentos: la suma de cantidad × precio.
    subtotal(c) {
        return c.lineas.reduce((sum, linea) => sum + linea.cantidad * linea.precio, 0);
    },

    ahorro(c) {
        return Math.max(0, Math.round((this.subtotal(c) - c.total) * 100) / 100);
    },

    conDescuento(c) {
        return this.ahorro(c) > 0.004;
    },

    // Subtotal − descuentos por producto − descuento al total = TOTAL.
    filasDescuento(c, fila) {
        if (!this.conDescuento(c)) return '';
        const porProducto = c.lineas.reduce((sum, linea) => sum + (linea.descuento || 0), 0);
        return fila('Subtotal', formatQ(this.subtotal(c))) +
            (porProducto > 0 ? fila('Desc. por producto', `−${formatQ(porProducto)}`) : '') +
            (c.descuentoGeneral > 0 ? fila('Descuento al total', `−${formatQ(c.descuentoGeneral)}`) : '');
    },

    // El cambio es sobre lo que se pagó en efectivo (en un pago dividido, solo esa parte).
    cambio(c) {
        if (!c.recibido) return 0;
        const efectivo = c.efectivo ?? (c.pagos ? c.pagos.find(pago => pago.metodo === 'efectivo')?.monto || 0 : c.total);
        return c.recibido - Number(efectivo);
    },

    titulo(c, hoja) {
        if (c.tipo === 'cuenta') return 'Cuenta (no es comprobante de pago)';
        if (c.factura) return 'Factura electrónica';
        return hoja ? 'Comprobante de venta' : 'Ticket de venta';
    },

    nombreArchivo(c) {
        const base = c.factura ? `Factura-${c.factura.serie}-${c.factura.numero}` : `Venta-${c.numero || 'cuenta'}`;
        return `${base.replace(/[^\w.-]+/g, '_')}.pdf`;
    },

    css(formato) {
        const comun = `
            .cpb, .cpb *, .cpb *::before, .cpb *::after { all: revert; box-sizing: border-box; }
            .cpb { display: block; margin: 0 auto; color: #000; background: #fff; text-align: left; }
            .cpb .cpb-fila { display: flex; justify-content: space-between; gap: 8px; }
            .cpb .cpb-fila > span:last-child { text-align: right; }
            .cpb .cpb-ajustar { overflow-wrap: anywhere; }`;
        if (!this.esHoja(formato)) {
            const ancho = this.TICKETS[formato] || this.TICKETS[80];
            return `${comun}
            .cpb { width: ${ancho}mm; padding: 2mm 0 10mm; font: ${formato === '58' ? '11px' : '12px'}/1.35 "Courier New", Courier, monospace; }
            .cpb.cpb-pdf { padding-bottom: 2mm; }
            .cpb h1 { margin: 0; font-size: 1.25em; font-weight: bold; text-align: center; }
            .cpb p { margin: 0; text-align: center; }
            .cpb .cpb-titulo { margin: 6px 0 2px; font-weight: bold; text-transform: uppercase; }
            .cpb hr { display: block; height: 0; border: 0; border-top: 1px dashed #000; margin: 6px 0; }
            .cpb .cpb-fila > span:last-child { white-space: nowrap; }
            .cpb .cpb-fila > span:first-child { overflow-wrap: anywhere; }
            .cpb .cpb-item { margin-bottom: 3px; }
            .cpb .cpb-total { font-size: 1.3em; font-weight: bold; }
            .cpb .cpb-chico { font-size: 0.9em; overflow-wrap: anywhere; }
            .cpb .cpb-nota { margin-top: 2px; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; }`;
        }
        return `${comun}
            .cpb { width: 100%; font: 10.5pt/1.4 Arial, Helvetica, sans-serif; color: #111; }
            .cpb h1 { margin: 0 0 4px; font-size: 17pt; font-weight: bold; line-height: 1.2; }
            .cpb p { margin: 0; }
            .cpb .cpb-encabezado { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
                padding-bottom: 10px; border-bottom: 2px solid #111; }
            .cpb .cpb-empresa { min-width: 0; }
            .cpb .cpb-empresa p { font-size: 9.5pt; color: #333; }
            .cpb .cpb-doc { flex: 0 0 auto; min-width: 62mm; padding: 8px 10px; border: 1.5px solid #111; border-radius: 4px; }
            .cpb .cpb-doc-tipo { margin-bottom: 4px; font-size: 11.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em; }
            .cpb .cpb-doc .cpb-fila { font-size: 9.5pt; }
            .cpb .cpb-doc .cpb-fila > span:first-child { color: #444; }
            .cpb .cpb-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0;
                padding: 10px 12px; border: 1px solid #bbb; border-radius: 4px; break-inside: avoid; }
            .cpb .cpb-dato { display: flex; gap: 6px; min-width: 0; font-size: 10pt; }
            .cpb .cpb-dato > span:first-child { flex: 0 0 auto; color: #555; }
            .cpb .cpb-dato > span:last-child { overflow-wrap: anywhere; font-weight: bold; }
            .cpb .cpb-dato-ancho { grid-column: 1 / -1; }
            .cpb table { width: 100%; border-collapse: collapse; font-size: 10pt; }
            .cpb thead { display: table-header-group; }
            .cpb tr { break-inside: avoid; }
            .cpb th { padding: 6px; border-bottom: 1.5px solid #111; background: #efefef; font-weight: bold; text-align: left; }
            .cpb td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
            .cpb .cpb-num { text-align: right; white-space: nowrap; }
            .cpb .cpb-codigo { color: #555; white-space: nowrap; }
            .cpb .cpb-totales { width: 72mm; margin: 10px 0 0 auto; break-inside: avoid; }
            .cpb .cpb-totales .cpb-fila { padding: 2px 0; }
            .cpb .cpb-total { margin-top: 4px; padding-top: 6px; border-top: 2px solid #111; font-size: 13pt; font-weight: bold; }
            .cpb .cpb-caja { margin-top: 14px; padding: 8px 12px; border: 1px solid #bbb; border-radius: 4px; break-inside: avoid; }
            .cpb .cpb-caja-titulo { margin-bottom: 2px; font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #444; }
            .cpb .cpb-nota { white-space: pre-wrap; overflow-wrap: anywhere; }
            .cpb .cpb-fel { font-size: 9pt; }
            .cpb .cpb-fel p { overflow-wrap: anywhere; }
            .cpb .cpb-firmas { display: flex; gap: 32px; margin-top: 36px; break-inside: avoid; }
            .cpb .cpb-firma { flex: 1; padding-top: 4px; border-top: 1px solid #111; font-size: 9pt; text-align: center; color: #333; }
            .cpb .cpb-pie { margin-top: 18px; font-size: 9pt; text-align: center; color: #444; }`;
    },

    cuerpo(c, formato, empresa, { pdf = false } = {}) {
        return this.esHoja(formato) ? this.cuerpoHoja(c, formato, empresa) : this.cuerpoTicket(c, formato, empresa, pdf);
    },

    cuerpoTicket(c, formato, empresa, pdf) {
        const e = (value) => this.escape(value);
        const fila = (label, value, cls = '') => `<div class="cpb-fila ${cls}"><span>${label}</span><span>${value}</span></div>`;
        const factura = c.factura;
        const cliente = c.cliente && !c.cliente.consumidorFinal ? c.cliente : null;
        const cambio = this.cambio(c);
        return `<div class="cpb cpb-${e(formato)}${pdf ? ' cpb-pdf' : ''}">
            ${empresa.nombre ? `<h1>${e(empresa.nombre)}</h1>` : ''}
            ${empresa.razonSocial ? `<p>${e(empresa.razonSocial)}</p>` : ''}
            ${empresa.nit ? `<p>NIT: ${e(empresa.nit)}</p>` : ''}
            ${empresa.direccion ? `<p class="cpb-chico">${e(empresa.direccion)}</p>` : ''}
            ${empresa.telefono ? `<p class="cpb-chico">Tel. ${e(empresa.telefono)}</p>` : ''}
            <p class="cpb-titulo">${e(this.titulo(c, false))}</p>
            ${factura ? `<p>Serie ${e(factura.serie)} · No. ${e(factura.numero)}</p>` : ''}
            ${c.facturaExterna ? `<p>Factura ${e(c.facturaExterna)}</p>` : ''}
            <hr>
            ${c.numero ? fila('Venta', e(c.numero)) : ''}
            ${fila('Fecha', e(c.fecha))}
            ${c.cuentaNombre ? fila('Cuenta', e(c.cuentaNombre)) : ''}
            ${c.atendio ? fila('Atendió', e(c.atendio)) : ''}
            ${cliente ? fila(cliente.idTipo === 'CUI' ? 'CUI cliente' : 'NIT cliente', e(cliente.id || 'CF')) + fila('Cliente', e(cliente.nombre)) : ''}
            ${factura && !cliente ? fila('NIT cliente', 'CF') : ''}
            <hr>
            ${c.lineas.map(linea => `<div class="cpb-item">
                <div class="cpb-ajustar">${e(linea.nombre)}</div>
                ${fila(`${linea.cantidad} × ${formatQ(linea.precio)}`, formatQ(linea.cantidad * linea.precio))}
                ${linea.descuento > 0 ? fila('&nbsp;&nbsp;Descuento', `−${formatQ(linea.descuento)}`) : ''}
            </div>`).join('')}
            <hr>
            ${this.filasDescuento(c, fila)}
            ${fila('TOTAL', formatQ(c.total), 'cpb-total')}
            ${c.metodo ? fila('Pago', e(this.METODOS[c.metodo] || c.metodo)) : ''}
            ${(c.pagos || []).map(pago => fila(`&nbsp;&nbsp;${e(this.METODOS[pago.metodo] || pago.metodo)}`, formatQ(Number(pago.monto)))).join('')}
            ${c.metodo === 'credito' ? fila('Pagado', formatQ(c.pagado)) + fila('Saldo', formatQ(c.pendiente)) : ''}
            ${c.recibido ? fila('Recibido', formatQ(c.recibido)) + fila('Cambio', formatQ(cambio)) : ''}
            ${c.observaciones ? `<hr><p class="cpb-nota">${e(c.observaciones)}</p>` : ''}
            ${factura ? `<hr>
                <p class="cpb-chico">Autorización:<br>${e(factura.uuid)}</p>
                ${factura.fecha_certificacion ? `<p class="cpb-chico">Certificada: ${e(new Date(factura.fecha_certificacion).toLocaleString('es-GT'))}</p>` : ''}
                ${factura.ambiente && factura.ambiente !== 'produccion' ? '<p class="cpb-chico">Ambiente de pruebas: sin validez fiscal</p>' : ''}` : ''}
            ${c.facturaPendiente ? '<hr><p class="cpb-chico">Su factura se emite por separado.</p>' : ''}
            <hr>
            <p>${c.tipo === 'cuenta' ? 'Total a pagar' : '¡Gracias por su compra!'}</p>
        </div>`;
    },

    cuerpoHoja(c, formato, empresa) {
        const e = (value) => this.escape(value);
        const fila = (label, value) => `<div class="cpb-fila"><span>${label}</span><span>${value}</span></div>`;
        const dato = (label, value, ancho = false) => (value
            ? `<div class="cpb-dato${ancho ? ' cpb-dato-ancho' : ''}"><span>${label}</span><span>${e(value)}</span></div>` : '');
        const factura = c.factura;
        const cliente = c.cliente || { nombre: 'Consumidor final', id: 'CF', idTipo: 'NIT' };
        const conCodigo = c.lineas.some(linea => linea.codigo);
        const conDescLinea = c.lineas.some(linea => linea.descuento > 0);
        const contacto = [empresa.telefono && `Tel. ${empresa.telefono}`, empresa.email].filter(Boolean).join(' · ');

        return `<div class="cpb cpb-hoja">
            <div class="cpb-encabezado">
                <div class="cpb-empresa">
                    ${empresa.nombre ? `<h1>${e(empresa.nombre)}</h1>` : ''}
                    ${empresa.razonSocial ? `<p>${e(empresa.razonSocial)}</p>` : ''}
                    ${empresa.nit ? `<p>NIT: ${e(empresa.nit)}</p>` : ''}
                    ${empresa.direccion ? `<p>${e(empresa.direccion)}</p>` : ''}
                    ${contacto ? `<p>${e(contacto)}</p>` : ''}
                </div>
                <div class="cpb-doc">
                    <div class="cpb-doc-tipo">${e(this.titulo(c, true))}</div>
                    ${factura ? fila('Serie', e(factura.serie)) + fila('Número', e(factura.numero)) : ''}
                    ${c.facturaExterna ? fila('Factura', e(c.facturaExterna)) : ''}
                    ${c.numero ? fila('Venta', e(c.numero)) : ''}
                    ${fila('Fecha', e(c.fecha))}
                </div>
            </div>
            <div class="cpb-datos">
                ${dato('Cliente:', cliente.nombre)}
                ${dato(`${cliente.idTipo === 'CUI' ? 'CUI' : 'NIT'}:`, cliente.id || 'CF')}
                ${dato('Teléfono:', cliente.telefono)}
                ${dato('Forma de pago:', c.pagos?.length ? PagoDividido.texto(c.pagos) : this.METODOS[c.metodo] || c.metodo, Boolean(c.pagos?.length))}
                ${dato('Dirección:', cliente.direccion, true)}
                ${dato('Atendió:', c.atendio)}
                ${dato('Cuenta:', c.cuentaNombre)}
            </div>
            <table>
                <thead><tr>
                    ${conCodigo ? '<th>Código</th>' : ''}
                    <th>Descripción</th>
                    <th class="cpb-num">Cant.</th>
                    <th class="cpb-num">Precio unit.</th>
                    ${conDescLinea ? '<th class="cpb-num">Descuento</th>' : ''}
                    <th class="cpb-num">Subtotal</th>
                </tr></thead>
                <tbody>
                    ${c.lineas.map(linea => `<tr>
                        ${conCodigo ? `<td class="cpb-codigo">${e(linea.codigo)}</td>` : ''}
                        <td class="cpb-ajustar">${e(linea.nombre)}</td>
                        <td class="cpb-num">${e(linea.cantidad)}</td>
                        <td class="cpb-num">${formatQ(linea.precio)}</td>
                        ${conDescLinea ? `<td class="cpb-num">${linea.descuento > 0 ? `−${formatQ(linea.descuento)}` : '—'}</td>` : ''}
                        <td class="cpb-num">${formatQ(linea.cantidad * linea.precio - (linea.descuento || 0))}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="cpb-totales">
                ${this.filasDescuento(c, fila)}
                <div class="cpb-fila cpb-total"><span>TOTAL</span><span>${formatQ(c.total)}</span></div>
                ${c.metodo === 'credito' ? fila('Pagado', formatQ(c.pagado)) + fila('Saldo pendiente', formatQ(c.pendiente)) : ''}
                ${c.recibido ? fila('Efectivo recibido', formatQ(c.recibido)) + fila('Cambio', formatQ(this.cambio(c))) : ''}
            </div>
            ${c.observaciones ? `<div class="cpb-caja"><div class="cpb-caja-titulo">Notas</div><div class="cpb-nota">${e(c.observaciones)}</div></div>` : ''}
            ${factura ? `<div class="cpb-caja cpb-fel">
                <div class="cpb-caja-titulo">Documento tributario electrónico</div>
                <p>Número de autorización: ${e(factura.uuid)}</p>
                ${factura.fecha_certificacion ? `<p>Fecha de certificación: ${e(new Date(factura.fecha_certificacion).toLocaleString('es-GT'))}</p>` : ''}
                ${factura.ambiente && factura.ambiente !== 'produccion' ? '<p><strong>Emitida en ambiente de pruebas: sin validez fiscal.</strong></p>' : ''}
            </div>` : ''}
            ${c.facturaPendiente ? '<div class="cpb-caja"><p>Su factura se emite por separado.</p></div>' : ''}
            ${c.tipo === 'venta' ? `<div class="cpb-firmas">
                <div class="cpb-firma">Entregado por</div>
                <div class="cpb-firma">Recibido por (nombre, firma y fecha)</div>
            </div>` : ''}
            <p class="cpb-pie">${c.tipo === 'cuenta' ? 'Total a pagar' : '¡Gracias por su compra!'}</p>
        </div>`;
    },

    // Documento completo para imprimir. En vista previa la hoja se ve como papel sobre fondo gris.
    documento(c, formato, empresa, { vista = false } = {}) {
        const hoja = this.HOJAS[formato];
        const pagina = hoja ? `size: ${hoja.css}; margin: ${this.MARGEN_HOJA}mm;` : `size: ${formato}mm auto; margin: 0;`;
        const papel = hoja
            ? `width: ${hoja.ancho}mm; min-height: ${hoja.alto}mm; padding: ${this.MARGEN_HOJA}mm;`
            : `width: ${formato}mm; padding: 0 ${(Number(formato) - this.TICKETS[formato]) / 2}mm;`;
        return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${this.escape(this.titulo(c, Boolean(hoja)))}</title><style>
            @page { ${pagina} }
            html, body { margin: 0; padding: 0; background: #fff; }
            ${vista ? `html, body { min-height: 100%; background: #e5e7eb; }
            body { padding: 12px; box-sizing: border-box; }
            .cpb-papel { ${papel} margin: 0 auto; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); }` : ''}
            ${this.css(formato)}
        </style></head><body>${vista ? '<div class="cpb-papel">' : ''}${this.cuerpo(c, formato, empresa)}${vista ? '</div>' : ''}</body></html>`;
    },

    // ---------- Imprimir y PDF ----------

    // Un iframe oculto con solo el comprobante: se imprime sin el resto de la pantalla.
    async imprimir(c, formato = this.formatoGuardado()) {
        const empresa = await this.cargarEmpresa();
        document.getElementById('comprobantePrintFrame')?.remove();
        const frame = document.createElement('iframe');
        frame.id = 'comprobantePrintFrame';
        frame.title = 'Comprobante';
        frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
        frame.addEventListener('load', () => {
            try {
                frame.contentWindow.focus();
                frame.contentWindow.print();
            } catch {
                showNotification('No se pudo abrir la impresión del comprobante.', 'error');
            }
        }, { once: true });
        frame.srcdoc = this.documento(c, formato, empresa);
        document.body.appendChild(frame);
    },

    async generarPdf(c, formato) {
        const [empresa] = await Promise.all([this.cargarEmpresa(), loadLibrary('pdf')]);
        const holder = document.createElement('div');
        holder.setAttribute('aria-hidden', 'true');
        holder.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
        holder.innerHTML = `<style>${this.css(formato)}</style>${this.cuerpo(c, formato, empresa, { pdf: true })}`;
        document.body.appendChild(holder);
        try {
            const elemento = holder.querySelector('.cpb');
            const hoja = this.HOJAS[formato];
            let margen;
            let pagina;
            if (hoja) {
                margen = this.MARGEN_HOJA;
                pagina = [hoja.ancho, hoja.alto];
            } else {
                // Un ticket es una sola tira: la página mide lo que mide el contenido.
                const ancho = Number(formato);
                margen = [3, (ancho - this.TICKETS[formato]) / 2];
                const alto = Math.ceil(elemento.getBoundingClientRect().height * 25.4 / 96) + 10;
                pagina = [ancho, Math.max(alto, ancho + 1)];
            }
            return await html2pdf().set({
                margin: margen,
                filename: this.nombreArchivo(c),
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, backgroundColor: '#ffffff', logging: false },
                jsPDF: { unit: 'mm', format: pagina, orientation: 'portrait' },
                pagebreak: { mode: ['css'], avoid: ['tr', '.cpb-caja', '.cpb-totales', '.cpb-firmas', '.cpb-datos'] }
            }).from(elemento).outputPdf('blob');
        } finally {
            holder.remove();
        }
    },

    descargar(blob, nombre) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nombre;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    },

    // ---------- WhatsApp ----------

    // En el teléfono se comparte el PDF directo a WhatsApp; en la computadora se descarga y se
    // abre WhatsApp con el mensaje para adjuntarlo (WhatsApp no deja adjuntar archivos por enlace).
    puedeCompartirArchivo() {
        try {
            return window.matchMedia('(pointer: coarse)').matches && typeof navigator.canShare === 'function' &&
                navigator.canShare({ files: [new File([''], 'prueba.pdf', { type: 'application/pdf' })] });
        } catch {
            return false;
        }
    },

    // Con 8 dígitos se asume Guatemala (502).
    numeroWhatsapp(texto) {
        const digitos = String(texto || '').replace(/\D/g, '');
        if (!digitos) return '';
        return digitos.length === 8 ? `502${digitos}` : digitos;
    },

    mensaje(c, empresa) {
        const cliente = c.cliente && !c.cliente.consumidorFinal ? ` ${c.cliente.nombre}` : '';
        const documento = c.factura
            ? `tu factura serie ${c.factura.serie} número ${c.factura.numero}`
            : `el comprobante de tu compra ${c.numero}`;
        return `Hola${cliente}, te enviamos ${documento} por ${formatQ(c.total)}${empresa.nombre ? ` de ${empresa.nombre}` : ''}. ¡Gracias por tu compra!`;
    },

    // ---------- Ventana ----------

    init() {
        if (this.state.initialized) return;
        this.state.initialized = true;
        document.getElementById('comprobanteFormatos')?.addEventListener('change', (event) => {
            if (event.target.name !== 'comprobanteFormato') return;
            this.guardarFormato(event.target.value);
            this.state.pdf = null;
            this.renderVista();
            this.prepararPdfSiComparte();
        });
        document.getElementById('comprobanteImprimir')?.addEventListener('click', () => {
            if (this.state.actual) this.imprimir(this.state.actual, this.formatoElegido());
        });
        document.getElementById('comprobantePdf')?.addEventListener('click', () => this.descargarPdf());
        document.getElementById('comprobanteWhatsapp')?.addEventListener('click', () => this.enviarWhatsapp());
        document.getElementById('comprobanteVista')?.addEventListener('load', () => this.ajustarVista());
        window.addEventListener('resize', () => {
            if (document.getElementById('comprobanteModal')?.style.display === 'flex') this.ajustarVista();
        });
    },

    abrir(c, { telefono = '' } = {}) {
        this.init();
        this.state.actual = c;
        this.state.pdf = null;
        document.getElementById('comprobanteTitulo').textContent = c.numero ? `Comprobante · venta ${c.numero}` : 'Comprobante';
        const formato = this.formatoGuardado();
        const radio = document.querySelector(`input[name="comprobanteFormato"][value="${formato}"]`);
        if (radio) radio.checked = true;
        document.getElementById('comprobanteTelefono').value = telefono || c.cliente?.telefono || '';
        this.mostrarError('');
        document.getElementById('comprobanteModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.renderVista();
        this.prepararPdfSiComparte();
        document.getElementById('comprobanteImprimir').focus();
    },

    cerrar() {
        document.getElementById('comprobanteModal').style.display = 'none';
        document.body.style.overflow = '';
        this.state.actual = null;
        this.state.pdf = null;
    },

    async renderVista() {
        const c = this.state.actual;
        const frame = document.getElementById('comprobanteVista');
        if (!c || !frame) return;
        const formato = this.formatoElegido();
        const empresa = await this.cargarEmpresa();
        if (this.state.actual !== c || this.formatoElegido() !== formato) return;
        frame.srcdoc = this.documento(c, formato, empresa, { vista: true });
    },

    // La hoja se reduce para que quepa completa a lo ancho de la ventana.
    ajustarVista() {
        const frame = document.getElementById('comprobanteVista');
        const doc = frame?.contentDocument;
        const papel = doc?.querySelector('.cpb-papel');
        if (!papel) return;
        doc.body.style.zoom = '';
        const disponible = frame.clientWidth - 24;
        const escala = Math.min(1, disponible / papel.offsetWidth);
        doc.body.style.zoom = String(escala);
    },

    formatoElegido() {
        return document.querySelector('input[name="comprobanteFormato"]:checked')?.value || this.formatoGuardado();
    },

    formatoGuardado() {
        let formato = '';
        try { formato = localStorage.getItem(this.FORMATO_KEY) || ''; } catch { /* opcional */ }
        return this.FORMATOS[formato] ? formato : 'carta';
    },

    guardarFormato(formato) {
        try { localStorage.setItem(this.FORMATO_KEY, formato); } catch { /* opcional */ }
    },

    // El PDF de la ventana se genera una sola vez por formato.
    pdfActual() {
        const c = this.state.actual;
        const formato = this.formatoElegido();
        if (this.state.pdf?.c === c && this.state.pdf.formato === formato) return this.state.pdf.promesa;
        const promesa = this.generarPdf(c, formato);
        this.state.pdf = { c, formato, promesa };
        promesa.catch(() => { if (this.state.pdf?.promesa === promesa) this.state.pdf = null; });
        return promesa;
    },

    // Compartir debe ocurrir justo después del toque: el PDF se deja listo de antemano.
    prepararPdfSiComparte() {
        if (this.state.actual && this.puedeCompartirArchivo()) this.pdfActual().catch(() => {});
    },

    async conBoton(id, texto, tarea) {
        const boton = document.getElementById(id);
        const original = boton.innerHTML;
        boton.disabled = true;
        boton.innerHTML = `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ${texto}`;
        this.mostrarError('');
        try {
            await tarea();
        } catch (error) {
            this.mostrarError(error.message || 'No se pudo generar el PDF. Inténtalo de nuevo.');
        } finally {
            boton.disabled = false;
            boton.innerHTML = original;
        }
    },

    descargarPdf() {
        const c = this.state.actual;
        if (!c) return;
        return this.conBoton('comprobantePdf', 'Generando…', async () => {
            this.descargar(await this.pdfActual(), this.nombreArchivo(c));
        });
    },

    enviarWhatsapp() {
        const c = this.state.actual;
        if (!c) return;
        const numero = this.numeroWhatsapp(document.getElementById('comprobanteTelefono').value);
        if (this.puedeCompartirArchivo()) {
            return this.conBoton('comprobanteWhatsapp', 'Preparando…', async () => {
                const [blob, empresa] = await Promise.all([this.pdfActual(), this.cargarEmpresa()]);
                const archivo = new File([blob], this.nombreArchivo(c), { type: 'application/pdf' });
                try {
                    await navigator.share({ files: [archivo], text: this.mensaje(c, empresa) });
                } catch (error) {
                    if (error.name === 'AbortError') return;
                    // Si el PDF tardó, el navegador ya no permite compartir con ese toque.
                    if (error.name === 'NotAllowedError') {
                        throw new Error('El PDF ya está listo: toca otra vez «Enviar por WhatsApp».');
                    }
                    throw error;
                }
            });
        }
        // La pestaña se abre con el clic para que el navegador no la bloquee.
        const ventana = window.open('', '_blank');
        return this.conBoton('comprobanteWhatsapp', 'Preparando…', async () => {
            try {
                const [blob, empresa] = await Promise.all([this.pdfActual(), this.cargarEmpresa()]);
                this.descargar(blob, this.nombreArchivo(c));
                const url = `https://wa.me/${numero}?text=${encodeURIComponent(this.mensaje(c, empresa))}`;
                if (ventana) {
                    ventana.opener = null;
                    ventana.location.href = url;
                } else {
                    window.open(url, '_blank', 'noopener');
                }
                showNotification('PDF descargado: adjúntalo en el chat de WhatsApp que se abrió.', 'success');
            } catch (error) {
                ventana?.close();
                throw error;
            }
        });
    },

    mostrarError(mensaje) {
        const error = document.getElementById('comprobanteError');
        if (!error) return;
        error.textContent = mensaje;
        error.hidden = !mensaje;
    },

    escape(value = '') {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }
};
