// Fuentes de plugins: carpeta local · .zip · .tgz · URL a un zip · GitHub (owner/repo[/ruta][@ref]) · npm ("npm:paquete", "@scope/pkg", "paquete@1.2").
// Reutiliza traer() de core/skills/instalar.js (carpeta/zip/URL/GitHub). npm: `npm pack --ignore-scripts` + extraer; NUNCA se ejecutan scripts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFile } = require('child_process');
const { crearInstalador } = require('../skills/instalar');
const M = require('./manifest');

const MAX_ARCHIVOS = 8000, MAX_BYTES = 300 * 1024 * 1024;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-plugin-'));
const sh = (cmd, o = {}) => new Promise((ok, mal) => exec(cmd, { windowsHide: true, timeout: 300_000, maxBuffer: 16e6, ...o }, (e, so, se) => (e ? mal(new Error(String(se || e.message).trim().split('\n').slice(-4).join(' ').slice(0, 400))) : ok(so))));
const tar = () => (process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar');
const extraerTgz = (f, d) => new Promise((ok, mal) => { fs.mkdirSync(d, { recursive: true }); execFile(tar(), ['-xzf', f, '-C', d], { windowsHide: true, timeout: 120_000 }, e => (e ? mal(new Error(`no pude extraer ${path.basename(f)}: ${e.message}`)) : ok(d))); });

// ¿es un paquete npm? (explícito con npm:, @scope/pkg, o un nombre suelto que no es una ruta)
function specNpm(f) {
  if (/^npm:/i.test(f)) return f.slice(4).trim();
  if (fs.existsSync(f)) return null;
  if (/^@[\w.-]+\/[\w.-]+(@[\w.^~*-]+)?$/.test(f)) return f;
  if (/^[a-z0-9][\w.-]*(@[\w.^~*-]+)?$/i.test(f) && !/\.(zip|tgz)$/i.test(f)) return f;
  return null;
}

async function traerNpm(spec) {
  if (!/^[\w@./~^*:-]+$/.test(spec)) throw new Error(`nombre de paquete npm no válido: "${spec}"`);   // sin espacios ni metacaracteres de shell
  const t = tmp();
  try {
    await sh(`npm pack ${spec} --ignore-scripts --json`, { cwd: t });
    const archivo = fs.readdirSync(t).find(x => x.endsWith('.tgz'));
    if (!archivo) throw new Error('npm pack no devolvió ningún paquete');
    await extraerTgz(path.join(t, archivo), path.join(t, 'x'));
    return { raiz: path.join(t, 'x', 'package'), origen: { tipo: 'npm', fuente: spec }, limpiar: () => fs.rmSync(t, { recursive: true, force: true }) };
  } catch (e) { fs.rmSync(t, { recursive: true, force: true }); throw e; }
}

// fuente → { raiz, origen, nombre ("#nombre" para elegir), limpiar }
async function traer(fuente, { cfg, tokenGithub } = {}) {
  let f = String(fuente || '').trim();
  if (!f) throw new Error('falta la fuente');
  const spec = specNpm(f);
  if (spec) return traerNpm(spec);
  if (/\.(tgz|tar\.gz)$/i.test(f) && fs.existsSync(f)) {
    const t = tmp(); await extraerTgz(path.resolve(f), path.join(t, 'x'));
    return { raiz: path.join(t, 'x'), origen: { tipo: 'tgz', fuente: path.resolve(f) }, limpiar: () => fs.rmSync(t, { recursive: true, force: true }) };
  }
  const tr = await crearInstalador({ almacen: null, cfg: cfg || {}, escaner: null, tokenGithub }).traer(f);
  return { raiz: tr.raiz, origen: { ...tr.base, ...(tr.sha ? { sha: tr.sha } : {}) }, nombre: tr.nombre, limpiar: tr.limpiar };
}

// qué plugin de la fuente: uno → ese; varios → el de "#nombre" o la lista de opciones
function elegir(tr) {
  const dirs = M.buscar(tr.raiz);
  if (!dirs.length) throw new Error(`no hay ningún ${M.ARCHIVO} en la fuente`);
  const info = dirs.map(d => { try { return { d, m: JSON.parse(fs.readFileSync(path.join(d, M.ARCHIVO), 'utf8').replace(/^\uFEFF/, '')) }; } catch { return { d, m: {} }; } });
  if (tr.nombre) {
    const x = info.find(x => x.m.nombre === tr.nombre || path.basename(x.d) === tr.nombre);
    if (!x) throw new Error(`la fuente no trae ningún plugin "${tr.nombre}" (hay: ${info.map(x => x.m.nombre || path.basename(x.d)).join(', ')})`);
    return { dir: x.d };
  }
  if (info.length === 1) return { dir: info[0].d };
  return { opciones: info.map(x => ({ nombre: x.m.nombre || path.basename(x.d), descripcion: String(x.m.descripcion || '').slice(0, 300), ruta: path.relative(tr.raiz, x.d).split(path.sep).join('/') })) };
}

function comprobarTamano(d) {
  let n = 0, bytes = 0;
  (function rec(x) {
    for (const e of fs.readdirSync(x, { withFileTypes: true })) {
      const f = path.join(x, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (e.name !== '.git') rec(f); continue; }
      if (++n > MAX_ARCHIVOS) throw new Error(`el plugin tiene demasiados archivos (> ${MAX_ARCHIVOS})`);
      bytes += fs.statSync(f).size;
      if (bytes > MAX_BYTES) throw new Error('el plugin es demasiado grande (> 300 MB)');
    }
  })(d);
}
// copia sin .git ni enlaces simbólicos (un zip podría apuntar fuera)
const copiar = (de, a) => fs.cpSync(de, a, { recursive: true, filter: s => path.basename(s) !== '.git' && !fs.lstatSync(s).isSymbolicLink() });

// dependencias de producción, sin scripts de instalación
async function instalarDependencias(dir) {
  let pkg; try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return false; }
  if (!Object.keys(pkg.dependencies || {}).length || fs.existsSync(path.join(dir, 'node_modules'))) return false;
  await sh('npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock', { cwd: dir });
  return true;
}

module.exports = { traer, elegir, copiar, comprobarTamano, instalarDependencias, specNpm };
