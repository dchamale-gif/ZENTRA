// Envío de correos con la API de Brevo (por HTTPS: DigitalOcean suele bloquear SMTP).
// Configuración: EMAIL_API_KEY (secreto), EMAIL_FROM y EMAIL_FROM_NAME (remitente verificado en Brevo).

// EMAIL_API_URL solo cambia en pruebas (un servidor falso que recibe los correos).
const BREVO_URL = process.env.EMAIL_API_URL || 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10000;

const emailError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const correoConfigurado = () => Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);

// URL pública del ERP para los enlaces de los correos.
const appUrl = () => (process.env.APP_URL || (process.env.CORS_ORIGIN || '').split(',')[0] || 'http://localhost:5500')
  .trim().replace(/\/$/, '');

// adjuntos: [{ nombre, contenido (Buffer) }]
const enviarCorreo = async ({ para, nombre, asunto, html, texto, adjuntos = [] }) => {
  if (!correoConfigurado()) {
    throw emailError(503, 'El envío de correos no está configurado en el servidor (falta la clave de Brevo o el remitente)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(BREVO_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'api-key': process.env.EMAIL_API_KEY.trim(),
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME || 'BotEngine ERP' },
        to: [{ email: para, ...(nombre ? { name: nombre } : {}) }],
        subject: asunto,
        htmlContent: html,
        textContent: texto,
        ...(adjuntos.length
          ? { attachment: adjuntos.map(({ nombre: name, contenido }) => ({ name, content: contenido.toString('base64') })) }
          : {})
      })
    });
  } catch (error) {
    throw emailError(502, error.name === 'AbortError'
      ? 'El servicio de correo no respondió a tiempo; intenta reenviar en unos minutos'
      : 'No se pudo conectar con el servicio de correo; intenta reenviar en unos minutos');
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Brevo rechazó el correo:', response.status, data.code, data.message);
    const motivo = response.status === 401
      ? 'la clave de Brevo no es válida'
      : (data.message || `respondió ${response.status}`);
    throw emailError(502, `El servicio de correo rechazó el envío: ${motivo}`);
  }
  return { id: data.messageId || null };
};

module.exports = { enviarCorreo, correoConfigurado, appUrl };
