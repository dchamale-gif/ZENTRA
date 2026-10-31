const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const authPool = require('../db/authConnection');
const { enviarCorreo, appUrl } = require('./email');
const plantillas = require('./plantillasCorreo');

// Alta de una empresa creada por soporte:
// 1. Se crea el administrador con una contraseña que nadie conoce y el correo sin verificar.
// 2. Se le envía el enlace de verificación.
// 3. Al abrir el enlace se genera una contraseña temporal y se le envía en otro correo;
//    en el primer ingreso debe cambiarla.

const HORAS_VIGENCIA = 48;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// 12 caracteres sin letras confundibles (0/O, 1/l/I); siempre con letras y números.
const passwordTemporal = () => {
  let password;
  do {
    password = Array.from({ length: 12 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
  } while (!/[A-Za-z]/.test(password) || !/\d/.test(password));
  return password;
};

// Hash de una contraseña aleatoria que no se guarda en ningún lado: nadie puede entrar
// hasta que verifique el correo y reciba la temporal.
const hashInutilizable = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

/**
 * Crea un enlace nuevo (invalida los anteriores sin usar) y envía el correo de verificación.
 * Si el envío falla, el enlace no queda creado y se puede reenviar desde soporte.
 */
const enviarVerificacion = async ({ userId, email, nombre, empresa }) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await client.query(
      `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 hour'))`,
      [sha256(token), userId, HORAS_VIGENCIA]
    );
    const enlace = `${appUrl()}/api/auth/verificar-correo?token=${token}`;
    const correo = plantillas.verificacion({ nombre, empresa, enlace, horas: HORAS_VIGENCIA });
    await enviarCorreo({ para: email, nombre, asunto: correo.asunto, html: correo.html, texto: correo.texto });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const diasRestantes = (row) => {
  const fin = row.subscription_status === 'trial' ? row.trial_ends_at : row.subscription_ends_at;
  return fin ? Math.max(0, Math.ceil((new Date(fin).getTime() - Date.now()) / 86400000)) : null;
};

// Genera la contraseña temporal y la envía. Si el correo no sale, no cambia nada.
const enviarCredenciales = async (client, usuario) => {
  const password = passwordTemporal();
  await client.query(
    `UPDATE users SET password_hash = $1, debe_cambiar_password = true, updated_at = NOW() WHERE id = $2`,
    [await bcrypt.hash(password, 10), usuario.user_id]
  );
  const correo = plantillas.credenciales({
    nombre: usuario.nombre,
    empresa: usuario.empresa,
    url: appUrl(),
    email: usuario.email,
    password,
    diasPrueba: usuario.subscription_status === 'trial' ? diasRestantes(usuario) : null
  });
  await enviarCorreo({ para: usuario.email, nombre: usuario.nombre, asunto: correo.asunto, html: correo.html, texto: correo.texto });
};

const USUARIO_SELECT = `
  SELECT u.id AS user_id, u.email, u.nombre, u.email_verificado_en, u.debe_cambiar_password,
         o.nombre AS empresa, o.subscription_status, o.trial_ends_at, o.subscription_ends_at
  FROM users u JOIN organizations o ON o.id = u.organization_id`;

/**
 * Abre el enlace del correo. Devuelve el estado para mostrar en el login:
 * 'verificado' · 'ya-verificado' · 'vencido' · 'invalido' · 'error-envio'.
 */
const verificarCorreo = async (token) => {
  if (!token || typeof token !== 'string' || token.length > 100) return 'invalido';
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT t.user_id, t.expires_at, t.used_at FROM email_verification_tokens t
       WHERE t.token_hash = $1 FOR UPDATE`,
      [sha256(token)]
    );
    const fila = result.rows[0];
    if (!fila) {
      await client.query('ROLLBACK');
      return 'invalido';
    }
    // Algunos correos abren los enlaces solos para revisarlos; el segundo clic no es un error.
    if (fila.used_at) {
      await client.query('ROLLBACK');
      return 'ya-verificado';
    }
    if (new Date(fila.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return 'vencido';
    }
    const usuario = (await client.query(`${USUARIO_SELECT} WHERE u.id = $1 FOR UPDATE OF u`, [fila.user_id])).rows[0];
    await client.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE token_hash = $1', [sha256(token)]);
    await client.query(
      'UPDATE users SET verificado = true, email_verificado_en = NOW(), updated_at = NOW() WHERE id = $1',
      [fila.user_id]
    );
    await enviarCredenciales(client, usuario);
    await client.query('COMMIT');
    return 'verificado';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error verificando correo:', error.message);
    return 'error-envio';
  } finally {
    client.release();
  }
};

/**
 * Reenvío desde soporte: si el cliente no ha verificado, otro enlace; si verificó pero nunca
 * entró, credenciales nuevas. Si ya creó su contraseña no se toca nada.
 */
const reenviar = async (organizationId) => {
  const usuario = (await authPool.query(
    `${USUARIO_SELECT} WHERE u.organization_id = $1 AND u.activo ORDER BY u.created_at, u.id LIMIT 1`,
    [organizationId]
  )).rows[0];
  if (!usuario) throw Object.assign(new Error('La empresa no tiene un usuario administrador'), { status: 404, expose: true });

  if (!usuario.email_verificado_en) {
    await enviarVerificacion({ userId: usuario.user_id, email: usuario.email, nombre: usuario.nombre, empresa: usuario.empresa });
    return `Enlace de verificación reenviado a ${usuario.email}`;
  }
  if (!usuario.debe_cambiar_password) {
    throw Object.assign(new Error(`${usuario.email} ya verificó su correo y creó su contraseña; si la olvidó, restablécela desde Configuración → Usuarios`), { status: 409, expose: true });
  }
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    await enviarCredenciales(client, usuario);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return `Credenciales nuevas enviadas a ${usuario.email}; la contraseña temporal anterior dejó de funcionar`;
};

module.exports = { enviarVerificacion, verificarCorreo, reenviar, hashInutilizable, passwordTemporal, HORAS_VIGENCIA };
