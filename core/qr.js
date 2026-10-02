// Codificador de códigos QR propio, sin dependencias (modo byte, corrección M, versiones 1–10 = hasta 213 bytes).
// Basta para la URL de emparejar el móvil. Algoritmo según ISO/IEC 18004 (mismo orden que las implementaciones de referencia).
//   const qr = require('./qr'); qr.matriz('http://…') → { tam, m: [[bool]] }; qr.svg('http://…') → '<svg …>'
'use strict';

// [ec por bloque, bloques grupo 1, datos por bloque g1, bloques grupo 2, datos por bloque g2] — nivel M
const TABLA_M = [null,
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
const ALINEACION = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const BITS_NIVEL_M = 0;

// ---------- Reed-Solomon sobre GF(256), polinomio 0x11D ----------
function mult(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function divisor(grado) {
  const r = new Array(grado).fill(0); r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mult(r[j], raiz); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    raiz = mult(raiz, 2);
  }
  return r;
}
function resto(datos, div) {
  const r = new Array(div.length).fill(0);
  for (const b of datos) {
    const f = b ^ r.shift(); r.push(0);
    div.forEach((c, i) => { r[i] ^= mult(c, f); });
  }
  return r;
}

// ---------- datos → palabras de código (con la corrección intercalada) ----------
function capacidad(v) { const [, b1, d1, b2, d2] = TABLA_M[v]; return b1 * d1 + b2 * d2; }
function codificar(bytes, v) {
  const bits = [];
  const poner = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  poner(0b0100, 4); poner(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) poner(b, 8);
  const cap = capacidad(v) * 8;
  poner(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0xec; datos.length < capacidad(v); p ^= 0xec ^ 0x11) datos.push(p);
  const [ec, b1, d1, b2, d2] = TABLA_M[v], div = divisor(ec);
  const bloques = []; let k = 0;
  for (let i = 0; i < b1 + b2; i++) { const n = i < b1 ? d1 : d2; const d = datos.slice(k, k + n); k += n; bloques.push({ d, e: resto(d, div) }); }
  const sal = [], maxD = Math.max(d1, d2);
  for (let i = 0; i < maxD; i++) for (const b of bloques) if (i < b.d.length) sal.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of bloques) sal.push(b.e[i]);
  return sal;
}

// ---------- matriz ----------
const MASCARAS = [
  (y, x) => (x + y) % 2 === 0, (y) => y % 2 === 0, (y, x) => x % 3 === 0, (y, x) => (x + y) % 3 === 0,
  (y, x) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (y, x) => (x * y) % 2 + (x * y) % 3 === 0,
  (y, x) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (y, x) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

function construir(v, palabras, mascara) {
  const tam = v * 4 + 17;
  const m = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fn = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fijar = (x, y, c) => { m[y][x] = c; fn[y][x] = true; };
  // temporización
  for (let i = 0; i < tam; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0); }
  // buscadores (+ separadores)
  const buscador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < tam && y >= 0 && y < tam) fijar(x, y, d !== 2 && d !== 4);
    }
  };
  buscador(3, 3); buscador(tam - 4, 3); buscador(3, tam - 4);
  // alineación
  const pos = ALINEACION[v], n = pos.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fijar(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  formato(m, fn, tam, 0, fijar);                 // reserva (se reescribe con la máscara de verdad)
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const c = ((bits >>> i) & 1) === 1, a = tam - 11 + (i % 3), b = Math.floor(i / 3); fijar(a, b, c); fijar(b, a, c); }
  }
  // datos en zigzag
  let i = 0;
  for (let der = tam - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (let vert = 0; vert < tam; vert++) for (let j = 0; j < 2; j++) {
      const x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? tam - 1 - vert : vert;
      if (!fn[y][x] && i < palabras.length * 8) { m[y][x] = ((palabras[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  // máscara
  const f = MASCARAS[mascara];
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fn[y][x] && f(y, x)) m[y][x] = !m[y][x];
  formato(m, fn, tam, mascara, fijar);
  return { tam, m };
}
function formato(m, fn, tam, mascara, fijar) {
  const d = (BITS_NIVEL_M << 3) | mascara;
  let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  const bits = ((d << 10) | r) ^ 0x5412, b = i => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) fijar(8, i, b(i));
  fijar(8, 7, b(6)); fijar(8, 8, b(7)); fijar(7, 8, b(8));
  for (let i = 9; i < 15; i++) fijar(14 - i, 8, b(i));
  for (let i = 0; i < 8; i++) fijar(tam - 1 - i, 8, b(i));
  for (let i = 8; i < 15; i++) fijar(8, tam - 15 + i, b(i));
  fijar(8, tam - 8, true);
}

// penalización estándar (N1 rachas, N2 bloques 2x2, N3 patrones tipo buscador, N4 proporción de oscuros)
function penalizacion({ tam, m }) {
  let p = 0, oscuros = 0;
  const linea = get => {
    let racha = 1;
    for (let i = 1; i < tam; i++) {
      if (get(i) === get(i - 1)) { racha++; if (racha === 5) p += 3; else if (racha > 5) p++; } else racha = 1;
    }
    for (let i = 0; i + 10 < tam; i++) {
      const s = Array.from({ length: 11 }, (_, k) => get(i + k) ? 1 : 0).join('');
      if (s === '10111010000' || s === '00001011101') p += 40;
    }
  };
  for (let y = 0; y < tam; y++) linea(x => m[y][x]);
  for (let x = 0; x < tam; x++) linea(y => m[y][x]);
  for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  for (const f of m) for (const c of f) if (c) oscuros++;
  const total = tam * tam;
  p += Math.max(0, Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * 10;
  return p;
}

function matriz(texto, { mascara, version } = {}) {
  const bytes = [...Buffer.from(String(texto), 'utf8')];
  let v = version || 1;
  while (v <= 10 && capacidad(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
  if (v > 10) throw new Error('texto demasiado largo para el QR (máx. 213 bytes)');
  const palabras = codificar(bytes, v);
  if (mascara !== undefined) return { version: v, mascara, ...construir(v, palabras, mascara) };
  let mejor = null;
  for (let k = 0; k < 8; k++) { const q = construir(v, palabras, k), p = penalizacion(q); if (!mejor || p < mejor.p) mejor = { p, version: v, mascara: k, ...q }; }
  delete mejor.p; return mejor;
}

function svg(texto, { margen = 4, color = '#000', fondo = '#fff' } = {}) {
  const { tam, m } = matriz(texto), t = tam + margen * 2;
  let d = '';
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (m[y][x]) d += `M${x + margen} ${y + margen}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="${fondo}"/><path d="${d}" fill="${color}"/></svg>`;
}

module.exports = { matriz, svg };
