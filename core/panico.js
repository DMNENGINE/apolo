// Kill switch global (FASE 9): un solo interruptor para TODO.
// activar(origen): cancela todos los turnos (sesiones, subagentes, consejo), suelta el control del ratón/teclado, para la grabación
// de demos, pausa tareas programadas / turno de noche / stream, deniega los permisos pendientes (núcleo + hooks vía bus 'panico')
// y bloquea los permisos NUEVOS que no sean de lectura hasta reanudar(). El estado se guarda en <nucleo>/panico.json: sobrevive a un reinicio.
// Llegan aquí: POST /v1/panico, Ctrl+Alt+Esc (main.js), botón del panel/isla/móvil, Stream Deck (Denegar largo), ojo (doble pulsación).
const fs = require('fs');
const path = require('path');

function crearPanico({ nucleo, ahora = Date.now }) {
  const n = nucleo;
  const f = path.join(n.cfg.dir, 'panico.json');
  let estado = { activo: false };
  try { const e = JSON.parse(fs.readFileSync(f, 'utf8')); if (e && e.activo) estado = e; } catch { }
  const guardar = () => { try { fs.writeFileSync(f, JSON.stringify(estado, null, 2)); } catch { } };
  const motivo = () => (estado.activo ? `PÁNICO activado (${estado.origen}): todo está parado hasta que el usuario pulse Reanudar` : '');
  n.permisos.ponerBloqueo?.(motivo);

  function cancelarTodo() {
    let turnos = 0;
    const ids = new Set();
    try { for (const a of n.subagentes?.lista?.() || []) if (a.estado === 'trabajando' || a.estado === 'esperando') ids.add(a.id || a.sesion); } catch { }
    try { for (const s of n.sesiones.lista()) if (n.agente.ocupada?.(s.id)) ids.add(s.id); } catch { }
    for (const id of ids) { try { if (n.agente.cancelar(id)) turnos++; } catch { } }
    try { for (const c of n.consejo?.enCurso?.() || []) n.consejo.cancelar(c.id); } catch { }
    return turnos;
  }

  function activar(origen = 'desconocido', { quien } = {}) {
    origen = String(origen || 'desconocido').slice(0, 60);
    const ya = estado.activo;
    if (!ya) { estado = { activo: true, desde: ahora(), origen }; guardar(); }
    const r = { turnos: 0, permisos: 0, control: 0 };
    r.permisos = n.permisos.denegarTodo?.('pánico', `pánico:${origen}`) || 0;
    try { r.control = n.control?.estado?.().length || 0; n.control?.soltarTodo?.(`pánico (${origen})`); } catch { }
    try { if (n.demo?.grabando?.()) n.demo.parar({ motivo: 'pánico' }).catch(() => { }); } catch { }
    r.turnos = cancelarTodo();
    try { n.turno?.parar?.(); } catch { }
    try { n.navegador?.detener?.(); } catch { }
    try { r.sandbox = require('./sandbox').matarTodo(); } catch { }          // Etapa H: jaulas (Job Object) y VMs de Windows Sandbox
    if (!ya) {
      n.auditoria?.registrar({ tipo: 'panico', decision: 'activar', quien: quien || origen, resumen: `turnos ${r.turnos}, permisos ${r.permisos}, control ${r.control}, sandbox ${r.sandbox || 0}` });
      n.registro?.add('aviso', 'PÁNICO', `activado desde ${origen}`);
      n.bus.emit('panico', { origen, ...r });                 // stream (silencio), main.js (hooks de Claude Code, isla, overlay), nodos…
      n.bus.emit('evento', { tipo: 'panico', activo: true, ...estado, ...r });
    }
    return { ...publico(), ...r };
  }
  function reanudar(quien = 'usuario') {
    if (!estado.activo) return publico();
    const antes = estado; estado = { activo: false, hasta: ahora(), ultimo: { origen: antes.origen, desde: antes.desde } }; guardar();
    n.auditoria?.registrar({ tipo: 'panico', decision: 'reanudar', quien: String(quien).slice(0, 60), resumen: `parado ${Math.round((ahora() - (antes.desde || ahora())) / 1000)} s` });
    n.registro?.add('ok', 'PÁNICO', `reanudado (${quien})`);
    try { n.stream?.reanudar?.(); } catch { }
    n.bus.emit('panico-fin', { quien });
    n.bus.emit('evento', { tipo: 'panico', activo: false });
    return publico();
  }
  const activo = () => !!estado.activo;
  const publico = () => ({ activo: !!estado.activo, desde: estado.desde || null, origen: estado.origen || null });
  // mientras dure: ninguna tarea programada arranca (tareas.js consulta n.panico.activo() vía el bloqueo de permisos y aquí)
  async function http(M, p, b = {}) {
    if (M === 'GET' && !p[2]) return publico();
    if (M === 'POST' && !p[2]) return activar(b.origen || 'api');
    if (M === 'POST' && p[2] === 'reanudar') return reanudar(b.quien || 'panel');
    throw Object.assign(new Error('ruta'), { status: 404 });
  }
  return { activar, reanudar, activo, estado: publico, motivo, http };
}

module.exports = { crearPanico };
