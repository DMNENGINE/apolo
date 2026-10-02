// WebSocket mínimo (RFC 6455) SIN dependencias: solo lo que usan los nodos de hardware.
// - aceptar(req, socket, head): handshake (Sec-WebSocket-Accept = base64(sha1(clave + GUID))) → Conexion
// - Conexion (EventEmitter): 'texto' (string), 'binario' (Buffer), 'cerrar' ({codigo, motivo})
//   enviarTexto(s) · enviarBinario(buf) · ping() · cerrar(codigo, motivo)
// Reglas que se cumplen: los frames del cliente DEBEN ir enmascarados (si no → 1002); fragmentación (opcode 0);
// ping → pong automático; close → se devuelve el close y se cierra el socket; mensajes > maxBytes → 1009.
// Sin extensiones (permessage-deflate no se negocia) ni subprotocolos.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const aceptarClave = clave => crypto.createHash('sha1').update(clave + GUID).digest('base64');

// construye un frame (servidor → cliente: sin máscara; mascara=true solo para el cliente de pruebas)
function frame(opcode, datos, mascara = false) {
  const len = datos.length;
  const cab = [0x80 | opcode];
  const m = mascara ? 0x80 : 0;
  if (len < 126) cab.push(m | len);
  else if (len < 65536) cab.push(m | 126, len >> 8, len & 255);
  else { cab.push(m | 127, 0, 0, 0, 0); const b = Buffer.alloc(4); b.writeUInt32BE(len); cab.push(...b); }
  if (!mascara) return Buffer.concat([Buffer.from(cab), datos]);
  const k = crypto.randomBytes(4), out = Buffer.from(datos);
  for (let i = 0; i < out.length; i++) out[i] ^= k[i & 3];
  return Buffer.concat([Buffer.from(cab), k, out]);
}

// lector incremental de frames; llama a alFrame({fin, opcode, datos}) o a alError(codigo, motivo)
function crearLector({ exigirMascara, maxBytes, alFrame, alError }) {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      if (b0 & 0x70) return alError(1002, 'bits RSV sin extensión');
      const enmascarado = !!(b1 & 0x80);
      if (exigirMascara && !enmascarado) return alError(1002, 'frame del cliente sin máscara');
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (buf.length < 10) return;
        if (buf.readUInt32BE(2) !== 0) return alError(1009, 'demasiado grande');
        len = buf.readUInt32BE(6); off = 10;
      }
      if (len > maxBytes) return alError(1009, 'demasiado grande');
      const total = off + (enmascarado ? 4 : 0) + len;
      if (buf.length < total) return;
      let datos = buf.subarray(off + (enmascarado ? 4 : 0), total);
      if (enmascarado) {
        const k = buf.subarray(off, off + 4); datos = Buffer.from(datos);
        for (let i = 0; i < datos.length; i++) datos[i] ^= k[i & 3];
      }
      buf = buf.subarray(total);
      alFrame({ fin: !!(b0 & 0x80), opcode: b0 & 0x0f, datos });
    }
  };
}

class Conexion extends EventEmitter {
  constructor(socket, { maxBytes = 2 * 1024 * 1024, cliente = false } = {}) {
    super();
    this.socket = socket; this.abierta = true; this.cliente = cliente;
    let partes = [], tipo = 0, acum = 0;
    const lector = crearLector({
      exigirMascara: !cliente, maxBytes,
      alError: (c, m) => this.cerrar(c, m),
      alFrame: ({ fin, opcode, datos }) => {
        if (opcode >= 8) {                                   // control: no pueden ir fragmentados ni pasar de 125 bytes
          if (!fin || datos.length > 125) return this.cerrar(1002, 'frame de control inválido');
          if (opcode === 9) return this._enviar(10, datos);  // ping → pong
          if (opcode === 10) return this.emit('pong');
          if (opcode === 8) {
            const codigo = datos.length >= 2 ? datos.readUInt16BE(0) : 1005;
            this.cerrar(codigo === 1005 ? 1000 : codigo, '', datos.subarray(2).toString('utf8'));
            return;
          }
          return this.cerrar(1002, 'opcode desconocido');
        }
        if (opcode === 0) { if (!tipo) return this.cerrar(1002, 'continuación sin inicio'); }
        else if (opcode === 1 || opcode === 2) { if (tipo) return this.cerrar(1002, 'mensaje nuevo a medias de otro'); tipo = opcode; partes = []; acum = 0; }
        else return this.cerrar(1002, 'opcode desconocido');
        partes.push(datos); acum += datos.length;
        if (acum > maxBytes) return this.cerrar(1009, 'demasiado grande');
        if (!fin) return;
        const msg = partes.length === 1 ? partes[0] : Buffer.concat(partes);
        const t = tipo; tipo = 0; partes = []; acum = 0;
        if (t === 1) this.emit('texto', msg.toString('utf8')); else this.emit('binario', msg);
      },
    });
    socket.on('data', d => { if (this.abierta) lector(d); });
    socket.on('close', () => this._fin(1006, 'conexión perdida'));
    socket.on('error', () => this._fin(1006, 'error de socket'));
    socket.setNoDelay?.(true);
  }
  _enviar(opcode, datos) { if (!this.abierta || this.socket.destroyed) return false; this.socket.write(frame(opcode, datos, this.cliente)); return true; }
  enviarTexto(s) { return this._enviar(1, Buffer.from(String(s), 'utf8')); }
  enviarJSON(o) { return this.enviarTexto(JSON.stringify(o)); }
  enviarBinario(b) { return this._enviar(2, Buffer.isBuffer(b) ? b : Buffer.from(b)); }
  ping() { return this._enviar(9, Buffer.alloc(0)); }
  cerrar(codigo = 1000, motivo = '', motivoRemoto) {
    if (!this.abierta) return;
    const m = Buffer.from(String(motivo).slice(0, 100), 'utf8'), b = Buffer.alloc(2 + m.length);
    b.writeUInt16BE(codigo); m.copy(b, 2);
    this._enviar(8, b);
    this._fin(codigo, motivoRemoto ?? motivo);
    setTimeout(() => this.socket.destroy(), 200).unref?.();
    this.socket.end();
  }
  _fin(codigo, motivo) { if (!this.abierta) return; this.abierta = false; this.emit('cerrar', { codigo, motivo }); }
}

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
