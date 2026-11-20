// Lee del XML certificado (el que devolvió el certificador) los datos que se imprimen en la
// factura. Lo impreso sale de lo que se certificó, no de lo que el ERP cree que mandó.
// El XML es el de la SAT (GT_Documento): se lee con expresiones simples, sin dependencias.

const decodificar = (texto) => String(texto ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, '&');

// Atributos de la primera etiqueta <dte:nombre ...> dentro del texto.
const atributos = (xml, nombre) => {
  const etiqueta = new RegExp(`<dte:${nombre}(\\s[^>]*?)?\\/?>`).exec(xml);
  if (!etiqueta) return null;
  const valores = {};
  for (const [, clave, valor] of (etiqueta[1] || '').matchAll(/([\w:]+)="([^"]*)"/g)) valores[clave] = decodificar(valor);
  return valores;
};

// Texto de <dte:nombre>…</dte:nombre>.
const contenido = (xml, nombre) => {
  const resultado = new RegExp(`<dte:${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</dte:${nombre}>`).exec(xml);
  return resultado ? decodificar(resultado[1].trim()) : null;
};

const bloques = (xml, nombre) => [...String(xml).matchAll(new RegExp(`<dte:${nombre}(?:\\s[^>]*)?>[\\s\\S]*?</dte:${nombre}>`, 'g'))]
  .map(([bloque]) => bloque);

const numero = (valor) => (valor === null || valor === undefined || valor === '' ? 0 : Number(valor));

// Textos de las frases de la SAT más comunes; las demás se imprimen con su código.
const TEXTO_FRASES = {
  '1-1': 'Sujeto a pagos trimestrales ISR',
  '1-2': 'Sujeto a retención definitiva ISR',
  '1-3': 'Sujeto a pago directo ISR',
  '2-1': 'Agente de retención del IVA',
  '3-1': 'No genera derecho a crédito fiscal',
  '9-22': 'Documento emitido posterior a los dos meses de la factura, no se reconoce como crédito fiscal, según Art. 17 Ley del IVA'
};

const TIPOS = { FACT: 'Factura', FPEQ: 'Factura Pequeño Contribuyente', FCAM: 'Factura Cambiaria', NCRE: 'Nota de Crédito', NDEB: 'Nota de Débito' };

const direccionDe = (xml, nombre) => {
  const bloque = bloques(xml, nombre)[0];
  if (!bloque) return null;
  return {
    direccion: contenido(bloque, 'Direccion'),
    municipio: contenido(bloque, 'Municipio'),
    departamento: contenido(bloque, 'Departamento')
  };
};

const leerFactura = (xml) => {
  if (!xml || !/<dte:DatosEmision/.test(xml)) return null;
  const generales = atributos(xml, 'DatosGenerales') || {};
  const emisor = atributos(xml, 'Emisor') || {};
  const receptor = atributos(xml, 'Receptor') || {};
  const autorizacion = atributos(xml, 'NumeroAutorizacion') || {};
  const items = bloques(xml, 'Item').map((item) => {
    const precio = numero(contenido(item, 'Precio'));
    const descuento = numero(contenido(item, 'Descuento'));
    return {
      cantidad: numero(contenido(item, 'Cantidad')),
      descripcion: contenido(item, 'Descripcion'),
      precioUnitario: numero(contenido(item, 'PrecioUnitario')),
      precio,
      descuento,
      total: numero(contenido(item, 'Total'))
    };
  });
  const frases = [...xml.matchAll(/<dte:Frase\s([^>]*?)\/?>/g)].map(([, texto]) => {
    const tipo = /TipoFrase="(\d+)"/.exec(texto)?.[1];
    const escenario = /CodigoEscenario="(\d+)"/.exec(texto)?.[1];
    const clave = `${tipo}-${escenario}`;
    return { tipo: Number(tipo), escenario: Number(escenario), texto: TEXTO_FRASES[clave] || `Frase ${clave}` };
  });
  const impuesto = atributos(xml, 'TotalImpuesto');
  const suma = (campo) => Math.round(items.reduce((total, item) => total + item[campo], 0) * 100) / 100;
  return {
    tipo: generales.Tipo || null,
    tipoNombre: TIPOS[generales.Tipo] || 'Factura',
    fechaEmision: generales.FechaHoraEmision || null,
    moneda: generales.CodigoMoneda || 'GTQ',
    emisor: {
      nit: emisor.NITEmisor || null,
      nombre: emisor.NombreEmisor || null,
      nombreComercial: emisor.NombreComercial || null,
      establecimiento: emisor.CodigoEstablecimiento || null,
      ...direccionDe(xml, 'DireccionEmisor')
    },
    receptor: {
      id: receptor.IDReceptor || 'CF',
      tipoEspecial: receptor.TipoEspecial || null,
      nombre: receptor.NombreReceptor || null,
      correo: receptor.CorreoReceptor || null,
      ...(direccionDe(xml, 'DireccionReceptor') || {})
    },
    frases,
    items,
    totales: {
      precio: suma('precio'),
      descuento: suma('descuento'),
      total: numero(contenido(xml, 'GranTotal')),
      iva: impuesto ? numero(impuesto.TotalMontoImpuesto) : 0
    },
    certificador: {
      nit: contenido(xml, 'NITCertificador'),
      nombre: contenido(xml, 'NombreCertificador')
    },
    autorizacion: {
      uuid: contenido(xml, 'NumeroAutorizacion'),
      serie: autorizacion.Serie || null,
      numero: autorizacion.Numero || null,
      fechaCertificacion: contenido(xml, 'FechaHoraCertificacion')
    }
  };
};

module.exports = { leerFactura, TEXTO_FRASES };
