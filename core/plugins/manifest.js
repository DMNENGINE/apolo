// Manifest de plugins (apolo-plugin.json): lectura, validación y semver mínimo (sin dependencias).
//   { nombre, version, descripcion, autor, licencia, entrada, apoloSdk: "^1.0.0",
//     permisos: ["red:api.ejemplo.com", "archivos:C:/ruta", "shell", "pantalla", "memoria", "tareas", "conversaciones"],
//     aporta: { herramientas: ["x" | {nombre, riesgo, descripcion}], canales, proveedores, comandos, vistas: [{nombre, archivo}], gestos, voces } }
const fs = require('fs');
const path = require('path');

const ARCHIVO = 'apolo-plugin.json';
const RIESGOS = ['lectura', 'escritura', 'ejecucion'];
const APORTES = ['herramientas', 'canales', 'proveedores', 'comandos', 'vistas', 'gestos', 'voces'];
const PERMISO = /^(red(:[\w*.-]+)?|archivos:.+|shell|pantalla|memoria|tareas|conversaciones|notificaciones)$/;
const NOMBRE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ID = /^[a-z][a-z0-9_-]{0,50}$/i;

// ---------- semver ----------
const parsear = v => { const m = String(v || '').trim().replace(/^v/, '').match(/^(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/i); return m ? [m[1], m[2], m[3]].map(x => (x === undefined || /x|\*/i.test(x) ? null : +x)) : null; };
const cmp = (a, b) => { for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return Math.sign(d); } return 0; };
function cumple(version, rango) {
  const v = parsear(version); if (!v) return false;
  const r = String(rango || '*').trim();
  if (!r || r === '*' || /^x$/i.test(r)) return true;
  return r.split('||').some(alt => alt.trim().split(/\s+/).every(c => {
    const m = c.match(/^(\^|~|>=|<=|>|<|=)?(.+)$/); if (!m) return false;
    const op = m[1] || '', b = parsear(m[2]); if (!b) return false;
    const base = b.map(x => x || 0);
    if (op === '>=') return cmp(v, base) >= 0;
    if (op === '<=') return cmp(v, base) <= 0;
    if (op === '>') return cmp(v, base) > 0;
    if (op === '<') return cmp(v, base) < 0;
    if (op === '^') { if (cmp(v, base) < 0) return false; const i = base[0] ? 0 : base[1] ? 1 : 2; return v.slice(0, i + 1).every((x, k) => x === base[k]); }
    if (op === '~') return cmp(v, base) >= 0 && v[0] === base[0] && (b[1] === null || v[1] === base[1]);
    return b.every((x, k) => x === null || x === v[k]);     // exacta o con comodines (1.x, 1.2.x)
  }));
}

// ---------- permisos ----------
// ¿"pedido" está cubierto por lo declarado? red:* / red cubre todo; red:*.dom cubre subdominios; archivos:<ruta> cubre lo de dentro
function declarado(lista, pedido) {
  const p = String(pedido || '').trim(); if (!p) return false;
  return (lista || []).some(d => {
    if (d === p) return true;
    if (p.startsWith('red:') && (d === 'red' || d === 'red:*')) return true;
    if (p.startsWith('red:') && d.startsWith('red:*.')) { const h = p.slice(4).toLowerCase(), suf = d.slice(5).toLowerCase(); return h.endsWith(suf) || h === suf.slice(1); }
    if (p.startsWith('archivos:') && d.startsWith('archivos:')) {
      const a = path.resolve(d.slice(9)).toLowerCase(), b = path.resolve(p.slice(9)).toLowerCase();
      return b === a || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep);
    }
    return false;
  });
}

// ---------- validación ----------
function validar(m, dir, versionSdk) {
  const err = t => { throw new Error(`${ARCHIVO}: ${t}`); };
  if (!m || typeof m !== 'object' || Array.isArray(m)) err('no es un objeto JSON');
  if (!NOMBRE.test(String(m.nombre || ''))) err('"nombre" obligatorio: minúsculas, números y guiones (máx. 41)');
  if (!parsear(m.version)) err('"version" obligatoria (semver, ej. 1.0.0)');
  const entrada = String(m.entrada || 'index.js').replace(/\\/g, '/');
  if (path.isAbsolute(entrada) || /^[a-z]:/i.test(entrada) || entrada.split('/').includes('..')) err('"entrada" debe ser relativa y sin ".."');
  if (dir && !fs.existsSync(path.join(dir, entrada))) err(`no existe la entrada "${entrada}"`);
  if (!m.apoloSdk) err('"apoloSdk" obligatorio (rango semver del SDK, ej. ^1.0.0)');
  if (versionSdk && !cumple(versionSdk, m.apoloSdk)) err(`requiere el SDK ${m.apoloSdk} y este APOLO trae el ${versionSdk}`);
  const permisos = m.permisos || [];
  if (!Array.isArray(permisos)) err('"permisos" debe ser una lista');
  for (const p of permisos) if (!PERMISO.test(String(p))) err(`permiso no válido "${p}" (red:dominio, archivos:ruta, shell, pantalla, memoria, tareas, conversaciones, notificaciones)`);
  const aporta = {};
  for (const k of APORTES) {
    const l = (m.aporta || {})[k] || [];
    if (!Array.isArray(l)) err(`aporta.${k} debe ser una lista`);
    aporta[k] = l.map(x => (typeof x === 'string' ? { nombre: x } : { ...x, nombre: String(x?.nombre || x?.id || '') }));
    for (const x of aporta[k]) if (!ID.test(x.nombre)) err(`aporta.${k}: nombre no válido "${x.nombre}"`);
  }
  for (const h of aporta.herramientas) if (h.riesgo !== undefined && !RIESGOS.includes(h.riesgo)) err(`aporta.herramientas ${h.nombre}: riesgo debe ser ${RIESGOS.join('|')}`);
  for (const v of aporta.vistas) {
    const a = String(v.archivo || '').replace(/\\/g, '/');
    if (!a || path.isAbsolute(a) || a.split('/').includes('..')) err(`aporta.vistas ${v.nombre}: "archivo" relativo obligatorio`);
    if (dir && !fs.existsSync(path.join(dir, a))) err(`aporta.vistas ${v.nombre}: no existe ${a}`);
  }
  return {
    nombre: m.nombre, version: String(m.version), descripcion: String(m.descripcion || '').slice(0, 1000), autor: String(m.autor || ''), licencia: String(m.licencia || ''),
    entrada, apoloSdk: String(m.apoloSdk), permisos: permisos.map(String), aporta,
  };
}

function leer(dir, versionSdk) {
  const f = path.join(dir, ARCHIVO);
  let txt; try { txt = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch { throw new Error(`no hay ${ARCHIVO} en ${dir}`); }
  let m; try { m = JSON.parse(txt); } catch (e) { throw new Error(`${ARCHIVO} no es JSON válido: ${e.message}`); }
  return validar(m, dir, versionSdk);
}

// carpetas con apolo-plugin.json dentro de "raiz" (la raíz primero; sin node_modules ni .git; profundidad 3)
function buscar(raiz, prof = 3) {
  const out = [];
  (function rec(d, n) {
    if (fs.existsSync(path.join(d, ARCHIVO))) { out.push(d); return; }
    if (n >= prof) return;
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) if (e.isDirectory() && !e.isSymbolicLink() && e.name !== 'node_modules' && !e.name.startsWith('.')) rec(path.join(d, e.name), n + 1);
  })(raiz, 0);
  return out;
}

module.exports = { ARCHIVO, RIESGOS, APORTES, cumple, declarado, validar, leer, buscar };
