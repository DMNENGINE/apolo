// WebSocket mínimo (RFC 6455) SIN dependencias, compartido por el núcleo (core/nodos/ws.js, servidor) y los plugins (cliente).
// Los plugins lo cargan con require('@apolo/sdk/ws-cliente'): está en core/sdk, la única carpeta del núcleo que pueden leer.
//
//   const { conectar } = require('@apolo/sdk/ws-cliente');
//   const ws = await conectar('wss://servidor/ruta?x=1', { cabeceras: { authorization: '…' } });
//   ws.on('texto', s => …); ws.on('cerrar', ({ codigo, motivo }) => …); ws.enviarJSON({ … }); ws.cerrar();
//
// - Conexion (EventEmitter): 'texto' (string), 'binario' (Buffer), 'pong', 'cerrar' ({codigo, motivo})
//   enviarTexto(s) · enviarJSON(o) · enviarBinario(buf) · ping() · cerrar(codigo, motivo)
// - El cliente enmascara sus frames (obligatorio) y exige que el servidor NO enmascare; fragmentación (opcode 0);
//   ping → pong automático; close → se devuelve el close; mensajes > maxBytes → 1009. Sin extensiones ni subprotocolos.
// - Red: usa tls.connect / net.connect EN EL MOMENTO de conectar, así que dentro de un plugin pasa por la vigilancia de red
//   del ejecutor (solo dominios declarados con red:<dominio>).
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const aceptarClave = clave => crypto.createHash('sha1').update(clave + GUID).digest('base64');

// construye un frame (servidor → cliente: sin máscara; cliente → servidor: mascara=true)
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
//   exigirMascara: el servidor exige frames enmascarados; prohibirMascara: el cliente rechaza frames enmascarados
function crearLector({ exigirMascara, prohibirMascara, maxBytes, alFrame, alError }) {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      if (b0 & 0x70) return alError(1002, 'bits RSV sin extensión');
      const enmascarado = !!(b1 & 0x80);
      if (exigirMascara && !enmascarado) return alError(1002, 'frame del cliente sin máscara');
      if (prohibirMascara && enmascarado) return alError(1002, 'frame del servidor con máscara');
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
  // inicial: bytes que llegaron pegados a la respuesta del handshake (ya son frames)
  constructor(socket, { maxBytes = 2 * 1024 * 1024, cliente = false, inicial = null } = {}) {
    super();
    this.socket = socket; this.abierta = true; this.cliente = cliente;
    let partes = [], tipo = 0, acum = 0;
    const lector = crearLector({
      exigirMascara: !cliente, prohibirMascara: cliente, maxBytes,
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
    if (inicial && inicial.length) setImmediate(() => { if (this.abierta) lector(inicial); });   // tras poner los oyentes
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

// cliente: ws:// o wss:// → Promise<Conexion>. opciones: { cabeceras, timeoutMs, maxBytes, tls (extra para tls.connect) }
function conectar(url, { cabeceras = {}, timeoutMs = 15_000, maxBytes = 4 * 1024 * 1024, tls: extraTls = {} } = {}) {
  return new Promise((ok, mal) => {
    let u;
    try { u = new URL(String(url)); } catch { return mal(new Error('URL de WebSocket no válida')); }
    if (!['ws:', 'wss:'].includes(u.protocol)) return mal(new Error('la URL debe empezar por ws:// o wss://'));
    const seguro = u.protocol === 'wss:', host = u.hostname.replace(/^\[|\]$/g, ''), puerto = +u.port || (seguro ? 443 : 80);
    const clave = crypto.randomBytes(16).toString('base64');
    // se resuelve AHORA (no al cargar el módulo) para pasar por la vigilancia de red del plugin
    const socket = seguro
      ? require('tls').connect({ host, port: puerto, servername: /^[\d.:]+$/.test(host) ? undefined : host, ALPNProtocols: ['http/1.1'], ...extraTls })
      : require('net').connect({ host, port: puerto });
    let buf = Buffer.alloc(0), hecho = false;
    const fallar = e => { if (hecho) return; hecho = true; clearTimeout(t); socket.destroy(); mal(e); };
    const t = setTimeout(() => fallar(new Error('el servidor WebSocket no respondió a tiempo')), timeoutMs);
    socket.once('error', e => fallar(new Error('WebSocket: ' + e.message)));
    socket.once(seguro ? 'secureConnect' : 'connect', () => {
      const lineas = [`GET ${u.pathname || '/'}${u.search} HTTP/1.1`, `Host: ${u.host}`, 'Upgrade: websocket', 'Connection: Upgrade',
        `Sec-WebSocket-Key: ${clave}`, 'Sec-WebSocket-Version: 13'];
      for (const [k, v] of Object.entries(cabeceras)) if (!/[\r\n]/.test(k + v)) lineas.push(`${k}: ${v}`);
      socket.write(lineas.join('\r\n') + '\r\n\r\n');
    });
    const alDato = d => {
      buf = Buffer.concat([buf, d]);
      const fin = buf.indexOf('\r\n\r\n');
      if (fin < 0) { if (buf.length > 16384) fallar(new Error('cabecera de respuesta demasiado larga')); return; }
      socket.off('data', alDato);
      const cab = buf.subarray(0, fin).toString('latin1'), resto = buf.subarray(fin + 4);
      const estado = cab.split('\r\n')[0];
      if (!/^HTTP\/1\.1 101/.test(estado)) return fallar(new Error(`el servidor rechazó el WebSocket (${estado.slice(0, 80)})`));
      const acc = (/^sec-websocket-accept:\s*(\S+)/im.exec(cab) || [])[1];
      if (acc !== aceptarClave(clave)) return fallar(new Error('Sec-WebSocket-Accept incorrecto'));
      hecho = true; clearTimeout(t);
      ok(new Conexion(socket, { cliente: true, maxBytes, inicial: resto.length ? Buffer.from(resto) : null }));
    };
    socket.on('data', alDato);
  });
}

module.exports = { conectar, aceptarClave, frame, crearLector, Conexion, GUID };
