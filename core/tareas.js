// Tareas programadas (cron propio) + heartbeat.
//   cuando:  { en: 'YYYY-MM-DDTHH:mm' }   una vez (hora local)
//            { cron: 'm h dia mes diaSemana' }   repetir (cron estándar de 5 campos, hora local)
//            { cadaMin: N }               cada N minutos
//   accion:  { tipo: 'aviso', texto }     solo te lo recuerda
//            { tipo: 'agente', texto, modelo?, cwd?, soloSiHayAlgo? }   un agente lo hace y te dice el resultado
//            { tipo: 'interna', nombre }   función del núcleo (registrarInterna), p. ej. 'mejorar-skills'; si devuelve texto, se avisa
//                                         soloSiHayAlgo: si responde NADA no te molesta (heartbeat)
// Eventos en el bus: 'tarea' { tarea, texto, tipo: 'aviso'|'resultado'|'error' }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- cron ----------
function campo(txt, min, max) {
  const vals = new Set();
  for (const parte of String(txt).split(',')) {
    const [rango, paso = '1'] = parte.split('/');
    let a, b;
    if (rango === '*') { a = min; b = max; }
    else if (rango.includes('-')) [a, b] = rango.split('-').map(Number);
    else { a = +rango; b = parte.includes('/') ? max : a; }
    const p = +paso;
    if (![a, b, p].every(Number.isInteger) || a < min || b > max || a > b || p < 1) throw new Error(`campo cron inválido: "${parte}"`);
    for (let v = a; v <= b; v += p) vals.add(v);
  }
  return vals;
}
function parseCron(expr) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length !== 5) throw new Error('cron debe tener 5 campos: minuto hora día mes díaSemana');
  const dow = campo(f[4].replace(/\b7\b/g, '0'), 0, 6);
  return { min: campo(f[0], 0, 59), hora: campo(f[1], 0, 23), dia: campo(f[2], 1, 31), mes: campo(f[3], 1, 12), dow, diaLibre: f[2] === '*', dowLibre: f[4] === '*' };
}
function siguienteCron(expr, desde = Date.now()) {
  const c = parseCron(expr);
  const d = new Date(desde); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 400; i++) {
    const okDia = c.diaLibre && c.dowLibre ? true
      : c.diaLibre ? c.dow.has(d.getDay()) : c.dowLibre ? c.dia.has(d.getDate())
      : c.dia.has(d.getDate()) || c.dow.has(d.getDay());          // estándar cron: OR si ambos están restringidos
    if (c.mes.has(d.getMonth() + 1) && okDia) {
      for (let h = d.getHours(); h < 24; h++) {
        if (!c.hora.has(h)) continue;
        for (let m = h === d.getHours() ? d.getMinutes() : 0; m < 60; m++) {
          if (c.min.has(m)) { const r = new Date(d); r.setHours(h, m, 0, 0); return r.getTime(); }
        }
      }
    }
    d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0);
  }
  return null;
}

function siguiente(cuando, desde = Date.now()) {
  if (cuando.en) { const t = new Date(cuando.en).getTime(); if (isNaN(t)) throw new Error(`fecha inválida: ${cuando.en}`); return t > desde ? t : null; }
  if (cuando.cron) return siguienteCron(cuando.cron, desde);
  if (cuando.cadaMin) { const n = Number(cuando.cadaMin); if (!(n >= 1)) throw new Error('cadaMin debe ser ≥ 1'); return desde + n * 60_000; }
  throw new Error('indica "en", "cron" o "cadaMin"');
}

function describir(c) {
  if (c.en) return `una vez, ${c.en.replace('T', ' ')}`;
  if (c.cadaMin) return `cada ${c.cadaMin} min`;
  return `cron ${c.cron}`;
}

// ---------- tareas ----------
function crearTareas({ cfg, bus, ejecutarAgente }) {
  const f = path.join(cfg.dir, 'tareas.json');
  const fHist = path.join(cfg.dir, 'tareas_historial.jsonl');
  let lista = [], mtime = 0;
  // si otro proceso (CLI, otra app) cambió tareas.json, lo releemos antes de tocar nada
  const sync = () => { try { const m = fs.statSync(f).mtimeMs; if (m !== mtime) { lista = JSON.parse(fs.readFileSync(f, 'utf8')); mtime = m; } } catch { } };
  const guardar = () => { fs.writeFileSync(f, JSON.stringify(lista, null, 2)); try { mtime = fs.statSync(f).mtimeMs; } catch { } };
  sync();
  const corriendo = new Set();
  const internas = new Map();                 // nombre → async () => texto | ''
  const RECUPERAR_MS = 2 * 3600_000;          // si el PC estaba apagado: se recupera si se atrasó menos de 2 h

  function crear({ nombre, cuando, accion, canal = 'isla' }) {
    if (!accion || !['aviso', 'agente', 'interna'].includes(accion.tipo) || !(accion.tipo === 'interna' ? accion.nombre : accion.texto)) throw new Error('accion: { tipo: aviso|agente, texto } o { tipo: interna, nombre }');
    sync();
    const proxima = siguiente(cuando);
    if (!proxima) throw new Error('esa fecha ya pasó');
    const t = { id: crypto.randomUUID().slice(0, 6), nombre: String(nombre || accion.texto || accion.nombre).slice(0, 80), cuando, accion, canal, activa: true, creada: Date.now(), proxima, ultima: null, ultimoResultado: null };
    lista.push(t); guardar();
    return t;
  }
  function borrar(id) { sync(); const n = lista.length; lista = lista.filter(t => t.id !== id); guardar(); return lista.length < n; }
  function pausar(id, activa) { sync(); const t = lista.find(x => x.id === id); if (!t) return null; t.activa = activa; if (activa && !t.proxima) t.proxima = siguiente(t.cuando); guardar(); return t; }

  async function ejecutar(t) {
    if (corriendo.has(t.id)) return;
    corriendo.add(t.id);
    t.ultima = Date.now();
    try {
      if (t.accion.tipo === 'aviso') {
        t.ultimoResultado = 'avisado';
        bus.emit('tarea', { tarea: t, tipo: 'aviso', texto: t.accion.texto });
      } else if (t.accion.tipo === 'interna') {
        const fn = internas.get(t.accion.nombre);
        if (!fn) throw new Error(`tarea interna desconocida: ${t.accion.nombre}`);
        const r = String(await fn() || '');
        t.ultimoResultado = r ? r.slice(0, 500) : 'nada que hacer';
        if (r) bus.emit('tarea', { tarea: t, tipo: 'resultado', texto: r });
      } else {
        let prompt = t.accion.texto;
        if (t.accion.soloSiHayAlgo) prompt += '\n\n(Tarea automática. Si NO hay nada importante que contar al usuario, responde exactamente: NADA)';
        const r = String(await ejecutarAgente({ texto: prompt, modelo: t.accion.modelo, cwd: t.accion.cwd, canal: t.canal, titulo: `⏰ ${t.nombre}` }) || '');
        t.ultimoResultado = r.slice(0, 500);
        if (!(t.accion.soloSiHayAlgo && /^\W*NADA\W*$/i.test(r.trim()))) bus.emit('tarea', { tarea: t, tipo: 'resultado', texto: r });
      }
    } catch (e) {
      t.ultimoResultado = `error: ${e.message}`;
      bus.emit('tarea', { tarea: t, tipo: 'error', texto: e.message });
    } finally {
      corriendo.delete(t.id); guardar();
      // historial de ejecuciones (línea de tiempo y Wrapped): solo metadatos, el resultado recortado
      try { fs.appendFileSync(fHist, JSON.stringify({ t: t.ultima, fin: Date.now(), id: t.id, nombre: t.nombre, tipo: t.accion.tipo, interna: t.accion.nombre, ok: !String(t.ultimoResultado || '').startsWith('error'), resultado: String(t.ultimoResultado || '').slice(0, 160) }) + '\n'); } catch { }
    }
  }
  function historial({ desde = 0, hasta = Infinity } = {}) {
    try { return fs.readFileSync(fHist, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(x => x && x.t >= desde && x.t <= hasta); } catch { return []; }
  }

  let pausa = () => false;                                 // kill switch (core/panico.js): mientras dure, no arranca nada
  function tick(ahora = Date.now()) {
    if (pausa()) return;
    sync();
    let cambio = false;
    for (const t of lista) {
      if (!t.activa || !t.proxima || t.proxima > ahora) continue;
      const atraso = ahora - t.proxima;
      try { t.proxima = siguiente(t.cuando, ahora); } catch { t.proxima = null; }
      if (!t.proxima && t.cuando.en) t.activa = false;               // las de una vez se apagan tras dispararse
      cambio = true;
      if (atraso <= RECUPERAR_MS) ejecutar(t);
      else t.ultimoResultado = `saltada (el equipo estaba apagado ${Math.round(atraso / 60_000)} min)`;
    }
    if (cambio) guardar();
  }

  let timer = null;
  return {
    ponerPausa: fn => { pausa = typeof fn === "function" ? fn : () => false; },
    crear, borrar, pausar, ejecutar, tick, describir, historial,
    registrarInterna: (nombre, fn) => internas.set(nombre, fn),
    lista: () => { sync(); return lista; },
    obtener: id => { sync(); return lista.find(t => t.id === id); },
    iniciar() { if (!timer) { tick(); timer = setInterval(tick, 20_000); timer.unref?.(); } },
    parar() { clearInterval(timer); timer = null; },
  };
}

module.exports = { crearTareas, siguienteCron, siguiente, parseCron };
