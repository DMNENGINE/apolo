// Piezas del núcleo para el panel: personalidad editable, registros, historial de permisos, canales y estado del equipo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { redactar } = require('./seguridad');

// ---------- personalidad: el alma (SOUL.md / IDENTITY.md / USER.md / instrucciones.md) vive en core/alma.js ----------
const crearPersonalidad = (cfg, bus) => require('./alma').crearAlma(cfg, bus);

// ---------- registros: últimas 1000 líneas de lo que pasa en el núcleo ----------
function crearRegistro(bus) {
  const lineas = [];
  const add = (nivel, origen, texto) => {
    const l = { t: Date.now(), nivel, origen: redactar(String(origen)).slice(0, 120), texto: redactar(String(texto)).slice(0, 500) };   // FASE 9: sin secretos en los registros
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
  bus.on('permiso-resuelto', ({ id, decision, motivo, quien }) => {
    const r = pedidos.get(id); pedidos.delete(id);
    if (!r) return;
    fs.appendFileSync(f, JSON.stringify({ t: Date.now(), id, herramienta: r.herramienta, resumen: redactar(String(r.resumen || '')), peligro: r.peligro, sesion: r.sesion, decision, quien: quien || '', motivo: motivo || '', espera: Date.now() - r.creado }) + '\n');
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
  const ocultos = new Set();          // p. ej. plugin:telegram:telegram cuando la app ya enseña "telegram" (canal con adaptador)
  return {
    registrar(id, datos) { m.set(id, { ...(m.get(id) || {}), ...datos, actualizado: Date.now() }); },
    ocultar(id, si = true) { if (si) ocultos.add(id); else ocultos.delete(id); },
    lista: () => [...m.entries()].filter(([id]) => !ocultos.has(id)).map(([id, c]) => ({ id, ...c })),
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
