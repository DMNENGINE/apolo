// WhatsApp y Discord como plugins del SDK. Todo OFFLINE: un Baileys falso (objetos con la forma de sus mensajes), un servidor
// WebSocket local que hace de Gateway de Discord (core/nodos/ws.js) y un fetch falso para su REST. Además: el gestor (canal.ajeno
// solo a la app, exclusión de canales con adaptador), y la regla de exclusión del plugin de Discord con el modo Pi / bot local.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const M = require('../plugins/manifest');
const { analizarEstatico } = require('../skills/escaner');

const RAIZ = path.join(__dirname, '..', '..', 'plugins');
const { crearWhatsapp, extraer, esMiChat, jidIgnorado } = require(path.join(RAIZ, 'whatsapp', 'wa.js'));
const { crearDiscord, intentsDe } = require(path.join(RAIZ, 'discord', 'discord.js'));
const { decidirDiscord } = require('../../shared/canales-flags');

const base = process.env.NUCLEO_HOME && fs.existsSync(process.env.NUCLEO_HOME) ? process.env.NUCLEO_HOME : os.tmpdir();
const tmp = p => fs.mkdtempSync(path.join(base, p));
const hasta = async (f, ms = 3000) => { const t0 = Date.now(); for (; ;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await new Promise(ok => setTimeout(ok, 10)); } };
const dormir = ms => new Promise(ok => setTimeout(ok, ms));

// canal falso con la regla del gestor: SOLO se puede decidir lo que se mostró en este canal
function canalFalso(ruta) {
  const ev = { recibidos: [], decisiones: [], tarjetas: [], estados: [], audios: [], ajenos: [], mostrados: new Set() };
  ev.canal = {
    recibir: async t => { ev.recibidos.push(t); return 'respuesta **ok**'; },
    estado: async (e, d) => { ev.estados.push(d); return true; },
    decidir: async (id, d) => { if (!ev.mostrados.has(String(id))) throw new Error('ese permiso no se mostró en este canal'); ev.decisiones.push([String(id), d]); return true; },
    tarjeta: async (id, a, t) => { ev.tarjetas.push([String(id), a, t]); return 'hecho'; },
    transcribir: async r => { ev.audios.push(fs.existsSync(r) && r.startsWith(ruta)); return { texto: 'hola por voz', error: '' }; },
    ajeno: async d => { ev.ajenos.push(d); return true; },
  };
  return ev;
}
function almacenFalso() {
  const ruta = tmp('canal2-alm-'), datos = {};
  return { ruta, datos, leer: (k, d = null) => (k in datos ? JSON.parse(JSON.stringify(datos[k])) : d), guardar: (k, v) => { datos[k] = JSON.parse(JSON.stringify(v)); return true; } };
}
function secretosFalsos(ini = {}) { const s = { ...ini }, leidos = []; return { s, leidos, leer: async n => { leidos.push(n); return s[n] || ''; }, guardar: async (n, v) => { s[n] = v; return true; } }; }

test('canales2: manifests (red declarada, secretos en su espacio) y escáner estático verde de whatsapp y discord', () => {
  const esperado = {
    whatsapp: [['red:web.whatsapp.com', 'red:*.whatsapp.com', 'red:*.whatsapp.net', 'red:mmg.whatsapp.net'], undefined],
    discord: [['red:discord.com', 'red:gateway.discord.gg', 'red:*.discord.gg', 'red:cdn.discordapp.com', 'red:media.discordapp.net'], ['discord:token']],
  };
  for (const [n, [red, sec]] of Object.entries(esperado)) {
    const d = path.join(RAIZ, n), m = M.leer(d, '1.0.0');
    assert.deepStrictEqual(m.permisos.filter(p => p.startsWith('red')), red, n);
    if (sec) { assert.deepStrictEqual(m.secretos, sec, n); assert.ok(sec.every(s => s.startsWith(n + ':'))); } else assert.ok(!(m.secretos || []).length);
    assert.ok(m.permisos.includes('conversaciones'));
    assert.strictEqual(m.aporta.canales[0].nombre, n); assert.strictEqual(m.aporta.canales[0].permisos, true);
    const r = analizarEstatico(d, { marcador: M.ARCHIVO, dominios: red.map(p => p.slice(4)) });
    assert.strictEqual(r.nivel, 'verde', `${n}: ${JSON.stringify(r.hallazgos)}`);
  }
  // Baileys es dependencia del plugin (se instala con --ignore-scripts al instalarlo), no se copia del repo
  assert.ok(JSON.parse(fs.readFileSync(path.join(RAIZ, 'whatsapp', 'package.json'), 'utf8')).dependencies['@whiskeysockets/baileys']);
});

// ---------------- WhatsApp ----------------
test('whatsapp: parseo de mensajes de Baileys (efímeros, ver una vez, pies de foto, audio) y filtro de tu chat (PN o LID)', () => {
  const yo = { pn: '34600111222@s.whatsapp.net', lid: '99887766@lid' };
  assert.deepStrictEqual(extraer({ key: { remoteJid: 'a@s.whatsapp.net', fromMe: true, id: 'X' }, message: { conversation: ' hola ' } }),
    { id: 'X', jid: 'a@s.whatsapp.net', fromMe: true, participante: '', nombre: '', texto: 'hola', tipo: 'texto', audio: false });
  assert.strictEqual(extraer({ key: {}, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'efímero' } } } } }).texto, 'efímero');
  assert.strictEqual(extraer({ key: {}, message: { viewOnceMessageV2: { message: { imageMessage: { caption: 'foto' } } } } }).tipo, 'imagen');
  assert.strictEqual(extraer({ key: {}, message: { documentWithCaptionMessage: { message: { documentMessage: { caption: 'pdf' } } } } }).texto, 'pdf');
  assert.strictEqual(extraer({ key: {}, message: { audioMessage: { seconds: 3 } } }).audio, true);
  assert.strictEqual(extraer({ key: {}, message: null }).tipo, 'otro');
  assert.ok(esMiChat('34600111222:7@s.whatsapp.net', yo)); assert.ok(esMiChat('99887766@lid', yo));
  assert.ok(!esMiChat('34999888777@s.whatsapp.net', yo)); assert.ok(!esMiChat('34600111222@s.whatsapp.net', null));
  assert.ok(jidIgnorado('status@broadcast')); assert.ok(jidIgnorado('123@newsletter')); assert.ok(!jidIgnorado('1@g.us'));
});

function baileysFalso() {
  const socks = [];
  const B = {
    DisconnectReason: { loggedOut: 401, restartRequired: 515 },
    Browsers: { windows: n => [n, 'Windows', '10'] },
    useMultiFileAuthState: async dir => ({ state: { creds: {} }, saveCreds: async () => fs.writeFileSync(path.join(dir, 'creds.json'), '{}') }),
    fetchLatestWaWebVersion: async () => ({ version: [2, 3000, 1] }),
    downloadMediaMessage: async () => Buffer.from('OggS-falso'),
    makeWASocket: opts => {
      const s = { opts, ev: new EventEmitter(), enviados: [], user: null, fuera: false,
        sendMessage: async (jid, c) => { s.enviados.push([jid, c.text]); return { key: { id: 'out' + s.enviados.length } }; },
        sendPresenceUpdate: async () => { }, logout: async () => { s.fuera = true; }, end: () => { } };
      socks.push(s); return s;
    },
  };
  return { B, socks };
}

test('whatsapp: QR, solo tu chat contigo mismo, permisos 1/2/3 + CONFIRMO acotados, tarjetas R/D, voz, y terceros solo hacia la app', async () => {
  const bf = baileysFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta);
  const w = crearWhatsapp({ cargar: async () => bf.B, qr: async t => 'data:image/png;base64,' + t, canal: ev.canal, almacen: alm, config: { conf: { modo: 'apagado', ignorar: ['34611000000'] } } });
  await w.arrancar();
  assert.strictEqual(bf.socks.length, 0, 'sin sesión no se conecta solo');
  assert.strictEqual(alm.datos.config.ignorar[0], '34611000000', 'la config de whatsapp.json se migra');
  await w.vincular();
  const s = bf.socks[0];
  assert.deepStrictEqual(s.opts.version, [2, 3000, 1]); assert.strictEqual(s.opts.syncFullHistory, false); assert.strictEqual(s.opts.markOnlineOnConnect, false);
  s.ev.emit('connection.update', { qr: 'ABC' });
  await hasta(() => w.estado().qr === 'data:image/png;base64,ABC');
  s.user = { id: '34600111222:5@s.whatsapp.net', lid: '99887766:5@lid' };
  s.ev.emit('creds.update', {});
  s.ev.emit('connection.update', { connection: 'open' });
  await hasta(() => w.estado().conectado);
  assert.strictEqual(w.estado().numero, '34600111222'); assert.strictEqual(w.estado().qr, null);
  assert.ok(fs.existsSync(path.join(alm.ruta, 'auth', 'creds.json')), 'la sesión vive en el almacén del plugin');
  const YO = '34600111222@s.whatsapp.net', ANA = '34999888777@s.whatsapp.net';
  const up = (m, type = 'notify') => s.ev.emit('messages.upsert', { type, messages: [m] });
  const a = (jid, fromMe, message, extra = {}) => ({ key: { remoteJid: jid, fromMe, id: 'in' + Math.random(), ...extra }, message, pushName: extra.pushName });
  const aMi = () => s.enviados.filter(e => e[0] === YO).map(e => e[1]);

  up(a(YO, true, { conversation: 'hola' }));
  await hasta(() => aMi().includes('🤖 respuesta *ok*'));
  up(a('99887766@lid', true, { ephemeralMessage: { message: { extendedTextMessage: { text: 'por lid' } } } }));
  await hasta(() => ev.recibidos.includes('por lid'));
  up(a(YO, false, { conversation: 'no soy yo' }));                       // en tu chat, solo lo que escribes TÚ
  up(a(YO, true, { conversation: 'historial' }), 'append');               // solo 'notify'
  up(a(YO, true, { conversation: '🤖 eco de APOLO' }));
  up(a(ANA, false, { conversation: 'hola jefe' }, { pushName: 'Ana' }));  // modo apagado: ni se lee
  await dormir(50);
  assert.deepStrictEqual(ev.recibidos, ['hola', 'por lid']); assert.strictEqual(ev.ajenos.length, 0);

  // modo avisar: el mensaje de Ana va SOLO a la app (canal.ajeno); el plugin no le contesta
  w.ponerConfig({ modo: 'avisar' });
  up(a(ANA, false, { conversation: 'hola jefe' }, { pushName: 'Ana' }));
  up(a('status@broadcast', false, { conversation: 'estado' }));
  up(a('1203630@g.us', false, { conversation: 'grupo' }, { participant: '34655@s.whatsapp.net' }));
  up(a('34611000000@s.whatsapp.net', false, { conversation: 'ignorado' }));
  await hasta(() => ev.ajenos.length === 1); await dormir(30);
  assert.strictEqual(ev.ajenos.length, 1);
  assert.deepStrictEqual({ ...ev.ajenos[0], historial: ev.ajenos[0].historial.length }, { jid: ANA, nombre: 'Ana', numero: '34999888777', texto: 'hola jefe', grupo: false, historial: 1, auto: false });
  assert.ok(!s.enviados.some(e => e[0] === ANA), 'nunca responde solo a terceros');
  // enviarA: solo lo pide la app, solo a quien te escribió, y el automático solo en modo auto
  await assert.rejects(w.enviarA({ jid: '34777@s.whatsapp.net', texto: 'x' }), /te escribió/);
  await assert.rejects(w.enviarA({ jid: ANA, texto: 'x', automatico: true }), /automático está apagado/);
  assert.strictEqual(await w.enviarA({ jid: ANA, texto: 'Luego te llamo' }), true);
  assert.deepStrictEqual(s.enviados.filter(e => e[0] === ANA), [[ANA, 'Luego te llamo']]);
  w.ponerConfig({ modo: 'auto', auto: { maxHora: 1 } });
  assert.strictEqual(await w.enviarA({ jid: ANA, texto: 'auto 1', automatico: true }), true);
  await assert.rejects(w.enviarA({ jid: ANA, texto: 'auto 2', automatico: true }), /límite/);

  // permisos: solo los mostrados; peligroso → CONFIRMO
  ev.mostrados.add('5'); ev.mostrados.add('6');
  assert.strictEqual(await w.permiso({ id: 5, tool: 'Bash', detail: 'ls', session: 'proyecto' }), true);
  assert.match(aMi().at(-1), /Permiso #5: Bash[\s\S]*\*1\* Permitir · \*2\* Siempre · \*3\* Denegar/);
  assert.strictEqual(await w.permiso({ id: 6, tool: 'Bash', detail: 'rm -rf /', session: 'p', peligro: 'borra todo' }), true);
  up(a(YO, true, { conversation: '1 #6' }));
  await hasta(() => aMi().some(t => /CONFIRMO 6/.test(t)));
  assert.strictEqual(ev.decisiones.length, 0);
  up(a(YO, true, { conversation: 'CONFIRMO 6' }));
  up(a(YO, true, { conversation: '2 #5' }));
  await hasta(() => ev.decisiones.length === 2);
  assert.deepStrictEqual(ev.decisiones.sort(), [['5', 'always'], ['6', 'allow']]);
  up(a(YO, true, { conversation: '3 #9' }));                              // no mostrado aquí
  await hasta(() => aMi().some(t => /ya no está pendiente/.test(t)));
  w.permisoResuelto('5', 'always', 'isla');
  assert.match(aMi().at(-1) || '', /Permitido siempre #5 desde isla/);
  // tarjetas: R con texto propio, D descarta
  up(a(YO, true, { conversation: 'R7 vale, mañana' }));
  up(a(YO, true, { conversation: 'd8' }));
  await hasta(() => ev.tarjetas.length === 2);
  assert.deepStrictEqual(ev.tarjetas.sort(), [['7', 'enviar', 'vale, mañana'], ['8', 'descartar', undefined]]);
  assert.strictEqual(await w.tarjeta({ id: 9, kind: 'whatsapp', author: 'Ana', resumen: 'pregunta', respuesta: 'sí', canSend: true }), true);
  assert.match(aMi().at(-1), /\*R9\* enviar esa respuesta/);
  // nota de voz → almacén → Whisper de la app → como si lo hubieras escrito
  up(a(YO, true, { audioMessage: { seconds: 2 } }));
  await hasta(() => ev.recibidos.includes('hola por voz'));
  assert.deepStrictEqual(ev.audios, [true]);
  // lo desvinculan desde el móvil: se borra la sesión y no reconecta
  s.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  await hasta(() => w.estado().estado === 'desvinculado');
  assert.ok(!fs.existsSync(path.join(alm.ruta, 'auth')));
  await dormir(30); assert.strictEqual(bf.socks.length, 1);
});

// ---------------- Discord ----------------
const TOKEN = [Buffer.from('101234567890123456789').toString('base64'), 'Gabc12', 'x'.repeat(30)].join('.');   // falso, armado al vuelo para que el escáner de secretos de GitHub no lo tome por real
const DUENO = '746608470056370267', BOT = '900000000000000001', EXTRANO = '123456789012345678';
function restFalso() {
  const llamadas = []; let n = 0;
  const r = (j, status = 200) => ({ ok: status < 300, status, json: async () => j, arrayBuffer: async () => new Uint8Array([1, 2]).buffer });
  async function fetch(url, init = {}) {
    if (url.startsWith('https://cdn.discordapp.com/')) { llamadas.push({ metodo: 'GET', ruta: 'cdn' }); return r(null); }
    assert.ok(url.startsWith('https://discord.com/api/v10/'), url);
    const ruta = url.slice(27), cuerpo = init.body ? JSON.parse(init.body) : null;
    llamadas.push({ metodo: init.method, ruta, cuerpo, auth: init.headers.authorization });
    if (/MALO/.test(init.headers.authorization)) return r({ message: '401: Unauthorized', code: 0 }, 401);
    if (ruta === '/users/@me') return r({ id: BOT, username: 'apolo' });
    if (ruta === '/oauth2/applications/@me') return r({ id: '900000000000000002', owner: { id: DUENO }, team: null });
    if (ruta === '/users/@me/channels') return r({ id: 'DM1' });
    if (/^\/channels\/\w+\/messages$/.test(ruta) && init.method === 'POST') return r({ id: 'M' + (++n), channel_id: ruta.split('/')[2] });
    return r(null, 204);
  }
  const de = (metodo, re) => llamadas.filter(l => l.metodo === metodo && re.test(l.ruta));
  return { fetch, llamadas, de };
}
// "Gateway" falso: servidor WebSocket local (el de core/nodos) que manda HELLO, contesta latidos y deja enviar eventos
async function gatewayFalso({ intervalo = 40 } = {}) {
  const { aceptar } = require('../nodos/ws');
  const srv = http.createServer(), conns = [], paquetes = [];
  let s = 0;
  srv.on('upgrade', (req, so, h) => {
    const c = aceptar(req, so, h), i = conns.length; c.url = req.url; conns.push(c);
    c.on('texto', t => { const p = JSON.parse(t); paquetes.push({ con: i, ...p }); if (p.op === 1) c.enviarJSON({ op: 11 }); });
    c.enviarJSON({ op: 10, d: { heartbeat_interval: intervalo } });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = `ws://127.0.0.1:${srv.address().port}`;
  return { srv, url, conns, paquetes, despacho: (t, d, i = conns.length - 1) => conns[i].enviarJSON({ op: 0, s: ++s, t, d }), get s() { return s; }, op: (i, o) => conns[i].enviarJSON(o) };
}

test('discord: gateway propio — hello/identify con intents mínimos, latidos con ACK, READY, reconnect → RESUME, cierre fatal 4004', async () => {
  const { conectar } = require('../sdk/ws-cliente');
  const g = await gatewayFalso(), rf = restFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta), sec = secretosFalsos();
  const bot = crearDiscord({ fetch: rf.fetch, conectarWS: u => conectar(u), canal: ev.canal, almacen: alm, secretos: sec, gateway: g.url, esperaReintento: 20, aleatorio: () => 0 });
  try {
    assert.strictEqual((await bot.arrancar()).configurado, false);
    assert.strictEqual(g.conns.length, 0); assert.strictEqual(rf.llamadas.length, 0);                    // sin token no sale a la red
    await assert.rejects(bot.conectar({ token: 'no-es-un-token' }), /token de bot/);
    await assert.rejects(bot.conectar({ token: TOKEN.replace('abc', 'MALO') }), /Unauthorized/);
    const e = await bot.conectar({ token: TOKEN });
    assert.strictEqual(e.dueno, DUENO, 'el dueño de la app de Discord'); assert.strictEqual(e.codigo, null);
    assert.ok(!JSON.stringify(e).includes(TOKEN), 'el estado nunca devuelve el token');
    assert.strictEqual(sec.s['discord:token'], TOKEN);
    assert.match(e.invitar, /client_id=900000000000000002&scope=bot&permissions=0$/);
    const ident = await hasta(() => g.paquetes.find(p => p.op === 2));
    assert.strictEqual(ident.d.token, TOKEN); assert.strictEqual(ident.d.intents, intentsDe(false)); assert.strictEqual(ident.d.intents, 1 << 12);
    assert.match(g.conns[0].url, /\/\?v=10&encoding=json$/);
    await hasta(() => g.paquetes.filter(p => p.op === 1).length >= 2);                                   // latidos (con ACK, no se cae)
    g.despacho('READY', { session_id: 'S1', resume_gateway_url: g.url, user: { id: BOT, username: 'apolo' } });
    await hasta(() => bot.estado().estado === 'conectado');
    // RECONNECT (op 7) → cierra y hace RESUME con la sesión y la última secuencia
    g.despacho('GUILD_CREATE', { id: '1' });
    const seq = g.s;
    g.op(0, { op: 7, d: null });
    const res = await hasta(() => g.paquetes.find(p => p.op === 6));
    assert.deepStrictEqual(res.d, { token: TOKEN, session_id: 'S1', seq });
    assert.strictEqual(res.con, 1); assert.strictEqual(g.paquetes.filter(p => p.op === 2).length, 1, 'no vuelve a identificarse');
    g.despacho('RESUMED', {});
    await hasta(() => bot.estado().estado === 'conectado');
    // INVALID SESSION (op 9, d=false) → identify nuevo
    g.op(1, { op: 9, d: false });
    await hasta(() => g.paquetes.filter(p => p.op === 2).length === 2, 4000);
    // cierre fatal 4004 (token no válido): para y no reintenta
    g.conns.at(-1).cerrar(4004, 'Authentication failed');
    await hasta(() => bot.estado().estado === 'token no válido');
    const n = g.conns.length; await dormir(120); assert.strictEqual(g.conns.length, n);
  } finally { bot.detener(); g.srv.close(); }
});

test('discord: solo el dueño (DMs), botones → permiso acotado con 2.º paso en peligrosos, tarjetas, avisos y voz', async () => {
  const { conectar } = require('../sdk/ws-cliente');
  const g = await gatewayFalso({ intervalo: 1000 }), rf = restFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta), sec = secretosFalsos({ 'discord:token': TOKEN });
  alm.guardar('estado', { dueno: DUENO, botId: BOT, appId: '900000000000000002' });
  const bot = crearDiscord({ fetch: rf.fetch, conectarWS: u => conectar(u), canal: ev.canal, almacen: alm, secretos: sec, gateway: g.url, esperaReintento: 20, aleatorio: () => 0 });
  try {
    await bot.arrancar();
    await hasta(() => g.paquetes.find(p => p.op === 2));
    g.despacho('READY', { session_id: 'S1', resume_gateway_url: g.url, user: { id: BOT, username: 'apolo' } });
    await hasta(() => bot.estado().estado === 'conectado');
    const msg = (autor, content, extra = {}) => g.despacho('MESSAGE_CREATE', { id: 'x' + Math.random(), channel_id: extra.canal || 'DM9', author: { id: autor, username: 'u', bot: !!extra.bot }, content, attachments: extra.adj || [], ...(extra.guild ? { guild_id: extra.guild } : {}) });
    msg(DUENO, 'hola');
    await hasta(() => rf.de('POST', /^\/channels\/DM9\/messages$/).some(l => l.cuerpo.content === 'respuesta **ok**'));
    msg(EXTRANO, 'hola, soy otro');
    await hasta(() => rf.de('POST', /^\/channels\/DM9\/messages$/).some(l => /privado/.test(l.cuerpo.content)));
    msg(BOT, 'yo mismo', { bot: true });
    msg(DUENO, 'en un servidor', { guild: '55', canal: 'C55' });                  // sin categoría: los servidores no se leen
    await dormir(60);
    assert.deepStrictEqual(ev.recibidos, ['hola']);

    // permiso normal y peligroso, con botones
    ev.mostrados.add('5'); ev.mostrados.add('6');
    assert.strictEqual(await bot.permiso({ id: 5, tool: 'Bash', detail: 'ls', session: 'p' }), true);
    const pm = rf.de('POST', /^\/channels\/DM9\/messages$/).at(-1).cuerpo;     // usa el DM donde le escribiste
    assert.deepStrictEqual(pm.components[0].components.map(b => b.custom_id), ['perm:5:allow', 'perm:5:always', 'perm:5:deny']);
    assert.strictEqual(await bot.permiso({ id: 6, tool: 'Bash', detail: 'rm -rf /', session: 'p', peligro: 'borra todo' }), true);
    const pp = rf.de('POST', /^\/channels\/DM9\/messages$/).at(-1).cuerpo;
    assert.deepStrictEqual(pp.components[0].components.map(b => b.custom_id), ['perm:6:ask', 'perm:6:deny'], 'sin "siempre" en peligrosos');
    const boton = (quien, custom_id, id = 'I' + Math.random()) => g.despacho('INTERACTION_CREATE', { id, token: 'tk', type: 3, channel_id: 'DM9', user: { id: quien }, data: { custom_id }, message: { id: 'M1', channel_id: 'DM9', content: 'Permiso' } });
    boton(EXTRANO, 'perm:5:allow', 'IX');
    await hasta(() => rf.de('POST', /^\/interactions\/IX\/tk\/callback$/).length);
    assert.deepStrictEqual(rf.de('POST', /IX/)[0].cuerpo.type, 4); assert.strictEqual(rf.de('POST', /IX/)[0].cuerpo.data.flags, 64);
    boton(DUENO, 'perm:6:ask', 'IA');
    await hasta(() => rf.de('POST', /^\/interactions\/IA\//).length);
    const paso2 = rf.de('POST', /IA/)[0].cuerpo;
    assert.strictEqual(paso2.type, 7); assert.deepStrictEqual(paso2.data.components[0].components.map(b => b.custom_id), ['perm:6:allow', 'perm:6:deny']);
    assert.strictEqual(ev.decisiones.length, 0, 'el primer clic en un peligroso no decide nada');
    boton(DUENO, 'perm:6:allow', 'IB'); boton(DUENO, 'perm:5:always', 'IC');
    await hasta(() => ev.decisiones.length === 2);
    assert.deepStrictEqual(ev.decisiones.sort(), [['5', 'always'], ['6', 'allow']]);
    assert.strictEqual(rf.de('POST', /IB/)[0].cuerpo.type, 6);
    boton(DUENO, 'perm:99:allow', 'ID');                                         // no mostrado aquí → no se decide
    await hasta(() => rf.de('PATCH', /^\/channels\/DM9\/messages\/M1$/).some(l => /Ya no está pendiente/.test(l.cuerpo.content)));
    bot.permisoResuelto('5', 'always', 'isla');
    await hasta(() => rf.de('PATCH', /messages\/M\d+$/).some(l => /Permitido siempre desde isla/.test(l.cuerpo.content) && !l.cuerpo.components.length));
    // tarjeta + botón
    assert.strictEqual(await bot.tarjeta({ id: 7, kind: 'whatsapp', author: 'Ana', resumen: 'pregunta', respuesta: 'sí', canSend: true }), true);
    boton(DUENO, 'card:7:enviar', 'IE');
    await hasta(() => ev.tarjetas.length === 1);
    assert.deepStrictEqual(ev.tarjetas[0], ['7', 'enviar', undefined]);
    // aviso al DM y nota de voz
    await bot.avisar('🤖 hola');
    msg(DUENO, '', { adj: [{ url: 'https://cdn.discordapp.com/attachments/1/2/voz.ogg', filename: 'voz.ogg', content_type: 'audio/ogg', size: 2000 }] });
    await hasta(() => ev.recibidos.includes('hola por voz'));
    assert.deepStrictEqual(ev.audios, [true]);
  } finally { bot.detener(); g.srv.close(); }
});

test('discord: exclusión — nunca a la vez que el modo Pi o el bot local; con config.bloqueado el plugin no se conecta', async () => {
  assert.deepStrictEqual(decidirDiscord({}, { modo: 'pi', token: 'x' }), { plugin: false, actual: 'pi', bloqueado: '', aviso: '' }, 'sin flag: lo de siempre');
  const pi = decidirDiscord({ discordComoPlugin: true }, { modo: 'pi' });
  assert.strictEqual(pi.plugin, false); assert.match(pi.bloqueado, /Raspberry Pi/); assert.match(pi.aviso, /NO arranca/);
  const local = decidirDiscord({ discordComoPlugin: true }, { token: 'abc' });
  assert.strictEqual(local.plugin, false); assert.strictEqual(local.actual, 'local');
  assert.deepStrictEqual(decidirDiscord({ discordComoPlugin: true }, { token: '  ' }), { plugin: true, actual: 'plugin', bloqueado: '', aviso: '' });
  // el plugin bloqueado ni lee el token ni abre el gateway
  const rf = restFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta), sec = secretosFalsos({ 'discord:token': TOKEN });
  let ws = 0;
  const bot = crearDiscord({ fetch: rf.fetch, conectarWS: async () => { ws++; throw new Error('no'); }, canal: ev.canal, almacen: alm, secretos: sec, config: { bloqueado: pi.bloqueado } });
  const e = await bot.arrancar();
  assert.match(e.estado, /^bloqueado: /); assert.strictEqual(e.bloqueado, pi.bloqueado);
  bot.iniciar(); await dormir(30);
  assert.strictEqual(ws, 0); assert.strictEqual(sec.leidos.length, 0); assert.strictEqual(rf.llamadas.length, 0);
});

// ---------------- gestor ----------------
function nucleoPlugins(extra = {}) {
  const dir = tmp('nucleo-canales2-');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, skills: { rutas: [] }, gestorPlugins: { timeoutMs: 8000, backoffMs: 20 }, ...extra }));
  const { crearNucleo } = require('../index');
  return crearNucleo({ dir, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [], resumen: 'ok' }) }, embedder: null });
}

test('canales2 en el gestor: whatsapp y discord arrancan en su proceso sin sesión/token (sin red), discord bloqueado, excluir con lista', async () => {
  const n = nucleoPlugins({ plugins: { discord: { bloqueado: 'modo pi' } } });
  const pedidos = []; n.bus.on('permiso', p => pedidos.push(p));
  const leidos = [];
  n.plugins.ponerSecretos({ leer: s => { leidos.push(s); return ''; }, guardar: () => true });
  // copia de plugins/whatsapp con node_modules vacío: así el test no instala Baileys (no hay red)
  const wa = path.join(tmp('pl-wa-'), 'whatsapp'); fs.cpSync(path.join(RAIZ, 'whatsapp'), wa, { recursive: true }); fs.mkdirSync(path.join(wa, 'node_modules'));
  try {
    await n.plugins.instalar(wa); await n.plugins.instalar(path.join(RAIZ, 'discord'));
    for (const nom of ['whatsapp', 'discord']) assert.deepStrictEqual((await n.plugins.activar(nom, true)).registrados.canales, [nom]);
    const ew = await hasta(() => n.plugins.accionCanal('whatsapp', 'whatsapp', 'estado'));
    assert.deepStrictEqual([ew.vinculado, ew.conectado, ew.qr, ew.plugin], [false, false, null, true]);
    const ed = await hasta(() => n.plugins.accionCanal('discord', 'discord', 'estado'));
    assert.match(ed.estado, /^bloqueado: modo pi/); assert.strictEqual(ed.configurado, false);
    assert.deepStrictEqual(leidos, [], 'bloqueado: ni pide el token');
    assert.strictEqual(await n.plugins.mostrarPermiso({ id: 1, tool: 'Bash', detail: 'ls', session: 's' }, { excluir: ['whatsapp', 'discord'] }), 0);
    await assert.rejects(n.plugins.accionCanal('whatsapp', 'whatsapp', 'enviarA', { jid: '34999@s.whatsapp.net', texto: 'hola' }), /no está conectado/);
    assert.strictEqual(pedidos.length, 0);
  } finally { await n.plugins.cerrar(); }
});

test('canales2 en el gestor: canal.ajeno llega SOLO a la app (mediador), nunca al bus ni a otros plugins', async () => {
  const n = nucleoPlugins();
  const raiz = tmp('pl-ajeno-'), d = path.join(raiz, 'chismoso'); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'apolo-plugin.json'), JSON.stringify({ nombre: 'chismoso', version: '1.0.0', descripcion: 'prueba', entrada: 'index.js', apoloSdk: '^1.0.0', permisos: ['conversaciones'], aporta: { canales: [{ nombre: 'c' }], comandos: [{ nombre: 'pasar' }] } }));
  fs.writeFileSync(path.join(d, 'index.js'), `const { definirPlugin } = require('@apolo/sdk');
module.exports = definirPlugin({ async activar(apolo) {
  const c = apolo.registrarCanal({ id: 'c', nombre: 'C' });
  apolo.registrarComando({ nombre: 'pasar', ejecutar: async t => String(await c.ajeno({ jid: 'x@s.whatsapp.net', texto: t })) });
} });`);
  const vistos = [], bus = [];
  n.bus.on('evento', e => bus.push(JSON.stringify(e)));
  try {
    await n.plugins.instalar(d); await n.plugins.activar('chismoso', true);
    assert.strictEqual(await n.plugins.comando('pasar', 'secreto de Ana'), 'false', 'sin app que medie no va a ningún sitio');
    n.plugins.mediar({ ajeno: a => { vistos.push(a); } });
    assert.strictEqual(await n.plugins.comando('pasar', 'secreto de Ana'), 'true');
    assert.deepStrictEqual(vistos, [{ plugin: 'chismoso', canal: 'c', datos: { jid: 'x@s.whatsapp.net', texto: 'secreto de Ana' } }]);
    assert.ok(!bus.some(e => e.includes('secreto de Ana')), 'no pasa por el bus');
  } finally { await n.plugins.cerrar(); }
});
