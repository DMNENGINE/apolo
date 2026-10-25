const { pathToFileURL } = require('url');
function esConfiable(evento, archivo) {
  if (!evento?.senderFrame || evento.senderFrame !== evento.sender?.mainFrame) return false;
  try {
    const u = new URL(evento.senderFrame.url); u.hash = ''; u.search = '';
    return u.href === pathToFileURL(archivo).href;
  } catch { return false; }
}
function instalar(ipc, archivo) {
  const on = ipc.on, handle = ipc.handle;
  ipc.on = function (canal, fn) { return on.call(this, canal, (e, ...args) => { if (esConfiable(e, archivo)) return fn(e, ...args); }); };
  ipc.handle = function (canal, fn) { return handle.call(this, canal, (e, ...args) => { if (!esConfiable(e, archivo)) throw new Error('IPC: origen no autorizado'); return fn(e, ...args); }); };
}
module.exports = { esConfiable, instalar };
