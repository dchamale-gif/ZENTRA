const crypto = require('crypto');

// Cifra las credenciales de integraciones con AES-256-GCM. La llave vive solo en el
// servidor (INTEGRATIONS_KEY), nunca en la base: un respaldo de la base no las expone.
// El texto cifrado queda ligado a la empresa (AAD): copiado a otra empresa no descifra.

const VERSION = 'v1';

const getKey = () => {
  const secret = process.env.INTEGRATIONS_KEY;
  if (!secret || secret.length < 32) {
    throw Object.assign(
      new Error('Las integraciones no están habilitadas en este servidor (falta INTEGRATIONS_KEY)'),
      { status: 503 }
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
};

const encrypt = (plainText, organizationId) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  cipher.setAAD(Buffer.from(`org:${organizationId}`));
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
};

const decrypt = (payload, organizationId) => {
  const [version, iv, tag, data] = String(payload || '').split(':');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Credencial cifrada con formato desconocido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(`org:${organizationId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

module.exports = { encrypt, decrypt };
