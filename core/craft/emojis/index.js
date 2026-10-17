// Emojis propios (emojis.py → <nombre>.png) que aparecen solos cuando se dice una palabra que encaja.
// Reglas: como mucho uno cada `hueco` s y el mismo emoji no se repite antes de `repetir` s (no saturar el vídeo).
'use strict';
const fs = require('fs');
const path = require('path');

// emoji → raíces (sin acentos, en minúsculas; casan con el principio de la palabra; '=x' = solo la palabra exacta)
const PALABRAS = {
  fuego: ['fuego', 'quema', 'caliente', 'epic', 'brutal', 'fire', 'candela'],
  risa: ['jaja', 'jeje', 'risa', 'chiste', 'gracios', '=xd', '=lol'],
  camion: ['camion', 'trailer', 'troca', 'trailero', 'truck', 'peterbilt', 'kenworth', 'freightliner', 'carga', 'cargamento'],
  saludo: ['hola', 'saludo', 'bienvenid', 'buenas', 'que onda', 'quiubo'],
  corazon: ['gracias', 'amor', 'quiero', 'corazon', 'familia', 'carino'],
  brillo: ['bendicion', 'dios', 'suerte', 'magia', 'bonit', 'precios'],
  dinero: ['dinero', 'dolar', 'peso', 'plata', '=lana', 'pago', 'paga', 'billete', 'cobr'],
  fantasma: ['llorona', 'fantasma', 'espanto', 'miedo', 'susto', 'espirit', 'aparicion'],
  sorpresa: ['increible', 'wow', 'guau', 'impresionante', 'gigante', 'enorme', 'no manches', 'que es eso', 'sorpresa'],
  rayo: ['vuela', 'volando', 'rapid', 'rayo', 'trueno', 'velocidad', '=corre', '=corran', 'acelera'],
  cien: ['100', 'cien', 'perfect', 'exacto'],
  corona: ['=rey', 'reina', 'jefe', 'campeon', '=pro', 'mejor', 'leyenda'],
  calavera: ['muero', 'muerto', 'mori', 'calavera', 'me mata'],
  ojos: ['miren', '=ojo', '=ojos', 'fijate', 'checa', 'atencion'],
  pesa: ['tonelada', 'pesad', 'fuerza', 'fuerte', '=kilo', '=kilos', 'libra'],
  mexico: ['mexico', 'mexican', 'coahuila', 'chihuahua', 'monterrey', 'jalisco', 'sonora'],
  like: ['chido', 'chingon', 'excelente', 'bien hecho', 'buenisim', 'genial', '=sale', 'arriba'],
};
const sinAcentos = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ruta = nombre => path.join(__dirname, `${nombre}.png`);
const disponibles = () => Object.keys(PALABRAS).filter(n => fs.existsSync(ruta(n)));

// texto de un trozo → nombre de emoji o null
function emojiDe(texto, extra = {}) {
  const t = ' ' + sinAcentos(texto).replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const [emoji, raices] of Object.entries({ ...PALABRAS, ...extra })) {
    for (const r of raices) {
      const exacta = r.startsWith('='), w = sinAcentos(exacta ? r.slice(1) : r);
      if (t.includes(' ' + w + (exacta ? ' ' : ''))) return emoji;
    }
  }
  return null;
}

// trozos [{s, e, texto}] → [{i, emoji, s, e}] respetando los huecos
function elegir(trozos, { hueco = 2.5, repetir = 12, minSeg = 0.9, extra } = {}) {
  const out = [], ultimo = {};
  let fin = -Infinity;
  trozos.forEach((t, i) => {
    const emoji = emojiDe(t.texto, extra);
    if (!emoji || t.s < fin + hueco || t.s < (ultimo[emoji] ?? -Infinity) + repetir) return;
    const sig = trozos[i + 1]?.s ?? t.e + minSeg;
    const e = Math.max(t.e, Math.min(t.s + minSeg, sig + 0.6));
    out.push({ i, emoji, s: t.s, e });
    ultimo[emoji] = t.s; fin = e;
  });
  return out;
}

module.exports = { PALABRAS, emojiDe, elegir, ruta, disponibles };

// catálogo completo (catalogo.py): cualquier emoji Unicode de un carácter → png de pegatina. lista de emojis → Map(emoji → ruta)
function catalogo(lista, { carpeta, python = 'python' }) {
  const pedir = [...new Set(lista)];
  if (!pedir.length) return new Map();
  const { execFileSync } = require('child_process');
  const out = execFileSync(python, ['-I', path.join(__dirname, 'catalogo.py'), carpeta, ...pedir], { windowsHide: true, timeout: 120_000, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
  const j = JSON.parse(String(out).trim().split(/\r?\n/).pop());
  return new Map(Object.entries(j).filter(([, r]) => r));
}
module.exports.catalogo = catalogo;
