// Markdown → líneas ANSI ajustadas al ancho (títulos, negritas, código con colores, listas, citas, tablas).
'use strict';
const { c, ancho, ajustar, rellenar, cortar } = require('./texto');

const PALABRAS = new Set(('const let var function return if else for while do switch case break continue new class extends import from export default ' +
  'async await try catch finally throw typeof instanceof in of this super null undefined true false def elif lambda pass None True False with as ' +
  'fn pub mut impl struct enum match use mod self Self trait where loop public private protected static void int bool string echo then fi done esac local').split(' '));

function colorearCodigo(linea, lang) {
  if (/^(diff|patch)$/.test(lang)) return linea.startsWith('+') ? c.verde(linea) : linea.startsWith('-') ? c.rojo(linea) : linea.startsWith('@@') ? c.morado(linea) : c.blanco(linea);
  if (/^(json)$/.test(lang)) return linea.replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(-?\d+(?:\.\d+)?|true|false|null)\b/g, (m, s, dos, k) => s ? (dos ? c.azul(s) + dos : c.verde(s)) : c.amarillo(k));
  const coment = /^(py|python|sh|bash|shell|ps1|powershell|yaml|yml|toml|ruby|rb)$/.test(lang) ? '#' : '//';
  let out = '', i = 0;
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$|--.*$)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(linea))) {
    out += c.blanco(linea.slice(i, m.index)); i = m.index + m[0].length;
    if (m[1]) out += c.verde(m[1]);
    else if (m[2]) {
      if (m[2].startsWith(coment) || (coment === '//' && m[2].startsWith('//'))) { out += c.tenue(linea.slice(m.index)); i = linea.length; break; }
      out += c.blanco(m[2][0]); i = m.index + 1; re.lastIndex = i;
    } else if (m[3]) out += c.amarillo(m[3]);
    else if (PALABRAS.has(m[4])) out += c.morado(m[4]);
    else if (linea[i] === '(') out += c.azul(m[4]);
    else out += c.blanco(m[4]);
  }
  return out + c.blanco(linea.slice(i));
}

// estilos en línea: `código`, **negrita**, *cursiva*, ~~tachado~~, [texto](url), <url>
function enLinea(t) {
  const aparte = [];   // código y enlaces van aparte: los códigos ANSI llevan '[' y confundirían al de enlaces
  const guardar = x => { aparte.push(x); return `\u0000${aparte.length - 1}\u0000`; };
  t = t.replace(/`([^`]+)`/g, (_, x) => guardar(c.azul(x)))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, x, u) => guardar(c.subr(c.acento2(x)) + c.tenue(` (${u})`)));
  t = t.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => c.negrita(a || b))
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, (_, p, x) => p + c.cursiva(x))
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, (_, p, x) => p + c.cursiva(x))
    .replace(/~~([^~]+)~~/g, (_, x) => c.tachado(x));
  return t.replace(/\u0000(\d+)\u0000/g, (_, k) => aparte[+k]);
}

function tabla(filas, ancho0) {
  const celdas = filas.map(f => f.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(x => enLinea(x.trim())));
  const n = Math.max(...celdas.map(f => f.length));
  let anchos = Array.from({ length: n }, (_, i) => Math.max(3, ...celdas.map(f => ancho(f[i] || ''))));
  const total = () => anchos.reduce((a, b) => a + b, 0) + 3 * n + 1;
  while (total() > ancho0 && Math.max(...anchos) > 6) { const k = anchos.indexOf(Math.max(...anchos)); anchos[k]--; }
  const linea = (iz, me, de) => c.tenue(iz + anchos.map(w => '─'.repeat(w + 2)).join(me) + de);
  const out = [linea('┌', '┬', '┐')];
  celdas.forEach((f, k) => {
    out.push(c.tenue('│') + anchos.map((w, i) => ' ' + rellenar(cortar(k === 0 ? c.negrita(f[i] || '') : (f[i] || ''), w), w) + ' ').join(c.tenue('│')) + c.tenue('│'));
    if (k === 0) out.push(linea('├', '┼', '┤'));
  });
  out.push(linea('└', '┴', '┘'));
  return out;
}

function renderMarkdown(md, anchoMax = 80) {
  const lineas = String(md || '').replace(/\r/g, '').split('\n');
  const out = [];
  let enCodigo = false, lang = '';
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const valla = l.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (valla) {
      if (!enCodigo) { enCodigo = true; lang = valla[2].toLowerCase(); if (lang) out.push(c.tenue(`  ${lang}`)); }
      else enCodigo = false;
      continue;
    }
    if (enCodigo) {
      for (const x of ajustar(colorearCodigo(l.replace(/\t/g, '  '), lang), anchoMax - 2)) out.push('  ' + x);
      continue;
    }
    // tablas: líneas seguidas que empiezan por | con separador |---|
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1] || '')) {
      const filas = [l]; i += 2;
      while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) filas.push(lineas[i++]);
      i--; out.push(...tabla(filas, anchoMax)); continue;
    }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const t = enLinea(m[2]);
      out.push(m[1].length <= 2 ? c.negrita(c.acento(t)) : c.negrita(t));
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { out.push(c.tenue('─'.repeat(Math.min(anchoMax, 60)))); continue; }
    if ((m = l.match(/^(\s*)>\s?(.*)$/))) { for (const x of ajustar(c.cursiva(c.tenue(enLinea(m[2]))), anchoMax - 2)) out.push(c.tenue('▎ ') + x); continue; }
    if ((m = l.match(/^(\s*)([-*+])\s+(\[[ xX]\]\s+)?(.*)$/))) {
      const sang = ' '.repeat(Math.min(m[1].length, 8));
      const casilla = m[3] ? (/x/i.test(m[3]) ? c.verde('☒ ') : '☐ ') : '';
      const bala = sang + (m[1].length >= 2 ? '◦ ' : '• ');
      const partes = ajustar(bala + casilla + enLinea(m[4]), anchoMax, ' '.repeat(ancho(bala)));
      out.push(...partes); continue;
    }
    if ((m = l.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) {
      const sang = ' '.repeat(Math.min(m[1].length, 8)), num = `${sang}${m[2]}. `;
      out.push(...ajustar(num + enLinea(m[3]), anchoMax, ' '.repeat(ancho(num)))); continue;
    }
    if (!l.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    out.push(...ajustar(enLinea(l), anchoMax));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

module.exports = { renderMarkdown, colorearCodigo, enLinea };
