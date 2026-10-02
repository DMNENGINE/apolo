// Nodos de hardware (ojo ESP32): servidor WebSocket propio, emparejamiento por código, IPs, estados del bus y botón → permisos.
// Sin hardware: un cliente WebSocket mínimo escrito aquí hace de ESP32.
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { crearNucleo } = require('../index');
const { crearNodos, ipPermitida, textoPantalla, enCidr } = require('../nodos');

const base = process.env.NUCLEO_HOME && fs.existsSync(process.env.NUCLEO_HOME) ? process.env.NUCLEO_HOME : os.tmpdir();
function nucleo(cfgNodos = {}) {
  const dir = fs.mkdtempSync(path.join(base, 'nodos-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m', nodos: cfgNodos }));
  return crearNucleo({ dir, embedder: null, sinPlugins: true, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [] }) } });
}

// ---------- cliente WebSocket mínimo (lo que hace el ESP32) ----------
function clienteWS(puerto) {
  return new Promise((ok, mal) => {
    const clave = crypto.randomBytes(16).toString('base64');
    const s = net.connect(puerto, '127.0.0.1');
    let buf = Buffer.alloc(0), abierto = false;
    const c = { mensajes: [], binarios: [], esperas: [], cerrado: false, s };
    const entregar = m => {
      const i = c.esperas.findIndex(e => e.f(m));
      if (i >= 0) { const [e] = c.esperas.splice(i, 1); e.ok(m); } else c.mensajes.push(m);
    };
    c.esperar = (f, ms = 2000) => {
      const i = c.mensajes.findIndex(f);
      if (i >= 0) return Promise.resolve(c.mensajes.splice(i, 1)[0]);
      return new Promise((ok2, mal2) => { const e = { f, ok: ok2 }; c.esperas.push(e); setTimeout(() => mal2(new Error('timeout esperando mensaje; llegaron: ' + JSON.stringify(c.mensajes))), ms); });
    };
    c.tipo = (t, ms) => c.esperar(m => m.tipo === t, ms);
    const enviarFrame = (op, datos) => {
      const k = crypto.randomBytes(4), len = datos.length;
      const cab = len < 126 ? Buffer.from([0x80 | op, 0x80 | len]) : Buffer.from([0x80 | op, 0x80 | 126, len >> 8, len & 255]);
      const m = Buffer.from(datos); for (let i = 0; i < m.length; i++) m[i] ^= k[i & 3];
      s.write(Buffer.concat([cab, k, m]));
    };
    c.json = o => enviarFrame(1, Buffer.from(JSON.stringify(o)));
    c.bin = b => enviarFrame(2, b);
    c.cerrar = () => { enviarFrame(8, Buffer.from([3, 232])); s.end(); };
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!abierto) {
        const fin = buf.indexOf('\r\n\r\n'); if (fin < 0) return;
        const cab = buf.subarray(0, fin).toString();
        buf = buf.subarray(fin + 4);
        if (!/^HTTP\/1\.1 101/.test(cab)) { s.destroy(); return mal(Object.assign(new Error(cab.split('\r\n')[0]), { cabecera: cab })); }
        const acc = /sec-websocket-accept: (\S+)/i.exec(cab)[1];
        const esperado = crypto.createHash('sha1').update(clave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        if (acc !== esperado) return mal(new Error('Sec-WebSocket-Accept incorrecto'));
        abierto = true; ok(c);
      }
      while (buf.length >= 2) {                              // frames del servidor: sin máscara
        assert.strictEqual(buf[1] & 0x80, 0, 'el servidor no debe enmascarar');
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + len) return;
        const op = buf[0] & 0x0f, datos = buf.subarray(off, off + len); buf = buf.subarray(off + len);
        if (op === 1) entregar(JSON.parse(datos.toString()));
        else if (op === 2) c.binarios.push(datos);
        else if (op === 8) { c.cerrado = datos.length >= 2 ? datos.readUInt16BE(0) : 1005; }
      }
    });
    s.on('error', mal);
    s.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${clave}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
}
const HOLA = { tipo: 'hola', id: 'ojo-test1', nombre: 'Ojo de prueba', version: '0.1.0', modelo: 'sim', capacidades: ['pantalla', 'boton', 'micro', 'altavoz'] };

// empareja un ojo nuevo y devuelve {c, token}
async function emparejado(n, puerto) {
  const c = await clienteWS(puerto);
  c.json(HOLA);
  const { codigo } = await c.tipo('emparejar');
  n.nodos.emparejar(codigo);
  const { token } = await c.tipo('emparejado');
  await c.tipo('bienvenido');
  return { c, token };
}

test('nodos: handshake RFC 6455 + emparejamiento por código + reconexión con token', async () => {
  const n = nucleo(); n.nodos = crearNodos({ nucleo: n });
  const puerto = await n.nodos.iniciar(0);
  const c = await clienteWS(puerto);
  c.json(HOLA);
  const e = await c.tipo('emparejar');
  assert.match(e.codigo, /^\d{6}$/);
  const lista = await n.nodos.http('GET', ['v1', 'nodos'], {});
  assert.strictEqual(lista.esperando.length, 1);
  assert.ok(!JSON.stringify(lista).includes(e.codigo), 'la API nunca enseña el código (hay que leerlo en la pantalla)');
  await assert.rejects(n.nodos.http('POST', ['v1', 'nodos', 'emparejar'], { codigo: e.codigo === '000000' ? '111111' : '000000' }), /incorrecto/);
  const r = await n.nodos.http('POST', ['v1', 'nodos', 'emparejar'], { codigo: e.codigo });
  assert.strictEqual(r.nodo.id, 'ojo-test1'); assert.strictEqual(r.nodo.conectado, true);
  const { token } = await c.tipo('emparejado');
  assert.match(token, /^[0-9a-f]{48}$/);
  const b = await c.tipo('bienvenido');
  assert.ok(b.epoch > 1.7e9);
  assert.strictEqual((await c.tipo('estado')).estado, 'reposo');
  const disco = fs.readFileSync(path.join(n.cfg.dir, 'nodos.json'), 'utf8');
  assert.ok(!disco.includes(token), 'el token no se guarda en claro');
  c.cerrar();
  // reconexión con su token: directo a bienvenido
  const c2 = await clienteWS(puerto);
  c2.json({ ...HOLA, token });
  await c2.tipo('bienvenido');
  // token falso: rechazado y vuelta a emparejar
  const c3 = await clienteWS(puerto);
  c3.json({ ...HOLA, token: 'f'.repeat(48) });
  await c3.tipo('rechazado'); await c3.tipo('emparejar');
  // borrar desde el panel cierra su conexión
  assert.deepStrictEqual(await n.nodos.http('DELETE', ['v1', 'nodos', 'ojo-test1'], {}), { ok: true });
  await new Promise(ok => setTimeout(ok, 100));
  assert.strictEqual(c2.cerrado, 4003);
  await n.nodos.cerrar(); n.nodos.apagarOyentes();
});

test('nodos: una IP no permitida se rechaza antes del handshake', async () => {
  const n = nucleo({ permitirLoopback: false }); n.nodos = crearNodos({ nucleo: n });
  const puerto = await n.nodos.iniciar(0);
  await assert.rejects(clienteWS(puerto), e => /403/.test(e.message));
  await n.nodos.cerrar(); n.nodos.apagarOyentes();
  // reglas de red
  const o = { permitirLoopback: true, permitidos: [] };
  assert.ok(ipPermitida('192.168.1.50', o)); assert.ok(ipPermitida('::ffff:10.0.0.7', o)); assert.ok(ipPermitida('172.20.1.1', o));
  assert.ok(!ipPermitida('8.8.8.8', o)); assert.ok(!ipPermitida('172.40.0.1', o));
  assert.ok(ipPermitida('192.168.1.60', { permitidos: ['192.168.1.0/24'] })); assert.ok(!ipPermitida('192.168.2.60', { permitidos: ['192.168.1.0/24'] }));
  assert.ok(enCidr('10.1.2.3', '10.1.2.3')); assert.ok(!enCidr('10.1.2.4', '10.1.2.3'));
  assert.strictEqual(textoPantalla('¿Permiso? ✓ ¡ácción!'), 'PERMISO? OK ACCION!');
});

test('nodos: los eventos del bus mueven los ojos (trabajando, herramienta, fin, permiso, externo)', async () => {
  const n = nucleo(); n.nodos = crearNodos({ nucleo: n });
  const puerto = await n.nodos.iniciar(0);
  const { c } = await emparejado(n, puerto);
  await c.tipo('estado');                                      // reposo inicial
  n.bus.emit('evento', { tipo: 'inicio', sesion: 's1', modelo: 'x' });
  assert.strictEqual((await c.tipo('estado')).estado, 'trabajando');
  n.bus.emit('evento', { tipo: 'herramienta', sesion: 's1', nombre: 'leer_archivo' });
  assert.deepStrictEqual(await c.tipo('estado'), { tipo: 'estado', estado: 'trabajando', msg: 'LEER_ARCHIVO' });
  n.bus.emit('evento', { tipo: 'fin', sesion: 's1', uso: {} });
  assert.deepStrictEqual(await c.tipo('flash'), { tipo: 'flash', estado: 'listo', msg: 'LISTO', segundos: 3 });
  assert.strictEqual((await c.tipo('estado')).estado, 'reposo');
  n.bus.emit('evento', { tipo: 'inicio', sesion: 's2' }); await c.tipo('estado');
  n.bus.emit('evento', { tipo: 'error', sesion: 's2', error: 'x' });
  assert.strictEqual((await c.tipo('flash')).estado, 'error');
  // sesiones de Claude Code (main.js) y gestos sueltos
  n.bus.emit('nodo-estado', { estado: 'trabajando', msg: 'Claude Code' });
  assert.deepStrictEqual(await c.esperar(m => m.tipo === 'estado' && m.estado === 'trabajando'), { tipo: 'estado', estado: 'trabajando', msg: 'CLAUDE CODE' });
  n.bus.emit('nodo-gesto', { gesto: 'corazon', segundos: 2 });
  assert.strictEqual((await c.tipo('gesto')).gesto, 'corazon');
  n.bus.emit('nodo-gesto', { gesto: 'inventado' });
  await n.nodos.cerrar(); n.nodos.apagarOyentes();
});

test('nodos: botón del ojo → permisos (corta permite, larga deniega, peligroso no, doble = pánico)', async () => {
  const n = nucleo(); n.nodos = crearNodos({ nucleo: n });
  const puerto = await n.nodos.iniciar(0);
  const { c } = await emparejado(n, puerto);
  // corta = Permitir
  let r = n.permisos.pedirExterno({ resumen: 'Borrar la caché de prueba', origen: 'test' });
  const p = await c.tipo('permiso');
  assert.strictEqual(p.resumen, 'BORRAR LA CACHE DE PRUEBA');
  assert.strictEqual((await c.esperar(m => m.tipo === 'estado' && m.estado === 'permiso')).msg, 'PERMISO?');
  c.json({ tipo: 'boton', pulsacion: 'corta' });
  assert.strictEqual((await r).ok, true);
  // larga = Denegar
  r = n.permisos.pedirExterno({ resumen: 'otra cosa', origen: 'test' }); await c.tipo('permiso');
  c.json({ tipo: 'boton', pulsacion: 'larga' });
  const d = await r; assert.strictEqual(d.ok, false); assert.match(d.motivo, /Ojo de prueba/);
  // peligroso: el botón NO lo aprueba (solo en el PC); larga sí lo deniega
  r = n.permisos.pedirExterno({ resumen: 'rm -rf algo', peligro: 'borrado recursivo', origen: 'test' });
  assert.strictEqual((await c.tipo('permiso')).peligro, true);
  c.json({ tipo: 'boton', pulsacion: 'corta' });
  assert.match((await c.esperar(m => m.tipo === 'flash' && m.estado === 'permiso')).msg, /PELIGROSO/);
  assert.strictEqual(n.permisos.pendientes().length, 1);
  c.json({ tipo: 'boton', pulsacion: 'larga' }); assert.strictEqual((await r).ok, false);
  // doble = pánico: deniega todo lo pendiente
  let panico = null; n.bus.on('panico', e => { panico = e; });
  const r1 = n.permisos.pedirExterno({ resumen: 'a', origen: 't' }), r2 = n.permisos.pedirExterno({ resumen: 'b', origen: 't' });
  c.json({ tipo: 'boton', pulsacion: 'doble' });
  assert.deepStrictEqual([(await r1).ok, (await r2).ok], [false, false]);
  assert.strictEqual(panico.origen, 'nodo:ojo-test1');
  await n.nodos.cerrar(); n.nodos.apagarOyentes();
});

test('nodos: permisos externos (hooks de Claude Code): el botón los resuelve, los peligrosos NO; estado y flash desde main', async () => {
  const n = nucleo(); n.nodos = crearNodos({ nucleo: n });
  const pend = new Map(), resueltos = [];
  n.nodos.permisosExternos = { pendientes: () => [...pend.values()], resolver: (id, d, via) => { resueltos.push([id, d, via]); return pend.delete(id); } };
  const puerto = await n.nodos.iniciar(0);
  const { c } = await emparejado(n, puerto);
  pend.set(5, { id: 5, resumen: 'Bash: npm test', peligro: '', creado: Date.now() });
  n.bus.emit('nodo-permiso', pend.get(5));
  assert.strictEqual((await c.tipo('permiso')).id, 5);
  assert.strictEqual((await c.esperar(m => m.tipo === 'estado' && m.estado === 'permiso')).msg, 'PERMISO?');
  c.json({ tipo: 'boton', pulsacion: 'corta' });
  await c.esperar(m => m.tipo === 'flash' && m.msg === 'PERMITIDO');
  assert.deepStrictEqual(resueltos, [[5, 'allow', 'Ojo de prueba']]);
  // peligroso de Claude Code: nunca desde el ojo (aunque cfg.nodos.permitirPeligrosos); larga sí deniega
  n.cfg.nodos = { ...(n.cfg.nodos || {}), permitirPeligrosos: true };
  pend.set(6, { id: 6, resumen: 'Bash: rm -rf /', peligro: 'borrado', creado: Date.now() });
  n.bus.emit('nodo-permiso', pend.get(6)); await c.tipo('permiso');
  c.json({ tipo: 'boton', pulsacion: 'corta' });
  assert.match((await c.esperar(m => m.tipo === 'flash' && m.estado === 'permiso')).msg, /PELIGROSO/);
  assert.strictEqual(resueltos.length, 1);
  c.json({ tipo: 'boton', pulsacion: 'larga' });
  await c.esperar(m => m.tipo === 'flash' && m.msg === 'DENEGADO');
  assert.deepStrictEqual(resueltos[1], [6, 'deny', 'Ojo de prueba']);
  // pánico también deniega los externos
  pend.set(7, { id: 7, resumen: 'x', peligro: '', creado: Date.now() });
  c.json({ tipo: 'boton', pulsacion: 'doble' });
  await c.esperar(m => m.tipo === 'flash' && /PANICO/.test(m.msg));
  assert.deepStrictEqual(resueltos[2], [7, 'deny', 'pánico']);
  // estados de Claude Code: trabajando con la herramienta y "listo" como destello
  n.bus.emit('nodo-estado', { estado: 'trabajando', msg: 'Edit', segundos: 60 });
  assert.strictEqual((await c.esperar(m => m.tipo === 'estado' && m.estado === 'trabajando')).msg, 'EDIT');
  n.bus.emit('nodo-estado', { estado: 'listo', msg: 'LISTO', flash: true, segundos: 3 });
  await c.esperar(m => m.tipo === 'flash' && m.estado === 'listo');
  assert.notStrictEqual((await c.esperar(m => m.tipo === 'estado')).estado, 'trabajando');
  await n.nodos.cerrar(); n.nodos.apagarOyentes();
});

test('nodos: push-to-talk → WAV + evento nodo-audio + transcriptor; daemon expone /v1/nodos', async () => {
  const n = nucleo(); n.nodos = crearNodos({ nucleo: n });
  n.nodos.transcriptor = async ruta => { assert.ok(fs.existsSync(ruta)); return 'hola apolo'; };
  const puerto = await n.nodos.iniciar(0);
  const { c } = await emparejado(n, puerto);
  const audio = new Promise(ok => n.bus.once('nodo-audio', ok)), texto = new Promise(ok => n.bus.once('nodo-texto', ok));
  c.json({ tipo: 'audio-inicio', frecuencia: 16000, bits: 16, canales: 1 });
  const pcm = Buffer.alloc(16000 * 2 / 2);                        // 0.5 s
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i);
  c.bin(pcm.subarray(0, 8000)); c.bin(pcm.subarray(8000));
  c.json({ tipo: 'audio-fin' });
  const a = await audio;
  assert.strictEqual(a.ms, 500);
  assert.strictEqual(fs.statSync(a.ruta).size, 44 + pcm.length);
  assert.strictEqual((await texto).texto, 'hola apolo');
  assert.strictEqual((await c.tipo('oido')).texto, 'HOLA APOLO');
  // TTS hacia el ojo
  await n.nodos.reproducir('ojo-test1', Buffer.alloc(10000));
  await c.tipo('audio-fin');
  assert.strictEqual(c.binarios.reduce((s, b) => s + b.length, 0), 10000);
  await n.nodos.cerrar(); n.nodos.apagarOyentes();

  // a través del daemon (extensión http): GET /v1/nodos con token
  const { iniciar } = require('../daemon');
  const n2 = nucleo();
  const { servidor, puerto: pd, token } = await iniciar({ nucleo: n2, puerto: 0, sinTareas: true });
  const r = await new Promise((ok, mal) => http.get({ host: '127.0.0.1', port: pd, path: '/v1/nodos', headers: { 'x-robot-token': token } }, res => {
    let b = ''; res.on('data', d => { b += d; }); res.on('end', () => ok({ code: res.statusCode, j: JSON.parse(b) }));
  }).on('error', mal));
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.j.activo, false);                         // apagado por defecto: no abre puertos a la LAN sin pedirlo
  assert.deepStrictEqual(r.j.nodos, []);
  servidor.close(); n2.nodos.apagarOyentes();
});
