// Subagentes + registro de "quién está haciendo qué" (lo que pinta el Mission Control del panel).
// - lanzar(): crea una sesión hija (padre = sesión que delega) y la hace trabajar en una subtarea; devuelve su informe.
//   Varias llamadas a "delegar" en la misma respuesta corren en paralelo (lo hace el agente). Los hijos no pueden delegar.
// - Registro: sigue TODAS las sesiones que trabajan (principales y subagentes) a partir de los eventos del bus.
// cfg.subagentes = { max: subagentes a la vez por sesión }

const INSTRUCCION = tarea => [
  'Eres un SUBAGENTE: el agente principal te encarga una subtarea concreta. El usuario no lee esta conversación.',
  'Trabaja de forma autónoma con tus herramientas, sin hacer preguntas: si te falta algo, decide lo razonable y dilo en el informe.',
  'Termina con un INFORME FINAL claro y conciso (es lo único que verá el agente principal): qué hiciste, qué encontraste y datos concretos.',
  '', 'TAREA:', tarea,
].join('\n');

function crearSubagentes({ cfg, bus, sesiones, proveedores, enviar, cancelar }) {
  const runs = new Map();                                  // sesion.id -> estado visible
  const max = () => cfg.subagentes?.max || 4;
  const publico = r => ({ ...r });
  let pendienteEmitir = new Set(), timer = null;
  const emitir = r => {                                    // agrupa: como mucho ~4 avisos por segundo
    pendienteEmitir.add(r.id);
    if (!timer) timer = setTimeout(() => { timer = null; for (const id of pendienteEmitir) { const x = runs.get(id); if (x) bus.emit('agente', publico(x)); } pendienteEmitir = new Set(); }, 250);
  };

  function registro(s) {
    let r = runs.get(s.id);
    if (!r) {
      r = { id: s.id, padre: s.padre || null, nombre: s.nombreAgente || s.titulo, modelo: s.modelo, canal: s.canal, tarea: s.tarea ? true : undefined,
        estado: 'quieto', inicio: 0, fin: 0, pasos: 0, herramienta: null, ultimo: '', uso: { entrada: 0, salida: 0 } };
      runs.set(s.id, r);
    }
    return r;
  }

  bus.on('evento', e => {
    const s = sesiones.obtener(e.sesion); if (!s) return;
    const r = registro(s);
    if (e.tipo === 'inicio') Object.assign(r, { estado: 'trabajando', inicio: Date.now(), fin: 0, pasos: 0, herramienta: null, error: undefined, modelo: s.modelo, nombre: s.nombreAgente || s.titulo });
    else if (e.tipo === 'herramienta') { r.pasos++; r.herramienta = { nombre: e.nombre, resumen: String(e.resumen || '').slice(0, 160), desde: Date.now() }; }
    else if (e.tipo === 'resultado') r.herramienta = null;
    else if (e.tipo === 'texto') r.ultimo = String(e.texto).slice(0, 300);
    else if (e.tipo === 'compactacion') r.compactada = (r.compactada || 0) + 1;
    else if (e.tipo === 'fin') Object.assign(r, { estado: ['incompleta', 'requiere_verificacion'].includes(e.estado) ? 'incompleto' : 'listo', fin: Date.now(), herramienta: null, uso: { ...e.uso }, ultimo: String(e.texto || r.ultimo).slice(0, 300) });
    else if (e.tipo === 'error') Object.assign(r, { estado: /cancelad/i.test(e.error) ? 'cancelado' : 'error', fin: Date.now(), herramienta: null, error: e.error });
    else return;
    emitir(r);
  });
  bus.on('permiso', p => { const r = p.sesion && runs.get(p.sesion); if (r) { r.esperando = p.id; emitir(r); } });
  bus.on('permiso-resuelto', p => { for (const r of runs.values()) if (r.esperando === p.id) { r.esperando = undefined; emitir(r); } });

  // motores externos (Claude Code, Gemini CLI, opencode): sus hooks llegan como 'motor-hook' y se ven en Mission Control como agentes más
  const MOTOR = { claude: ['Claude Code', 'claudecode/cli'], gemini: ['Gemini CLI', 'gemini/cli'], opencode: ['opencode', 'opencode/cli'] };
  const detalle = i => { i = i || {}; return String(i.url || i.query || i.command || i.file_path || i.pattern || i.path || i.prompt || i.description || '').replace(/\s+/g, ' '); };
  bus.on('motor-hook', ev => {
    if (!ev || !ev.session_id) return;
    const motor = MOTOR[ev._motor] ? ev._motor : 'claude', id = 'ext:' + String(ev.session_id).slice(-40), h = ev.hook_event_name;
    let r = runs.get(id);
    if (!r) {
      if (h === 'SessionEnd') return;
      const sitio = String(ev.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '';
      r = { id, padre: null, nombre: `${MOTOR[motor][0]}${sitio ? ' · ' + sitio : ''}`, modelo: MOTOR[motor][1], canal: motor, externo: motor,
        estado: 'quieto', inicio: 0, fin: 0, pasos: 0, herramienta: null, ultimo: '', uso: { entrada: 0, salida: 0 } };
      runs.set(id, r);
    }
    const tapar = t => { try { return require('./seguridad').redactar(t); } catch { return t; } };
    if (h === 'UserPromptSubmit' || h === 'SessionStart') { if (r.estado !== 'trabajando') Object.assign(r, { estado: h === 'SessionStart' ? 'quieto' : 'trabajando', inicio: Date.now(), fin: 0, pasos: 0, herramienta: null, error: undefined }); }
    else if (h === 'PreToolUse') Object.assign(r, { estado: 'trabajando', inicio: r.inicio || Date.now(), fin: 0, esperando: undefined, pasos: r.pasos + 1, herramienta: { nombre: String(ev.tool_name || '?'), resumen: tapar(detalle(ev.tool_input)).slice(0, 160), desde: Date.now() } });
    else if (h === 'PostToolUse') { r.herramienta = null; r.esperando = undefined; }
    else if (h === 'PermissionRequest') { r.esperando = 'ext'; r.estado = 'trabajando'; r.herramienta = { nombre: String(ev.tool_name || '?'), resumen: tapar(detalle(ev.tool_input)).slice(0, 160), desde: Date.now() }; }
    else if (h === 'Stop') Object.assign(r, { estado: 'listo', fin: Date.now(), herramienta: null, esperando: undefined, ultimo: tapar(String(ev.last_assistant_message || '')).slice(0, 300) });
    else if (h === 'StopFailure') Object.assign(r, { estado: 'error', fin: Date.now(), herramienta: null, esperando: undefined, error: String(ev.error || 'error').slice(0, 200) });
    else if (h === 'SessionEnd') Object.assign(r, { estado: r.estado === 'trabajando' ? 'listo' : r.estado, fin: r.fin || Date.now(), herramienta: null, esperando: undefined });
    else return;
    if (ev._usage?.ctx) { r.uso = { entrada: ev._usage.ctx, salida: ev._usage.out || 0 }; if (ev._usage.model) r.modelo = `${motor === 'claude' ? 'claudecode' : motor}/${ev._usage.model}`; }
    emitir(r);
  });

  async function lanzar({ padre, tarea, nombre, modelo, signal, perfil, dependencias = [] }) {
    tarea = String(tarea || '').trim();
    if (!tarea) throw new Error('falta la tarea');
    if (padre.padre) throw new Error('un subagente no puede delegar');
    if (signal?.aborted) throw new Error('cancelado');
    for (const id of dependencias) if (!runs.has(id) || runs.get(id).padre !== padre.id || runs.get(id).estado !== 'listo') throw new Error('dependencia no completada: ' + id);
    const activos = [...runs.values()].filter(r => r.padre === padre.id && r.estado === 'trabajando').length;
    if (activos >= max()) throw new Error(`ya hay ${activos} subagentes trabajando (máximo ${max()})`);
    const p = perfil && Object.hasOwn(cfg.subagentes?.perfiles || {}, perfil) ? cfg.subagentes.perfiles[perfil] : {};
    if (perfil && !Object.keys(p).length) throw new Error('perfil no configurado');
    const elegido = modelo || p.modelo;
    const m = elegido ? (cfg.alias[String(elegido).toLowerCase()] || String(elegido)) : padre.modelo;
    if (cfg.proveedores?.[padre.modelo?.split('/')[0]]?.local && !cfg.proveedores?.[m?.split('/')[0]]?.local && cfg.recuperacion?.permitirNube !== true) throw new Error('cambio local a nube no autorizado');
    proveedores.resolver(m);                               // lanza si el modelo no existe
    nombre = String(nombre || tarea).replace(/\s+/g, ' ').trim().slice(0, 40);
    const s = sesiones.crear({ modelo: m, cwd: padre.cwd, canal: 'subagente', titulo: `⤷ ${nombre}`, padre: padre.id, nombreAgente: nombre });
    s.soloLectura = !!padre.soloLectura || !!p.soloLectura; s.usuario = padre.usuario;
    if (padre.herramientasPermitidas || p.herramientas) s.herramientasPermitidas = (p.herramientas || padre.herramientasPermitidas).filter(n => !padre.herramientasPermitidas || padre.herramientasPermitidas.includes(n));
    if (padre._presupuesto) Object.defineProperty(s, '_presupuesto', { value: padre._presupuesto, configurable: true });
    registro(s);
    const parar = () => cancelar(s.id);
    signal?.addEventListener('abort', parar, { once: true });
    try {
      const texto = await enviar(s, INSTRUCCION(tarea)), estado = s.ultimaEjecucion?.estado;
      return { ok: !estado || estado === 'completada', estado, sesion: s.id, nombre, texto };
    }
    catch (e) { return { ok: false, sesion: s.id, nombre, texto: e.message }; }
    finally { signal?.removeEventListener('abort', parar); }
  }

  // lo que pinta el Mission Control: lo que trabaja ahora + lo terminado en las últimas 6 h (máx. 60)
  function lista() {
    const desde = Date.now() - 6 * 3600_000;
    return [...runs.values()].filter(r => r.estado === 'trabajando' || r.fin > desde)
      .sort((a, b) => (b.estado === 'trabajando') - (a.estado === 'trabajando') || (b.inicio - a.inicio)).slice(0, 60).map(publico);
  }

  return { lanzar, lista };
}

module.exports = { crearSubagentes };
