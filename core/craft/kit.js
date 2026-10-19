// Kit de marca: colores, fuente, letrero, llamada a seguir, hashtags, zonas del vídeo, zona segura y objetivos de audio de un
// canal, en un solo sitio. Lo usan subtitular_video (perfil), las miniaturas, los rótulos, el título animado y el anuncio de
// Discord, y el agente lo lee con kit_marca antes de diseñar en cualquier app de la suite (todo sale con la misma marca).
// Kits de serie: core/craft/kits/<id>.json. Cambios del usuario: <datos>/craft/kits/<id>.json (encima del de serie, campo a campo).
'use strict';
const fs = require('fs');
const path = require('path');

const SERIE = path.join(__dirname, 'kits');
const BASE = {                                         // lo que no diga un kit
  colores: { primario: '#ffffff', acento: '#00d9ff', resaltado: '#ffd400', contorno: '#000000', fondo: '#111111' },
  fuente: { familia: 'Trueno', estilo: 'Black' },
  zonaSegura: { arriba: 0.06, abajo: 0.12, lados: 0.04, botones: { x: 0.88, desde: 0.42, hasta: 0.88 } },
  audio: { lufs: -14, picoMax: -1, pro: false },
  miniatura: { variantes: 3 },
  video: {},
};
const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;

const esObj = x => x && typeof x === 'object' && !Array.isArray(x);
function mezclar(a, b) {                               // b encima de a; los arrays se sustituyen enteros
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = esObj(v) && esObj(a?.[k]) ? mezclar(a[k], v) : v;
  return out;
}
const leer = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function crearKits({ cfg } = {}) {
  const dirUsuario = path.join(cfg?.dir || path.join(require('os').homedir(), '.apolo'), 'craft', 'kits');
  const ids = () => [...new Set([SERIE, dirUsuario].flatMap(d => { try { return fs.readdirSync(d); } catch { return []; } })
    .filter(n => n.endsWith('.json')).map(n => n.slice(0, -5)).filter(n => ID.test(n)))].sort();

  function obtener(id) {
    const k = String(id || '').toLowerCase();
    if (!ID.test(k)) return null;
    const serie = leer(path.join(SERIE, `${k}.json`)), usuario = leer(path.join(dirUsuario, `${k}.json`));
    if (!serie && !usuario) return null;
    return { ...mezclar(mezclar(BASE, serie || {}), usuario || {}), id: k };
  }
  const lista = () => ids().map(obtener).filter(Boolean);

  // cambios = solo lo que cambia ({ colores: { acento: '#ff0000' } }); se guarda encima de lo que el usuario ya tenía
  function guardar(id, cambios) {
    const k = String(id || '').toLowerCase();
    if (!ID.test(k)) throw new Error('id de kit no válido (minúsculas, números, - y _)');
    if (!esObj(cambios)) throw new Error('los cambios tienen que ser un objeto');
    const errores = validar(mezclar(obtener(k) || BASE, cambios));
    if (errores.length) throw new Error(errores.join('; '));
    fs.mkdirSync(dirUsuario, { recursive: true });
    const f = path.join(dirUsuario, `${k}.json`);
    fs.writeFileSync(f, JSON.stringify(mezclar(leer(f) || {}, cambios), null, 2));
    return obtener(k);
  }

  const HERRAMIENTA = {
    nombre: 'kit_marca', riesgo: a => (a?.accion === 'guardar' ? 'escritura' : 'lectura'),
    descripcion: 'Kit de marca de un canal (colores, fuente, letrero, llamada a seguir, hashtags, zonas del vídeo, zona segura, objetivos de audio). '
      + 'LÉELO antes de diseñar cualquier pieza con la suite (miniatura, rótulo, título, póster, presentación, vídeo) y usa SOLO sus colores y su fuente. '
      + 'accion: lista | ver (id) | guardar (id + cambios: solo los campos que cambian; se pide permiso).',
    parametros: { type: 'object', properties: {
      accion: { type: 'string', enum: ['lista', 'ver', 'guardar'] },
      id: { type: 'string', description: 'id del kit (p. ej. lagctrucks)' },
      cambios: { type: 'object', description: 'campos a cambiar, p. ej. {"colores":{"acento":"#ff3355"},"cta":"Únete al convoy"}' },
    }, required: ['accion'] },
    resumen: a => `${a.accion}${a.id ? ' ' + a.id : ''}`,
    ejecutar: async a => {
      if (a.accion === 'lista') return JSON.stringify(lista().map(k => ({ id: k.id, nombre: k.nombre, descripcion: k.descripcion, colores: k.colores })), null, 1);
      if (a.accion === 'guardar') return JSON.stringify(guardar(a.id, a.cambios), null, 1);
      const k = obtener(a.id || ids()[0]);
      if (!k) throw new Error(`no existe el kit "${a.id}". Hay: ${ids().join(', ') || 'ninguno'}`);
      return JSON.stringify(k, null, 1);
    },
  };

  return { obtener, lista, ids, guardar, HERRAMIENTA, dirUsuario };
}

const HEX = /^#[0-9a-f]{6}$/i;
function validar(k) {
  const e = [];
  for (const [n, c] of Object.entries(k.colores || {})) if (!HEX.test(String(c))) e.push(`color ${n} no es #rrggbb`);
  const z = k.zonaSegura || {};
  for (const n of ['arriba', 'abajo', 'lados']) if (z[n] != null && !(z[n] >= 0 && z[n] < 0.4)) e.push(`zonaSegura.${n} tiene que estar entre 0 y 0.4`);
  if (k.audio?.lufs != null && !(k.audio.lufs <= -6 && k.audio.lufs >= -30)) e.push('audio.lufs fuera de rango (-30 a -6)');
  for (const [n, r] of Object.entries(k.video?.zonas || {})) if (!Array.isArray(r) || r.length !== 4 || !(r[2] > r[0] && r[3] > r[1])) e.push(`zona ${n} no es [x0,y0,x1,y1]`);
  return e;
}

// opciones de subtitular_video que salen del kit (lo que pase quien llama va encima)
function perfil(k) {
  if (!k) return {};
  const v = k.video || {};
  return { kit: k, y: v.y, marca: k.marca, letrero: k.letrero && { ...k.letrero, ...(Array.isArray(k.redes) ? { redes: k.redes } : {}) }, cta: k.cta, director: v.director, contexto: k.contexto, zonas: v.zonas || {}, ...(k.audio?.pro ? { audioPro: true } : {}), lufs: k.audio?.lufs };
}

// lo más ancho que puede ser un texto centrado a la altura y (fracción) sin meterse en la columna de botones ni en los lados
function anchoSeguro(k, y, W) {
  const z = k?.zonaSegura || BASE.zonaSegura, b = z.botones;
  let mitad = W / 2 - W * (z.lados ?? 0.04);
  if (b && y >= b.desde && y <= b.hasta) mitad = Math.min(mitad, W * b.x - W / 2);
  return Math.max(W * 0.4, 2 * mitad);
}
// x en px donde acaba lo usable a la altura y (fracción): el lado, o la columna de botones si y cae en ella
function limiteDerecho(k, y, W) {
  const z = k?.zonaSegura || BASE.zonaSegura, b = z.botones;
  const lado = W * (1 - (z.lados ?? 0.04));
  return b && y >= b.desde && y <= b.hasta ? Math.min(lado, W * b.x) : lado;
}
// rectángulo seguro [x0,y0,x1,y1] en píxeles (fuera de la interfaz de TikTok/Shorts/Reels)
function rectSeguro(k, W, H) {
  const z = k?.zonaSegura || BASE.zonaSegura;
  return [W * (z.lados ?? 0.04), H * (z.arriba ?? 0.06), W * (1 - (z.lados ?? 0.04)), H * (1 - (z.abajo ?? 0.12))];
}

module.exports = { crearKits, mezclar, validar, perfil, anchoSeguro, limiteDerecho, rectSeguro, BASE };
