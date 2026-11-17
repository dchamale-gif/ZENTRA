// Avisos internos para el equipo de BotEngine (no para clientes).
// AVISOS_CORREO: a quién llegan (varios, separados por coma). Si no está, se usa SOPORTE_CORREO;
// sin ninguno de los dos no se envía nada.
const { enviarCorreo, appUrl } = require('./email');
const dominios = require('./dominios');

const destinatarios = () => (process.env.AVISOS_CORREO || process.env.SOPORTE_CORREO || '')
  .split(',').map((correo) => correo.trim()).filter(Boolean);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const fechaGuatemala = (fecha) => new Date(fecha).toLocaleString('es-GT', {
  timeZone: 'America/Guatemala', dateStyle: 'long', timeStyle: 'short'
});

const tabla = (filas) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px">
  ${filas.map(([etiqueta, valor]) => `<tr>
    <td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(etiqueta)}</td>
    <td style="padding:6px 0;color:#0f172a">${valor ? escapeHtml(valor) : '<span style="color:#94a3b8">—</span>'}</td>
  </tr>`).join('')}
</table>`;

/**
 * Una empresa se registró sola desde la página de inicio de sesión. Nunca lanza: si el correo
 * no sale, el registro ya quedó hecho y solo se anota en el registro del servidor.
 */
const avisarRegistro = async ({ empresa, usuario }) => {
  const para = destinatarios();
  if (!para.length) return;
  const direccion = dominios.urlEmpresa(empresa.subdominio) || appUrl();
  const soporte = dominios.urlSoporte() || appUrl();
  const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ');
  const datosEmpresa = [
    ['Empresa', empresa.nombre],
    ['NIT', empresa.nit],
    ['Sector', empresa.sector],
    ['Correo', empresa.correo],
    ['Teléfono', empresa.telefono],
    ['Dirección', empresa.direccion],
    ['Dirección del ERP', direccion],
    ['Prueba hasta', empresa.pruebaHasta ? fechaGuatemala(empresa.pruebaHasta) : '']
  ];
  const datosAdmin = [
    ['Nombre', nombreCompleto],
    ['Correo', usuario.email],
    ['Teléfono', usuario.telefono]
  ];
  const asunto = `Nuevo registro: ${empresa.nombre}`;
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#334155">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e9f0;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#0f172a">${escapeHtml(empresa.nombre)} se registró</h1>
    <p style="margin:0 0 24px;color:#64748b">${escapeHtml(fechaGuatemala(new Date()))} · prueba gratis</p>
    <h2 style="margin:0 0 8px;font-size:15px;color:#0f172a">Empresa</h2>
    ${tabla(datosEmpresa)}
    <h2 style="margin:0 0 8px;font-size:15px;color:#0f172a">Administrador</h2>
    ${tabla(datosAdmin)}
    ${soporte ? `<p style="margin:24px 0 0"><a href="${escapeHtml(`${soporte}/support.html`)}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold">Abrir el panel de soporte</a></p>` : ''}
  </div>
</body></html>`;
  const texto = [
    `${empresa.nombre} se registró (${fechaGuatemala(new Date())}).`,
    '',
    'EMPRESA',
    ...datosEmpresa.map(([etiqueta, valor]) => `${etiqueta}: ${valor || '—'}`),
    '',
    'ADMINISTRADOR',
    ...datosAdmin.map(([etiqueta, valor]) => `${etiqueta}: ${valor || '—'}`),
    ...(soporte ? ['', `Panel de soporte: ${soporte}/support.html`] : [])
  ].join('\n');

  for (const correo of para) {
    try {
      await enviarCorreo({ para: correo, asunto, html, texto });
    } catch (error) {
      console.error(`No se envió el aviso de registro a ${correo}:`, error.message);
    }
  }
};

module.exports = { avisarRegistro };
