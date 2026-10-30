// Memorias de los agentes de programación de la PC: APOLO busca los archivos de memoria (.md) que guardan Claude Code,
// Codex, Gemini CLI / Antigravity, Qwen Code, opencode, OpenClaw… y cualquier otro agente que deje sus notas en ~/.<agente>/
// (AGENTS.md, MEMORY.md, <AGENTE>.md o una carpeta memory/ / memories/), y absorbe en su memoria lo duradero sobre el usuario.
// Así, si el usuario importó su memoria de OpenClaw a Claude Code (o le contó algo a Codex), su APOLO también lo sabe.
//   - Al arrancar (la 1.ª vez = al instalar) lee todo; después vigila: cada cfg.memoriasAgentes.cadaMin (5) mira tamaños y
//     fechas, y los hooks de los agentes (bus 'motor-hook') adelantan la vuelta. Solo manda al modelo los archivos que cambiaron.
//   - Si el modelo falla (p. ej. Ollama aún no responde) el archivo NO se marca: se reintenta en la siguiente vuelta.
//   - Las claves se tapan antes de mandar el texto al modelo y memoria.recordar() rechaza lo que parezca un secreto.
// cfg.memoriasAgentes { activo (true), cadaMin (5), rutasExtra: [{ agente, ruta }], ignorar: ['codex', …] }.
// API /v1/memorias-agentes: GET = agentes detectados, archivos y última vuelta · POST = leer ya { forzar? }.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { extraerHechos } = require('./importador');

const DEF = { activo: true, cadaMin: 5 };
const MAX_ARCHIVO = 200 * 1024;
const MAX_POR_AGENTE = 300;
const TROZO = 24_000;
const MAX_TROZOS = 12;                                       // por vuelta; lo que no quepa se lee en la siguiente

// agentes conocidos: dir = carpeta en el home; archivos = rutas relativas; carpetas = se leen sus .md (recursivo)
const AGENTES = [
  { id: 'claude-code', nombre: 'Claude Code', dir: '.claude', archivos: ['CLAUDE.md'], carpetas: [], memoriaProyectos: true },
  { id: 'codex', nombre: 'Codex', dir: '.codex', archivos: ['AGENTS.md', 'AGENTS.override.md'], carpetas: ['memories', 'memory'] },
  { id: 'gemini', nombre: 'Gemini CLI', dir: '.gemini', archivos: ['GEMINI.md'], carpetas: [] },
  { id: 'antigravity', nombre: 'Antigravity', dir: path.join('.gemini', 'antigravity'), archivos: [], carpetas: ['knowledge'] },
  { id: 'qwen', nombre: 'Qwen Code', dir: '.qwen', archivos: ['QWEN.md', 'AGENTS.md'], carpetas: ['memories', 'memory'] },
  { id: 'opencode', nombre: 'opencode', dir: path.join('.config', 'opencode'), archivos: ['AGENTS.md'], carpetas: [] },
  { id: 'openclaw', nombre: 'OpenClaw', dir: path.join('.openclaw', 'workspace'), archivos: ['USER.md', 'MEMORY.md', 'IDENTITY.md'], carpetas: ['memory'] },
  { id: 'cursor', nombre: 'Cursor', dir: '.cursor', archivos: ['AGENTS.md'], carpetas: ['memories'] },
  { id: 'windsurf', nombre: 'Windsurf', dir: path.join('.codeium', 'windsurf'), archivos: [], carpetas: ['memories'] },
];
// carpetas del home que no son agentes (o que ya cubre la lista de arriba)
const NO_AGENTE = new Set(['.git', '.ssh', '.npm', '.cache', '.config', '.vscode', '.vs', '.nuget', '.gradle', '.m2', '.cargo', '.rustup',
  '.android', '.docker', '.local', '.ipython', '.jupyter', '.conda', '.pyenv', '.nvm', '.yarn', '.pnpm-store', '.bun', '.deno', '.dotnet',
  '.openclaw', '.agents', '.ollama', '.lmstudio', '.thumbnails', '.idlerc', '.matplotlib', '.keras', '.u2net', '.insightface']);

const sha = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 24);
function mdsDe(dir, max, out = []) {
  let ls = []; try { ls = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ls) {
    if (out.length >= max) break;
    const r = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') mdsDe(r, max, out);
    else if (e.isFile() && /\.md$/i.test(e.name) && !/\.robot-backup/.test(e.name)) out.push(r);
  }
  return out;
}

function crearMemoriasAgentes({ cfg, memoria, generarJSON, modelo, bus, registro, home = os.homedir() }) {
  const conf = () => ({ ...DEF, ...(cfg.memoriasAgentes || {}) });
  const dir = path.join(cfg.dir, 'memorias-agentes'), fEstado = path.join(dir, 'estado.json');
  const leerEstado = () => { try { return JSON.parse(fs.readFileSync(fEstado, 'utf8')); } catch { return { archivos: {}, vueltas: 0 }; } };
  const guardarEstado = est => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fEstado, JSON.stringify(est, null, 1)); };
  let enCurso = null, timer = null, pronto = null;

  // { id, nombre, raiz, archivos: [ruta] } de cada agente que existe en esta PC
  function detectar() {
    const ignorar = new Set(conf().ignorar || []), out = [];
    for (const a of AGENTES) {
      if (ignorar.has(a.id)) continue;
      const raiz = path.join(home, a.dir); if (!fs.existsSync(raiz)) continue;
      const archivos = [];
      for (const f of a.archivos) { const r = path.join(raiz, f); if (fs.existsSync(r)) archivos.push(r); }
      for (const c of a.carpetas) mdsDe(path.join(raiz, c), MAX_POR_AGENTE, archivos);
      if (a.memoriaProyectos) {                               // Claude Code: ~/.claude/projects/<proyecto>/memory/*.md
        let ps = []; try { ps = fs.readdirSync(path.join(raiz, 'projects')); } catch { }
        for (const p of ps) mdsDe(path.join(raiz, 'projects', p, 'memory'), MAX_POR_AGENTE, archivos);
      }
      out.push({ id: a.id, nombre: a.nombre, raiz, archivos: archivos.slice(0, MAX_POR_AGENTE) });
    }
    // agentes que no conocemos (DeepSeek, Kiro, Aider…): ~/.<x>/ con AGENTS.md, MEMORY.md, <X>.md o memory(ies)/
    let dot = []; try { dot = fs.readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory() && e.name.startsWith('.')).map(e => e.name); } catch { }
    const conocidos = new Set(AGENTES.map(a => a.dir.split(path.sep)[0]));
    for (const d of dot) {
      const id = d.slice(1).toLowerCase();
      if (conocidos.has(d) || NO_AGENTE.has(d) || ignorar.has(id)) continue;
      const raiz = path.join(home, d), archivos = [];
      for (const f of ['AGENTS.md', 'MEMORY.md', `${d.slice(1).toUpperCase()}.md`]) { const r = path.join(raiz, f); if (fs.existsSync(r)) archivos.push(r); }
      for (const c of ['memory', 'memories']) mdsDe(path.join(raiz, c), MAX_POR_AGENTE, archivos);
      if (archivos.length) out.push({ id, nombre: d.slice(1), raiz, archivos: archivos.slice(0, MAX_POR_AGENTE), generico: true });
    }
    for (const x of conf().rutasExtra || []) {                // { agente, ruta } (archivo o carpeta)
      const r = path.resolve(String(x.ruta || '')); let st; try { st = fs.statSync(r); } catch { continue; }
      out.push({ id: String(x.agente || 'extra'), nombre: String(x.agente || 'extra'), raiz: r, archivos: st.isDirectory() ? mdsDe(r, MAX_POR_AGENTE) : [r] });
    }
    return out;
  }

  // una vuelta: lee lo que cambió, lo manda al modelo por trozos y guarda los recuerdos
  async function leer({ forzar = false, avisar = true } = {}) {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const est = leerEstado(), primera = !est.vueltas, agentes = detectar(), pendientes = [];
      for (const a of agentes) for (const r of a.archivos) {
        let st; try { st = fs.statSync(r); } catch { continue; }
        if (!st.size || st.size > MAX_ARCHIVO) continue;
        const prev = est.archivos[r];
        if (!forzar && prev && prev.mtime === st.mtimeMs && prev.tam === st.size) continue;
        const texto = fs.readFileSync(r, 'utf8'), h = sha(texto);
        if (!forzar && prev?.hash === h) { est.archivos[r] = { ...prev, mtime: st.mtimeMs, tam: st.size }; continue; }
        pendientes.push({ agente: a, r, st, texto, h });
      }
      // trozos de ≤24k caracteres; un archivo solo se marca cuando su trozo salió bien
      const trozos = []; let cur = null;
      for (const p of pendientes) {
        const bloque = `### ${p.agente.nombre} · ${path.relative(home, p.r).replace(/\\/g, '/')}\n${p.texto.slice(0, TROZO)}`;
        if (!cur || cur.agente !== p.agente || cur.texto.length + bloque.length > TROZO) trozos.push(cur = { agente: p.agente, texto: '', archivos: [] });
        cur.texto += (cur.texto ? '\n\n' : '') + bloque; cur.archivos.push(p);
      }
      const res = { agentes: agentes.map(a => ({ id: a.id, nombre: a.nombre, archivos: a.archivos.length })), leidos: 0, creados: 0, actualizados: 0, errores: [], porAgente: {} };
      for (const t of trozos.slice(0, MAX_TROZOS)) {
        let hechos;
        try { hechos = (await extraerHechos({ generarJSON, modelo: modelo(), texto: t.texto, fuente: `la memoria de ${t.agente.nombre} (un agente de programación del usuario)` })).hechos; }
        catch (e) { res.errores.push(`${t.agente.nombre}: ${e.message}`); continue; }
        let n = 0;
        for (const h of hechos.slice(0, 40)) {
          try { const m = memoria.recordar({ texto: h.texto, tipo: h.tipo, origen: `memoria de ${t.agente.nombre}` }); m.accion === 'creada' ? res.creados++ : res.actualizados++; n++; } catch { }
        }
        for (const p of t.archivos) { est.archivos[p.r] = { agente: p.agente.id, mtime: p.st.mtimeMs, tam: p.st.size, hash: p.h, leido: Date.now() }; res.leidos++; }
        res.porAgente[t.agente.nombre] = (res.porAgente[t.agente.nombre] || 0) + n;
        guardarEstado(est);
      }
      if (trozos.length > MAX_TROZOS) res.quedan = trozos.length - MAX_TROZOS;
      est.vueltas = (est.vueltas || 0) + 1; est.ultima = { t: Date.now(), ...res, agentes: undefined };
      guardarEstado(est);
      if (res.errores.length) registro?.add?.('aviso', 'memorias-agentes', res.errores.join(' · '));
      const nuevos = Object.entries(res.porAgente).filter(([, n]) => n);
      if (avisar && nuevos.length && (primera || res.creados >= 3)) {
        bus?.emit('aviso-externo', { origen: 'APOLO', urgente: false,
          texto: `${primera ? 'Leí la memoria de tus agentes de programación' : 'Aprendí cosas nuevas de tus agentes de programación'}: ${nuevos.map(([a, n]) => `${a} (${n})`).join(', ')}. Ya lo tengo en mi memoria.` });
      }
      if (res.quedan) programarPronto(60_000);                // lo que faltó, en un minuto
      return res;
    })().finally(() => { enCurso = null; });
    return enCurso;
  }

  function programarPronto(ms = 20_000) {
    if (!conf().activo || pronto) return;
    pronto = setTimeout(() => { pronto = null; leer().catch(() => { }); }, ms); pronto.unref?.();
  }
  // la app la arranca (no los tests): primera vuelta a los 20 s (da tiempo a que los proveedores respondan) y luego cada cadaMin
  function iniciar() {
    if (!conf().activo || timer) return;
    programarPronto(20_000);
    timer = setInterval(() => leer().catch(() => { }), Math.max(1, conf().cadaMin) * 60_000); timer.unref?.();
    bus?.on?.('motor-hook', ev => { if (['Stop', 'SessionEnd', 'AfterAgent'].includes(ev?.hook_event_name)) programarPronto(30_000); });
  }
  function detener() { clearInterval(timer); clearTimeout(pronto); timer = pronto = null; }

  async function http(M, p, b = {}) {
    if (M === 'GET') {
      const est = leerEstado();
      return { conf: conf(), trabajando: !!enCurso, ultima: est.ultima || null,
        agentes: detectar().map(a => ({ id: a.id, nombre: a.nombre, raiz: a.raiz, generico: !!a.generico,
          archivos: a.archivos.map(r => ({ ruta: r, leido: est.archivos[r]?.leido || null })) })) };
    }
    if (M === 'POST') return leer({ forzar: !!b.forzar, avisar: false });
    throw Object.assign(new Error('método'), { status: 405 });
  }

  return { detectar, leer, iniciar, detener, http };
}

module.exports = { crearMemoriasAgentes, AGENTES };
