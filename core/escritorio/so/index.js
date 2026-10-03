// Capa de sistema operativo del escritorio: todo lo que depende del SO para VER y ACTUAR pasa por aquí.
// Interfaz común (cada implementación exporta lo mismo):
//   nombre                      'windows' | 'mac' | 'linux'
//   soportado                   true si esta plataforma ya tiene implementación real
//   ejecutarPantalla(args, o)   → Promise<objeto JSON>  captura del monitor + elementos de la ventana activa (args estilo pantalla.ps1)
//   lanzarManos()               → ChildProcess con el protocolo JSON por líneas de manos.ps1 (stdin órdenes, stdout respuestas/eventos)
//   lanzarGrabadora()          → ChildProcess de grabar.ps1 (reuniones: mic + loopback en trozos WAV; JSON por líneas)
//   escribirEnTerminal(o)       → Promise   escribir texto en la terminal de una sesión ({ hwnd, archivo })
//   abrirTerminal(dir, args)    → abre una terminal nueva en dir ejecutando args (p. ej. ['claude', 'msg'])
//   voz: { hablar, escuchar }   TTS/STT del sistema como reserva cuando no hay edge-tts / whisper
// Ver docs/portabilidad.md para el plan por módulo.
const impl = { win32: './windows', darwin: './mac', linux: './linux' }[process.platform];
module.exports = impl ? require(impl) : require('./sin-soporte')(process.platform);
