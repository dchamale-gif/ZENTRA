// PDF de las facturas que BotEngine emite a sus clientes desde el panel de soporte.
// Es el documento de cobro; la factura electrónica (FEL) se certifica aparte.

const { dineroEnLetras, maquetacion } = require('./pdfContrato');

const { PROVEEDOR, COLOR, R, MARGEN, ANCHO, encabezado, seccion, parrafo, tabla, aviso, renderizar, dinero, fechaCorta } = maquetacion;

const ESTADOS = { pendiente: 'Pendiente de pago', pagada: 'Pagada', anulada: 'Anulada' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fechas DATE de PostgreSQL ('2026-11-01' o Date a medianoche UTC) como { anio, mes, dia }.
const partesFecha = (valor) => {
  const texto = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
  const [anio, mes, dia] = texto.split('-').map(Number);
  return { anio, mes, dia };
};

const nombrePeriodo = (periodo) => {
  const { anio, mes } = partesFecha(periodo);
  return `${MESES[mes - 1]} de ${anio}`;
};

/**
 * factura: fila de facturas_plataforma con empresa_nombre, empresa_nit, empresa_email y
 * empresa_direccion. Devuelve el PDF como Buffer.
 */
const generarFactura = (factura) => renderizar(factura.numero, 'Factura', false, (doc) => {
  const total = Number(factura.total);
  const base = Math.round((total / 1.12) * 100) / 100;
  encabezado(doc, factura.numero, partesFecha(factura.fecha_emision), 'FACTURA',
    factura.periodo ? `Servicio de BotEngine ERP · ${nombrePeriodo(factura.periodo)}` : 'Servicios de BotEngine ERP');

  if (factura.estado !== 'pendiente') {
    aviso(doc, [{ b: ESTADOS[factura.estado] }, factura.estado === 'pagada' && factura.pagada_en
      ? ` el ${fechaCorta(partesFecha(factura.pagada_en))}${factura.referencia_pago ? ` · referencia ${factura.referencia_pago}` : ''}.`
      : '.']);
  }

  seccion(doc, 'Cliente');
  tabla(doc, {
    columnas: [{ titulo: '', ancho: 0.28 }, { titulo: '', ancho: 0.72 }],
    encabezado: false,
    etiquetas: true,
    filas: [
      ['Nombre', factura.empresa_nombre],
      ['NIT', factura.empresa_nit || 'CF'],
      ['Correo', factura.empresa_email || ''],
      ...(factura.empresa_direccion ? [['Dirección', factura.empresa_direccion]] : []),
      ['Fecha de emisión', fechaCorta(partesFecha(factura.fecha_emision))],
      ['Vence', fechaCorta(partesFecha(factura.fecha_vencimiento))]
    ]
  });

  seccion(doc, 'Detalle');
  tabla(doc, {
    columnas: [
      { titulo: 'Descripción', ancho: 0.52 },
      { titulo: 'Cantidad', ancho: 0.14, alinear: 'right' },
      { titulo: 'Precio', ancho: 0.17, alinear: 'right' },
      { titulo: 'Subtotal', ancho: 0.17, alinear: 'right' }
    ],
    negritaUltima: true,
    filas: [
      ...factura.items.map((item) => [
        item.descripcion,
        String(item.cantidad),
        dinero(Number(item.precio)),
        dinero(Math.round(item.cantidad * item.precio * 100) / 100)
      ]),
      ['Total (IVA incluido)', '', '', dinero(total)]
    ]
  });
  parrafo(doc, [{ b: 'Total en letras: ' }, `${dineroEnLetras(total)}. `, `Base ${dinero(base)} más IVA ${dinero(Math.round((total - base) * 100) / 100)}.`], { size: 9 });

  seccion(doc, 'Forma de pago');
  const cuenta = (process.env.FACTURA_DATOS_PAGO || '').trim();
  parrafo(doc, `${cuenta || 'Transferencia o depósito a la cuenta que te indique tu asesor.'} Envía el comprobante respondiendo a este correo o por WhatsApp al ${PROVEEDOR.whatsapp}, indicando el número ${factura.numero}.`, { align: 'left' });
  doc.moveDown(1);
  doc.fillColor(COLOR.suave).font(R).fontSize(8)
    .text('Documento de cobro. La factura electrónica (FEL) correspondiente se emite por separado.', MARGEN.left, doc.y, { width: ANCHO });
});

module.exports = { generarFactura, nombrePeriodo, partesFecha };
