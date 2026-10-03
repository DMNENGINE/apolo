// Linux: pendiente. Plan (docs/portabilidad.md): captura con grim (Wayland) / import o xwd (X11), elementos con AT-SPI (python3-pyatspi),
// ratón/teclado con ydotool (Wayland) / xdotool (X11), terminal con x-terminal-emulator / gnome-terminal, voz con espeak-ng / whisper.
module.exports = require('./sin-soporte')('linux');
