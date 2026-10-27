// Genera el XML del DTE según el esquema de la SAT GT_Documento-0.2.1
// (namespace http://www.sat.gob.gt/dte/fel/0.2.0) y la anulación GT_AnulacionDocumento-0.1.0.
// La firma (ds:Signature) la agrega el certificador.

const NS_DTE = 'http://www.sat.gob.gt/dte/fel/0.2.0';
const NS_ANULACION = 'http://www.sat.gob.gt/dte/fel/0.1.0';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const TASA_IVA = 0.12;

// Tipo de documento según la afiliación al IVA del emisor.
const TIPO_DTE = { GEN: 'FACT', PEQ: 'FPEQ' };

// Frases por defecto; cada empresa puede cambiarlas según su resolución de la SAT.
// GEN: «Sujeto a pagos trimestrales ISR» · PEQ: «No genera derecho a crédito fiscal».
const FRASES_POR_DEFECTO = {
  GEN: [{ tipo: 1, escenario: 1 }],
  PEQ: [{ tipo: 3, escenario: 1 }]
};

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const attrs = (values) => Object.entries(values)
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('');

const round = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
const num = (value, decimals = 2) => round(value, decimals).toFixed(decimals);

// Fecha en hora de Guatemala (UTC-6, sin horario de verano): 2026-10-27T09:15:00-06:00
const fechaGuatemala = (date = new Date()) => {
  const local = new Date(date.getTime() - 6 * 3600 * 1000);
  return `${local.toISOString().slice(0, 19)}-06:00`;
};

const direccionXml = (tag, direccion = {}) => `
        <dte:${tag}>
          <dte:Direccion>${escapeXml(direccion.direccion || 'Ciudad')}</dte:Direccion>
          <dte:CodigoPostal>${escapeXml(direccion.codigoPostal || '01001')}</dte:CodigoPostal>
          <dte:Municipio>${escapeXml(direccion.municipio || 'Guatemala')}</dte:Municipio>
          <dte:Departamento>${escapeXml(direccion.departamento || 'Guatemala')}</dte:Departamento>
          <dte:Pais>${escapeXml(direccion.pais || 'GT')}</dte:Pais>
        </dte:${tag}>`;

/**
 * Calcula las líneas: los precios de venta ya incluyen IVA (como se cobran en caja).
 * En GEN se desglosa el IVA de cada línea; en PEQ no lleva impuestos.
 */
const calcularLineas = (items, afiliacion) => items.map((item, index) => {
  const cantidad = Number(item.cantidad);
  const precioUnitario = round(item.precioUnitario, 6);
  const precio = round(cantidad * precioUnitario, 6);
  const descuento = round(item.descuento || 0, 6);
  const total = round(precio - descuento, 6);
  const linea = {
    numero: index + 1,
    bienOServicio: item.bienOServicio === 'S' ? 'S' : 'B',
    cantidad,
    descripcion: item.descripcion,
    precioUnitario,
    precio,
    descuento,
    total
  };
  if (afiliacion === 'GEN') {
    linea.montoGravable = round(total / (1 + TASA_IVA), 6);
    linea.montoImpuesto = round(total - linea.montoGravable, 6);
  }
  return linea;
});

const generarFactura = ({ emisor, receptor, items, fechaEmision = new Date(), moneda = 'GTQ' }) => {
  const afiliacion = emisor.afiliacionIVA;
  const tipo = TIPO_DTE[afiliacion];
  if (!tipo) throw Object.assign(new Error(`Régimen de IVA no soportado: ${afiliacion}`), { status: 400, expose: true });
  if (!items.length) throw Object.assign(new Error('La factura no tiene líneas'), { status: 400, expose: true });

  const lineas = calcularLineas(items, afiliacion);
  const granTotal = round(lineas.reduce((sum, linea) => sum + linea.total, 0), 2);
  const totalIva = round(lineas.reduce((sum, linea) => sum + (linea.montoImpuesto || 0), 0), 6);
  const frases = emisor.frases?.length ? emisor.frases : FRASES_POR_DEFECTO[afiliacion];

  const itemsXml = lineas.map((linea) => `
        <dte:Item${attrs({ BienOServicio: linea.bienOServicio, NumeroLinea: linea.numero })}>
          <dte:Cantidad>${num(linea.cantidad, 2)}</dte:Cantidad>
          <dte:UnidadMedida>UNI</dte:UnidadMedida>
          <dte:Descripcion>${escapeXml(linea.descripcion)}</dte:Descripcion>
          <dte:PrecioUnitario>${num(linea.precioUnitario, 6)}</dte:PrecioUnitario>
          <dte:Precio>${num(linea.precio, 6)}</dte:Precio>
          <dte:Descuento>${num(linea.descuento, 6)}</dte:Descuento>${afiliacion === 'GEN' ? `
          <dte:Impuestos>
            <dte:Impuesto>
              <dte:NombreCorto>IVA</dte:NombreCorto>
              <dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>
              <dte:MontoGravable>${num(linea.montoGravable, 6)}</dte:MontoGravable>
              <dte:MontoImpuesto>${num(linea.montoImpuesto, 6)}</dte:MontoImpuesto>
            </dte:Impuesto>
          </dte:Impuestos>` : ''}
          <dte:Total>${num(linea.total, 6)}</dte:Total>
        </dte:Item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTDocumento xmlns:dte="${NS_DTE}" xmlns:ds="${NS_DS}" Version="0.1">
  <dte:SAT ClaseDocumento="dte">
    <dte:DTE ID="DatosCertificados">
      <dte:DatosEmision ID="DatosEmision">
        <dte:DatosGenerales${attrs({ Tipo: tipo, FechaHoraEmision: fechaGuatemala(fechaEmision), CodigoMoneda: moneda })}/>
        <dte:Emisor${attrs({
          NITEmisor: emisor.nit,
          NombreEmisor: emisor.nombre,
          CodigoEstablecimiento: emisor.codigoEstablecimiento,
          NombreComercial: emisor.nombreComercial,
          CorreoEmisor: emisor.correo,
          AfiliacionIVA: afiliacion
        })}>${direccionXml('DireccionEmisor', emisor.direccion)}
        </dte:Emisor>
        <dte:Receptor${attrs({
          IDReceptor: receptor.id,
          TipoEspecial: receptor.tipo,
          NombreReceptor: receptor.nombre,
          CorreoReceptor: receptor.correo
        })}/>
        <dte:Frases>${frases.map((frase) => `
          <dte:Frase${attrs({ TipoFrase: frase.tipo, CodigoEscenario: frase.escenario, NumeroResolucion: frase.resolucion, FechaResolucion: frase.fechaResolucion })}/>`).join('')}
        </dte:Frases>
        <dte:Items>${itemsXml}
        </dte:Items>
        <dte:Totales>${afiliacion === 'GEN' ? `
          <dte:TotalImpuestos>
            <dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${num(totalIva, 6)}"/>
          </dte:TotalImpuestos>` : ''}
          <dte:GranTotal>${num(granTotal, 6)}</dte:GranTotal>
        </dte:Totales>
      </dte:DatosEmision>
    </dte:DTE>
  </dte:SAT>
</dte:GTDocumento>
`;
  return { xml, tipo, granTotal, totalIva: round(totalIva, 2) };
};

const generarAnulacion = ({ emisorNit, uuid, receptorId, fechaEmisionDocumento, motivo, fechaAnulacion = new Date() }) => `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTAnulacionDocumento xmlns:dte="${NS_ANULACION}" xmlns:ds="${NS_DS}" Version="0.1">
  <dte:SAT>
    <dte:AnulacionDTE ID="DatosCertificados">
      <dte:DatosGenerales${attrs({
        ID: 'DatosAnulacion',
        NumeroDocumentoAAnular: uuid,
        NITEmisor: emisorNit,
        IDReceptor: receptorId,
        FechaEmisionDocumentoAnular: fechaGuatemala(new Date(fechaEmisionDocumento)),
        FechaHoraAnulacion: fechaGuatemala(fechaAnulacion),
        MotivoAnulacion: motivo
      })}/>
    </dte:AnulacionDTE>
  </dte:SAT>
</dte:GTAnulacionDocumento>
`;

module.exports = { generarFactura, generarAnulacion, fechaGuatemala, TIPO_DTE, FRASES_POR_DEFECTO };
