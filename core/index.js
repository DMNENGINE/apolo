// Núcleo de Robot Companion: une configuración, proveedores de modelos, permisos, sesiones y el agente.
// Cualquier canal (isla, Discord, Telegram, CLI, web) habla con el núcleo; el núcleo habla con cualquier modelo.
const { EventEmitter } = require('events');
const { cargarConfig } = require('./config');
const { crearProveedores } = require('./proveedores');
const { crearPermisos } = require('./permisos');
const { crearSesiones } = require('./sesiones');
const { crearAgente } = require('./agente');
const { crearTareas } = require('./tareas');
const { crearMemoria } = require('./memoria');
const { crearEmbedder } = require('./vectores');
const extras = require('./extras');
const { crearEstructurado } = require('./estructurado');
const { crearCompactador } = require('./compactar');
const { crearSubagentes } = require('./subagentes');
const { crearControl } = require('./escritorio/control');
const { crearImportador } = require('./importador');
const { crearSkills } = require('./skills');
const { crearPlugins } = require('./plugins');
const consejoMod = require('./consejo');
const turnoMod = require('./turno');
const grafoMod = require('./grafo');

function crearNucleo(opciones = {}) {
  const cfg = cargarConfig(opciones.dir, { boveda: opciones.boveda });
  const bus = new EventEmitter(); bus.setMaxListeners(100);
  const proveedores = crearProveedores(cfg);
  const permisos = crearPermisos({ cfg, bus });
  const sesiones = crearSesiones({ cfg });
  const embedder = opciones.embedder !== undefined ? opciones.embedder : crearEmbedder(cfg);
  const memoria = crearMemoria({ cfg, embedder });
  const personalidad = extras.crearPersonalidad(cfg, bus);
  const registro = extras.crearRegistro(bus);
  const historialPermisos = extras.crearHistorialPermisos(cfg, bus);
  const canales = extras.crearCanales();
  const generarJSON = crearEstructurado(proveedores);
  const compactador = crearCompactador({ cfg, generarJSON, memoria, sesiones });
  let tareas = null, subagentes = null, control = null, navegador = null, nucleo = null, consejo = null, turno = null;
  const modeloCerebro = () => { const m = nucleo?.cerebro?.leer?.()?.modelo; return m && m.includes('/') ? m : cfg.modeloPorDefecto; };
  const skills = crearSkills({ cfg, bus, generarJSON: (...a) => (nucleo?.generarJSON || generarJSON)(...a), embedder, modelo: modeloCerebro, escaner: opciones.escaner,
    tokenGithub: () => nucleo?.extensiones?.conectores?.almacen?.secreto?.('srv:github'), fetchMarketplace: opciones.fetchMarketplace,
    ejecutarEval: async ({ modelo, texto }) => {                 // evals del taller: sesión efímera (canal 'eval', solo lectura) que se borra al acabar
      const s = sesiones.crear({ modelo, canal: 'eval', titulo: 'eval de skill' });
      try { return await agente.enviar(s, texto); } finally { sesiones.borrar(s.id); }
    } });
  const agente = crearAgente({ cfg, proveedores, permisos, sesiones, memoria, personalidad, compactador, skills, sandbox: () => nucleo?.sandbox, tareas: () => tareas, subagentes: () => subagentes, control: () => control, navegador: () => navegador, consejo: () => consejo, turnoNoche: () => turno });
  // atajo: enviar y emitir los eventos también al bus global
  const enviar = (s, texto, emitir) => agente.enviar(s, texto, e => { bus.emit('evento', e); emitir?.(e); });
  subagentes = crearSubagentes({ cfg, bus, sesiones, proveedores, enviar, cancelar: id => agente.cancelar(id) });
  // FASE 3 (manos de verdad): registro de capturas por sesión + comprobar tras cada acción + macros por demostración
  const registroCapturas = require('./escritorio/registro').crearRegistroCapturas({ cfg, sesiones, video: opciones.videoCapturas });
  let demo = null;
  control = crearControl({ cfg, bus, permisos, cancelarTurno: id => agente.cancelar(id), manos: opciones.manos, ojos: opciones.ojos, registro: registroCapturas,
    bloqueo: () => (demo?.grabando() ? 'se está grabando una demostración del usuario: espera a que pulse Parar'
      : nucleo?.escritorioRemoto?.activa?.() ? 'el usuario está usando el escritorio remoto desde el móvil: espera a que termine' : null) });
  demo = require('./escritorio/demo').crearDemo({ cfg, bus, permisos, control, taller: skills.taller,
    generarJSON: (...a) => (nucleo?.generarJSON || generarJSON)(...a), modelo: modeloCerebro });
  control.demo = demo;                                            // la herramienta grabar_demostracion lo encuentra por ctx.control
  navegador = require('./navegador').crearNavegador({ cfg, bus, permisos, cancelarTurno: id => agente.cancelar(id) });
  tareas = crearTareas({
    cfg, bus,
    ejecutarAgente: ({ texto, modelo, cwd, canal, titulo }) => enviar(sesiones.crear({ modelo, cwd, canal, titulo, tarea: true }), texto),
  });
  // FASE 6: consejo de modelos (debate + veredicto) y turno de noche (cola de encargos en worktrees + informe y vídeo matutino)
  const generarJSONvivo = (...a) => (nucleo?.generarJSON || generarJSON)(...a);
  consejo = consejoMod.crearConsejo({ cfg, bus, sesiones, proveedores, generarJSON: generarJSONvivo });
  turno = turnoMod.crearTurno({ cfg, bus, sesiones, enviar, cancelar: id => agente.cancelar(id), generarJSON: generarJSONvivo, registro, video: opciones.video,
    modeloInforme: modeloCerebro, horaBriefing: () => nucleo?.cerebro?.leer?.()?.resumenHora });
  require('./herramientas').registrar([consejoMod.HERRAMIENTA, ...turnoMod.HERRAMIENTAS]);
  const cancelarAgente = agente.cancelar;                         // "Detener" en Mission Control también para un consejo
  agente.cancelar = id => cancelarAgente(id) || consejo.cancelar(id);
  // mejora semanal de skills (cfg.skills.mejoraSemanal): propone diffs, nunca aplica
  tareas.registrarInterna('mejorar-skills', () => skills.taller.mejoraSemanal());
  try {
    const ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === 'mejorar-skills');
    if (cfg.skills?.mejoraSemanal && !ya) tareas.crear({ nombre: 'Mejora semanal de skills', cuando: { cron: '0 10 * * 1' }, accion: { tipo: 'interna', nombre: 'mejorar-skills' }, canal: 'isla' });
    else if (!cfg.skills?.mejoraSemanal && ya) tareas.borrar(ya.id);
  } catch { }
  // plugins (core/plugins + core/sdk): cada uno en su proceso; el escáner es el mismo antivirus de las skills
  const plugins = crearPlugins({ cfg, bus, permisos, memoria, tareas, proveedores, canales, sesiones, enviar, herramientas: require('./herramientas'), sandbox: () => nucleo?.sandbox,
    escaner: () => opciones.escaner || require('./skills/escaner').crearEscaner({ generarJSON: (...a) => (nucleo?.generarJSON || generarJSON)(...a), modelo: modeloCerebro() }),
    tokenGithub: () => nucleo?.extensiones?.conectores?.almacen?.secreto?.('srv:github'),
    // secretos de los plugins (slack:bot, matrix:token…): por defecto en la bóveda (DPAPI); la app puede poner el suyo con ponerSecretos
    secretos: cfg.boveda ? { leer: s => cfg.boveda.leer('plugin:' + s) || '', guardar: (s, v) => (v ? cfg.boveda.guardar('plugin:' + s, v) : cfg.boveda.borrar('plugin:' + s)) } : null });
  if (!opciones.sinPlugins) plugins.iniciar().catch(e => console.log(`[plugins] ${e.message}`));
  nucleo = { registrarHerramientas: require('./herramientas').registrar, extensiones: {}, cfg, bus, proveedores, permisos, sesiones, agente, tareas, memoria, personalidad, registro, historialPermisos, canales, enviar, generarJSON, compactador, subagentes, control, navegador, skills, plugins, consejo, turno };
  nucleo.extensiones.turno = { http: (...a) => turno.http(...a) };   // API /v1/turno (daemon → extensiones)
  Object.assign(nucleo, { demo, capturas: registroCapturas });
  nucleo.extensiones.capturas = { http: (...a) => registroCapturas.http(...a) };   // /v1/capturas ("Lo que hizo" + time-lapse)
  nucleo.extensiones.demo = { http: (...a) => demo.http(...a) };                   // /v1/demo (grabar demostración → skill)
  // FASE 4: memoria v2 — grafo, fases de sueño, línea de tiempo, privacidad y Wrapped
  const grafo = grafoMod.crearGrafo({ cfg, memoria });
  memoria.grafo = grafo;                                          // la herramienta explorar_grafo lo encuentra por ctx.memoria
  const sueno = require('./sueno').crearSueno({ cfg, bus, memoria, grafo, generarJSON: generarJSONvivo, modelo: modeloCerebro, registro, tareas,
    horaBriefing: () => nucleo?.cerebro?.leer?.()?.resumenHora });
  tareas.registrarInterna('sueno', async () => { await sueno.dormir({ motivo: 'noche' }); return ''; });   // el aviso llega a la hora del briefing
  require('./herramientas').registrar([grafoMod.HERRAMIENTA]);
  const linea = require('./linea').crearLinea({ cfg, sesiones, tareas, turno, consejo, sueno, historialPermisos, memoria, reuniones: () => nucleo.reuniones });
  const privacidad = require('./privacidad').crearPrivacidad({ cfg, memoria, grafo, sesiones, personalidad, registro, bus });
  // Estudio de Avatares (core/avatar.js + core/ui/avatar.js) → /v1/avatar; el del usuario sale en el Wrapped
  const avatar = require('./avatar').crearAvatar({ cfg, bus });
  const wrapped = require('./wrapped').crearWrapped({ cfg, sesiones, tareas, turno, consejo, sueno, memoria, personalidad, historialPermisos, avatar: () => avatar.svgDe('usuario') });
  Object.assign(nucleo, { grafo, sueno, linea, privacidad, wrapped });
  nucleo.extensiones.sueno = { http: async (M, p, b = {}) => {
    if (!p[2] && M === 'GET') return { config: sueno.conf(), enCurso: sueno.enCurso(), informes: sueno.informes(30) };
    if ((!p[2] || p[2] === 'ejecutar') && M === 'POST') return sueno.dormir({ motivo: 'manual' });
    if (p[2] === 'config' && M === 'PATCH') return { config: sueno.configurar(b) };
    if (p[2] && p[3] === 'deshacer' && M === 'POST') return sueno.deshacer(p[2]);
    if (p[2] && !p[3] && M === 'GET') { const i = sueno.leer(p[2]); if (!i) throw Object.assign(new Error('informe'), { status: 404 }); return i; }
    throw Object.assign(new Error('ruta'), { status: 404 });
  } };
  nucleo.extensiones.grafo = { http: async (M, p, b, q = {}) => {
    if (M !== 'GET') throw Object.assign(new Error('ruta'), { status: 404 });
    if (!p[2]) return grafo.datos({ min: +q.min || 0 });
    const r = grafo.explorar(decodeURIComponent(p[2])); if (!r) throw Object.assign(new Error('entidad'), { status: 404 }); return r;
  } };
  nucleo.extensiones.linea = { http: async (M, p, b, q = {}) => {
    if (M !== 'GET') throw Object.assign(new Error('ruta'), { status: 404 });
    return linea.consultar({ desde: q.desde, hasta: q.hasta, q: q.q, tipos: q.tipos ? String(q.tipos).split(',') : undefined, limite: q.limite });
  } };
  nucleo.extensiones.privacidad = { http: (...a) => privacidad.http(...a) };
  nucleo.extensiones.wrapped = { http: (...a) => wrapped.http(...a) };
  nucleo.avatar = avatar; nucleo.extensiones.avatar = { http: (...a) => avatar.http(...a) };
  // FASE 9: registro de auditoría encadenado + kill switch global
  const auditoria = require('./auditoria').crearAuditoria({ cfg, bus, boveda: cfg.boveda });
  permisos.ponerAuditoria(auditoria);
  nucleo.auditoria = auditoria; nucleo.extensiones.auditoria = { http: (...a) => auditoria.http(...a) };
  // Etapa H: sandbox por niveles para scripts de skills y shell de plugins de terceros (core/sandbox)
  const sandbox = require('./sandbox').crearSandbox({ cfg, auditoria });
  nucleo.sandbox = sandbox; nucleo.extensiones.sandbox = { http: (...a) => sandbox.http(...a) };
  const panico = require('./panico').crearPanico({ nucleo });
  nucleo.panico = panico; nucleo.extensiones.panico = { http: (...a) => panico.http(...a) };
  tareas.ponerPausa(() => panico.activo());
  bus.on('config-seguridad', e => auditoria.registrar({ tipo: 'seguridad', resumen: e.resumen, quien: e.quien || 'panel' }));
  // FASE 6: dashboards generados por el agente (core/dashboards.js) → /v1/dashboards
  const dashMod = require('./dashboards');
  const dashboards = dashMod.crearDashboards({ cfg, bus, permisos, nucleo: () => nucleo, generarJSON: generarJSONvivo,
    modelo: () => cfg.dashboards?.modeloAgente || modeloCerebro(), fetch: opciones.fetchDashboards, ejecutarComando: opciones.comandoDashboards });
  require('./herramientas').registrar(dashMod.HERRAMIENTAS);
  nucleo.dashboards = dashboards; nucleo.extensiones.dashboards = { http: (...a) => dashboards.http(...a) };
  // FASE 6: reuniones (subtítulos de Meet/Teams/Zoom vía la extensión o audio local mic+sistema → whisper → resumen) → /v1/reuniones
  const reunMod = require('./reuniones');
  const reuniones = reunMod.crearReuniones({ cfg, bus, navegador, generarJSON: generarJSONvivo, modelo: modeloCerebro, tareas, memoria,
    lanzarGrabadora: opciones.lanzarGrabadora, transcribir: opciones.transcribirReunion });
  require('./herramientas').registrar(reunMod.HERRAMIENTAS);
  nucleo.reuniones = reuniones; nucleo.extensiones.reuniones = { http: (...a) => reuniones.http(...a) };
  // ETAPA J: Modo Gamer (core/gamer) → /v1/gamer; al arrancar deshace una sesión que quedara abierta (cierre a medias)
  const gamer = require('./gamer').crearGamer({ cfg, bus, permisos, so: opciones.soGamer });
  nucleo.gamer = gamer; nucleo.extensiones.gamer = { http: (...a) => gamer.http(...a) };
  gamer.restaurarPendiente().catch(e => console.log(`[gamer] no se pudo restaurar: ${e.message}`));
  nucleo.importador = crearImportador({ cfg, memoria, generarJSON, personalidad, tareas, proveedores, skills, modelo: modeloCerebro });
  return nucleo;
}

module.exports = { crearNucleo, version: require('./package.json').version };
