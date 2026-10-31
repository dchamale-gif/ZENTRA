const dns = require('dns').promises;
const net = require('net');
const { MAX_FOTO_BYTES, parseFotoBase64 } = require('./fotos');

// Fotos de la página web guardadas como URL o ruta («/uploads/pez.jpg») en lugar de base64.
// La dirección sale de la base de datos de la empresa, así que solo se descarga de servidores
// públicos por http(s): nunca de la red interna, del propio servidor ni de los metadatos de la nube.

const TIMEOUT_MS = 8000;
const MAX_REDIRECCIONES = 3;

const errorFoto = (message) => Object.assign(new Error(message), { expose: true });

// Rangos que no son internet pública (IPv4 y IPv6).
const BLOQUEADAS = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]
].forEach(([ip, bits]) => BLOQUEADAS.addSubnet(ip, bits, 'ipv4'));
[['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]]
  .forEach(([ip, bits]) => BLOQUEADAS.addSubnet(ip, bits, 'ipv6'));

// Una IPv4 escrita como IPv6 («::ffff:10.0.0.1») se revisa como IPv4. (No se agrega la regla
// ::ffff:0:0/96 porque BlockList la aplica también a toda IPv4 y bloquearía internet entera.)
const esPublica = (address, family) => {
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapeada) return !BLOQUEADAS.check(mapeada[1], 'ipv4');
  return !BLOQUEADAS.check(address, family === 6 ? 'ipv6' : 'ipv4');
};

const verificarHost = async (url) => {
  if (!['http:', 'https:'].includes(url.protocol)) throw errorFoto('la dirección de la foto no es http(s)');
  const direcciones = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!direcciones.length) throw errorFoto(`no se encontró el servidor ${url.hostname}`);
  if (!direcciones.every(({ address, family }) => esPublica(address, family))) {
    throw errorFoto(`${url.hostname} no es un servidor público`);
  }
};

/** ¿El valor de la columna es una dirección o ruta de imagen y no la imagen en base64? */
// Un JPG en base64 empieza con «/9j/»: un texto largo solo con caracteres de base64 no es ruta.
const pareceUrl = (valor) => {
  if (typeof valor !== 'string') return false;
  const texto = valor.trim();
  if (/^data:/i.test(texto) || (texto.length > 100 && /^[A-Za-z0-9+/=\s_-]+$/.test(texto))) return false;
  return /^https?:\/\//i.test(texto) || /^\.{0,2}\//.test(texto) || /^\[/.test(texto) ||
    /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(texto);
};

/**
 * Algunas webs guardan varias fotos en la columna (JSON o separadas por coma):
 * se usa la primera.
 */
const primeraRuta = (valor) => {
  const texto = String(valor).trim();
  if (texto.startsWith('[')) {
    try {
      const lista = JSON.parse(texto);
      const primera = lista.find((item) => typeof item === 'string' || item?.url || item?.src);
      return typeof primera === 'string' ? primera : primera?.url || primera?.src || '';
    } catch {
      return texto;
    }
  }
  return texto.split(/[,|]\s*/)[0];
};

/** Descarga la foto y la devuelve como Buffer validado (JPG, PNG, WebP o GIF de hasta 2 MB). */
const descargarFoto = async (valor, base) => {
  const ruta = primeraRuta(valor);
  let url;
  try {
    // Con «/» al final, una ruta relativa («uploads/pez.jpg») se agrega a la dirección completa.
    url = new URL(ruta, base ? `${base.replace(/\/+$/, '')}/` : undefined);
  } catch {
    // Sin la ruta en el mensaje, para que las fotos que fallan igual se agrupen en un solo aviso.
    throw errorFoto(base ? 'la ruta de la foto no es válida'
      : 'las fotos son rutas de la web; escribe la «Dirección de la web» en Configuración → Integración web');
  }
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto += 1) {
    await verificarHost(url);
    const respuesta = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
      .catch((error) => { throw errorFoto(error.name === 'TimeoutError' ? 'la web tardó demasiado en dar la foto' : 'no se pudo descargar la foto'); });
    if (respuesta.status >= 300 && respuesta.status < 400 && respuesta.headers.get('location')) {
      url = new URL(respuesta.headers.get('location'), url);
      continue;
    }
    if (!respuesta.ok) throw errorFoto(`la web respondió ${respuesta.status} al pedir la foto`);
    if (Number(respuesta.headers.get('content-length')) > MAX_FOTO_BYTES) throw errorFoto('la foto pesa más de 2 MB');
    const buffer = Buffer.from(await respuesta.arrayBuffer());
    if (buffer.length > MAX_FOTO_BYTES) throw errorFoto('la foto pesa más de 2 MB');
    try {
      parseFotoBase64(buffer); // valida que sea una imagen
    } catch {
      throw errorFoto('la dirección no devuelve una imagen JPG, PNG, WebP o GIF');
    }
    return buffer;
  }
  throw errorFoto('la foto redirige demasiadas veces');
};

/**
 * Convierte el valor de la columna en algo que guardarFoto acepte (Buffer o base64),
 * o lanza un error con el motivo. base: dirección de la web para rutas relativas.
 */
const prepararFoto = async (valor, base) => {
  if (valor === null || valor === undefined || (!Buffer.isBuffer(valor) && String(valor).trim() === '')) return null;
  if (pareceUrl(Buffer.isBuffer(valor) ? null : valor)) return descargarFoto(valor, base);
  parseFotoBase64(valor);
  return valor;
};

module.exports = { prepararFoto, pareceUrl, primeraRuta };
