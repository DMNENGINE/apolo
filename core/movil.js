// App móvil (PWA en /m/): emparejar por QR, tokens de dispositivo con alcance limitado, aprobaciones con PIN o passkey
// (WebAuthn verificado aquí con node:crypto) y Web Push propio (VAPID + aes128gcm, RFC 8291/8292) sin dependencias.
//
// Seguridad (ver docs/movil.md):
//   · El token maestro NUNCA va al móvil. El móvil canjea un código de un solo uso (5 min, sale en el QR del escritorio)
//     por un token propio (en disco solo su sha256), revocable, con nombre y última conexión.
//   · cfg.red.moviles = true → el daemon acepta IPs PRIVADAS de la LAN, pero SOLO para los estáticos de /m/ y para /v1 con un
//     token de dispositivo válido; el token maestro desde esas IPs → 403. Sin el modo, esas IPs siguen recibiendo 403 antes de nada.
//   · Alcance del token de dispositivo: chat, permisos (vía /v1/movil/permisos), tarjetas del cerebro, Mission Control,
//     añadir encargos al turno de noche, Wrapped y voz. Nada de /v1/config, claves, privacidad, skills, plugins, memoria…
//   · Aprobar algo PELIGROSO desde el móvil exige prueba: aserción WebAuthn (passkey del dispositivo, con verificación de
//     usuario = huella/cara) o el PIN elegido al emparejar. 5 PIN fallidos → el dispositivo queda bloqueado (hay que re-emparejar).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CADUCA_CODIGO = 5 * 60_000, CADUCA_RETO = 2 * 60_000, MAX_DISPOSITIVOS = 10, MAX_FALLOS_PIN = 5;
const b64u = b => Buffer.from(b).toString('base64url');
const desB64 = s => Buffer.from(String(s || ''), 'base64url');
const sha256 = b => crypto.createHash('sha256').update(b).digest();
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

// ---------- red ----------
// IPs privadas: 10/8, 172.16/12, 192.168/16, 100.64/10 (Tailscale, CGNAT), IPv6 ULA fc00::/7 y enlace local fe80::/10
function ipPrivada(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '').toLowerCase();
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^f[cd][0-9a-f]{0,2}:/.test(ip) || /^fe[89ab][0-9a-f]?:/.test(ip);
}
// estáticos que puede pedir un móvil de la LAN (nada del panel de escritorio)
const ESTATICOS = /^(m\/[\w.-]+(\/[\w.-]+)*|vendor\/[\w.-]+(\/[\w.-]+)*|robot3d\.js|casco\.glb|icono\.svg|i18n\.js|wrapped\.html|wrapped-tarjetas\.js|avatar\.js)$/;
const estaticoMovil = nombre => ESTATICOS.test(nombre) && !nombre.split('/').includes('..');
// IPv4 de la LAN de este equipo (sin adaptadores virtuales), las 192.168 primero
function ipsLan() {
  const r = [];
  for (const [nombre, lista] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|Loopback|vboxnet|br-/i.test(nombre)) continue;
    for (const a of lista || []) if (a.family === 'IPv4' && !a.internal && ipPrivada(a.address)) r.push({ ip: a.address, interfaz: nombre });
  }
  const peso = ip => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3;
  return r.sort((a, b) => peso(a.ip) - peso(b.ip));
}

// ---------- alcance del token de dispositivo ----------
// '*' = un segmento cualquiera; '**' = el resto. /v1/movil/** lo filtra después movil.http según quién llama.
const ALCANCE = [
  ['GET', 'estado'], ['GET', 'sesiones'], ['POST', 'sesiones'], ['GET', 'sesiones/*'], ['POST', 'sesiones/*/mensajes'], ['POST', 'sesiones/*/cancelar'],
  ['GET', 'eventos'], ['GET', 'agentes'], ['GET', 'turno'], ['POST', 'turno'], ['GET', 'wrapped'], ['GET', 'avatar'], ['GET', 'avatar/svg'], ['GET', 'avatar/ia/*'],['POST', 'voz/transcribir'], ['GET', 'panico'], ['POST', 'panico'],   // pánico: el móvil lo activa; reanudar solo desde el escritorio
  ['*', 'movil/**'],
  ['*', 'escritorio/**'],               // escritorio remoto: además exige d.escritorio (permiso concedido desde el PC) → core/escritorio/remoto.js
].map(([m, r]) => [m, r.split('/')]);
function alcance(M, p) {                 // p = ['v1', …]
  const s = p.slice(1);
  return ALCANCE.some(([m, r]) => (m === '*' || m === M) && (r[r.length - 1] === '**'
    ? s.length >= r.length - 1 && r.slice(0, -1).every((x, i) => x === '*' || x === s[i])
    : s.length === r.length && r.every((x, i) => x === '*' || x === s[i])));
}

// ---------- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) ----------
function claveVapidPrivada(v) {
  const pub = desB64(v.publica);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privada, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}
function jwtVapid(v, endpoint, sujeto, ahora = Date.now()) {
  const cab = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const carga = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: sujeto }));
  const firma = crypto.sign('sha256', Buffer.from(`${cab}.${carga}`), { key: claveVapidPrivada(v), dsaEncoding: 'ieee-p1363' });
  return `${cab}.${carga}.${b64u(firma)}`;
}
function cifrarPush(texto, suscripcion, { sal = crypto.randomBytes(16), efimera } = {}) {
  const uaPub = desB64(suscripcion.keys.p256dh), auth = desB64(suscripcion.keys.auth);
  const ecdh = efimera || crypto.createECDH('prime256v1'); if (!efimera) ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secreto = ecdh.computeSecret(uaPub);
  const ikm = hmac(hmac(auth, secreto), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const prk = hmac(sal, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const cifrado = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([sal, rs, Buffer.from([asPub.length]), asPub, cifrado]);
}

// ---------- WebAuthn (solo lo que necesitamos: ES256 / RS256 / EdDSA, attestation 'none') ----------
const ALGS = { '-7': 'sha256', '-257': 'sha256', '-8': null };
function err(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }

const TXT = {
  es: { perm: 'Permiso pendiente', peligro: '⚠ Permiso peligroso', aviso: 'Aviso de {n}' },
  en: { perm: 'Pending permission', peligro: '⚠ Dangerous permission', aviso: 'Notice from {n}' },
};

function crearMovil({ nucleo: n, fetch: fetchPush = globalThis.fetch, ahora = () => Date.now() } = {}) {
  const f = path.join(n.cfg.dir, 'movil.json');
  let st = { dispositivos: [] };
  try { st = { dispositivos: [], ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { }
  const guardar = () => { fs.writeFileSync(f + '.tmp', JSON.stringify(st, null, 2), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); };
  const codigos = new Map(), retos = new Map(), fallosCanje = [];
  let ultimoGuardado = 0;
  const api = { alCambiarActivo: null };

  const activo = () => !!n.cfg.red?.moviles;
  function ponerActivo(v) {
    v = !!v;
    n.cfg.red = { ...(n.cfg.red || {}), moviles: v };
    const fc = path.join(n.cfg.dir, 'config.json');
    let disco = {}; try { disco = JSON.parse(fs.readFileSync(fc, 'utf8')); } catch { }
    disco.red = { permitidos: [], ...(disco.red || {}), moviles: v };
    fs.writeFileSync(fc, JSON.stringify(disco, null, 2));
    n.registro?.add('info', 'móvil', v ? 'acceso de móviles de la LAN activado' : 'acceso de móviles desactivado');
    try { api.alCambiarActivo?.(v); } catch { }
    return v;
  }

  const publico = d => ({ id: d.id, nombre: d.nombre, creado: d.creado, ultimo: d.ultimo, ip: d.ip, so: d.so, idioma: d.idioma, bloqueado: !!d.bloqueado,
    passkeys: (d.passkeys || []).length, push: !!d.push, escritorio: !!d.escritorio });
  const buscar = id => st.dispositivos.find(d => d.id === id);

  // ---------- emparejar ----------
  function limpiar() { const t = ahora(); for (const [k, v] of codigos) if (v.exp < t) codigos.delete(k); for (const [k, v] of retos) if (v.exp < t) retos.delete(k); }
  function urlBase(puerto, ip) {
    const fija = String(n.cfg.red?.urlMovil || '').trim().replace(/\/+$/, '');
    if (fija && /^https?:\/\//.test(fija)) return fija;
    return `http://${ip || ipsLan()[0]?.ip || '127.0.0.1'}:${puerto}`;
  }
  function nuevoCodigo({ puerto = n.cfg.puerto, ip } = {}) {
    limpiar();
    const codigo = b64u(crypto.randomBytes(16)), exp = ahora() + CADUCA_CODIGO;
    codigos.set(codigo, { exp });
    const url = `${urlBase(puerto, ip)}/m/#par=${codigo}`;
    return { codigo, expira: exp, url, svg: require('./qr').svg(url), ips: ipsLan(), activo: activo() };
  }
  function canjear({ codigo, nombre, pin, so, idioma } = {}, { ip = '' } = {}) {
    limpiar();
    const t = ahora();
    while (fallosCanje.length && t - fallosCanje[0] > 10 * 60_000) fallosCanje.shift();
    if (fallosCanje.length >= 20) throw err('demasiados intentos, espera unos minutos', 429);
    const c = codigos.get(String(codigo || ''));
    if (!c || c.exp < t) { fallosCanje.push(t); throw err('código no válido o caducado', 403); }
    if (!/^\d{4,8}$/.test(String(pin || ''))) throw err('el PIN debe tener de 4 a 8 cifras');
    if (st.dispositivos.length >= MAX_DISPOSITIVOS) throw err(`máximo ${MAX_DISPOSITIVOS} dispositivos: revoca alguno en el escritorio`, 409);
    codigos.delete(String(codigo));                       // un solo uso
    const token = b64u(crypto.randomBytes(32)), sal = crypto.randomBytes(16);
    const d = {
      id: 'm' + crypto.randomBytes(5).toString('hex'), nombre: String(nombre || '').trim().slice(0, 40) || 'Móvil', creado: t, ultimo: t, ip: String(ip).slice(0, 60),
      so: String(so || '').slice(0, 40), idioma: /^[a-z]{2}$/.test(idioma) ? idioma : 'es',
      hash: sha256(token).toString('hex'), pin: { sal: sal.toString('hex'), hash: crypto.scryptSync(String(pin), sal, 32).toString('hex') }, fallos: 0, passkeys: [], push: null,
    };
    st.dispositivos.push(d); guardar();
    n.registro?.add('info', 'móvil', `emparejado: ${d.nombre}${ip ? ` (${ip})` : ''}`);
    n.bus.emit('evento', { tipo: 'movil', accion: 'emparejado', dispositivo: publico(d) });
    return { token, dispositivo: publico(d) };
  }
  function autenticar(token, { ip } = {}) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const h = sha256(token).toString('hex');
    const d = st.dispositivos.find(x => x.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
    if (!d || d.bloqueado) return null;
    d.ultimo = ahora(); if (ip) d.ip = String(ip).slice(0, 60);
    if (d.ultimo - ultimoGuardado > 60_000) { ultimoGuardado = d.ultimo; guardar(); }
    return d;
  }
  function revocar(id) {
    const i = st.dispositivos.findIndex(d => d.id === id); if (i < 0) return false;
    const [d] = st.dispositivos.splice(i, 1); guardar();
    n.registro?.add('info', 'móvil', `revocado: ${d.nombre}`);
    n.bus.emit('evento', { tipo: 'movil', accion: 'revocado', id });
    return true;
  }

  // ---------- pruebas para lo peligroso: PIN o passkey ----------
  function comprobarPin(d, pin) {
    if (d.bloqueado) throw err('dispositivo bloqueado: vuelve a emparejarlo', 403);
    const ok = /^\d{4,8}$/.test(String(pin || '')) && crypto.timingSafeEqual(crypto.scryptSync(String(pin), Buffer.from(d.pin.sal, 'hex'), 32), Buffer.from(d.pin.hash, 'hex'));
    if (ok) { if (d.fallos) { d.fallos = 0; guardar(); } return true; }
    d.fallos = (d.fallos || 0) + 1;
    if (d.fallos >= MAX_FALLOS_PIN) { d.bloqueado = true; n.registro?.add('aviso', 'móvil', `${d.nombre} bloqueado por ${MAX_FALLOS_PIN} PIN fallidos`); }
    guardar();
    throw err(d.bloqueado ? 'PIN incorrecto: dispositivo bloqueado' : `PIN incorrecto (quedan ${MAX_FALLOS_PIN - d.fallos})`, 403);
  }
  function nuevoReto(d, uso) { limpiar(); const r = b64u(crypto.randomBytes(32)); retos.set(r, { disp: d.id, uso, exp: ahora() + CADUCA_RETO }); return r; }
  function tomarReto(d, r, uso) {
    const x = retos.get(String(r || '')); retos.delete(String(r || ''));
    if (!x || x.exp < ahora() || x.disp !== d.id || x.uso !== uso) throw err('reto caducado o no válido', 403);
  }
  function clientData(cred, tipo, reto, origen) {
    let cd; try { cd = JSON.parse(desB64(cred.clientDataJSON).toString('utf8')); } catch { throw err('clientDataJSON inválido'); }
    if (cd.type !== tipo || cd.challenge !== reto) throw err('respuesta WebAuthn que no corresponde', 403);
    if (origen && cd.origin !== origen) throw err('origen WebAuthn distinto', 403);
    return cd;
  }
  function registrarPasskey(d, cred = {}, { origen } = {}) {
    tomarReto(d, cred.reto, 'registro');
    const cd = clientData(cred, 'webauthn.create', cred.reto, origen);
    const alg = String(cred.alg ?? -7);
    if (!(alg in ALGS)) throw err('algoritmo no soportado');
    try { crypto.createPublicKey({ key: desB64(cred.publicKey), format: 'der', type: 'spki' }); } catch { throw err('clave pública inválida'); }
    if (cred.authenticatorData) {
      const ad = desB64(cred.authenticatorData);
      if (!ad.subarray(0, 32).equals(sha256(new URL(cd.origin).hostname))) throw err('rpId distinto', 403);
    }
    const id = String(cred.id || '').slice(0, 512); if (!id) throw err('id');
    d.passkeys = (d.passkeys || []).filter(k => k.id !== id);
    d.passkeys.push({ id, spki: String(cred.publicKey), alg: +alg, contador: 0, creada: ahora(), rp: new URL(cd.origin).hostname });
    guardar();
    return { ok: true, passkeys: d.passkeys.length };
  }
  function verificarAsercion(d, cred = {}, uso, { origen } = {}) {
    tomarReto(d, cred.reto, uso);
    const k = (d.passkeys || []).find(x => x.id === cred.id); if (!k) throw err('passkey desconocida', 403);
    const cd = clientData(cred, 'webauthn.get', cred.reto, origen);
    const ad = desB64(cred.authenticatorData);
    if (ad.length < 37 || !ad.subarray(0, 32).equals(sha256(new URL(cd.origin).hostname))) throw err('rpId distinto', 403);
    if (!(ad[32] & 0x01) || !(ad[32] & 0x04)) throw err('falta la verificación de usuario (huella/cara)', 403);
    const cont = ad.readUInt32BE(33);
    if ((cont || k.contador) && cont <= k.contador) throw err('contador de la passkey no válido (¿clonada?)', 403);
    const firmado = Buffer.concat([ad, sha256(desB64(cred.clientDataJSON))]);
    const clave = crypto.createPublicKey({ key: desB64(k.spki), format: 'der', type: 'spki' });
    if (!crypto.verify(ALGS[String(k.alg)], firmado, clave, desB64(cred.signature))) throw err('firma de la passkey no válida', 403);
    k.contador = cont; guardar();
    return true;
  }

  // prueba de identidad para el escritorio remoto (modo 'pin'): passkey con reto de uso 'escritorio' o el PIN
  function probar(d, prueba, uso, ctx = {}) {
    if (prueba?.tipo === 'passkey') return verificarAsercion(d, prueba, uso, ctx);
    if (prueba?.tipo === 'pin') return comprobarPin(d, prueba.pin);
    throw err('confirma con tu huella o tu PIN', 428);
  }
  const retoEscritorio = d => ({ reto: nuevoReto(d, 'escritorio'), credenciales: (d.passkeys || []).map(k => k.id) });

  // ---------- permisos (núcleo + hooks de Claude Code que main.js expone en nodos.permisosExternos) ----------
  function externos() { try { return n.nodos?.permisosExternos?.pendientes?.() || []; } catch { return []; } }
  function permisos() {
    const nuc = n.permisos.pendientes().map(r => ({ id: 'n-' + r.id, origen: r.origen ? `Agente ${r.origen}` : n.personalidad?.nombre?.() || 'APOLO', herramienta: r.herramienta, resumen: r.resumen, peligro: r.peligro ? String(r.peligro === true ? 'peligroso' : r.peligro) : '', creado: r.creado }));
    const ext = externos().map(p => ({ id: 'h-' + p.id, origen: 'Claude Code', herramienta: 'hook', resumen: p.resumen, peligro: p.peligro || '', creado: p.creado }));
    return [...nuc, ...ext].sort((a, b) => (a.creado || 0) - (b.creado || 0));
  }
  function decidir(d, id, { decision, prueba } = {}, ctx = {}) {
    if (!['allow', 'always', 'deny'].includes(decision)) throw err('decision');
    const p = permisos().find(x => x.id === id); if (!p) throw err('ese permiso ya no está pendiente', 404);
    if (decision !== 'deny' && p.peligro) {
      if (prueba?.tipo === 'passkey') verificarAsercion(d, prueba, 'permiso:' + id, ctx);
      else if (prueba?.tipo === 'pin') comprobarPin(d, prueba.pin);
      else throw err('acción peligrosa: confirma con tu huella o tu PIN', 428);
      if (decision === 'always') decision = 'allow';
    }
    const ok = id.startsWith('n-') ? n.permisos.resolver(id.slice(2), decision, undefined, `movil:${d.nombre}`)
      : !!n.nodos?.permisosExternos?.resolver?.(+id.slice(2), decision === 'deny' ? 'deny' : 'allow', `móvil ${d.nombre}`);
    n.registro?.add(p.peligro ? 'aviso' : 'info', 'móvil', `${d.nombre}: ${decision} · ${String(p.resumen).slice(0, 120)}`);
    return { ok };
  }

  // ---------- push ----------
  function vapid() {
    if (!st.vapid) { const e = crypto.createECDH('prime256v1'); e.generateKeys(); st.vapid = { publica: b64u(e.getPublicKey()), privada: b64u(e.getPrivateKey()) }; guardar(); }
    return st.vapid;
  }
  async function enviarPush(d, datos) {
    if (!d.push?.endpoint || typeof fetchPush !== 'function') return false;
    const v = vapid();
    const cuerpo = cifrarPush(JSON.stringify(datos), d.push);
    try {
      const r = await fetchPush(d.push.endpoint, { method: 'POST', body: cuerpo, headers: {
        TTL: '3600', Urgency: datos.urgente ? 'high' : 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        Authorization: `vapid t=${jwtVapid(v, d.push.endpoint, n.cfg.red?.vapidSujeto || 'mailto:apolo@localhost.invalid')}, k=${v.publica}` } });
      if (r.status === 404 || r.status === 410) { d.push = null; guardar(); return false; }   // la suscripción ya no existe
      return r.ok;
    } catch { return false; }
  }
  const conPush = () => st.dispositivos.filter(d => d.push && !d.bloqueado);
  function avisarTodos(fn) { for (const d of conPush()) enviarPush(d, fn(TXT[d.idioma] || TXT.es)).catch(() => { }); }
  const alPermiso = (r, origen) => conPush().length && avisarTodos(t => ({ titulo: r.peligro ? t.peligro : t.perm, cuerpo: `${origen}: ${String(r.resumen || '').slice(0, 160)}`, url: '/m/#permisos', tag: 'perm', urgente: true }));
  n.bus.on('permiso', r => alPermiso(r, r.origen || n.personalidad?.nombre?.() || 'APOLO'));
  n.bus.on('nodo-permiso', r => alPermiso(r, 'Claude Code'));
  n.bus.on('aviso-externo', a => { if (a.urgente && conPush().length) avisarTodos(t => ({ titulo: t.aviso.replace('{n}', a.origen), cuerpo: String(a.texto).slice(0, 200), url: '/m/', tag: 'aviso', urgente: true })); });

  // ---------- HTTP: /v1/movil/… ----------
  // ctx = { maestro: bool, dispositivo: obj|null, origen: header Origin, ip, puerto }
  async function http(M, p, b = {}, ctx = {}) {
    const [, , a, x, y] = p, d = ctx.dispositivo;
    if (ctx.maestro) {                                      // escritorio (panel con el token maestro)
      if (!a && M === 'GET') return { activo: activo(), dispositivos: st.dispositivos.map(publico), lan: ipsLan(), puerto: ctx.puerto, urlMovil: n.cfg.red?.urlMovil || '', vapid: vapid().publica };
      if (a === 'emparejar' && M === 'POST') return nuevoCodigo({ puerto: ctx.puerto, ip: b.ip });
      if (a === 'config' && M === 'PATCH') {
        if (typeof b.urlMovil === 'string') {
          const u = b.urlMovil.trim(); if (u && !/^https?:\/\/[^\s/]+$/.test(u.replace(/\/+$/, ''))) throw err('URL no válida (solo esquema y host, ej. https://apolo.midominio.com)');
          n.cfg.red = { ...(n.cfg.red || {}), urlMovil: u };
          const fc = path.join(n.cfg.dir, 'config.json'); let disco = {}; try { disco = JSON.parse(fs.readFileSync(fc, 'utf8')); } catch { }
          disco.red = { permitidos: [], ...(disco.red || {}), urlMovil: u }; fs.writeFileSync(fc, JSON.stringify(disco, null, 2));
        }
        if (typeof b.activo === 'boolean') ponerActivo(b.activo);
        return { activo: activo(), urlMovil: n.cfg.red?.urlMovil || '' };
      }
      if (a === 'dispositivos' && x) {
        const dd = buscar(x); if (!dd) throw err('dispositivo', 404);
        if (!y && M === 'DELETE') return { ok: revocar(x) };
        if (!y && M === 'PATCH') {
          if (typeof b.nombre === 'string' && b.nombre.trim()) dd.nombre = b.nombre.trim().slice(0, 40);
          if (typeof b.escritorio === 'boolean' && b.escritorio !== !!dd.escritorio) {   // escritorio remoto: SOLO desde el PC (token maestro)
            dd.escritorio = b.escritorio;
            n.auditoria?.registrar({ tipo: 'seguridad', decision: b.escritorio ? 'conceder' : 'retirar', quien: 'panel', resumen: `escritorio remoto ${b.escritorio ? 'permitido' : 'retirado'} a ${dd.nombre}` });
            n.bus.emit('evento', { tipo: 'movil', accion: 'escritorio', id: dd.id, valor: dd.escritorio });
          }
          guardar(); return publico(dd);
        }
        if (y === 'push-prueba' && M === 'POST') return { ok: await enviarPush(dd, { titulo: 'APOLO', cuerpo: (TXT[dd.idioma] || TXT.es) === TXT.en ? 'Test notification ✔' : 'Notificación de prueba ✔', url: '/m/' }) };
      }
      throw err('ruta', 404);
    }
    if (!d) throw err('token de dispositivo', 401);
    if (a === 'yo' && M === 'GET') return { ...publico(d), vapid: vapid().publica, nombreAsistente: n.personalidad?.nombre?.() || 'APOLO' };
    if (a === 'yo' && M === 'PATCH') { if (typeof b.nombre === 'string' && b.nombre.trim()) d.nombre = b.nombre.trim().slice(0, 40); if (/^[a-z]{2}$/.test(b.idioma || '')) d.idioma = b.idioma; guardar(); return publico(d); }
    if (a === 'yo' && M === 'DELETE') return { ok: revocar(d.id) };
    if (a === 'permisos' && !x && M === 'GET') return { permisos: permisos() };
    if (a === 'permisos' && x && M === 'POST') return decidir(d, x, b, ctx);
    if (a === 'reto' && M === 'POST') {                     // reto WebAuthn para aprobar un permiso concreto
      if (!permisos().some(q => q.id === b.permiso)) throw err('ese permiso ya no está pendiente', 404);
      return { reto: nuevoReto(d, 'permiso:' + b.permiso), credenciales: (d.passkeys || []).map(k => k.id) };
    }
    if (a === 'passkey' && x === 'opciones' && M === 'POST') {
      comprobarPin(d, b.pin);
      return { reto: nuevoReto(d, 'registro'), usuario: { id: b64u(Buffer.from(d.id)), nombre: d.nombre }, rp: n.personalidad?.nombre?.() || 'APOLO', excluir: (d.passkeys || []).map(k => k.id) };
    }
    if (a === 'passkey' && x === 'registrar' && M === 'POST') return registrarPasskey(d, b, ctx);
    if (a === 'passkey' && !x && M === 'DELETE') { d.passkeys = []; guardar(); return { ok: true }; }
    if (a === 'push' && M === 'POST') {
      const s = b.suscripcion || {};
      if (!/^https:\/\//.test(s.endpoint || '') || !s.keys?.p256dh || !s.keys?.auth) throw err('suscripción push inválida');
      if (desB64(s.keys.p256dh).length !== 65 || desB64(s.keys.auth).length < 16) throw err('claves push inválidas');
      d.push = { endpoint: String(s.endpoint).slice(0, 1000), keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }; guardar();
      return { ok: true };
    }
    if (a === 'push' && M === 'DELETE') { d.push = null; guardar(); return { ok: true }; }
    if (a === 'tarjetas' && !x && M === 'GET') {
      const t = (() => { try { return n.cerebro?.tarjetas?.() || []; } catch { return []; } })();
      return { disponible: typeof n.cerebro?.tarjetas === 'function', tarjetas: t.slice(-40).reverse().map(c => ({ id: c.id, tipo: c.kind, prioridad: c.prioridad, autor: c.author, lugar: [c.guild, c.channel].filter(Boolean).join(' · '), resumen: c.resumen, texto: String(c.text || '').slice(0, 600), respuesta: c.respuesta || '', puedeEnviar: !!c.canSend, t: c.t })) };
    }
    if (a === 'tarjetas' && x && M === 'POST') {
      if (!['enviar', 'descartar', 'ruido'].includes(b.accion)) throw err('accion');
      if (typeof n.cerebro?.accion !== 'function') throw err('el cerebro no está (abre la app de escritorio)', 503);
      return { texto: await n.cerebro.accion(+x, b.accion, typeof b.texto === 'string' ? b.texto.slice(0, 4000) : undefined) };
    }
    throw err('fuera del alcance del móvil', 403);
  }

  return Object.assign(api, { activo, ponerActivo, nuevoCodigo, canjear, autenticar, revocar, lista: () => st.dispositivos.map(publico), permisos, decidir, probar, retoEscritorio, http, vapid, enviarPush, ipsLan });
}

module.exports = { crearMovil, ipPrivada, estaticoMovil, alcance, ipsLan, cifrarPush, jwtVapid };
