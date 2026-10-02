// App móvil: código de un solo uso con caducidad, token de dispositivo con alcance, 403 fuera del alcance, revocar,
// IPs privadas solo con cfg.red.moviles, PIN/passkey para lo peligroso, Web Push (cifrado aes128gcm + VAPID) y el QR propio.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { crearNucleo } = require('../index');
const { iniciar } = require('../daemon');
const MV = require('../movil');
const qr = require('../qr');

const base = process.env.NUCLEO_HOME && fs.existsSync(process.env.NUCLEO_HOME) ? process.env.NUCLEO_HOME : os.tmpdir();
const ORIGEN = 'http://192.168.1.31:47900';

async function montar({ moviles = true, ip = '192.168.1.50' } = {}) {
  const dir = fs.mkdtempSync(path.join(base, 'movil-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m', red: { permitidos: [], moviles } }));
  const n = crearNucleo({ dir, embedder: null, sinPlugins: true, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [] }) } });
  const reloj = { t: Date.now() };
  const enviados = [];
  n.movil = MV.crearMovil({ nucleo: n, ahora: () => reloj.t, fetch: async (url, o) => { enviados.push({ url, o }); return { ok: true, status: 201 }; } });
  const estado = { ip };                                     // IP que "ve" el daemon (para simular la LAN desde 127.0.0.1)
  const d = await iniciar({ nucleo: n, puerto: 0, sinTareas: true, ipCliente: () => estado.ip, host: '127.0.0.1' });
  const pet = (M, ruta, { cab = {}, cuerpo } = {}) => new Promise((ok, mal) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo));
    const r = http.request({ host: '127.0.0.1', port: d.puerto, method: M, path: ruta, headers: { ...(datos ? { 'content-type': 'application/json', 'content-length': datos.length } : {}), ...cab } }, res => {
      const t = []; res.on('data', x => t.push(x)); res.on('end', () => { const s = Buffer.concat(t).toString(); let j = null; try { j = JSON.parse(s); } catch { } ok({ status: res.statusCode, j, s, h: res.headers }); });
    });
    r.on('error', mal); if (datos) r.write(datos); r.end();
  });
  const cerrar = () => { d.servidor.closeAllConnections?.(); d.servidor.close(); };
  return { n, d, pet, reloj, estado, enviados, cerrar, token: d.token };
}
async function emparejar(m, pin = '1234') {
  m.estado.ip = '127.0.0.1';
  const c = await m.pet('POST', '/v1/movil/emparejar', { cab: { 'x-robot-token': m.token }, cuerpo: {} });
  assert.strictEqual(c.status, 200, c.s);
  m.estado.ip = '192.168.1.50';
  const r = await m.pet('POST', '/v1/movil/canjear', { cuerpo: { codigo: c.j.codigo, pin, nombre: 'Pixel de prueba' } });
  assert.strictEqual(r.status, 200, r.s);
  return { codigo: c.j.codigo, url: c.j.url, svg: c.j.svg, tok: r.j.token, disp: r.j.dispositivo };
}

test('emparejar: código de un solo uso, caduca a los 5 min, el QR lleva la URL y el token maestro no sale', async () => {
  const m = await montar();
  try {
    const e = await emparejar(m);
    assert.match(e.url, /\/m\/#par=/); assert.ok(e.url.endsWith(e.codigo)); assert.match(e.svg, /^<svg/);
    assert.ok(!JSON.stringify(e).includes(m.token), 'el token maestro nunca va al móvil');
    // segundo uso del mismo código → rechazado
    const otra = await m.pet('POST', '/v1/movil/canjear', { cuerpo: { codigo: e.codigo, pin: '1234' } });
    assert.strictEqual(otra.status, 403);
    // caducidad
    m.estado.ip = '127.0.0.1';
    const c2 = await m.pet('POST', '/v1/movil/emparejar', { cab: { 'x-robot-token': m.token }, cuerpo: {} });
    m.reloj.t += 5 * 60_000 + 1000;
    const tarde = await m.pet('POST', '/v1/movil/canjear', { cuerpo: { codigo: c2.j.codigo, pin: '1234' } });
    assert.strictEqual(tarde.status, 403);
    // PIN obligatorio de 4–8 cifras
    const c3 = await m.pet('POST', '/v1/movil/emparejar', { cab: { 'x-robot-token': m.token }, cuerpo: {} });
    assert.strictEqual((await m.pet('POST', '/v1/movil/canjear', { cuerpo: { codigo: c3.j.codigo, pin: '12' } })).status, 400);
    // en disco solo el hash del token
    const disco = fs.readFileSync(path.join(m.n.cfg.dir, 'movil.json'), 'utf8');
    assert.ok(!disco.includes(e.tok)); assert.ok(disco.includes(crypto.createHash('sha256').update(e.tok).digest('hex')));
  } finally { m.cerrar(); }
});

test('token de dispositivo: alcance limitado (403 en config, claves, privacidad, skills, plugins…) y revocable', async () => {
  const m = await montar();
  try {
    const { tok, disp } = await emparejar(m);
    const cab = { 'x-dispositivo': tok };
    assert.strictEqual((await m.pet('GET', '/v1/estado', { cab })).status, 200);
    assert.strictEqual((await m.pet('GET', '/v1/movil/yo', { cab })).j.nombre, 'Pixel de prueba');
    assert.strictEqual((await m.pet('GET', '/v1/movil/permisos', { cab })).status, 200);
    const s = await m.pet('POST', '/v1/sesiones', { cab, cuerpo: { titulo: 'móvil', cwd: 'C:/Windows' } });
    assert.strictEqual(s.status, 201); assert.strictEqual(s.j.canal, 'movil'); assert.notStrictEqual(s.j.cwd, path.resolve('C:/Windows'));
    const prohibidas = [['GET', '/v1/config'], ['PATCH', '/v1/config'], ['GET', '/v1/privacidad'], ['POST', '/v1/privacidad/borrar'], ['POST', '/v1/privacidad/exportar'],
      ['POST', '/v1/skills/instalar'], ['GET', '/v1/skills'], ['POST', '/v1/plugins/instalar'], ['GET', '/v1/memoria'], ['GET', '/v1/conectores'], ['POST', '/v1/permisos/x'],
      ['GET', '/v1/movil'], ['POST', '/v1/movil/emparejar'], ['PATCH', '/v1/movil/config'], ['DELETE', '/v1/movil/dispositivos/' + disp.id], ['DELETE', '/v1/sesiones/' + s.j.id],
      ['PATCH', '/v1/turno/config'], ['DELETE', '/v1/turno/x'], ['GET', '/v1/registros'], ['POST', '/v1/control/soltar'], ['GET', '/v1/reglas']];
    for (const [M, r] of prohibidas) assert.strictEqual((await m.pet(M, r, { cab, cuerpo: M === 'GET' || M === 'DELETE' ? undefined : {} })).status, 403, `${M} ${r} debería ser 403`);
    // el token maestro desde la IP del móvil no vale
    assert.strictEqual((await m.pet('GET', '/v1/config', { cab: { 'x-robot-token': m.token } })).status, 401);
    // revocar desde el escritorio → 401
    m.estado.ip = '127.0.0.1';
    assert.strictEqual((await m.pet('DELETE', '/v1/movil/dispositivos/' + disp.id, { cab: { 'x-robot-token': m.token } })).j.ok, true);
    m.estado.ip = '192.168.1.50';
    assert.strictEqual((await m.pet('GET', '/v1/estado', { cab })).status, 401);
  } finally { m.cerrar(); }
});

test('IPs privadas: solo con cfg.red.moviles, solo /m/ y nunca IPs públicas', async () => {
  const sin = await montar({ moviles: false });
  try {
    assert.strictEqual((await sin.pet('GET', '/m/manifest.webmanifest')).status, 403);
    assert.strictEqual((await sin.pet('POST', '/v1/movil/canjear', { cuerpo: {} })).status, 403);
  } finally { sin.cerrar(); }
  const m = await montar({ moviles: true });
  try {
    assert.strictEqual((await m.pet('GET', '/m/manifest.webmanifest')).status, 200);
    assert.strictEqual((await m.pet('GET', '/m')).status, 301);
    assert.strictEqual((await m.pet('GET', '/index.html')).status, 403, 'el panel de escritorio no se sirve al móvil');
    assert.strictEqual((await m.pet('GET', '/ajustes.js')).status, 403);
    assert.strictEqual((await m.pet('GET', '/v1/estado')).status, 401);
    m.estado.ip = '8.8.8.8';
    assert.strictEqual((await m.pet('GET', '/m/manifest.webmanifest')).status, 403);
    m.estado.ip = '127.0.0.1';                                // desde este equipo sigue todo igual
    assert.strictEqual((await m.pet('GET', '/index.html')).status, 200);
    assert.ok(MV.ipPrivada('10.1.2.3') && MV.ipPrivada('172.20.0.1') && MV.ipPrivada('100.101.1.2') && MV.ipPrivada('fd00::1'));
    assert.ok(!MV.ipPrivada('172.32.0.1') && !MV.ipPrivada('8.8.8.8') && !MV.ipPrivada('100.128.0.1'));
    // activar/desactivar en caliente desde el escritorio
    const r = await m.pet('PATCH', '/v1/movil/config', { cab: { 'x-robot-token': m.token }, cuerpo: { activo: false } });
    assert.strictEqual(r.j.activo, false);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(m.n.cfg.dir, 'config.json'), 'utf8')).red.moviles, false);
    m.estado.ip = '192.168.1.50';
    assert.strictEqual((await m.pet('GET', '/m/manifest.webmanifest')).status, 403);
  } finally { m.cerrar(); }
});

test('permiso peligroso desde el móvil: exige PIN (y bloquea tras 5 fallos) o passkey WebAuthn válida', async () => {
  const m = await montar();
  try {
    const { tok } = await emparejar(m, '4321');
    const cab = { 'x-dispositivo': tok, origin: ORIGEN };
    // permiso normal: sin prueba
    const p1 = m.n.permisos.pedirExterno({ resumen: 'leer README', origen: 'test' });
    let l = (await m.pet('GET', '/v1/movil/permisos', { cab })).j.permisos;
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${l[0].id}`, { cab, cuerpo: { decision: 'allow' } })).j.ok, true);
    assert.strictEqual((await p1).ok, true);
    // peligroso: sin prueba 428, PIN malo 403, PIN bueno → permitido
    const p2 = m.n.permisos.pedirExterno({ resumen: 'rm -rf /', peligro: 'borrado', origen: 'test' });
    l = (await m.pet('GET', '/v1/movil/permisos', { cab })).j.permisos;
    const id = l[0].id; assert.ok(l[0].peligro);
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id}`, { cab, cuerpo: { decision: 'allow' } })).status, 428);
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id}`, { cab, cuerpo: { decision: 'allow', prueba: { tipo: 'pin', pin: '0000' } } })).status, 403);
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id}`, { cab, cuerpo: { decision: 'allow', prueba: { tipo: 'pin', pin: '4321' } } })).status, 200);
    assert.strictEqual((await p2).ok, true);

    // passkey: registrar (con PIN) y aprobar con una aserción firmada por "el autenticador" (clave EC generada aquí)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const cdj = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const op = await m.pet('POST', '/v1/movil/passkey/opciones', { cab, cuerpo: { pin: '4321' } });
    assert.strictEqual(op.status, 200, op.s);
    const credId = crypto.randomBytes(16).toString('base64url');
    const reg = await m.pet('POST', '/v1/movil/passkey/registrar', { cab, cuerpo: { reto: op.j.reto, id: credId, alg: -7, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), clientDataJSON: cdj({ type: 'webauthn.create', challenge: op.j.reto, origin: ORIGEN }) } });
    assert.strictEqual(reg.status, 200, reg.s);
    const firmar = (reto, contador, clave = privateKey, origen = ORIGEN) => {
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: reto, origin: origen }));
      const cnt = Buffer.alloc(4); cnt.writeUInt32BE(contador);
      const ad = Buffer.concat([crypto.createHash('sha256').update(new URL(origen).hostname).digest(), Buffer.from([0x05]), cnt]);
      const sig = crypto.sign('sha256', Buffer.concat([ad, crypto.createHash('sha256').update(cd).digest()]), clave);
      return { tipo: 'passkey', reto, id: credId, clientDataJSON: cd.toString('base64url'), authenticatorData: ad.toString('base64url'), signature: sig.toString('base64url') };
    };
    const p3 = m.n.permisos.pedirExterno({ resumen: 'format C:', peligro: 'disco', origen: 'test' });
    const id3 = (await m.pet('GET', '/v1/movil/permisos', { cab })).j.permisos[0].id;
    // firma con otra clave → 403; reto de otro permiso → 403
    const r1 = (await m.pet('POST', '/v1/movil/reto', { cab, cuerpo: { permiso: id3 } })).j;
    assert.deepStrictEqual(r1.credenciales, [credId]);
    const otraClave = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id3}`, { cab, cuerpo: { decision: 'allow', prueba: firmar(r1.reto, 1, otraClave) } })).status, 403);
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id3}`, { cab, cuerpo: { decision: 'allow', prueba: firmar(r1.reto, 1) } })).status, 403, 'el reto es de un solo uso');
    const r2 = (await m.pet('POST', '/v1/movil/reto', { cab, cuerpo: { permiso: id3 } })).j;
    const ok = await m.pet('POST', `/v1/movil/permisos/${id3}`, { cab, cuerpo: { decision: 'allow', prueba: firmar(r2.reto, 1) } });
    assert.strictEqual(ok.status, 200, ok.s);
    assert.strictEqual((await p3).ok, true);
    // contador que no sube (passkey clonada) → rechazada
    const p4 = m.n.permisos.pedirExterno({ resumen: 'shutdown', peligro: 'apagar', origen: 'test' });
    const id4 = (await m.pet('GET', '/v1/movil/permisos', { cab })).j.permisos[0].id;
    const r3 = (await m.pet('POST', '/v1/movil/reto', { cab, cuerpo: { permiso: id4 } })).j;
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id4}`, { cab, cuerpo: { decision: 'allow', prueba: firmar(r3.reto, 1) } })).status, 403);
    // denegar nunca pide prueba
    assert.strictEqual((await m.pet('POST', `/v1/movil/permisos/${id4}`, { cab, cuerpo: { decision: 'deny' } })).status, 200);
    assert.strictEqual((await p4).ok, false);

    // 5 PIN fallidos → bloqueado (token inválido)
    m.n.permisos.pedirExterno({ resumen: 'rm x', peligro: 'p', origen: 'test', esperaMs: 5000 });
    const id5 = (await m.pet('GET', '/v1/movil/permisos', { cab })).j.permisos[0].id;
    for (let i = 0; i < 5; i++) await m.pet('POST', `/v1/movil/permisos/${id5}`, { cab, cuerpo: { decision: 'allow', prueba: { tipo: 'pin', pin: '9999' } } });
    assert.strictEqual((await m.pet('GET', '/v1/estado', { cab })).status, 401);
    m.n.permisos.resolver(id5.slice(2), 'deny');
  } finally { m.cerrar(); }
});

test('Web Push: cifrado aes128gcm (RFC 8291) descifrable por el navegador, JWT VAPID válido y aviso al llegar un permiso', async () => {
  // "navegador": par de claves P-256 + secreto auth
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const sus = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  const cuerpo = MV.cifrarPush('{"hola":"móvil"}', sus);
  // descifrar como lo haría el navegador
  const sal = cuerpo.subarray(0, 16), idl = cuerpo[20], asPub = cuerpo.subarray(21, 21 + idl), ct = cuerpo.subarray(21 + idl);
  const h = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ikm = h(h(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = h(sal, ikm);
  const dc = crypto.createDecipheriv('aes-128-gcm', h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
  dc.setAuthTag(ct.subarray(-16));
  const claro = Buffer.concat([dc.update(ct.subarray(0, -16)), dc.final()]);
  assert.strictEqual(claro[claro.length - 1], 2);
  assert.deepStrictEqual(JSON.parse(claro.subarray(0, -1).toString()), { hola: 'móvil' });
  assert.strictEqual(cuerpo.readUInt32BE(16), 4096);

  const m = await montar();
  try {
    const { tok } = await emparejar(m);
    const cab = { 'x-dispositivo': tok };
    assert.strictEqual((await m.pet('POST', '/v1/movil/push', { cab, cuerpo: { suscripcion: { endpoint: 'http://inseguro', keys: sus.keys } } })).status, 400);
    assert.strictEqual((await m.pet('POST', '/v1/movil/push', { cab, cuerpo: { suscripcion: sus } })).status, 200);
    const p = m.n.permisos.pedirExterno({ resumen: 'git push', origen: 'test', esperaMs: 3000 });
    await new Promise(ok => setTimeout(ok, 100));
    assert.strictEqual(m.enviados.length, 1);
    const { url, o } = m.enviados[0];
    assert.strictEqual(url, sus.endpoint); assert.strictEqual(o.headers['Content-Encoding'], 'aes128gcm');
    const [, jwt, k] = o.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
    const [c, cg, firma] = jwt.split('.');
    assert.strictEqual(JSON.parse(Buffer.from(cg, 'base64url')).aud, 'https://fcm.googleapis.com');
    const pub = Buffer.from(k, 'base64url');
    const clave = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.ok(crypto.verify('sha256', Buffer.from(`${c}.${cg}`), { key: clave, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')));
    m.n.permisos.resolver(m.n.permisos.pendientes()[0].id, 'deny'); await p;
  } finally { m.cerrar(); }
});

test('QR propio: versión y máscara válidas; idéntico al paquete qrcode si está instalado', () => {
  const url = 'http://192.168.1.31:47900/m/#par=' + 'A'.repeat(22);
  const q = qr.matriz(url);
  assert.strictEqual(q.tam, q.version * 4 + 17);
  assert.ok(q.m[0][0] && q.m[6][6] && !q.m[7][7]);          // esquina del buscador y separador
  let QR = null; try { QR = require('qrcode'); } catch { }
  if (!QR) return;
  for (const t of [url, 'hola', 'z'.repeat(200)]) for (const k of [0, 3, 7]) {
    const a = qr.matriz(t, { mascara: k }), b = QR.create([{ data: t, mode: 'byte' }], { errorCorrectionLevel: 'M', version: a.version, maskPattern: k });
    for (let y = 0; y < a.tam; y++) for (let x = 0; x < a.tam; x++) assert.strictEqual(!!b.modules.data[y * a.tam + x], a.m[y][x]);
  }
});

test('voz: POST /v1/voz/transcribir → bus transcribir-audio → texto (501 sin la app de escritorio)', async () => {
  const m = await montar();
  try {
    const { tok } = await emparejar(m);
    const audio = Buffer.alloc(2000, 7);
    const enviar = () => new Promise((ok, mal) => {
      const r = http.request({ host: '127.0.0.1', port: m.d.puerto, method: 'POST', path: '/v1/voz/transcribir', headers: { 'x-dispositivo': tok, 'content-type': 'audio/webm', 'content-length': audio.length } }, res => {
        const t = []; res.on('data', x => t.push(x)); res.on('end', () => ok({ status: res.statusCode, j: JSON.parse(Buffer.concat(t).toString() || '{}') }));
      });
      r.on('error', mal); r.end(audio);
    });
    assert.strictEqual((await enviar()).status, 501);
    let ruta = null;
    m.n.bus.on('transcribir-audio', e => { ruta = e.ruta; assert.strictEqual(fs.readFileSync(e.ruta).length, 2000); e.responder(null, '  hola apolo  '); });
    const r = await enviar();
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.texto, 'hola apolo');
    assert.match(ruta, /\.webm$/);
    await new Promise(ok => setTimeout(ok, 50));
    assert.ok(!fs.existsSync(ruta), 'el audio temporal se borra');
  } finally { m.cerrar(); }
});
