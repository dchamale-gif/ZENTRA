const crypto = require('crypto');

// Límite de la foto ya decodificada. En base64 ocupa un tercio más.
const MAX_FOTO_BYTES = 2 * 1024 * 1024;

// El tipo se decide por los primeros bytes, no por lo que diga el remitente:
// así no se guarda (ni se sirve) algo que no sea una imagen, como un SVG con scripts.
const SIGNATURES = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'],
  ['image/gif', (b) => b.toString('ascii', 0, 4) === 'GIF8'],
  ['image/avif', (b) => b.toString('ascii', 4, 8) === 'ftyp' && /^avi[fs]$/.test(b.toString('ascii', 8, 12))]
];

// status para las rutas y expose para la importación masiva (mensaje por fila).
const fotoError = (message) => Object.assign(new Error(message), { status: 400, expose: true });

const detectMime = (buffer) => (buffer.length > 12 ? SIGNATURES.find(([, test]) => test(buffer))?.[0] : null);

// Inicio del valor para los avisos: igual en todas las fotos con el mismo formato, así se agrupan.
const inicioDe = (texto) => texto.slice(0, 24).replace(/\s+/g, ' ');

// Desde otra base, la foto puede venir envuelta: lista JSON («["data:image/…"]»), objeto
// ({"url": "…"}), etiqueta HTML (<img src="data:…">) o entre comillas. Se busca la imagen adentro.
const extraerBase64 = (texto) => {
  const dataUrl = texto.match(/data:image\/[\w.+-]+(?:;[^,;"'\s]*)*;base64,([A-Za-z0-9+/=_%\s-]+)/i);
  if (dataUrl) return dataUrl[1];
  if (/^[[{]/.test(texto)) {
    try {
      const buscar = (valor) => {
        if (typeof valor === 'string') return valor;
        if (Array.isArray(valor)) return valor.map(buscar).find(Boolean);
        if (valor && typeof valor === 'object') return Object.values(valor).map(buscar).find(Boolean);
        return null;
      };
      const encontrado = buscar(JSON.parse(texto));
      if (encontrado) return encontrado;
    } catch {
      // No era JSON: se intenta como base64 tal cual.
    }
  }
  return texto.replace(/^["']+|["']+$/g, '');
};

/**
 * Acepta base64 puro o con prefijo «data:image/...;base64,» (aunque traiga más parámetros),
 * dentro de JSON o HTML, con saltos de línea, codificado para URL (%2B), sin relleno «=»
 * o en variante URL (-_). Desde otra base de datos también puede llegar la imagen binaria
 * (BLOB/BYTEA). Devuelve { mime, buffer, hash } o lanza un error 400.
 */
const parseFotoBase64 = (value) => {
  if (Buffer.isBuffer(value)) {
    if (value.length > MAX_FOTO_BYTES * 1.4) {
      throw fotoError(`La foto pesa más de ${MAX_FOTO_BYTES / 1024 / 1024} MB; redúcela antes de enviarla`);
    }
    if (detectMime(value)) value = value.toString('base64');
    else value = value.toString('latin1'); // texto base64 guardado en una columna binaria
  }
  const original = String(value).trim();
  let raw = extraerBase64(original);
  if (/%[0-9a-f]{2}/i.test(raw)) {
    try { raw = decodeURIComponent(raw); } catch { /* se deja como venía */ }
  }
  raw = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!raw || !/^[A-Za-z0-9+/]+$/.test(raw)) {
    throw fotoError(`La foto no es una imagen en base64 (empieza con «${inicioDe(original)}»)`);
  }
  raw += '='.repeat((4 - (raw.length % 4)) % 4);
  if (Math.floor(raw.length * 3 / 4) > MAX_FOTO_BYTES + 3) {
    throw fotoError(`La foto pesa más de ${MAX_FOTO_BYTES / 1024 / 1024} MB; redúcela antes de enviarla`);
  }
  const buffer = Buffer.from(raw, 'base64');
  const mime = detectMime(buffer);
  if (!mime) throw fotoError(`La foto debe ser una imagen JPG, PNG, WebP, GIF o AVIF (empieza con «${inicioDe(original)}»)`);
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
