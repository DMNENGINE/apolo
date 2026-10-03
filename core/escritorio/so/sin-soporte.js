// Plataforma sin implementación (aún): misma interfaz que windows.js, pero cada función falla con un mensaje claro
// en lugar de un "powershell.exe: not found" críptico. El resto de APOLO (núcleo, modelos, panel, canales) funciona igual.
const { EventEmitter } = require('events');

module.exports = function sinSoporte(plataforma, pendiente = 'docs/portabilidad.md') {
  const nombre = { darwin: 'mac', linux: 'linux' }[plataforma] || plataforma;
  const msg = que => `${que} aún no está disponible en ${nombre} (solo Windows por ahora). Plan y estado: ${pendiente}`;
  const falla = que => () => Promise.reject(Object.assign(new Error(msg(que)), { codigo: 'SO_NO_SOPORTADO' }));
  // lanzarManos devuelve un "proceso" que se cierra enseguida: control.js ya trata el cierre del ayudante como error
  const proceso = que => () => {
    const p = new EventEmitter();
    p.stdout = new EventEmitter(); p.stdout.setEncoding = () => { };
    p.stderr = new EventEmitter(); p.stdin = { write: () => false, end: () => { } };
    p.kill = () => { }; p.error = msg(que);
    setImmediate(() => p.emit('exit', 1));
    return p;
  };
  const lanzarManos = proceso('El control del ratón y el teclado');
  // grabadora de reuniones (mic + audio del sistema). Plan mac: ScreenCaptureKit (audio) + AVAudioEngine; linux: PipeWire/PulseAudio monitor (parec)
  const lanzarGrabadora = proceso('Grabar el audio de una reunión (micrófono + sistema)');
  return {
    nombre, soportado: false, lanzarFlujo: proceso('El escritorio remoto (ver la pantalla en vivo)'),
    ejecutarPantalla: falla('Ver la pantalla'),
    lanzarManos, lanzarGrabadora,
    escribirEnTerminal: falla('Escribir en la terminal de una sesión'),
    abrirTerminal: () => { throw Object.assign(new Error(msg('Abrir una terminal nueva')), { codigo: 'SO_NO_SOPORTADO' }); },
    voz: { escuchar: falla('El reconocimiento de voz del sistema'), hablar: null },
    // Modo Gamer (core/gamer): de momento solo Windows
    ...Object.fromEntries(['gamerPlanes', 'gamerPonerPlan', 'gamerProcesos', 'gamerSuspender', 'gamerReanudar', 'gamerCerrar', 'gamerPrioridad', 'gamerPonerPrioridad',
      'gamerLeerRegistro', 'gamerNoMolestar', 'gamerPonerNoMolestar', 'gamerMonitores', 'gamerInicio'].map(f => [f, falla(`El Modo Gamer (${f})`)])),
  };
};
