// Canales como plugins del SDK: Slack (Socket Mode), Matrix (Client-Server API) y Signal (signal-cli JSON-RPC).
// Todo OFFLINE: fetch y WebSocket falsos (nunca se llama a slack.com, a un homeserver ni a signal-cli). Además: el cliente
// WebSocket del SDK contra el servidor de core/nodos/ws.js, los tres plugins cargados en el gestor (su proceso) y secretos.
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
const { crearSlack, mrkdwn } = require(path.join(RAIZ, 'slack', 'slack.js'));
const { crearMatrix } = require(path.join(RAIZ, 'matrix', 'matrix.js'));
const { crearSignal, normalizarUrl } = require(path.join(RAIZ, 'signal', 'signal.js'));

const base = process.env.NUCLEO_HOME && fs.existsSync(process.env.NUCLEO_HOME) ? process.env.NUCLEO_HOME : os.tmpdir();
const tmp = p => fs.mkdtempSync(path.join(base, p));
const hasta = async (f, ms = 3000) => { const t0 = Date.now(); for (; ;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await new Promise(ok => setTimeout(ok, 10)); } };

// canal falso con la regla del gestor: SOLO se puede decidir lo que se mostró en este canal
function canalFalso(ruta) {
  const ev = { recibidos: [], decisiones: [], tarjetas: [], estados: [], audios: [], mostrados: new Set() };
  ev.canal = {
    recibir: async t => { ev.recibidos.push(t); return 'respuesta **ok**'; },
    estado: async (e, d) => { ev.estados.push(d); return true; },
    decidir: async (id, d) => { if (!ev.mostrados.has(id)) throw new Error('ese permiso no se mostró en este canal'); ev.decisiones.push([id, d]); return true; },
    tarjeta: async (id, a) => { ev.tarjetas.push([id, a]); return 'hecho'; },
    transcribir: async r => { ev.audios.push(fs.existsSync(r) && r.startsWith(ruta)); return { texto: 'hola por voz', error: '' }; },
  };
  return ev;
}
function almacenFalso() {
  const ruta = tmp('canal-alm-'), datos = {};
  return { ruta, datos, leer: (k, d = null) => (k in datos ? JSON.parse(JSON.stringify(datos[k])) : d), guardar: (k, v) => { datos[k] = JSON.parse(JSON.stringify(v)); return true; } };
}
function secretosFalsos(ini = {}) { const s = { ...ini }; return { s, leer: async n => s[n] || '', guardar: async (n, v) => { s[n] = v; return true; } }; }

test('canales: manifests (red declarada, secretos en su espacio, canal con permisos) y escáner estático verde', () => {
  const esperado = { slack: [['red:slack.com', 'red:*.slack.com'], ['slack:app', 'slack:bot']], matrix: [['red:matrix.org', 'red:*.matrix.org'], ['matrix:token']], signal: [['red:127.0.0.1', 'red:localhost'], []] };
  for (const [n, [red, sec]] of Object.entries(esperado)) {
    const d = path.join(RAIZ, n), m = M.leer(d, '1.0.0');
    assert.deepStrictEqual(m.permisos.filter(p => p.startsWith('red')), red, n);
    assert.deepStrictEqual(m.secretos, sec, n);
    assert.ok(sec.every(s => s.startsWith(n + ':')), `${n}: secretos fuera de su espacio`);
    assert.strictEqual(m.aporta.canales[0].nombre, n); assert.strictEqual(m.aporta.canales[0].permisos, true);
    const r = analizarEstatico(d, { marcador: M.ARCHIVO, dominios: red.map(p => p.slice(4)) });
    assert.strictEqual(r.nivel, 'verde', `${n}: ${JSON.stringify(r.hallazgos)}`);
  }
  assert.strictEqual(mrkdwn('**a** <b> `c`'), '*a* &lt;b&gt; `c`');
});

test('ws-cliente del SDK: handshake, texto en los dos sentidos, ping/pong y cierre contra el servidor de nodos', async () => {
  const { conectar } = require('../sdk/ws-cliente');
  const { aceptar } = require('../nodos/ws');
  const srv = http.createServer();
  srv.on('upgrade', (req, s, h) => {
    const c = aceptar(req, s, h);
    c.enviarTexto('{"type":"hello"}');                     // llega pegado al 101: lo tiene que leer igual
    c.on('texto', t => c.enviarTexto('eco:' + t));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const ws = await conectar(`ws://127.0.0.1:${srv.address().port}/link/?ticket=x`, { cabeceras: { 'x-prueba': '1' } });
  const recibidos = []; ws.on('texto', t => recibidos.push(t));
  await hasta(() => recibidos.includes('{"type":"hello"}'));
  ws.enviarJSON({ envelope_id: 'e1' });
  await hasta(() => recibidos.includes('eco:{"envelope_id":"e1"}'));
  const pong = new Promise(ok => ws.once('pong', ok)); ws.ping(); await pong;
  const cerrado = new Promise(ok => ws.once('cerrar', ok)); ws.cerrar(1000, 'adiós');
  assert.strictEqual((await cerrado).codigo, 1000);
  await assert.rejects(conectar('http://127.0.0.1:1/'), /ws:\/\//);
  srv.close();
});

// ---------------- Slack ----------------
function slackFalso() {
  const llamadas = [], sockets = []; let ts = 1000;
  const r = j => ({ ok: true, status: 200, json: async () => j });
  async function fetch(url, init = {}) {
    if (url.startsWith('https://files.slack.com/')) { llamadas.push({ metodo: 'descarga', auth: init.headers?.authorization }); return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; }
    if (!url.startsWith('https://slack.com/api/')) throw new Error('URL inesperada ' + url);
    const metodo = url.slice(22), datos = JSON.parse(init.body || '{}'), auth = init.headers.authorization;
    llamadas.push({ metodo, datos, auth });
    if (/MALO/.test(auth)) return r({ ok: false, error: 'invalid_auth' });
    switch (metodo) {
      case 'auth.test': return r({ ok: true, user_id: 'UBOT', user: 'apolo', team: 'Equipo', team_id: 'T1' });
      case 'apps.connections.open': return r({ ok: true, url: 'wss://wss-primary.slack.com/link/?ticket=t' + llamadas.length });
      case 'chat.postMessage': return r({ ok: true, ts: String(++ts), channel: datos.channel });
      case 'users.info': return r({ ok: true, user: { real_name: 'Demon' } });
      case 'conversations.open': return r({ ok: true, channel: { id: 'D1' } });
      default: return r({ ok: true });
    }
  }
  async function conectarWS(url) {
    assert.match(url, /^wss:\/\/wss-primary\.slack\.com\//);
    const w = new EventEmitter(); w.enviados = [];
    w.enviarJSON = o => w.enviados.push(o); w.cerrar = () => setImmediate(() => w.emit('cerrar', { codigo: 1000 }));
    sockets.push(w); return w;
  }
  const de = (metodo, pred = () => true) => llamadas.filter(l => l.metodo === metodo && pred(l.datos || {}));
  return { fetch, conectarWS, llamadas, sockets, de };
}

test('slack: conectar valida y guarda los tokens cifrados (nunca vuelven), Socket Mode con ack y solo el dueño', async () => {
  const sl = slackFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta), sec = secretosFalsos();
  const bot = crearSlack({ fetch: sl.fetch, conectarWS: sl.conectarWS, canal: ev.canal, almacen: alm, secretos: sec, esperaReintento: 20 });
  assert.strictEqual((await bot.arrancar()).configurado, false);
  assert.strictEqual(sl.llamadas.length, 0);                                        // sin tokens no sale a la red
  await assert.rejects(bot.conectar({ appToken: 'hola', botToken: 'xoxb-' + 'a'.repeat(30) }), /xapp-/);
  await assert.rejects(bot.conectar({ appToken: 'xapp-' + 'a'.repeat(30), botToken: 'xoxb-MALO' + 'a'.repeat(30) }), /invalid_auth/);
  const APP = 'xapp-1-' + 'b'.repeat(30), BOT = 'xoxb-' + 'c'.repeat(30);
  const e = await bot.conectar({ appToken: APP, botToken: BOT });
  assert.deepStrictEqual([sec.s['slack:app'], sec.s['slack:bot']], [APP, BOT]);
  assert.match(e.codigo, /^APOLO-[0-9A-F]{6}$/);
  assert.ok(!JSON.stringify(e).includes('xoxb') && !JSON.stringify(e).includes('xapp'), 'el estado no lleva tokens');
  assert.strictEqual(sl.de('apps.connections.open').at(-1).auth, 'Bearer ' + APP);
  const ws = await hasta(() => sl.sockets[0]);
  ws.emit('texto', JSON.stringify({ type: 'hello' }));
  const evento = (id, event, team = 'T1') => ws.emit('texto', JSON.stringify({ envelope_id: id, type: 'events_api', payload: { team_id: team, event } }));
  const dm = (user, text, extra = {}) => ({ type: 'message', channel_type: 'im', channel: user === 'U1' ? 'D1' : 'D9', user, text, ts: String(Math.random()), ...extra });
  // un extraño con un código malo → ack + privado; el dueño con el código → enlazado
  evento('e1', dm('U9', 'hola'));
  await hasta(() => sl.de('chat.postMessage', d => d.channel === 'D9').length);
  assert.deepStrictEqual(ws.enviados[0], { envelope_id: 'e1' });
  assert.match(sl.de('chat.postMessage', d => d.channel === 'D9')[0].datos.text, /privado/);
  evento('e2', dm('U1', `este es mi código ${e.codigo.toLowerCase()}`));
  await hasta(() => bot.estado().enlazado);
  assert.strictEqual(alm.datos.estado.dueno, 'U1'); assert.strictEqual(alm.datos.estado.codigo, null);
  await hasta(() => bot.estado().usuario === 'Demon');
  // otros usuarios, bots, otro equipo y reintentos de Slack no pasan; el dueño sí, una vez
  evento('e3', dm('U9', 'cuélame'));
  evento('e4', dm('U1', 'soy un bot', { bot_id: 'B1' }));
  evento('e5', dm('U1', 'de otro equipo'), 'T2');
  evento('e6', dm('U1', 'qué tal', { client_msg_id: 'm1' }));
  evento('e7', dm('U1', 'qué tal', { client_msg_id: 'm1' }));
  await hasta(() => sl.de('chat.postMessage', d => d.channel === 'D1' && d.text === 'respuesta *ok*').length);
  await hasta(() => ws.enviados.length === 7);                                         // todos confirmados (ack)
  assert.deepStrictEqual(ev.recibidos, ['qué tal']);
  assert.strictEqual(sl.de('chat.postMessage', d => d.channel === 'D9').length, 2);
  // Slack pide reconectar ("disconnect") → nueva URL y nuevo WebSocket
  ws.emit('texto', JSON.stringify({ type: 'disconnect', reason: 'refresh_requested' }));
  await hasta(() => sl.sockets.length === 2);
  bot.detener();
});

test('slack: botones Block Kit → permiso acotado (solo el dueño, solo lo mostrado, peligrosos en dos pasos), tarjetas y voz', async () => {
  const sl = slackFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta);
  alm.guardar('estado', { dueno: 'U1', dm: 'D1', usuario: 'Demon', equipo: 'Equipo', equipoId: 'T1', bot: 'apolo', botId: 'UBOT', codigo: null });
  const sec = secretosFalsos({ 'slack:app': 'xapp-1-' + 'b'.repeat(30), 'slack:bot': 'xoxb-' + 'c'.repeat(30) });
  const bot = crearSlack({ fetch: sl.fetch, conectarWS: sl.conectarWS, canal: ev.canal, almacen: alm, secretos: sec, esperaReintento: 20 });
  await bot.arrancar();
  const ws = await hasta(() => sl.sockets[0]);
  const mostrar = p => { ev.mostrados.add(p.id); return bot.permiso(p); };
  const pulsar = (id, user, action_id, value) => ws.emit('texto', JSON.stringify({ envelope_id: id, type: 'interactive', payload: { type: 'block_actions', team: { id: 'T1' }, user: { id: user }, channel: { id: 'D1' }, message: { ts: '1' }, actions: [{ action_id, value }] } }));
  assert.strictEqual(await mostrar({ id: '7', tool: 'Bash', detail: 'npm test', peligro: '', session: 'proyecto' }), true);
  const msg = sl.de('chat.postMessage', d => /Permiso: Bash/.test(d.text))[0].datos;
  assert.deepStrictEqual(msg.blocks[1].elements.map(b => [b.action_id, b.value]), [['perm:allow', '7'], ['perm:always', '7'], ['perm:deny', '7']]);
  pulsar('i1', 'U9', 'perm:allow', '7');                                                  // otro usuario: nada
  pulsar('i2', 'U1', 'perm:allow', '99');                                                 // nunca mostrado: rechazado
  pulsar('i3', 'U1', 'perm:allow', '7');
  await hasta(() => ev.decisiones.length === 1 && sl.de('chat.update', d => /Ya no está pendiente/.test(d.text)).length);
  assert.deepStrictEqual(ev.decisiones, [['7', 'allow']]);
  assert.deepStrictEqual(ws.enviados.map(x => x.envelope_id), ['i1', 'i2', 'i3']);
  await bot.permisoResuelto('7', 'allow', 'Slack');
  assert.ok(sl.de('chat.update', d => /Permitido desde Slack/.test(d.text)).length);
  // peligroso: sin "Siempre"; primero confirma
  await mostrar({ id: '8', tool: 'Bash', detail: 'rm -rf /', peligro: 'borra todo', session: 'x' });
  assert.deepStrictEqual(sl.de('chat.postMessage', d => /PELIGRO/.test(JSON.stringify(d.blocks || ''))).at(-1).datos.blocks[1].elements.map(b => b.action_id), ['perm:ask', 'perm:deny']);
  pulsar('i4', 'U1', 'perm:ask', '8');
  await hasta(() => sl.de('chat.update', d => /¿Seguro\?/.test(JSON.stringify(d.blocks))).length);
  assert.deepStrictEqual(sl.de('chat.update', d => /¿Seguro\?/.test(JSON.stringify(d.blocks)))[0].datos.blocks[1].elements.map(b => b.action_id), ['perm:allow', 'perm:deny']);
  assert.strictEqual(ev.decisiones.length, 1);
  pulsar('i5', 'U1', 'perm:allow', '8');
  await hasta(() => ev.decisiones.length === 2);
  assert.deepStrictEqual(ev.decisiones[1], ['8', 'allow']);
  // tarjeta
  assert.strictEqual(await bot.tarjeta({ id: '3', kind: 'mail', author: 'Ana', resumen: 'factura', respuesta: 'ok', canSend: true, prioridad: 'urgente' }), true);
  pulsar('i6', 'U1', 'card:enviar', '3');
  await hasta(() => ev.tarjetas.length);
  assert.deepStrictEqual(ev.tarjetas, [['3', 'enviar']]);
  // clip de audio → descarga con el token de bot al almacén → transcripción → APOLO
  ws.emit('texto', JSON.stringify({ envelope_id: 'e9', type: 'events_api', payload: { team_id: 'T1', event: { type: 'message', subtype: 'file_share', channel_type: 'im', channel: 'D1', user: 'U1', text: '', ts: '5.5',
    files: [{ mimetype: 'audio/mp4', subtype: 'slack_audio', filetype: 'm4a', size: 100, url_private_download: 'https://files.slack.com/files-pri/T1-F1/download/audio.m4a' }] } } }));
  await hasta(() => ev.recibidos.length === 1);
  assert.deepStrictEqual(ev.audios, [true]); assert.strictEqual(ev.recibidos[0], 'hola por voz');
  assert.match(sl.de('descarga')[0].auth, /^Bearer xoxb-/);
  await hasta(() => !fs.readdirSync(alm.ruta).some(f => f.startsWith('voz-')));
  bot.detener();
});

// ---------------- Matrix ----------------
function matrixFalso() {
  const llamadas = [], cola = []; let despertar = null, n = 0;
  const r = (j, status = 200) => ({ ok: status < 400, status, json: async () => j, arrayBuffer: async () => new Uint8Array([1]).buffer });
  async function fetch(url, init = {}) {
    const u = new URL(url), ruta = u.pathname.replace('/_matrix/client/v3', ''), cuerpo = init.body ? JSON.parse(init.body) : null;
    if (u.origin !== 'https://matrix.example.org') throw new Error('URL inesperada ' + url);
    llamadas.push({ metodo: init.method || 'GET', ruta, q: Object.fromEntries(u.searchParams), cuerpo, auth: init.headers?.authorization });
    if (ruta.startsWith('/_matrix/client/v1/media/download/')) return r({});
    if (ruta === '/login') return cuerpo.password === 'pw' ? r({ access_token: 'syt_TOKEN_SECRETO', user_id: '@apolo:example.org' }) : r({ errcode: 'M_FORBIDDEN', error: 'Invalid password' }, 403);
    if (ruta === '/account/whoami') return r({ user_id: '@apolo:example.org' });
    if (ruta === '/createRoom') return r({ room_id: '!sala:example.org' });
    if (/\/send\//.test(ruta)) return r({ event_id: '$ev' + (++n) });
    if (ruta === '/sync') {
      if (!cola.length) await new Promise((ok, mal) => { despertar = ok; init.signal?.addEventListener('abort', () => mal(new Error('abortado')), { once: true }); });
      return r(cola.shift());
    }
    return r({});
  }
  const sync = j => { cola.push(j); const d = despertar; despertar = null; d?.(); };
  const de = (pred = () => true) => llamadas.filter(pred);
  const enviados = tipo => llamadas.filter(l => l.metodo === 'PUT' && l.ruta.includes(`/send/${tipo}/`));
  return { fetch, llamadas, sync, de, enviados };
}

test('matrix: login (sin guardar la contraseña), sala sin cifrar, sync incremental con since, solo el dueño, permisos por reacción y 1/2/3', async () => {
  const mx = matrixFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta), sec = secretosFalsos();
  const bot = crearMatrix({ fetch: mx.fetch, canal: ev.canal, almacen: alm, secretos: sec, esperaReintento: 20, timeoutSync: 50 });
  assert.strictEqual((await bot.arrancar()).configurado, false);
  await assert.rejects(bot.conectar({ homeserver: 'http://matrix.example.org', usuario: 'apolo', password: 'pw', dueno: '@demon:example.org' }), /https/);
  await assert.rejects(bot.conectar({ homeserver: 'matrix.example.org', usuario: 'apolo', password: 'pw', dueno: 'demon' }), /@tu_usuario/);
  await assert.rejects(bot.conectar({ homeserver: 'matrix.example.org', usuario: 'apolo', password: 'mala', dueno: '@demon:example.org' }), /Invalid password/);
  const e = await bot.conectar({ homeserver: 'matrix.example.org', usuario: 'apolo', password: 'pw', dueno: '@demon:example.org' });
  assert.strictEqual(sec.s['matrix:token'], 'syt_TOKEN_SECRETO');
  assert.ok(!/syt_|pw/.test(JSON.stringify(e)) && !JSON.stringify(alm.datos).includes('syt_'), 'ni token ni contraseña en el estado');
  const sala = mx.de(l => l.ruta === '/createRoom')[0].cuerpo;
  assert.deepStrictEqual(sala.invite, ['@demon:example.org']); assert.ok(!sala.initial_state, 'sin m.room.encryption');
  const yo = '@apolo:example.org', D = '@demon:example.org', S = '!sala:example.org';
  const msg = (sender, body, extra = {}) => ({ type: 'm.room.message', sender, event_id: '$m' + Math.random(), content: { msgtype: 'm.text', body, ...extra } });
  const syncs = () => mx.de(l => l.ruta === '/sync');
  // 1.er sync (sin since, timeout 0): historial → no se responde; la invitación de un extraño se rechaza
  await hasta(() => syncs().length === 1);
  assert.strictEqual(syncs()[0].q.since, undefined); assert.strictEqual(syncs()[0].q.timeout, '0');
  mx.sync({ next_batch: 's1', rooms: {
    join: { [S]: { timeline: { events: [{ type: 'm.room.member', state_key: D, sender: D, content: { membership: 'join' } }, msg(D, 'mensaje viejo')] } } },
    invite: { '!spam:x': { invite_state: { events: [{ type: 'm.room.member', state_key: yo, sender: '@spam:x', content: { membership: 'invite' } }] } } } } });
  await hasta(() => syncs().length === 2);
  assert.strictEqual(syncs()[1].q.since, 's1');                                        // incremental
  assert.strictEqual(alm.datos.estado.since, 's1');                                    // y persistido
  assert.ok(mx.de(l => l.ruta === '/rooms/!spam%3Ax/leave' || l.ruta === '/rooms/' + encodeURIComponent('!spam:x') + '/leave').length);
  assert.deepStrictEqual(ev.recibidos, []);
  assert.strictEqual(bot.estado().enlazado, true);
  // 2.º sync: el extraño no pasa (ni en la sala), el dueño sí; otra sala tampoco
  mx.sync({ next_batch: 's2', rooms: { join: { [S]: { timeline: { events: [msg('@otro:x', 'cuélame'), msg(D, 'qué tal'), msg(yo, 'eco propio')] } }, '!otra:x': { timeline: { events: [msg(D, 'en otra sala')] } } } } });
  await hasta(() => syncs().length === 3);
  assert.strictEqual(syncs()[2].q.since, 's2');
  await hasta(() => mx.enviados('m.room.message').some(l => l.cuerpo.body === 'respuesta ok'));
  assert.deepStrictEqual(ev.recibidos, ['qué tal']);
  assert.match(mx.enviados('m.room.message').find(l => l.cuerpo.body === 'respuesta ok').cuerpo.formatted_body, /<b>ok<\/b>/);
  // permiso normal: reacciones 👍 🔁 👎 como botones; la reacción del extraño no vale, la del dueño sí
  ev.mostrados.add('7');
  assert.strictEqual(await bot.permiso({ id: '7', tool: 'Bash', detail: 'npm test', peligro: '', session: 'proyecto' }), true);
  assert.ok(mx.enviados('m.room.message').some(l => /Permiso #1: Bash/.test(l.cuerpo.body) && /👍 permitir/.test(l.cuerpo.body)));
  assert.deepStrictEqual(mx.enviados('m.reaction').map(l => l.cuerpo['m.relates_to'].key), ['👍', '🔁', '👎']);
  const evId = mx.enviados('m.reaction')[0].cuerpo['m.relates_to'].event_id;
  assert.match(evId, /^\$ev\d+$/);
  const reac = (sender, key, evento = evId) => ({ type: 'm.reaction', sender, content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: evento, key } } });
  mx.sync({ next_batch: 's3', rooms: { join: { [S]: { timeline: { events: [reac('@otro:x', '👍'), reac(yo, '👍'), reac(D, '👍️')] } } } } });
  await hasta(() => ev.decisiones.length === 1);
  assert.deepStrictEqual(ev.decisiones, [['7', 'allow']]);
  await bot.permisoResuelto('7', 'allow', 'Matrix');
  assert.ok(mx.enviados('m.room.message').some(l => l.cuerpo['m.relates_to']?.rel_type === 'm.replace' && /Permitido desde Matrix/.test(l.cuerpo['m.new_content'].body)));
  // peligroso: "1" pide CONFIRMO; "CONFIRMO 2" lo permite
  ev.mostrados.add('8');
  await bot.permiso({ id: '8', tool: 'Bash', detail: 'rm -rf /', peligro: 'borra todo', session: 'x' });
  mx.sync({ next_batch: 's4', rooms: { join: { [S]: { timeline: { events: [msg(D, '1')] } } } } });
  await hasta(() => mx.enviados('m.room.message').some(l => /CONFIRMO 2/.test(l.cuerpo.body)));
  assert.strictEqual(ev.decisiones.length, 1);
  mx.sync({ next_batch: 's5', rooms: { join: { [S]: { timeline: { events: [msg(D, 'confirmo 2')] } } } } });
  await hasta(() => ev.decisiones.length === 2);
  assert.deepStrictEqual(ev.decisiones[1], ['8', 'allow']);
  // nota de voz (m.audio) → descarga autenticada → Whisper → APOLO
  mx.sync({ next_batch: 's6', rooms: { join: { [S]: { timeline: { events: [{ type: 'm.room.message', sender: D, content: { msgtype: 'm.audio', body: 'nota.ogg', url: 'mxc://example.org/abc123', info: { size: 10 } } }] } } } } });
  await hasta(() => ev.recibidos.length === 2);
  assert.strictEqual(ev.recibidos[1], 'hola por voz'); assert.deepStrictEqual(ev.audios, [true]);
  assert.strictEqual(mx.de(l => /media\/download\/example\.org\/abc123$/.test(l.ruta))[0].auth, 'Bearer syt_TOKEN_SECRETO');
  bot.detener();
});

// ---------------- Signal ----------------
function signalFalso() {
  const llamadas = []; let ts = 5000, ctl = null;
  async function fetch(url, init = {}) {
    const u = new URL(url);
    if (u.origin !== 'http://127.0.0.1:8080') throw new Error('URL inesperada ' + url);
    if (u.pathname === '/api/v1/events') {
      llamadas.push({ metodo: 'events', q: Object.fromEntries(u.searchParams) });
      const body = new ReadableStream({ start(c) { ctl = c; init.signal?.addEventListener('abort', () => { try { c.error(new Error('abortado')); } catch { } }, { once: true }); } });
      return { ok: true, status: 200, body };
    }
    const j = JSON.parse(init.body); llamadas.push(j);
    const res = { version: () => ({ version: '0.13.4' }), send: () => ({ timestamp: ++ts }), sendReaction: () => ({ timestamp: ++ts }), getAttachment: () => ({ data: Buffer.from('OggS').toString('base64') }) }[j.method]?.();
    j.resultado = res;
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: j.id, result: res }) };
  }
  const empujar = (...envs) => { const t = envs.map(e => `event: receive\ndata: ${JSON.stringify({ envelope: e, account: '+34600000001' })}\n\n`).join(''); const m = t.length >> 1; ctl.enqueue(new TextEncoder().encode(t.slice(0, m))); ctl.enqueue(new TextEncoder().encode(t.slice(m))); };
  const metodo = (m, pred = () => true) => llamadas.filter(l => l.method === m && pred(l.params));
  return { fetch, llamadas, empujar, metodo, get listo() { return !!ctl; } };
}

test('signal: solo 127.0.0.1, solo el número del dueño (ni extraños ni grupos), eventos SSE, permisos por reacción y CONFIRMO, voz', async () => {
  assert.throws(() => normalizarUrl('http://192.168.1.5:8080'), /este equipo/);
  assert.throws(() => normalizarUrl('https://127.0.0.1:8080'), /este equipo/);
  const sg = signalFalso(), alm = almacenFalso(), ev = canalFalso(alm.ruta);
  const bot = crearSignal({ fetch: sg.fetch, canal: ev.canal, almacen: alm, esperaReintento: 20 });
  assert.strictEqual((await bot.arrancar()).configurado, false);
  assert.strictEqual(sg.llamadas.length, 0);
  await assert.rejects(bot.conectar({ cuenta: '+34600000001', dueno: '+34600000001' }), /DISTINTO/);
  await assert.rejects(bot.conectar({ url: 'http://10.0.0.2:8080', cuenta: '+34600000001', dueno: '+34600000002' }), /este equipo/);
  const DUENO = '+34600000002', CUENTA = '+34600000001';
  await bot.conectar({ cuenta: CUENTA, dueno: '+34 600 000 002' });
  assert.deepStrictEqual(sg.metodo('send')[0].params, { recipient: [DUENO], message: sg.metodo('send')[0].params.message, account: CUENTA });
  await hasta(() => sg.listo);
  assert.strictEqual(sg.llamadas.find(l => l.metodo === 'events').q.account, CUENTA);
  const de = (num, dataMessage, uuid) => ({ sourceNumber: num, source: num, sourceUuid: uuid, timestamp: Date.now(), dataMessage });
  sg.empujar(de('+34999999999', { message: 'cuélame' }), de(DUENO, { message: 'en un grupo', groupInfo: { groupId: 'g' } }), de(DUENO, { message: 'qué tal' }, 'uuid-dueno'));
  await hasta(() => sg.metodo('send', p => p.message === 'respuesta ok').length);
  assert.deepStrictEqual(ev.recibidos, ['qué tal']);
  assert.ok(sg.metodo('send').every(l => l.params.recipient[0] === DUENO), 'nunca escribe a otro número');
  assert.strictEqual(bot.estado().enlazado, true);
  // el dueño escribiendo solo con su UUID (número oculto) también vale
  sg.empujar({ sourceUuid: 'uuid-dueno', timestamp: 1, dataMessage: { message: 'por uuid' } });
  await hasta(() => ev.recibidos.length === 2);
  // permiso: reacción 👍 al mensaje (por su timestamp) → permitir; la del extraño no
  ev.mostrados.add('7');
  assert.strictEqual(await bot.permiso({ id: '7', tool: 'Bash', detail: 'npm test', peligro: '', session: 'p' }), true);
  const tsPerm = sg.metodo('send', p => /Permiso #1/.test(p.message))[0].resultado.timestamp;
  const reaccion = { emoji: '👍', targetAuthorNumber: CUENTA, targetSentTimestamp: tsPerm, isRemove: false };
  sg.empujar(de('+34999999999', { reaction: reaccion }), de(DUENO, { reaction: reaccion }));
  await hasta(() => ev.decisiones.length === 1);
  assert.deepStrictEqual(ev.decisiones, [['7', 'allow']]);
  await bot.permisoResuelto('7', 'allow', 'Signal');
  // peligroso: "1" pide confirmación; "CONFIRMO 2" lo permite
  ev.mostrados.add('8');
  await bot.permiso({ id: '8', tool: 'Bash', detail: 'rm -rf /', peligro: 'borra todo', session: 'x' });
  sg.empujar(de(DUENO, { message: '1' }));
  await hasta(() => sg.metodo('send', p => /CONFIRMO 2/.test(p.message) && /Seguro/.test(p.message)).length);
  assert.strictEqual(ev.decisiones.length, 1);
  sg.empujar(de(DUENO, { message: 'CONFIRMO 2' }));
  await hasta(() => ev.decisiones.length === 2);
  assert.deepStrictEqual(ev.decisiones[1], ['8', 'allow']);
  // nota de voz → getAttachment (base64) → almacén → Whisper
  sg.empujar(de(DUENO, { attachments: [{ id: 'att1', contentType: 'audio/aac', size: 4 }] }));
  await hasta(() => ev.recibidos.length === 3);
  assert.strictEqual(ev.recibidos[2], 'hola por voz'); assert.deepStrictEqual(ev.audios, [true]);
  assert.deepStrictEqual(sg.metodo('getAttachment')[0].params, { id: 'att1', recipient: DUENO, account: CUENTA });
  bot.detener();
});

// ---------------- gestor: procesos reales, sin red ----------------
function nucleoPlugins() {
  const dir = tmp('nucleo-canales-');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, skills: { rutas: [] }, gestorPlugins: { timeoutMs: 8000, backoffMs: 20 } }));
  const { crearNucleo } = require('../index');
  return crearNucleo({ dir, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [], resumen: 'ok' }) }, embedder: null });
}

test('canales en el gestor: slack, matrix y signal arrancan en su proceso sin tokens (sin red ni preguntas) y no muestran permisos', async () => {
  const n = nucleoPlugins();
  const pedidos = []; n.bus.on('permiso', p => pedidos.push(p));
  const guardados = {};
  n.plugins.ponerSecretos({ leer: s => guardados[s] || '', guardar: (s, v) => { guardados[s] = v; return true; } });
  try {
    for (const nom of ['slack', 'matrix', 'signal']) {
      await n.plugins.instalar(path.join(RAIZ, nom));
      const p = await n.plugins.activar(nom, true);
      assert.deepStrictEqual(p.registrados.canales, [nom]);
      const e = await hasta(() => n.plugins.accionCanal(nom, nom, 'estado'));
      assert.strictEqual(e.configurado, false, nom);
    }
    assert.strictEqual(await n.plugins.mostrarPermiso({ id: 1, tool: 'Bash', detail: 'ls', session: 's' }), 0);
    await assert.rejects(n.plugins.accionCanal('slack', 'slack', 'conectar', { appToken: 'x', botToken: 'y' }), /xapp-/);
    await assert.rejects(n.plugins.accionCanal('signal', 'signal', 'conectar', { url: 'http://8.8.8.8:8080', cuenta: '+34600000001', dueno: '+34600000002' }), /este equipo/);
    await assert.rejects(n.plugins.accionCanal('matrix', 'matrix', 'toString'), /no tiene la acción/);
    assert.strictEqual(pedidos.length, 0);                                                     // ni red ni secretos ajenos
  } finally { await n.plugins.cerrar(); }
});

test('canales en el gestor: un plugin no puede leer secretos que no declaró (ni los de otro canal)', async () => {
  const n = nucleoPlugins();
  const raiz = tmp('pl-curioso-'), d = path.join(raiz, 'curioso'); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'apolo-plugin.json'), JSON.stringify({ nombre: 'curioso', version: '1.0.0', descripcion: 'prueba', entrada: 'index.js', apoloSdk: '^1.0.0', permisos: [], secretos: ['curioso:clave'], aporta: { comandos: [{ nombre: 'leer_secreto' }] } }));
  fs.writeFileSync(path.join(d, 'index.js'), `const { definirPlugin } = require('@apolo/sdk');
module.exports = definirPlugin({ async activar(apolo) {
  apolo.registrarComando({ nombre: 'leer_secreto', ejecutar: async t => { try { return 'OK ' + await apolo.secretos.leer(t); } catch (e) { return 'ERROR ' + e.message; } } });
} });`);
  const almacen = { 'curioso:clave': 'valor-propio-123', 'slack:bot': 'xoxb-DEL-OTRO', 'tg:token': '1:AAA' };
  n.plugins.ponerSecretos({ leer: s => almacen[s] || '' });
  try {
    await n.plugins.instalar(d); await n.plugins.activar('curioso', true);
    assert.strictEqual(await n.plugins.comando('leer_secreto', 'curioso:clave'), 'OK valor-propio-123');
    for (const s of ['slack:bot', 'tg:token', 'matrix:token']) assert.match(await n.plugins.comando('leer_secreto', s), /^ERROR .*no está declarado/, s);
  } finally { await n.plugins.cerrar(); }
});
