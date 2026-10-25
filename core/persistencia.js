// Reemplazo atomico en el mismo volumen; nunca truncar el archivo de destino.
const fs = require('fs');
const crypto = require('crypto');
function escribirAtomico(archivo, contenido) {
  const tmp = archivo + '.tmp-' + crypto.randomUUID();
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, contenido); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, archivo);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
module.exports = { escribirAtomico };
