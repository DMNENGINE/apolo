// Preparación automática de skills (Biblioteca DMN, docs/biblioteca.md): una skill trae `preparar.json` ("apolo-preparar/1")
// con lo que necesita para funcionar (programas, repos, entornos de Python, modelos a descargar, modelos de Ollama y su
// configuración). APOLO comprueba el equipo, enseña el plan (espacio, descargas, GPU) y, con el sí del usuario, lo deja todo listo.
//   · DECLARATIVO: no hay comandos libres. Programas solo de una lista cerrada (winget), descargas y repos solo https y de
//     hosts conocidos, destinos siempre dentro de {{apps}}, {{modelos}} o {{datos}} (sin salir con ..).
//   · Reanudable: las descargas van a .part con Range; cada paso hecho queda en <skill>/_datos/preparacion.json.
//   · Compartido: {{apps}} y {{modelos}} son comunes a todas las skills (ComfyUI o FLUX se bajan una vez).
// Variables: {{apps}} {{modelos}} {{skill}} {{datos}} (y en SKILL.md también {{config.<clave>}} → _datos/config.json).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const FORMATO = 'apolo-preparar/1';
const TIPOS = ['programa', 'git', 'python', 'descarga', 'ollama', 'config'];
// programas permitidos: id → { winget, cmd (para detectarlo) }
// rutas: dónde queda tras instalarlo con winget (el PATH del proceso no se refresca hasta reiniciar APOLO)
const LAD = process.env.LOCALAPPDATA || '', PF = process.env.ProgramFiles || 'C:\\Program Files';
const PROGRAMAS = {
  python: { winget: 'Python.Python.3.12', cmd: 'python', nombre: 'Python 3.12', version: /^Python 3\.(1[0-9])/,
    rutas: ['Python313', 'Python312', 'Python311', 'Python310'].map(v => path.join(LAD, 'Programs', 'Python', v, 'python.exe')) },
  git: { winget: 'Git.Git', cmd: 'git', nombre: 'Git', rutas: [path.join(PF, 'Git', 'cmd', 'git.exe')] },
  ffmpeg: { winget: 'Gyan.FFmpeg', cmd: 'ffmpeg', nombre: 'FFmpeg', rutas: [] },
  ollama: { winget: 'Ollama.Ollama', cmd: 'ollama', nombre: 'Ollama', rutas: [path.join(LAD, 'Programs', 'Ollama', 'ollama.exe')] },
  node: { winget: 'OpenJS.NodeJS.LTS', cmd: 'node', nombre: 'Node.js LTS', rutas: [path.join(PF, 'nodejs', 'node.exe')] },
  '7zip': { winget: '7zip.7zip', cmd: '7z', nombre: '7-Zip', rutas: [path.join(PF, '7-Zip', '7z.exe')] },
  // Blender: cualquier versión instalada (Program Files\Blender Foundation\Blender 4.xlender.exe), la más nueva primero
  blender: { winget: 'BlenderFoundation.Blender', cmd: 'blender', nombre: 'Blender', rutas: () => {
    try { const d = path.join(PF, 'Blender Foundation'); return fs.readdirSync(d).sort().reverse().map(v => path.join(d, v, 'blender.exe')); } catch { return []; }
  } },
};
const HOSTS_DESCARGA = ['huggingface.co', 'cdn-lfs.huggingface.co', 'cdn-lfs-us-1.huggingface.co', 'cas-bridge.xethub.hf.co', 'github.com', 'objects.githubusercontent.com',
  'release-assets.githubusercontent.com', 'raw.githubusercontent.com', 'codeload.github.com', 'download.pytorch.org', 'files.pythonhosted.org', 'pypi.org'];
const HOSTS_GIT = ['github.com', 'huggingface.co'];
const HOSTS_PIP = ['download.pytorch.org', 'pypi.org'];
const GB = 1024 ** 3;

const hostOk = (url, lista) => { try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && lista.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; } };
const PAQUETE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?\s*((==|>=|<=|~=|!=|<|>)\s*[A-Za-z0-9.*+!_-]+\s*,?\s*)*$/;

function rutasBase(cfg) {
  const base = cfg.skills?.dirRecursos || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'APOLO-recursos');
  return { base, apps: path.join(base, 'apps'), modelos: path.join(base, 'modelos') };
}
const dentro = (f, d) => { const r = path.relative(d, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

// sustituye {{apps}} {{modelos}} {{skill}} {{datos}} y comprueba que la ruta queda dentro de una raíz permitida
function expandir(texto, vars) { return String(texto ?? '').replace(/\{\{\s*(apps|modelos|skill|datos)\s*\}\}/g, (_, k) => vars[k]); }
// valor de config: si es una ruta ({{modelos}}/x) queda con las barras del sistema
const valorConfig = (v, vars) => (typeof v !== 'string' ? v : /^\{\{\s*(apps|modelos|skill|datos)\s*\}\}/.test(v) ? path.normalize(expandir(v, vars)) : expandir(v, vars));
function rutaSegura(plantilla, vars, { soloEscribibles = true } = {}) {
  const t = String(plantilla || '');
  if (!/^\{\{\s*(apps|modelos|datos|skill)\s*\}\}/.test(t)) throw new Error(`ruta "${t}": debe empezar por {{apps}}, {{modelos}} o {{datos}}`);
  const f = path.resolve(expandir(t, vars));
  const raices = soloEscribibles ? [vars.apps, vars.modelos, vars.datos] : [vars.apps, vars.modelos, vars.datos, vars.skill];
  if (!raices.some(r => dentro(f, path.resolve(r)))) throw new Error(`ruta "${t}" sale de las carpetas permitidas`);
  return f;
}

// ---------- leer y validar ----------
function leerPlan(dirSkill) {
  const f = path.join(dirSkill, 'preparar.json');
  if (!fs.existsSync(f)) return null;
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { throw new Error(`preparar.json no es JSON válido: ${e.message}`); }
  return j;
}

// devuelve { errores: [], avisos: [] }. Con errores la skill NO se prepara.
function validar(plan) {
  const errores = [], avisos = [];
  if (!plan || typeof plan !== 'object') return { errores: ['plan vacío'], avisos };
  if (plan.formato !== FORMATO) errores.push(`formato desconocido (se esperaba ${FORMATO})`);
  const pasos = Array.isArray(plan.pasos) ? plan.pasos : [];
  // requisitos externos: lo que solo puede instalar el usuario (Roblox Studio, una cuenta…); se enseñan con su enlace, no se ejecutan
  const ext = plan.requisitos?.externos;
  if (ext !== undefined) {
    if (!Array.isArray(ext) || ext.length > 8) errores.push('requisitos.externos debe ser una lista (máx. 8)');
    else for (const x of ext) {
      if (!x || typeof x.nombre !== 'string' || !x.nombre.trim() || x.nombre.length > 60) errores.push('requisito externo sin nombre válido');
      if (x?.url !== undefined && !/^https:\/\/[^\s]+$/.test(String(x.url))) errores.push(`requisito externo "${x?.nombre}": la url debe ser https`);
      if (x?.detalle !== undefined && String(x.detalle).length > 240) errores.push(`requisito externo "${x?.nombre}": detalle demasiado largo`);
    }
  }
  if (!pasos.length && !(Array.isArray(ext) && ext.length)) errores.push('no hay pasos');
  if (pasos.length > 60) errores.push('demasiados pasos (máx. 60)');
  const ids = new Set();
  const vars = { apps: path.resolve('/A'), modelos: path.resolve('/M'), skill: path.resolve('/S'), datos: path.resolve('/S/_datos') };
  const ruta = (p, k, o) => { try { rutaSegura(p[k], vars, o); } catch (e) { errores.push(`${p.id}: ${e.message}`); } };
  for (const p of pasos) {
    if (!p || typeof p !== 'object' || !/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(p.id || '')) { errores.push(`paso sin id válido: ${JSON.stringify(p).slice(0, 60)}`); continue; }
    if (ids.has(p.id)) errores.push(`id repetido: ${p.id}`); ids.add(p.id);
    if (!TIPOS.includes(p.tipo)) { errores.push(`${p.id}: tipo "${p.tipo}" no permitido (${TIPOS.join(', ')})`); continue; }
    if (p.tipo === 'programa' && !PROGRAMAS[p.programa]) errores.push(`${p.id}: programa "${p.programa}" no está en la lista permitida (${Object.keys(PROGRAMAS).join(', ')})`);
    if (p.tipo === 'git') {
      if (!hostOk(p.repo, HOSTS_GIT)) errores.push(`${p.id}: repo no permitido (https de ${HOSTS_GIT.join(' o ')})`);
      if (!p.ref) avisos.push(`${p.id}: repo sin versión fija (ref); se baja lo último`);
      ruta(p, 'destino');
    }
    if (p.tipo === 'python') {
      ruta(p, 'venv');
      if (p.requisitos) ruta(p, 'requisitos', { soloEscribibles: false });
      for (const x of p.paquetes || []) if (!PAQUETE.test(String(x))) errores.push(`${p.id}: paquete no válido "${x}"`);
      if (p.indice && !hostOk(p.indice, HOSTS_PIP)) errores.push(`${p.id}: índice de pip no permitido`);
      if ((p.paquetes || []).some(x => !/==/.test(x))) avisos.push(`${p.id}: hay paquetes sin versión fija`);
    }
    if (p.tipo === 'descarga') {
      if (!hostOk(p.url, HOSTS_DESCARGA)) errores.push(`${p.id}: descarga de un host no permitido (${String(p.url).slice(0, 80)})`);
      ruta(p, 'destino');
      if (!/^[a-f0-9]{64}$/i.test(p.sha256 || '')) avisos.push(`${p.id}: sin sha256; no se puede comprobar que el archivo es el bueno`);
      if (!(p.bytes > 0)) avisos.push(`${p.id}: sin tamaño declarado`);
    }
    if (p.tipo === 'ollama' && !/^[a-z0-9][a-z0-9._/-]*(:[a-z0-9._-]+)?$/i.test(p.modelo || '')) errores.push(`${p.id}: modelo de Ollama no válido`);
    if (p.tipo === 'config') {
      if (!p.valores || typeof p.valores !== 'object' || Array.isArray(p.valores)) errores.push(`${p.id}: config sin "valores"`);
      else for (const [k, v] of Object.entries(p.valores)) {
        if (!/^[a-z][a-z0-9_]{0,40}$/i.test(k)) errores.push(`${p.id}: clave de config no válida "${k}"`);
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') errores.push(`${p.id}: el valor de "${k}" debe ser texto, número o sí/no`);
      }
    }
  }
  return { errores, avisos };
}

// ---------- equipo ----------
const correr = (cmd, args, o = {}) => new Promise(ok => execFile(cmd, args, { windowsHide: true, timeout: o.timeout || 15_000, ...o }, (e, out, er) => ok({ code: e ? (e.code ?? 1) : 0, out: String(out || ''), err: String(er || '') })));
async function detectarEquipo(base, { ejecutar = correr } = {}) {
  const eq = { so: process.platform, ramGB: os.totalmem() / GB, gpu: null, discoLibreGB: null };
  try {
    const r = await ejecutar('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
    const l = r.code === 0 && r.out.trim().split(/\r?\n/)[0];
    if (l) { const [nombre, mem] = l.split(',').map(s => s.trim()); eq.gpu = { fabricante: 'nvidia', nombre, vramGB: Number(mem) / 1024 }; }
  } catch { }
  try { let d = base; while (!fs.existsSync(d)) d = path.dirname(d); const s = fs.statfsSync(d); eq.discoLibreGB = (s.bavail * s.bsize) / GB; } catch { }
  return eq;
}
async function hayComando(cmd, ejecutar = correr) { const r = await ejecutar(process.platform === 'win32' ? 'where' : 'which', [cmd], { timeout: 8000 }); return r.code === 0; }
// ruta del programa que funciona de verdad (rutas de winget primero; python: versión real, no el atajo de la Microsoft Store) o null
async function ejecutable(id, ejecutar = correr) {
  const pr = PROGRAMAS[id]; if (!pr) return null;
  const cands = [...(typeof pr.rutas === 'function' ? pr.rutas() : pr.rutas).filter(r => { try { return fs.existsSync(r); } catch { return false; } }), pr.cmd];
  for (const c of cands) {
    if (pr.version) { const r = await ejecutar(c, ['--version'], { timeout: 10_000 }); if (r.code === 0 && pr.version.test((r.out + r.err).trim())) return c; continue; }
    if (c !== pr.cmd || await hayComando(c, ejecutar)) return c;
  }
  return null;
}

// ---------- motor ----------
function crearPreparador({ cfg, bus, almacen, fetch: traer = (...a) => globalThis.fetch(...a), ejecutar = correr, lanzar = spawn, ollamaUrl } = {}) {
  const trabajos = new Map();                                     // slug → { estado, paso, progreso, cancelar }
  const urlOllama = () => (ollamaUrl || cfg.proveedores?.ollama?.baseUrl || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const avisar = (slug, datos) => bus?.emit?.('evento', { tipo: 'skills', accion: 'preparar', slug, ...datos });

  function contexto(slug) {
    const s = almacen.obtener(slug);
    if (!s) { const e = new Error(`no hay ninguna skill "${slug}"`); e.status = 404; throw e; }
    const plan = leerPlan(s.dir);
    const r = rutasBase(cfg), datos = path.join(s.dir, '_datos');
    return { s, plan, vars: { apps: r.apps, modelos: r.modelos, skill: s.dir, datos }, fEstado: path.join(datos, 'preparacion.json') };
  }
  const leerEstado = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { pasos: {} }; } };
  const guardarEstado = (f, e) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(e, null, 2)); };
  const huella = p => crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0, 16);

  // ¿este paso ya está hecho? (sin descargar nada)
  async function hecho(p, vars, est) {
    const marca = est.pasos?.[p.id];
    switch (p.tipo) {
      case 'programa': return !!(await ejecutable(p.programa, ejecutar));
      case 'git': return fs.existsSync(path.join(rutaSegura(p.destino, vars), '.git'));
      case 'python': return marca?.estado === 'hecho' && marca.huella === huella(p) && fs.existsSync(rutaSegura(p.venv, vars));
      case 'descarga': {
        const f = rutaSegura(p.destino, vars);
        if (!fs.existsSync(f)) return false;
        if (p.bytes && fs.statSync(f).size !== p.bytes) return false;
        return !p.sha256 || (marca?.estado === 'hecho' && marca.sha256 === p.sha256);
      }
      case 'ollama': {
        try { const j = await (await traer(urlOllama() + '/api/tags', { signal: AbortSignal.timeout(4000) })).json(); const tag = m => (m.includes(':') ? m : m + ':latest'); return (j.models || []).some(m => tag(m.name) === tag(p.modelo)); } catch { return false; }
      }
      case 'config': {
        try { const c = JSON.parse(fs.readFileSync(path.join(vars.datos, 'config.json'), 'utf8')); return Object.entries(p.valores).every(([k, v]) => c[k] === valorConfig(v, vars)); } catch { return false; }
      }
    }
    return false;
  }

  // diagnóstico: lo que hay, lo que falta, cuánto ocupa y si el equipo cumple
  async function diagnostico(slug) {
    const { s, plan, vars, fEstado } = contexto(slug);
    if (!plan) return { slug: s.slug, tienePlan: false, listo: true };
    const { errores, avisos } = validar(plan);
    const est = leerEstado(fEstado), eq = await detectarEquipo(vars.apps, { ejecutar }), req = plan.requisitos || {};
    const pasos = [];
    if (!errores.length) for (const p of plan.pasos) {
      let ok = false; try { ok = await hecho(p, vars, est); } catch (e) { errores.push(`${p.id}: ${e.message}`); }
      pasos.push({ id: p.id, tipo: p.tipo, nombre: p.nombre || p.id, estado: ok ? 'hecho' : 'pendiente', ...(p.bytes ? { bytes: p.bytes } : {}),
        detalle: p.tipo === 'programa' ? PROGRAMAS[p.programa]?.nombre : p.tipo === 'ollama' ? p.modelo : p.tipo === 'descarga' ? path.basename(String(p.destino)) : p.tipo === 'git' ? String(p.repo).replace(/^https:\/\//, '') : p.tipo === 'python' ? `${(p.paquetes || []).length} paquetes${p.requisitos ? ' + requirements' : ''}` : '' });
    }
    const faltaBytes = pasos.filter(p => p.estado === 'pendiente').reduce((n, p) => n + (p.bytes || 0), 0);
    const problemas = [];
    if (Array.isArray(req.so) && req.so.length && !req.so.includes(eq.so)) problemas.push(`necesita ${req.so.join(' o ')}; este equipo es ${eq.so}`);
    if (req.gpu?.vramGB) {
      if (!eq.gpu) problemas.push(`necesita una GPU ${req.gpu.fabricante || ''} con ${req.gpu.vramGB} GB de VRAM y no se encontró ninguna`.replace('  ', ' '));
      else if (eq.gpu.vramGB + 0.3 < req.gpu.vramGB) problemas.push(`necesita ${req.gpu.vramGB} GB de VRAM; tu ${eq.gpu.nombre} tiene ${eq.gpu.vramGB.toFixed(1)} GB`);
    }
    if (req.ramGB && eq.ramGB + 0.5 < req.ramGB) problemas.push(`necesita ${req.ramGB} GB de RAM; hay ${eq.ramGB.toFixed(0)} GB`);
    const necesitaGB = Math.max(req.discoGB || 0, faltaBytes / GB * 1.1);
    if (eq.discoLibreGB != null && necesitaGB > eq.discoLibreGB) problemas.push(`necesita ~${necesitaGB.toFixed(0)} GB libres en ${path.parse(vars.apps).root}; hay ${eq.discoLibreGB.toFixed(0)} GB`);
    const t = trabajos.get(s.slug);
    return {
      slug: s.slug, tienePlan: true, errores, avisos, problemas, equipo: eq, requisitos: req, pasos, descargaBytes: faltaBytes,
      externos: (Array.isArray(req.externos) ? req.externos : []).map(x => ({ nombre: String(x.nombre), ...(x.url ? { url: String(x.url) } : {}), ...(x.detalle ? { detalle: String(x.detalle) } : {}) })),
      carpetas: { base: rutasBase(cfg).base, apps: vars.apps, modelos: vars.modelos }, listo: !errores.length && pasos.every(p => p.estado === 'hecho'),
      puede: !errores.length && !problemas.length, trabajo: t ? { estado: t.estado, paso: t.paso, progreso: t.progreso, error: t.error } : est.ultimo || null,
    };
  }

  // ---------- pasos ----------
  async function descargar(p, vars, o) {
    const f = rutaSegura(p.destino, vars), part = f + '.part';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    let ya = fs.existsSync(part) ? fs.statSync(part).size : 0;
    const cab = { 'user-agent': 'APOLO-preparar', ...(ya ? { range: `bytes=${ya}-` } : {}) };
    // espejo local (cfg.skills.espejo, p. ej. otro PC de casa con tools/espejo-recursos.js): pide el archivo por su sha256 y,
    // si no lo tiene o no responde, va al original. El sha256 se comprueba igual, así que el espejo no puede colar otro archivo
    let r = null;
    const espejo = String(cfg.skills?.espejo || '').replace(/\/+$/, '');
    if (espejo && /^https?:\/\//i.test(espejo) && /^[a-f0-9]{64}$/i.test(p.sha256 || '')) {
      try { r = await traer(`${espejo}/sha256/${p.sha256.toLowerCase()}`, { headers: cab, signal: o.signal }); if (!r.ok && r.status !== 416) r = null; else o.progreso({ fase: 'desde el espejo local' }); } catch { r = null; }
    }
    if (!r) r = await traer(p.url, { headers: cab, redirect: 'follow', signal: o.signal });
    if (r.status === 416) ya = 0;
    else if (!r.ok) throw new Error(`HTTP ${r.status} al descargar ${path.basename(f)}`);
    if (ya && r.status !== 206) ya = 0;                             // el servidor no reanuda: empezar de cero
    const total = p.bytes || (Number(r.headers.get('content-length')) || 0) + ya;
    const out = fs.createWriteStream(part, { flags: ya ? 'a' : 'w' });
    let n = ya, ultimo = 0;
    try {
      if (r.status !== 416) for await (const trozo of r.body) {
        if (o.signal?.aborted) throw new Error('cancelado');
        if (!out.write(trozo)) await new Promise(ok => out.once('drain', ok));
        n += trozo.length;
        if (Date.now() - ultimo > 500) { ultimo = Date.now(); o.progreso({ bytes: n, total }); }
      }
    } finally { await new Promise(ok => out.end(ok)); }
    if (p.bytes && fs.statSync(part).size !== p.bytes) throw new Error(`${path.basename(f)}: tamaño ${fs.statSync(part).size} ≠ ${p.bytes}`);
    if (p.sha256) {
      o.progreso({ bytes: n, total, fase: 'comprobando' });
      const h = crypto.createHash('sha256');
      await new Promise((ok, ko) => fs.createReadStream(part).on('data', d => h.update(d)).on('end', ok).on('error', ko));
      if (h.digest('hex') !== p.sha256.toLowerCase()) { fs.rmSync(part, { force: true }); throw new Error(`${path.basename(f)}: el sha256 no coincide (archivo corrupto o cambiado); se borró`); }
    }
    fs.renameSync(part, f);
    return { sha256: p.sha256 || '' };
  }
  // proceso con salida línea a línea (la última línea va al progreso)
  function proceso(cmd, args, o) {
    return new Promise((ok, ko) => {
      const c = lanzar(cmd, args, { cwd: o.cwd, windowsHide: true, env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });
      const cola = [];
      const linea = d => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) { cola.push(l.trim()); if (cola.length > 20) cola.shift(); o.progreso?.({ linea: l.trim().slice(0, 200) }); } };
      c.stdout?.on('data', linea); c.stderr?.on('data', linea);
      const abortar = () => { try { c.kill(); } catch { } };
      o.signal?.addEventListener('abort', abortar, { once: true });
      c.on('error', ko);
      c.on('close', code => { o.signal?.removeEventListener('abort', abortar); code === 0 ? ok() : ko(new Error(`${path.basename(cmd)} terminó con código ${code}: ${cola.slice(-3).join(' | ').slice(0, 300)}`)); });
    });
  }
  const pythonDe = venv => path.join(venv, process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  async function ejecutarPaso(p, vars, o) {
    switch (p.tipo) {
      case 'programa': {
        const pr = PROGRAMAS[p.programa];
        if (process.platform !== 'win32') throw new Error(`instala ${pr.nombre} con el gestor de paquetes de tu sistema`);
        // muchos instaladores (Git, Node, 7-Zip…) son para todo el equipo: Windows enseña su aviso de permiso y hay que pulsar Sí
        o.progreso?.({ fase: `Instalando ${pr.nombre}. Si Windows pregunta si permites cambios, pulsa «Sí».` });
        try { await proceso('winget', ['install', '--id', pr.winget, '-e', '--silent', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements'], o); }
        catch (e) {
          if (/cancel|0x8a15010c|2316632332|1223/i.test(e.message)) throw new Error(`no se instaló ${pr.nombre}: se canceló el permiso de administrador de Windows. Vuelve a pulsar Preparar y, cuando Windows pregunte, pulsa «Sí»`);
          throw e;
        }
        if (!(await ejecutable(p.programa, ejecutar))) throw new Error(`${pr.nombre} se instaló pero no lo encuentro todavía; cierra y abre APOLO y vuelve a pulsar Preparar`);
        return {};
      }
      case 'git': {
        const d = rutaSegura(p.destino, vars);
        fs.mkdirSync(path.dirname(d), { recursive: true });
        await proceso(await ejecutable('git', ejecutar) || 'git', ['clone', '--depth', '1', ...(p.ref ? ['--branch', p.ref] : []), p.repo, d], o);
        return {};
      }
      case 'python': {
        const venv = rutaSegura(p.venv, vars);
        if (!fs.existsSync(pythonDe(venv))) await proceso(await ejecutable('python', ejecutar) || (process.platform === 'win32' ? 'python' : 'python3'), ['-m', 'venv', venv], o);
        const py = pythonDe(venv), base = ['-m', 'pip', 'install', '--no-input', ...(p.indice ? [p.soloIndice ? '--index-url' : '--extra-index-url', p.indice] : [])];
        if ((p.paquetes || []).length) await proceso(py, [...base, ...p.paquetes], o);
        if (p.requisitos) await proceso(py, [...base, '-r', rutaSegura(p.requisitos, vars, { soloEscribibles: false })], o);
        return { huella: huella(p) };
      }
      case 'descarga': return descargar(p, vars, o);
      case 'ollama': {
        const r = await traer(urlOllama() + '/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: p.modelo, stream: true }), signal: o.signal });
        if (!r.ok) throw new Error(`Ollama respondió ${r.status} (¿está abierto?)`);
        let resto = '';
        for await (const trozo of r.body) {
          resto += Buffer.from(trozo).toString('utf8');
          const ls = resto.split('\n'); resto = ls.pop();
          for (const l of ls) { if (!l.trim()) continue; let j; try { j = JSON.parse(l); } catch { continue; } if (j.error) throw new Error(`Ollama: ${j.error}`); o.progreso({ linea: j.status, ...(j.total ? { bytes: j.completed || 0, total: j.total } : {}) }); }
        }
        return {};
      }
      case 'config': {
        const f = path.join(vars.datos, 'config.json');
        let c = {}; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
        for (const [k, v] of Object.entries(p.valores)) c[k] = valorConfig(v, vars);
        fs.mkdirSync(vars.datos, { recursive: true }); fs.writeFileSync(f, JSON.stringify(c, null, 2));
        return {};
      }
    }
    throw new Error(`tipo desconocido ${p.tipo}`);
  }

  // prepara la skill en segundo plano; devuelve el diagnóstico inicial. forzar = aunque el equipo no cumpla
  async function preparar(slug, { forzar = false } = {}) {
    const d = await diagnostico(slug);
    if (!d.tienePlan) return d;
    if (d.errores.length) throw Object.assign(new Error(`el plan de la skill no es válido: ${d.errores.join('; ')}`), { status: 400 });
    if (d.problemas.length && !forzar) throw Object.assign(new Error(`este equipo no cumple: ${d.problemas.join('; ')}`), { status: 409 });
    if (trabajos.get(d.slug)?.estado === 'preparando') return d;
    const { plan, vars, fEstado } = contexto(d.slug);
    const ctl = new AbortController(), t = { estado: 'preparando', paso: '', progreso: null, cancelar: () => ctl.abort() };
    trabajos.set(d.slug, t);
    (async () => {
      const est = leerEstado(fEstado);
      est.ultimo = { estado: 'preparando', forzar, fecha: new Date().toISOString() };   // si APOLO se reinicia a medias, al arrancar sigue solo
      guardarEstado(fEstado, est);
      try {
        for (const p of plan.pasos) {
          if (ctl.signal.aborted) throw new Error('cancelado');
          if (await hecho(p, vars, est).catch(() => false)) continue;
          t.paso = p.id; t.progreso = null; avisar(d.slug, { estado: 'paso', paso: p.id });
          const extra = await ejecutarPaso(p, vars, { signal: ctl.signal, cwd: vars.datos && fs.existsSync(vars.datos) ? vars.datos : undefined,
            progreso: x => { t.progreso = { ...t.progreso, ...x }; avisar(d.slug, { estado: 'progreso', paso: p.id, progreso: t.progreso }); } });
          est.pasos[p.id] = { estado: 'hecho', fecha: new Date().toISOString(), ...extra };
          guardarEstado(fEstado, est);
        }
        t.estado = 'listo'; t.paso = ''; est.ultimo = { estado: 'listo', fecha: new Date().toISOString() };
      } catch (e) {
        t.estado = ctl.signal.aborted ? 'cancelado' : 'error'; t.error = e.message;
        est.ultimo = { estado: t.estado, paso: t.paso, error: e.message, fecha: new Date().toISOString() };
      }
      guardarEstado(fEstado, est);
      avisar(d.slug, { estado: t.estado, ...(t.error ? { error: t.error } : {}) });
    })();
    return { ...d, trabajo: { estado: 'preparando' } };
  }
  function cancelar(slug) { const t = trabajos.get(String(slug)); if (t?.estado === 'preparando') { t.cancelar(); return true; } return false; }

  // texto de SKILL.md con {{apps}} {{modelos}} {{skill}} {{datos}} y {{config.x}} ya resueltos (para usar_skill)
  function resolverTexto(slug, texto) {
    let ctx; try { ctx = contexto(slug); } catch { return texto; }
    let conf = {}; try { conf = JSON.parse(fs.readFileSync(path.join(ctx.vars.datos, 'config.json'), 'utf8')); } catch { }
    return expandir(String(texto), ctx.vars).replace(/\{\{\s*config\.([a-z0-9_]+)\s*\}\}/gi, (m, k) => (conf[k] != null ? String(conf[k]) : m));
  }

  // al arrancar APOLO: reanuda las preparaciones que quedaron a medias (reinicio, actualización, apagón). Lo hecho no se repite
  // y las descargas siguen desde su .part
  function reanudar() {
    for (const s of almacen.lista?.() || []) {
      let est; try { est = JSON.parse(fs.readFileSync(path.join(s.dir, '_datos', 'preparacion.json'), 'utf8')); } catch { continue; }
      if (est.ultimo?.estado !== 'preparando' || trabajos.has(s.slug)) continue;
      console.log(`[preparar] reanudo la preparación de ${s.slug}`);
      preparar(s.slug, { forzar: !!est.ultimo.forzar }).catch(e => {
        console.log(`[preparar] no pude reanudar ${s.slug}: ${e.message}`);
        try { est.ultimo = { estado: 'error', error: e.message, fecha: new Date().toISOString() }; guardarEstado(path.join(s.dir, '_datos', 'preparacion.json'), est); } catch { }
      });
    }
  }
  if (!process.env.NODE_TEST_CONTEXT && !process.execArgv.includes('--test')) { const t = setTimeout(reanudar, 15_000); t.unref?.(); }

  return { diagnostico, preparar, cancelar, resolverTexto, reanudar, estado: slug => trabajos.get(slug) || null };
}

// estado rápido (sin tocar el equipo ni la red): undefined = no necesita preparación · 'pendiente' · 'preparando' · 'lista' · 'error'
function estadoRapido(dir) {
  if (!dir || !fs.existsSync(path.join(dir, 'preparar.json'))) return undefined;
  try { const e = JSON.parse(fs.readFileSync(path.join(dir, '_datos', 'preparacion.json'), 'utf8')).ultimo?.estado; return e === 'listo' ? 'lista' : e === 'preparando' ? 'preparando' : e === 'error' ? 'error' : 'pendiente'; }
  catch { return 'pendiente'; }
}

module.exports = { crearPreparador, estadoRapido, ejecutable, validar, leerPlan, rutaSegura, expandir, rutasBase, PROGRAMAS, HOSTS_DESCARGA, FORMATO };
