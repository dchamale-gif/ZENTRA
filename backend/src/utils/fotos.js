const crypto = require('crypto');

// Límite de la foto ya decodificada. En base64 ocupa un tercio más.
const MAX_FOTO_BYTES = 2 * 1024 * 1024;

// El tipo se decide por los primeros bytes, no por lo que diga el remitente:
// así no se guarda (ni se sirve) algo que no sea una imagen, como un SVG con scripts.
const SIGNATURES = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'],
  ['image/gif', (b) => b.toString('ascii', 0, 4) === 'GIF8']
];

// status para las rutas y expose para la importación masiva (mensaje por fila).
const fotoError = (message) => Object.assign(new Error(message), { status: 400, expose: true });

const detectMime = (buffer) => (buffer.length > 12 ? SIGNATURES.find(([, test]) => test(buffer))?.[0] : null);

/**
 * Acepta base64 puro o con prefijo «data:image/...;base64,», con saltos de línea
 * o en variante URL (-_). Desde otra base de datos también puede llegar la imagen
 * binaria (BLOB/BYTEA). Devuelve { mime, buffer, hash } o lanza un error 400.
 */
const parseFotoBase64 = (value) => {
  if (Buffer.isBuffer(value)) {
    if (value.length > MAX_FOTO_BYTES) {
      throw fotoError(`La foto pesa más de ${MAX_FOTO_BYTES / 1024 / 1024} MB; redúcela antes de enviarla`);
    }
    if (detectMime(value)) value = value.toString('base64');
    else value = value.toString('latin1'); // texto base64 guardado en una columna binaria
  }
  let raw = String(value).trim();
  const dataUrl = raw.match(/^data:[^;,]*;base64,(.*)$/s);
  if (dataUrl) raw = dataUrl[1];
  raw = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw fotoError('La foto no es un texto base64 válido');
  }
  if (Math.floor(raw.length * 3 / 4) > MAX_FOTO_BYTES + 3) {
    throw fotoError(`La foto pesa más de ${MAX_FOTO_BYTES / 1024 / 1024} MB; redúcela antes de enviarla`);
  }
  const buffer = Buffer.from(raw, 'base64');
  const mime = detectMime(buffer);
  if (!mime) throw fotoError('La foto debe ser una imagen JPG, PNG, WebP o GIF');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  return { mime, buffer, hash };
};

/**
 * Guarda o quita la foto de un artículo dentro de la transacción del llamador.
 * undefined: no tocar · null o '': quitar · texto o Buffer: reemplazar.
 * origenHash identifica la foto en el sistema externo del que se sincronizó.
 */
const guardarFoto = async (db, articuloId, foto, { origenHash = null } = {}) => {
  if (foto === undefined) return;
  if (foto === null || (!Buffer.isBuffer(foto) && String(foto).trim() === '')) {
    await db.query('DELETE FROM articulo_fotos WHERE articulo_id = $1', [articuloId]);
    return;
  }
  const { mime, buffer, hash } = parseFotoBase64(foto);
  await db.query(
    `INSERT INTO articulo_fotos (articulo_id, mime_type, datos, bytes, hash, origen_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (articulo_id) DO UPDATE
     SET mime_type = EXCLUDED.mime_type, datos = EXCLUDED.datos, bytes = EXCLUDED.bytes,
         hash = EXCLUDED.hash, origen_hash = EXCLUDED.origen_hash, updated_at = NOW()`,
    [articuloId, mime, buffer, buffer.length, hash, origenHash]
  );
};

// Columna para los SELECT de artículos: null si no tiene foto.
const FOTO_VERSION_COLUMN =
  '(SELECT f.hash FROM articulo_fotos f WHERE f.articulo_id = codigos_articulos.id) AS foto_version';

module.exports = { MAX_FOTO_BYTES, parseFotoBase64, guardarFoto, FOTO_VERSION_COLUMN };
