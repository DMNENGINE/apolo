// Rutas para procesos EXTERNOS (powershell, python, el node del sistema, Claude Code, Chrome, Stream Deck…).
// En la app instalada (.exe) el código vive dentro de resources/app.asar, que solo Electron sabe leer;
// lo que usan esos procesos se desempaqueta en resources/app.asar.unpacked (ver "asarUnpack" en package.json).
// En desarrollo y en la instalación de una línea (sin asar) devuelve la ruta tal cual.
const fuera = p => String(p).replace(/([\\/])app\.asar(?=[\\/]|$)/, '$1app.asar.unpacked');

module.exports = { fuera };
