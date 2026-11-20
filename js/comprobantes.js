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

    // La fecha llega como día (UTC a medianoche) y la hora aparte. venta.hora es la del servidor
    // (UTC): se usa hora_ticket, que el backend ya convierte a hora de Guatemala.
    fechaVenta(venta) {
        const dia = venta.fecha ? new Date(venta.fecha).toLocaleDateString('es-GT', { timeZone: 'UTC' }) : '';
        const hora = venta.hora_ticket || String(venta.hora || '').slice(0, 5);
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

    // ---------- Factura oficial del certificador ----------
    // Si la factura la certificó INFILE se usa su PDF (con el QR de verificación de la SAT) en vez
    // del formato del ERP. Los tickets de 80 y 58 mm siguen saliendo del ERP: el PDF es tamaño carta.

    urlOficial(c) {
        const factura = c?.factura;
        if (!factura?.id || factura.certificador !== 'infile') return '';
        return `${authManager.apiBaseUrl}/api/fel/documentos/${encodeURIComponent(factura.id)}/pdf`;
    },

    async pdfOficial(c) {
        const response = await fetch(this.urlOficial(c));
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudo obtener el PDF de la factura.');
        }
        return new Blob([await response.blob()], { type: 'application/pdf' });
    },

    // Sin la ventana abierta (punto de venta al cobrar): el PDF va en un iframe que se imprime.
    async imprimirOficial(c) {
        let url;
        try {
            url = URL.createObjectURL(await this.pdfOficial(c));
        } catch (error) {
            showNotification(`${error.message} Puedes imprimirla desde Ventas.`, 'error');
            return;
        }
        document.getElementById('comprobantePrintFrame')?.remove();
        const frame = document.createElement('iframe');
        frame.id = 'comprobantePrintFrame';
        frame.title = 'Factura';
        frame.tabIndex = -1;
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        frame.addEventListener('load', () => {
            try {
                frame.contentWindow.focus();
                frame.contentWindow.print();
            } catch {
                window.open(url, '_blank');
            }
        }, { once: true });
        frame.src = url;
        document.body.appendChild(frame);
        setTimeout(() => URL.revokeObjectURL(url), 120000);
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
            .cpb .cpb-nota { margin-top: 2px; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; }
            .cpb .cpb-logo { display: block; max-width: 40mm; max-height: 28mm; margin: 0 auto 4px; }
            .cpb .cpb-igual { height: 0; border-top: 3px double #000; margin: 7px 0; }
            .cpb .cpb-fel-titulo { margin-top: 2px; font-size: 1.15em; font-weight: bold; }
            .cpb .cpb-fel-dato { font-weight: bold; overflow-wrap: anywhere; }
            .cpb .cpb-izq { text-align: left; overflow-wrap: anywhere; }
            .cpb table.cpb-fel-items { width: 100%; border-collapse: collapse; margin: 2px 0 4px; font: inherit; }
            .cpb .cpb-fel-items th { padding: 0 0 3px; font-weight: bold; text-align: left; }
            .cpb .cpb-fel-items td { padding: 1px 0; vertical-align: top; }
            .cpb .cpb-fel-items .num { text-align: right; white-space: nowrap; padding-left: 4px; }
            .cpb .cpb-fel-items .desc { overflow-wrap: anywhere; padding-left: 4px; }
            .cpb .cpb-totales-fel .cpb-fila { justify-content: flex-end; gap: 6px; }
            .cpb .cpb-anulada { margin: 4px 0; font-size: 1.3em; font-weight: bold; }`;
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
        if (this.esHoja(formato)) return this.cuerpoHoja(c, formato, empresa);
        // Factura electrónica en ticket: sale de los datos certificados (ver prepararFel).
        return c.felDatos ? this.cuerpoTicketFel(c, formato, pdf) : this.cuerpoTicket(c, formato, empresa, pdf);
    },

    // ---------- Ticket de factura electrónica ----------

    // Datos certificados de la factura (del XML del certificador), con el logo y la sucursal de
    // la empresa. Se piden una vez por factura; si fallan, se imprime el ticket normal.
    async prepararFel(c) {
        const id = c?.factura?.id;
        if (!id || c.felDatos !== undefined) return c;
        this.state.felDatos ||= new Map();
        if (!this.state.felDatos.has(id)) {
            this.state.felDatos.set(id, fetch(`${authManager.apiBaseUrl}/api/fel/documentos/${encodeURIComponent(id)}/impresion`)
                .then(response => (response.ok ? response.json() : null))
                .then(data => data?.factura || null)
                .catch(() => null));
        }
        c.felDatos = await this.state.felDatos.get(id);
        if (!c.felDatos) this.state.felDatos.delete(id);
        return c;
    },

    // Fecha del XML («2026-09-30T16:37:00-06:00», ya en hora de Guatemala) → «30/09/2026 16:37».
    fechaFel(valor) {
        if (!valor) return '';
        const texto = String(valor);
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*-06:00$/.test(texto)) {
            return `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)} ${texto.slice(11, 16)}`;
        }
        const fecha = new Date(texto);
        if (Number.isNaN(fecha.getTime())) return texto;
        const partes = Object.fromEntries(new Intl.DateTimeFormat('es-GT', {
            timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(fecha).map(({ type, value }) => [type, value]));
        return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
    },

    // 215.5 → «Doscientos quince quetzales con 50/100».
    montoEnLetras(monto) {
        const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
            'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno',
            'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
        const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
        const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
        const apocope = (texto) => texto.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
        const menosDeMil = (n) => {
            if (n === 100) return 'cien';
            const resto = n % 100;
            const decenas = resto < 30 ? U[resto] : `${D[Math.floor(resto / 10)]}${resto % 10 ? ` y ${U[resto % 10]}` : ''}`;
            return [C[Math.floor(n / 100)], decenas].filter(Boolean).join(' ');
        };
        const letras = (n) => {
            if (n === 0) return 'cero';
            const millones = Math.floor(n / 1e6);
            const miles = Math.floor((n % 1e6) / 1000);
            const resto = n % 1000;
            return [
                millones ? (millones === 1 ? 'un millón' : `${apocope(letras(millones))} millones`) : '',
                miles ? (miles === 1 ? 'mil' : `${apocope(menosDeMil(miles))} mil`) : '',
                resto ? menosDeMil(resto) : ''
            ].filter(Boolean).join(' ');
        };
        const centavosTotales = Math.round(Number(monto || 0) * 100);
        const entero = Math.floor(centavosTotales / 100);
        const centavos = centavosTotales % 100;
        const texto = `${apocope(letras(entero))} ${entero === 1 ? 'quetzal' : 'quetzales'}${centavos ? ` con ${String(centavos).padStart(2, '0')}/100` : ''}`;
        return texto.charAt(0).toUpperCase() + texto.slice(1);
    },

    cuerpoTicketFel(c, formato, pdf) {
        const e = (value) => this.escape(value);
        const f = c.felDatos;
        const fila = (label, value, cls = '') => `<div class="cpb-fila ${cls}"><span>${label}</span><span>${value}</span></div>`;
        const q = (n) => `Q ${Number(n || 0).toFixed(2)}`;
        const n2 = (n) => Number(n || 0).toFixed(2);
        const igual = '<div class="cpb-igual"></div>';
        const direccion = [f.emisor.direccion, f.emisor.municipio, f.emisor.departamento].filter(Boolean).join(', ');
        const cliente = c.cliente || {};
        const receptorId = f.receptor.id || 'CF';
        const etiquetaId = f.receptor.tipoEspecial === 'CUI' ? 'CUI' : 'NIT';
        const subtotal = Math.round((f.totales.precio - f.totales.descuento) * 100) / 100;
        return `<div class="cpb cpb-${e(formato)} cpb-fel${pdf ? ' cpb-pdf' : ''}">
            ${f.logo ? `<img class="cpb-logo" src="${e(f.logo)}" alt="">` : ''}
            <h1>${e(f.emisor.nombreComercial || f.emisor.nombre || '')}</h1>
            ${direccion ? `<p>${e(direccion)}</p>` : ''}
            ${f.emisor.nombre && f.emisor.nombre !== f.emisor.nombreComercial ? `<p>${e(f.emisor.nombre)}</p>` : ''}
            ${f.emisor.nit ? `<p><strong>NIT: ${e(f.emisor.nit)}</strong></p>` : ''}
            ${igual}
            <p class="cpb-fel-titulo">Documento Tributario Electrónico</p>
            <p><strong>${e(f.tipoNombre)}</strong></p>
            ${f.estado === 'anulado' ? '<p class="cpb-anulada">ANULADA</p>' : ''}
            <p>Autorización</p>
            <p class="cpb-fel-dato">${e(f.autorizacion.uuid || '')}</p>
            <p>Fecha de emisión:</p>
            <p class="cpb-fel-dato">${e(this.fechaFel(f.fechaEmision))}</p>
            ${fila('Serie', e(f.autorizacion.serie || ''))}
            ${fila('No.', e(f.autorizacion.numero || ''))}
            <p>Fecha de certificación:</p>
            <p class="cpb-fel-dato">${e(this.fechaFel(f.autorizacion.fechaCertificacion))}</p>
            ${f.sucursal ? fila('Emisor', e(f.sucursal)) : ''}
            ${igual}
            <p class="cpb-fel-titulo">Datos del receptor</p>
            <div class="cpb-izq">
                <div>Nombre: ${e(f.receptor.nombre || 'Consumidor Final')}</div>
                <div>${etiquetaId}: ${e(receptorId)}</div>
                <div>Dirección: ${e(f.receptor.direccion || cliente.direccion || 'Ciudad')}</div>
                <div>Correo: ${e(f.receptor.correo || '')}</div>
                <div>Teléfono: ${e(cliente.telefono || '')}</div>
                ${c.numero ? `<div>No. de venta: ${e(c.numero)}</div>` : ''}
                <div>Descripción: ${e(c.observaciones || '')}</div>
            </div>
            ${igual}
            <table class="cpb-fel-items">
                <thead><tr><th>Cant</th><th class="desc">Descripción</th><th class="num">Prec</th><th class="num">Total</th></tr></thead>
                <tbody>${f.items.map(item => `<tr>
                    <td>${Number.isInteger(Math.round(item.cantidad * 1000) / 10) ? n2(item.cantidad) : Number(item.cantidad).toFixed(3)}</td>
                    <td class="desc">${e(item.descripcion)}${item.descuento > 0 ? `<br>Desc. −${n2(item.descuento)}` : ''}</td>
                    <td class="num">${n2(item.precioUnitario)}</td>
                    <td class="num">${n2(item.total)}</td>
                </tr>`).join('')}</tbody>
            </table>
            <div class="cpb-totales-fel">
                ${fila('Subtotal:', q(f.totales.precio))}
                ${fila('Descuentos:', q(f.totales.descuento))}
                ${fila('Subtotal:', q(subtotal))}
                ${fila('Total:', q(f.totales.total), 'cpb-total')}
            </div>
            <div class="cpb-izq">Total en letras:<br>${e(this.montoEnLetras(f.totales.total))}</div>
            ${igual}
            ${fila('Certificador', e(f.certificador.nombre || ''))}
            ${fila('NIT', e(f.certificador.nit || ''))}
            ${f.frases.map(frase => `<p>${e(frase.texto)}</p>`).join('')}
            ${f.ambiente && f.ambiente !== 'produccion' ? '<p class="cpb-chico"><strong>Ambiente de pruebas: sin validez fiscal</strong></p>' : ''}
        </div>`;
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
        // Factura de INFILE en hoja: su PDF oficial.
        if (this.urlOficial(c) && (formato === 'oficial' || this.HOJAS[formato])) return this.imprimirOficial(c);
        const [empresa] = await Promise.all([this.cargarEmpresa(), this.prepararFel(c)]);
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
        const [empresa] = await Promise.all([this.cargarEmpresa(), loadLibrary('pdf'), this.prepararFel(c)]);
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
            if (event.target.value !== 'oficial') this.guardarFormato(event.target.value);
            this.state.pdf = null;
            this.renderVista();
            this.prepararPdfSiComparte();
        });
        document.getElementById('comprobanteImprimir')?.addEventListener('click', () => {
            if (!this.state.actual) return;
            // La vista previa ya tiene el PDF oficial cargado: se imprime ese mismo.
            if (this.formatoElegido() === 'oficial') {
                try {
                    const vista = document.getElementById('comprobanteVista').contentWindow;
                    vista.focus();
                    vista.print();
                    return;
                } catch { /* se imprime aparte */ }
            }
            this.imprimir(this.state.actual, this.formatoElegido());
        });
        document.getElementById('comprobantePdf')?.addEventListener('click', () => this.descargarPdf());
        document.getElementById('comprobanteWhatsapp')?.addEventListener('click', () => this.enviarWhatsapp());
        document.getElementById('comprobanteVista')?.addEventListener('load', () => this.ajustarVista());
        window.addEventListener('resize', () => {
            if (document.getElementById('comprobanteModal')?.style.display === 'flex') this.ajustarVista();
        });
    },

    async abrir(c, { telefono = '' } = {}) {
        this.init();
        this.state.actual = c;
        this.state.pdf = null;
        document.getElementById('comprobanteTitulo').textContent = c.numero ? `Comprobante · venta ${c.numero}` : 'Comprobante';
        const oficial = Boolean(this.urlOficial(c));
        document.getElementById('comprobanteFormatoOficial').hidden = !oficial;
        // Factura electrónica: el formato que eligió la empresa (ticket de 80 mm o PDF del certificador).
        let formato = this.formatoGuardado();
        if (c.factura) {
            const empresa = await this.cargarEmpresa();
            if (this.state.actual !== c) return;
            if (empresa.formatoFactura === 'ticket') formato = '80';
            else if (oficial) formato = 'oficial';
        }
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
        if (formato === 'oficial') {
            frame.removeAttribute('srcdoc');
            frame.src = this.urlOficial(c);
            return;
        }
        const [empresa] = await Promise.all([this.cargarEmpresa(), this.prepararFel(c)]);
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
        const promesa = formato === 'oficial' ? this.pdfOficial(c) : this.generarPdf(c, formato);
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
