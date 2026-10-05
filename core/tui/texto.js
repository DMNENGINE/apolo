// Utilidades de texto para la terminal: colores ANSI, ancho visible (emojis/CJK = 2), cortar y ajustar líneas.
'use strict';

const ESC = '\x1b[';
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

// paleta (truecolor; las terminales viejas caen al color más cercano)
const rgb = (r, g, b) => t => `${ESC}38;2;${r};${g};${b}m${t}${ESC}39m`;
const c = {
  acento: rgb(80, 250, 160),      // verde del visor del casco
  acento2: rgb(120, 200, 255),
  gris: t => `${ESC}90m${t}${ESC}39m`,
  tenue: rgb(130, 130, 140),
  rojo: rgb(255, 95, 95),
  amarillo: rgb(240, 200, 80),
  verde: rgb(110, 220, 120),
  azul: rgb(110, 170, 255),
  morado: rgb(190, 140, 255),
  blanco: rgb(235, 235, 240),
  negrita: t => `${ESC}1m${t}${ESC}22m`,
  cursiva: t => `${ESC}3m${t}${ESC}23m`,
  subr: t => `${ESC}4m${t}${ESC}24m`,
  tachado: t => `${ESC}9m${t}${ESC}29m`,
  inverso: t => `${ESC}7m${t}${ESC}27m`,
  fondo: (t, r = 55, g = 55, b = 62) => `${ESC}48;2;${r};${g};${b}m${t}${ESC}49m`,
};

const quitarAnsi = s => String(s).replace(ANSI_RE, '');

// ancho de un punto de código en columnas
function anchoCar(cp) {
  if (cp === 0 || cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x20e3 || (cp >= 0xe0100 && cp <= 0xe01ef)) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) || (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x1f680 && cp <= 0x1f6ff) || (cp >= 0x1fa70 && cp <= 0x1faff) ||
      (cp >= 0x2600 && cp <= 0x26ff && [0x2614, 0x2615, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2648, 0x267f, 0x2693].includes(cp)) ||
      [0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55].includes(cp) ||
      (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

function ancho(s) {
  let w = 0;
  for (const ch of quitarAnsi(s)) w += anchoCar(ch.codePointAt(0));
  return w;
}

// trocea en [ {ansi} | {car, w} ] para poder cortar sin romper las secuencias de color
function trozos(s) {
  const r = []; let i = 0; s = String(s);
  ANSI_RE.lastIndex = 0;
  let m;
  while ((m = ANSI_RE.exec(s))) {
    for (const ch of s.slice(i, m.index)) r.push({ car: ch, w: anchoCar(ch.codePointAt(0)) });
    r.push({ ansi: m[0] }); i = m.index + m[0].length;
  }
  for (const ch of s.slice(i)) r.push({ car: ch, w: anchoCar(ch.codePointAt(0)) });
  return r;
}

// corta a `max` columnas (añade … si corta)
function cortar(s, max, puntos = true) {
  if (ancho(s) <= max) return s;
  let w = 0, out = '';
  const lim = puntos ? max - 1 : max;
  for (const t of trozos(s)) {
    if (t.ansi) { out += t.ansi; continue; }
    if (w + t.w > lim) break;
    out += t.car; w += t.w;
  }
  return out + (puntos ? '…' : '') + `${ESC}0m`;
}

const rellenar = (s, n) => s + ' '.repeat(Math.max(0, n - ancho(s)));

// ajusta una línea (con colores) a `max` columnas, partiendo por espacios cuando se puede.
// El estilo activo se repite al principio de cada línea nueva.
function ajustar(linea, max, sangria = '') {
  max = Math.max(4, max);
  if (ancho(linea) <= max) return [linea];
  const out = [];
  let actual = '', w = 0, estilo = '', ultEsp = -1, ultEspW = 0, estiloEnEsp = '';
  const t = trozos(linea);
  const anchoSangria = ancho(sangria);
  const abrir = () => { actual = sangria + estilo; w = anchoSangria; ultEsp = -1; };
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    if (x.ansi) { actual += x.ansi; estilo = /\x1b\[0m$/.test(x.ansi) ? '' : estilo + x.ansi; continue; }
    if (w + x.w > max) {
      if (ultEsp > anchoSangria && x.car !== ' ') {        // vuelve al último espacio
        const resto = actual.slice(ultEsp + 1);
        out.push(actual.slice(0, ultEsp) + `${ESC}0m`);
        actual = sangria + estiloEnEsp + resto; w = anchoSangria + (w - ultEspW - 1); ultEsp = -1;
      } else { out.push(actual + `${ESC}0m`); abrir(); if (x.car === ' ') continue; }
    }
    if (x.car === ' ') { ultEsp = actual.length; ultEspW = w; estiloEnEsp = estilo; }
    actual += x.car; w += x.w;
  }
  if (quitarAnsi(actual).trim() || !out.length) out.push(actual);
  return out;
}

module.exports = { ESC, c, quitarAnsi, ancho, anchoCar, cortar, rellenar, ajustar, trozos };
