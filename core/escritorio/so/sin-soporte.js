// Plataforma sin implementación (aún): misma interfaz que windows.js, pero cada función falla con un mensaje claro
// en lugar de un "powershell.exe: not found" críptico. El resto de APOLO (núcleo, modelos, panel, canales) funciona igual.
const { EventEmitter } = require('events');

module.exports = function sinSoporte(plataforma, pendiente = 'docs/portabilidad.md') {
  const nombre = { darwin: 'mac', linux: 'linux' }[plataforma] || plataforma;
  const msg = que => `${que} aún no está disponible en ${nombre} (solo Windows por ahora). Plan y estado: ${pendiente}`;
  const falla = que => () => Promise.reject(Object.assign(new Error(msg(que)), { codigo: 'SO_NO_SOPORTADO' }));
  // lanzarManos devuelve un "proceso" que se cierra enseguida: control.js ya trata el cierre del ayudante como error
  const lanzarManos = () => {
    const p = new EventEmitter();
    p.stdout = new EventEmitter(); p.stdout.setEncoding = () => { };
    p.stderr = new EventEmitter(); p.stdin = { write: () => false, end: () => { } };
    p.kill = () => { }; p.error = msg('El control del ratón y el teclado');
    setImmediate(() => p.emit('exit', 1));
    return p;
  };
  return {
    nombre, soportado: false,
    ejecutarPantalla: falla('Ver la pantalla'),
    lanzarManos,
    escribirEnTerminal: falla('Escribir en la terminal de una sesión'),
    abrirTerminal: () => { throw Object.assign(new Error(msg('Abrir una terminal nueva')), { codigo: 'SO_NO_SOPORTADO' }); },
    voz: { escuchar: falla('El reconocimiento de voz del sistema'), hablar: null },
  };
};
