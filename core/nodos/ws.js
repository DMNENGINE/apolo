// WebSocket mínimo (RFC 6455) SIN dependencias: solo lo que usan los nodos de hardware.
// El protocolo (frames, lector, Conexion) vive en core/sdk/ws-cliente.js, compartido con el cliente de los plugins.
// - aceptar(req, socket, head): handshake (Sec-WebSocket-Accept = base64(sha1(clave + GUID))) → Conexion
// - Conexion (EventEmitter): 'texto' (string), 'binario' (Buffer), 'cerrar' ({codigo, motivo})
//   enviarTexto(s) · enviarBinario(buf) · ping() · cerrar(codigo, motivo)
// Reglas que se cumplen: los frames del cliente DEBEN ir enmascarados (si no → 1002); fragmentación (opcode 0);
// ping → pong automático; close → se devuelve el close y se cierra el socket; mensajes > maxBytes → 1009.
// Sin extensiones (permessage-deflate no se negocia) ni subprotocolos.
const { aceptarClave, frame, crearLector, Conexion } = require('../sdk/ws-cliente');

// handshake de servidor sobre el evento 'upgrade' de http. Devuelve Conexion o null (y responde 400)
function aceptar(req, socket, head, opciones = {}) {
  const clave = req.headers['sec-websocket-key'];
  const ok = req.method === 'GET' && /websocket/i.test(req.headers.upgrade || '') && /upgrade/i.test(req.headers.connection || '')
    && clave && Buffer.from(clave, 'base64').length === 16 && String(req.headers['sec-websocket-version']) === '13';
  if (!ok) { socket.end('HTTP/1.1 400 Bad Request\r\nSec-WebSocket-Version: 13\r\n\r\n'); return null; }
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${aceptarClave(clave)}`, '', ''].join('\r\n'));
  if (head && head.length) socket.unshift(head);
  return new Conexion(socket, opciones);
}

module.exports = { aceptar, aceptarClave, frame, crearLector, Conexion };
