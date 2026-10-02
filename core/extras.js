// Piezas del núcleo para el panel: personalidad editable, registros, historial de permisos, canales y estado del equipo.
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- personalidad: archivos .md que entran en el system prompt ----------
const PERSONALIDAD = {
  identidad: { titulo: 'Identidad', ayuda: 'Quién es tu asistente: nombre, carácter, forma de hablar.',
    inicial: '# Identidad\n\nTe llamas Robot Companion. Eres el compañero de trabajo del usuario: directo, cercano y útil.\n\n- Hablas claro y sin rodeos.\n- Si algo puede salir mal, lo dices antes de hacerlo.\n- No finjas: si no sabes algo, búscalo con tus herramientas.\n' },
  instrucciones: { titulo: 'Instrucciones', ayuda: 'Cómo debe trabajar: reglas, costumbres, lo que nunca debe hacer.',
    inicial: '# Instrucciones\n\n- Antes de borrar o sobrescribir algo, revisa qué hay.\n- Resume lo que hiciste al terminar.\n' },
  contexto: { titulo: 'Contexto', ayuda: 'Datos fijos útiles: tus equipos, carpetas, servidores, proyectos.',
    inicial: '# Contexto\n\n(Escribe aquí lo que el asistente debe tener siempre presente.)\n' },
};
// nombre del compañero: "**Name:** X" / "Nombre: X" / "Te llamas X" en identidad.md (lo trae también la importación de OpenClaw)
const RE_NOMBRE = /^[ \t>*-]*\**\s*(?:name|nombre)\s*:?\**\s*:?\s*\**\s*([^\n*]{1,40}?)\s*\**\s*$/im;
const RE_LLAMAS = /\bte llamas\s+([^\n.,;]{1,40})/i;
const NOMBRE_DEF = 'Robot';
function crearPersonalidad(cfg, bus) {
  const dir = path.join(cfg.dir, 'personalidad'); fs.mkdirSync(dir, { recursive: true });
  for (const [k, p] of Object.entries(PERSONALIDAD)) { const f = path.join(dir, `${k}.md`); if (!fs.existsSync(f)) fs.writeFileSync(f, p.inicial); }
  const leer = k => { try { return fs.readFileSync(path.join(dir, `${k}.md`), 'utf8'); } catch { return ''; } };
  const api = {
    lista: () => Object.entries(PERSONALIDAD).map(([k, p]) => ({ id: k, titulo: p.titulo, ayuda: p.ayuda, ruta: path.join(dir, `${k}.md`), contenido: leer(k) })),
    guardar(k, texto) {
      if (!PERSONALIDAD[k]) throw new Error('archivo desconocido');
      if (String(texto).length > 20000) throw new Error('máximo 20.000 caracteres');
      const antes = api.nombre();
      fs.writeFileSync(path.join(dir, `${k}.md`), String(texto));
      if (k === 'identidad' && bus && api.nombre() !== antes) bus.emit('evento', { tipo: 'identidad', nombre: api.nombre() });
    },
    nombre() {
      const t = leer('identidad'), m = RE_NOMBRE.exec(t) || RE_LLAMAS.exec(t);
      const n = m ? m[1].trim().replace(/[`_]/g, '') : '';
      return !n || /^robot companion$/i.test(n) ? NOMBRE_DEF : n;
    },
    ponerNombre(nuevo) {
      const n = String(nuevo || '').trim().replace(/[\n*`_]/g, '').slice(0, 40);
      if (!n) throw new Error('nombre vacío');
      let t = leer('identidad');
      if (RE_NOMBRE.test(t)) t = t.replace(RE_NOMBRE, l => l.replace(/(:\**\s*\**\s*)([^\n*]{1,40}?)(\s*\**\s*)$/, `$1${n}$3`));
      else if (RE_LLAMAS.test(t)) t = t.replace(RE_LLAMAS, `Te llamas ${n}`);
      else t = t.replace(/^(#[^\n]*\n)?/, h => `${h || '# Identidad\n'}\n- **Nombre:** ${n}\n`);
      api.guardar('identidad', t);
      return api.nombre();
    },
    restablecer(k) { if (PERSONALIDAD[k]) fs.writeFileSync(path.join(dir, `${k}.md`), PERSONALIDAD[k].inicial); },
    // texto para el system prompt (sin las plantillas vacías)
    prompt() {
      return Object.keys(PERSONALIDAD).map(leer).map(t => t.trim()).filter(t => t && !/^#[^\n]*\n+\(Escribe aquí/.test(t)).join('\n\n').slice(0, 24000);
    },
  };
  return api;
}

// ---------- registros: últimas 1000 líneas de lo que pasa en el núcleo ----------
function crearRegistro(bus) {
  const lineas = [];
  const add = (nivel, origen, texto) => {
    const l = { t: Date.now(), nivel, origen, texto: String(texto).slice(0, 500) };
    lineas.push(l); if (lineas.length > 1000) lineas.shift();
    bus.emit('registro', l);
  };
  bus.on('evento', e => {
    if (e.tipo === 'inicio') add('info', `sesión ${e.sesion}`, `empieza con ${e.modelo}`);
    else if (e.tipo === 'herramienta') add('info', `sesión ${e.sesion}`, `${e.nombre} ${e.resumen || ''}`);
    else if (e.tipo === 'resultado' && /^(error|DENEGADO)/.test(e.resultado)) add('aviso', `sesión ${e.sesion}`, `${e.nombre}: ${e.resultado.split('\n')[0]}`);
    else if (e.tipo === 'fin') add('info', `sesión ${e.sesion}`, `terminó (${e.uso.entrada}↑ ${e.uso.salida}↓ tokens)`);
    else if (e.tipo === 'error') add('error', `sesión ${e.sesion}`, e.error);
  });
  bus.on('permiso', r => add('aviso', 'permisos', `pide ${r.herramienta}: ${r.resumen}${r.peligro ? ` [PELIGRO: ${r.peligro}]` : ''}`));
  bus.on('permiso-resuelto', r => add('info', 'permisos', `${r.id} → ${r.decision}${r.motivo ? ` (${r.motivo})` : ''}`));
  bus.on('tarea', e => add(e.tipo === 'error' ? 'error' : 'info', 'tareas', `${e.tarea.nombre}: ${e.tipo} ${String(e.texto || '').slice(0, 120)}`));
  add('info', 'núcleo', 'iniciado');
  return { add, lista: (desde = 0) => lineas.filter(l => l.t > desde) };
}

// ---------- historial de permisos (30 días, en disco) ----------
function crearHistorialPermisos(cfg, bus) {
  const f = path.join(cfg.dir, 'permisos_historial.jsonl');
  const pedidos = new Map();
  bus.on('permiso', r => pedidos.set(r.id, r));
  bus.on('permiso-resuelto', ({ id, decision, motivo }) => {
    const r = pedidos.get(id); pedidos.delete(id);
    if (!r) return;
    fs.appendFileSync(f, JSON.stringify({ t: Date.now(), id, herramienta: r.herramienta, resumen: r.resumen, peligro: r.peligro, sesion: r.sesion, decision, motivo: motivo || '', espera: Date.now() - r.creado }) + '\n');
  });
  return {
    lista() {
      const desde = Date.now() - 30 * 86400_000;
      let l = []; try { l = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(x => x.t > desde); } catch { }
      return l.reverse().slice(0, 300);
    },
  };
}

// ---------- canales: los registra quien los tenga (app de escritorio, bots…) ----------
function crearCanales() {
  const m = new Map([
    ['web', { nombre: 'Panel web', tipo: 'web', estado: 'activo', detalle: 'Este panel' }],
    ['api', { nombre: 'API local', tipo: 'api', estado: 'activo', detalle: 'HTTP + SSE en 127.0.0.1' }],
  ]);
  return {
    registrar(id, datos) { m.set(id, { ...(m.get(id) || {}), ...datos, actualizado: Date.now() }); },
    lista: () => [...m.entries()].map(([id, c]) => ({ id, ...c })),
  };
}

// ---------- estado del equipo ----------
let cpuPrev = os.cpus().map(c => c.times);
function usoCpu() {
  const ahora = os.cpus().map(c => c.times);
  let ocupado = 0, total = 0;
  ahora.forEach((t, i) => {
    const p = cpuPrev[i] || t;
    const d = k => t[k] - p[k];
    const tot = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    ocupado += tot - d('idle'); total += tot;
  });
  cpuPrev = ahora;
  return total ? ocupado / total : 0;
}
function sistema(cfg) {
  const cpus = os.cpus();
  let disco = null;
  try { const s = fs.statfsSync(cfg.dir); disco = { total: s.blocks * s.bsize, libre: s.bavail * s.bsize, ruta: path.parse(cfg.dir).root }; } catch { }
  return {
    host: os.hostname(), so: `${os.type()} ${os.release()}`, arquitectura: os.arch(), node: process.version, pid: process.pid,
    cpu: { modelo: cpus[0]?.model?.trim() || '?', nucleos: cpus.length, uso: usoCpu() },
    memoria: { total: os.totalmem(), libre: os.freemem() },
    disco, encendidoSeg: Math.round(os.uptime()), nucleoSeg: Math.round(process.uptime()),
    ips: Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address),
    datos: cfg.dir,
  };
}

module.exports = { crearPersonalidad, crearRegistro, crearHistorialPermisos, crearCanales, sistema };
