// Formato de skills: SKILL.md estándar (Anthropic / Claude Code / Codex) = frontmatter YAML + cuerpo Markdown,
// en una carpeta con scripts/, references/ y assets/ opcionales.
//   name, description, allowed-tools, license, metadata
//   metadata.apolo (extensión propia): { modelos, canales, permisos, disparadores, version, autor, firma }
// Parser YAML propio y tolerante (sin dependencias): mapas por sangría, listas "- x", [a, b], {a: b}, escalares
// con comillas, bloques | y >, y escalares de varias líneas. Lo que no entiende lo deja como texto.
const fs = require('fs');
const path = require('path');

// ---------- YAML mínimo ----------
function escalar(v) {
  v = v.trim();
  if (!v) return null;
  if (v[0] === '"') { const m = v.match(/^"((?:[^"\\]|\\.)*)"/); if (m) return m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }[c] ?? c)); }
  if (v[0] === "'") { const m = v.match(/^'((?:[^']|'')*)'/); if (m) return m[1].replace(/''/g, "'"); }
  if (v[0] === '[' && v.endsWith(']')) return partir(v.slice(1, -1)).map(escalar).filter(x => x !== null);
  if (v[0] === '{' && v.endsWith('}')) {
    const o = {};
    for (const p of partir(v.slice(1, -1))) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim().replace(/^["']|["']$/g, '')] = escalar(p.slice(i + 1)); }
    return o;
  }
  v = v.replace(/\s+#.*$/, '');                               // comentario al final (solo sin comillas)
  if (/^(true|yes|sí|si)$/i.test(v)) return true;
  if (/^(false|no)$/i.test(v)) return false;
  if (/^(null|~)$/i.test(v)) return null;
  if (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return Number(v);
  return v;
}
// separa por comas fuera de comillas y corchetes
function partir(s) {
  const out = []; let cur = '', q = null, n = 0;
  for (const c of s) {
    if (q) { if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '[' || c === '{') n++;
    else if (c === ']' || c === '}') n--;
    else if (c === ',' && !n) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parsearYAML(texto) {
  const L = String(texto || '').replace(/\t/g, '  ').split(/\r?\n/).map(raw => ({ raw, ind: raw.match(/^ */)[0].length, t: raw.trim() }));
  const vacia = l => !l.t || l.t.startsWith('#');
  const sig = i => { while (i < L.length && vacia(L[i])) i++; return i; };

  function bloqueTexto(i, ind, modo) {                       // | y > : líneas más sangradas (o vacías)
    const ls = [];
    while (i < L.length && (!L[i].t || L[i].ind > ind)) ls.push(L[i++].raw);
    while (ls.length && !ls.at(-1).trim()) ls.pop();
    const min = Math.min(...ls.filter(x => x.trim()).map(x => x.match(/^ */)[0].length), 1e9);
    const quit = ls.map(x => x.slice(Math.min(min, x.length)));
    const txt = modo[0] === '|' ? quit.join('\n') : quit.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ');
    return [txt, i];
  }

  function bloque(i, ind) {
    i = sig(i);
    if (i >= L.length) return [null, i];
    return /^-( |$)/.test(L[i].t) ? lista(i, L[i].ind) : mapa(i, L[i].ind);
  }

  function valor(i, ind, resto) {                            // resto = lo que va tras "clave:" o "- "
    if (/^[|>][+-]?\d*$/.test(resto)) return bloqueTexto(i, ind, resto);
    if (resto) {
      let v = resto;                                         // escalar que sigue en líneas más sangradas
      if (!/^["'[{]/.test(resto)) while (i < L.length && L[i].t && L[i].ind > ind && !L[i].t.startsWith('#')) v += ' ' + L[i++].t;
      return [escalar(v), i];
    }
    const j = sig(i);
    if (j < L.length && (L[j].ind > ind || (L[j].ind === ind && /^-( |$)/.test(L[j].t)))) return bloque(j, ind);
    return [null, i];
  }

  function mapa(i, ind) {
    const o = {};
    while ((i = sig(i)) < L.length && L[i].ind === ind && !/^-( |$)/.test(L[i].t)) {
      const m = L[i].t.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*)|$)/);
      if (!m) { i++; continue; }                             // línea rara: se ignora
      const k = m[1].replace(/^["']|["']$/g, '');
      const [v, j] = valor(i + 1, ind, (m[2] || '').trim());
      o[k] = v; i = j;
    }
    return [o, i];
  }

  function lista(i, ind) {
    const a = [];
    while ((i = sig(i)) < L.length && L[i].ind === ind && /^-( |$)/.test(L[i].t)) {
      const resto = L[i].t.slice(1).trim();
      if (/^("[^"]*"|'[^']*'|[^:"'[{]+?)\s*:(\s|$)/.test(resto)) {   // "- clave: valor" = mapa dentro de la lista
        const nind = L[i].raw.indexOf(resto, ind + 1);
        L[i] = { raw: ' '.repeat(nind) + resto, ind: nind, t: resto };
        const [v, j] = mapa(i, nind); a.push(v); i = j;
      } else { const [v, j] = valor(i + 1, ind, resto); a.push(v); i = j; }
    }
    return [a, i];
  }

  try { const [v] = bloque(0, 0); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

// separa frontmatter (--- … ---) y cuerpo
function parsearSkillMd(texto) {
  texto = String(texto || '').replace(/^﻿/, '');
  const m = texto.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!m) return { datos: {}, cuerpo: texto };
  return { datos: parsearYAML(m[1]), cuerpo: texto.slice(m[0].length) };
}

// YAML de vuelta (para las skills que creamos nosotros: migración, importador)
function aYAML(o, ind = 0) {
  const pad = ' '.repeat(ind), out = [];
  const esc = v => (typeof v === 'string' ? (/^[\w ./,()¿?¡!áéíóúñÁÉÍÓÚÑ-]*$/.test(v) && v.trim() === v && v && !/^(true|false|null|yes|no|\d)/i.test(v) ? v : JSON.stringify(v)) : JSON.stringify(v));
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) out.push(`${pad}${k}: [${v.map(esc).join(', ')}]`);
    else if (v && typeof v === 'object') out.push(`${pad}${k}:`, aYAML(v, ind + 2));
    else out.push(`${pad}${k}: ${esc(v)}`);
  }
  return out.filter(Boolean).join('\n');
}
const componerSkillMd = (datos, cuerpo) => `---\n${aYAML(datos)}\n---\n\n${String(cuerpo || '').trim()}\n`;

const slugDe = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const lista = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(/\s*,\s*|\s+(?=\S)/).filter(Boolean)).map(String);

// datos propios de APOLO dentro de la carpeta (estado, fallos registrados, versiones del taller): no son parte de la skill
const PRIVADOS = new Set(['instalado.json', 'aprendizaje.jsonl', '_versiones']);
// archivos de la skill (rutas relativas con /), sin entrar en .git ni node_modules
function listarArchivos(dir, max = 500) {
  const out = [];
  const rec = (d, rel) => {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max || e.name === '.git' || e.name === 'node_modules' || (!rel && PRIVADOS.has(e.name)) || e.isSymbolicLink()) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) rec(path.join(d, e.name), r); else out.push(r);
    }
  };
  rec(dir, '');
  return out;
}

// lee una carpeta de skill → descripción normalizada (null si no hay SKILL.md)
function leerSkill(dir) {
  const f = ['SKILL.md', 'skill.md', 'Skill.md'].map(x => path.join(dir, x)).find(x => fs.existsSync(x));
  if (!f) return null;
  const contenido = fs.readFileSync(f, 'utf8');
  const { datos, cuerpo } = parsearSkillMd(contenido);
  const meta = datos.metadata && typeof datos.metadata === 'object' ? datos.metadata : {};
  const ap = (meta.apolo && typeof meta.apolo === 'object' ? meta.apolo : datos.apolo && typeof datos.apolo === 'object' ? datos.apolo : {});
  const nombre = String(datos.name || path.basename(dir)).trim();
  const primeraLinea = cuerpo.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
  const archivos = listarArchivos(dir);
  return {
    nombre, slug: slugDe(nombre) || slugDe(path.basename(dir)),
    descripcion: String(datos.description || primeraLinea).replace(/\s+/g, ' ').trim().slice(0, 1024),
    allowedTools: lista(datos['allowed-tools']), licencia: datos.license ? String(datos.license) : '',
    metadata: meta,
    apolo: {
      modelos: lista(ap.modelos), canales: lista(ap.canales), permisos: lista(ap.permisos),
      disparadores: Array.isArray(ap.disparadores) ? ap.disparadores.map(String) : ap.disparadores ? [String(ap.disparadores)] : [],
      version: ap.version != null ? String(ap.version) : meta.version != null ? String(meta.version) : datos.version != null ? String(datos.version) : '',
      autor: String(ap.autor || meta.author || meta.autor || ''), firma: ap.firma ? String(ap.firma) : '',
    },
    cuerpo, contenido, archivoSkill: path.basename(f), archivos,
    scripts: archivos.filter(a => a.startsWith('scripts/')), referencias: archivos.filter(a => a.startsWith('references/')), recursos: archivos.filter(a => a.startsWith('assets/')),
  };
}

// busca carpetas con SKILL.md dentro de una raíz (repos con varias skills)
function buscarSkills(raiz, prof = 5) {
  const out = [];
  const rec = (d, n) => {
    if (fs.existsSync(path.join(d, 'SKILL.md')) || fs.existsSync(path.join(d, 'skill.md'))) { out.push(d); return; }
    if (n <= 0) return;
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) if (e.isDirectory() && !e.isSymbolicLink() && !/^(\.git|node_modules|__pycache__)$/.test(e.name)) rec(path.join(d, e.name), n - 1);
  };
  rec(raiz, prof);
  return out.sort();
}

module.exports = { PRIVADOS, parsearYAML, parsearSkillMd, aYAML, componerSkillMd, leerSkill, listarArchivos, buscarSkills, slugDe };
