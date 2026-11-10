const { pathToFileURL } = require('url');
// IPC solo desde la página principal de la isla… y, para ventanas propias de APOLO (p. ej. el menú de Ctrl+Alt+clic derecho),
// solo sus canales: permitir(archivo, prefijo) deja que ESE archivo use ÚNICAMENTE los canales que empiezan por `prefijo`.
const extras = [];
const urlDe = f => pathToFileURL(f).href;
function urlFrame(evento) {
  if (!evento?.senderFrame || evento.senderFrame !== evento.sender?.mainFrame) return null;
  try { const u = new URL(evento.senderFrame.url); u.hash = ''; u.search = ''; return u.href; } catch { return null; }
}
function esConfiable(evento, archivo, canal) {
  const u = urlFrame(evento); if (!u) return false;
  if (u === urlDe(archivo)) return true;
  return extras.some(x => u === x.url && typeof canal === 'string' && canal.startsWith(x.prefijo));
}
function permitir(archivo, prefijo) { if (prefijo) extras.push({ url: urlDe(archivo), prefijo }); }
function instalar(ipc, archivo) {
  const on = ipc.on, handle = ipc.handle;
  ipc.on = function (canal, fn) { return on.call(this, canal, (e, ...args) => { if (esConfiable(e, archivo, canal)) return fn(e, ...args); }); };
  ipc.handle = function (canal, fn) { return handle.call(this, canal, (e, ...args) => { if (!esConfiable(e, archivo, canal)) throw new Error('IPC: origen no autorizado'); return fn(e, ...args); }); };
}
module.exports = { esConfiable, instalar, permitir };
