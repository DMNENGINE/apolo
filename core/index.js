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

function crearNucleo(opciones = {}) {
  const cfg = cargarConfig(opciones.dir);
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
  let tareas = null, subagentes = null, control = null, navegador = null, nucleo = null;
  const modeloCerebro = () => { const m = nucleo?.cerebro?.leer?.()?.modelo; return m && m.includes('/') ? m : cfg.modeloPorDefecto; };
  const skills = crearSkills({ cfg, bus, generarJSON: (...a) => (nucleo?.generarJSON || generarJSON)(...a), embedder, modelo: modeloCerebro, escaner: opciones.escaner,
    tokenGithub: () => nucleo?.extensiones?.conectores?.almacen?.secreto?.('srv:github') });
  const agente = crearAgente({ cfg, proveedores, permisos, sesiones, memoria, personalidad, compactador, skills, tareas: () => tareas, subagentes: () => subagentes, control: () => control, navegador: () => navegador });
  // atajo: enviar y emitir los eventos también al bus global
  const enviar = (s, texto, emitir) => agente.enviar(s, texto, e => { bus.emit('evento', e); emitir?.(e); });
  subagentes = crearSubagentes({ cfg, bus, sesiones, proveedores, enviar, cancelar: id => agente.cancelar(id) });
  control = crearControl({ cfg, bus, permisos, cancelarTurno: id => agente.cancelar(id), manos: opciones.manos });
  navegador = require('./navegador').crearNavegador({ cfg, bus, permisos, cancelarTurno: id => agente.cancelar(id) });
  tareas = crearTareas({
    cfg, bus,
    ejecutarAgente: ({ texto, modelo, cwd, canal, titulo }) => enviar(sesiones.crear({ modelo, cwd, canal, titulo, tarea: true }), texto),
  });
  nucleo = { registrarHerramientas: require('./herramientas').registrar, extensiones: {}, cfg, bus, proveedores, permisos, sesiones, agente, tareas, memoria, personalidad, registro, historialPermisos, canales, enviar, generarJSON, compactador, subagentes, control, navegador, skills };
  nucleo.importador = crearImportador({ cfg, memoria, generarJSON, personalidad, tareas, proveedores, skills, modelo: modeloCerebro });
  return nucleo;
}

module.exports = { crearNucleo, version: require('./package.json').version };
