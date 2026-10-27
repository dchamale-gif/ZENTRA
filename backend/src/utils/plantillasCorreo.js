// Plantillas de los correos a clientes. HTML simple con estilos en línea (los clientes de
// correo ignoran las hojas de estilo) y versión de texto para los que no muestran HTML.

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const marco = (titulo, cuerpo) => `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#334155">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e9f0;border-radius:12px">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #e5e9f0">
      <strong style="font-size:18px;color:#0b1b33">BotEngine ERP</strong>
    </td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${escapeHtml(titulo)}</h1>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #e5e9f0;font-size:12px;color:#64748b">
      Recibiste este correo porque se creó una cuenta de BotEngine ERP con esta dirección. Si no fuiste tú, ignóralo.
    </td></tr>
  </table>
</body></html>`;

const boton = (href, texto) => `<p style="margin:24px 0">
  <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(texto)}</a>
</p>`;

const verificacion = ({ nombre, empresa, enlace, horas }) => ({
  asunto: `Confirma tu correo para activar ${empresa} en BotEngine ERP`,
  html: marco('Confirma tu correo', `
    <p>Hola ${escapeHtml(nombre)}:</p>
    <p>Creamos la cuenta de <strong>${escapeHtml(empresa)}</strong> en BotEngine ERP. Confirma que este es tu correo y te enviaremos enseguida tu usuario y contraseña de acceso.</p>
    ${boton(enlace, 'Confirmar mi correo')}
    <p style="font-size:13px;color:#64748b">El enlace vence en ${horas} horas. Si el botón no funciona, copia esta dirección en tu navegador:<br>
    <span style="word-break:break-all">${escapeHtml(enlace)}</span></p>`),
  texto: `Hola ${nombre}:\n\nCreamos la cuenta de ${empresa} en BotEngine ERP. Confirma tu correo abriendo este enlace y te enviaremos tu usuario y contraseña:\n\n${enlace}\n\nEl enlace vence en ${horas} horas.`
});

const credenciales = ({ nombre, empresa, url, email, password, diasPrueba }) => ({
  asunto: `Tus datos de acceso a BotEngine ERP · ${empresa}`,
  html: marco('Tu cuenta está lista', `
    <p>Hola ${escapeHtml(nombre)}:</p>
    <p>Tu correo quedó confirmado. Estos son tus datos para entrar a <strong>${escapeHtml(empresa)}</strong>${diasPrueba ? ` (prueba gratuita de ${diasPrueba} días)` : ''}:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e9f0;border-radius:8px;width:100%">
      <tr><td style="padding:10px 14px;color:#64748b;width:120px">Usuario</td><td style="padding:10px 14px"><strong>${escapeHtml(email)}</strong></td></tr>
      <tr><td style="padding:10px 14px;color:#64748b;border-top:1px solid #e5e9f0">Contraseña temporal</td><td style="padding:10px 14px;border-top:1px solid #e5e9f0;font-family:Consolas,Menlo,monospace;font-size:15px"><strong>${escapeHtml(password)}</strong></td></tr>
    </table>
    ${boton(`${url}/login.html`, 'Entrar a BotEngine ERP')}
    <p style="font-size:13px;color:#64748b">Al entrar por primera vez te pediremos crear tu propia contraseña; la temporal deja de funcionar en ese momento.</p>`),
  texto: `Hola ${nombre}:\n\nTu correo quedó confirmado. Datos para entrar a ${empresa}:\n\nUsuario: ${email}\nContraseña temporal: ${password}\n\nEntra en: ${url}/login.html\n\nAl entrar por primera vez te pediremos crear tu propia contraseña.`
});

const documentosContrato = ({ nombre, empresa, numero, documentos }) => ({
  asunto: `Documentos de contratación de BotEngine ERP · ${empresa} (${numero})`,
  html: marco('Tus documentos de contratación', `
    <p>Hola ${escapeHtml(nombre)}:</p>
    <p>Adjuntamos los documentos de contratación de BotEngine ERP para <strong>${escapeHtml(empresa)}</strong>:</p>
    <ul style="padding-left:20px;line-height:1.7">
      ${documentos.map((documento) => `<li>${escapeHtml(documento)}</li>`).join('')}
    </ul>
    <p>Revisa la propuesta y el contrato, completa los datos en blanco y firma la propuesta, el contrato y el Anexo A (con tus iniciales en cada página). Envíanos una copia escaneada respondiendo a este correo junto con los requisitos de la propuesta.</p>
    <p style="font-size:13px;color:#64748b">El acta de entrega se firma el día de la puesta en marcha; te la enviamos desde ahora para que conozcas lo que se verificará.</p>`),
  texto: `Hola ${nombre}:\n\nAdjuntamos los documentos de contratación de BotEngine ERP para ${empresa}:\n\n${documentos.map((documento) => `- ${documento}`).join('\n')}\n\nCompleta los datos en blanco y firma la propuesta, el contrato y el Anexo A (con tus iniciales en cada página). Envíanos una copia escaneada respondiendo a este correo junto con los requisitos de la propuesta.\n\nEl acta de entrega se firma el día de la puesta en marcha.`
});

module.exports = { verificacion, credenciales, documentosContrato };
