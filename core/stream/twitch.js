// Chat de Twitch por IRC sobre WebSocket (wss://irc-ws.chat.twitch.tv).
// Lectura anónima con un nick "justinfanNNNN" (no hace falta cuenta); para ESCRIBIR hace falta el OAuth del bot (chat:read chat:edit, ver docs/stream.md).
// Sin dependencias: usa el WebSocket global de Node ≥ 22 (o el que se le inyecte en las pruebas).
const URL_IRC = 'wss://irc-ws.chat.twitch.tv:443';

// valores de tags IRCv3: \s espacio, \: punto y coma, \\ barra, \r \n
const desescapar = v => String(v || '').replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] ?? c));

// "@a=1;b=2 :nick!nick@nick.tmi.twitch.tv PRIVMSG #canal :hola" → { tags, prefijo, nick, comando, params, texto }
function parsearIRC(linea) {
  let l = String(linea || '').replace(/\r?\n$/, '');
  if (!l) return null;
  const r = { tags: {}, prefijo: '', nick: '', comando: '', params: [], texto: '' };
  if (l[0] === '@') {
    const fin = l.indexOf(' '); if (fin < 0) return null;
    for (const par of l.slice(1, fin).split(';')) {
      const i = par.indexOf('=');
      if (i < 0) r.tags[par] = true; else r.tags[par.slice(0, i)] = desescapar(par.slice(i + 1));
    }
    l = l.slice(fin + 1).replace(/^ +/, '');
  }
  if (l[0] === ':') {
    const fin = l.indexOf(' '); if (fin < 0) return null;
    r.prefijo = l.slice(1, fin); r.nick = r.prefijo.split('!')[0];
    l = l.slice(fin + 1).replace(/^ +/, '');
  }
  const t = l.indexOf(' :');
  const cabeza = t >= 0 ? l.slice(0, t) : l;
  if (t >= 0) r.texto = l.slice(t + 2);
  const partes = cabeza.split(' ').filter(Boolean);
  r.comando = (partes.shift() || '').toUpperCase();
  r.params = partes;
  return r.comando ? r : null;
}

const insignias = s => Object.fromEntries(String(s || '').split(',').filter(Boolean).map(b => b.split('/')));

// PRIVMSG → mensaje normalizado del chat
function mensajeDe(m) {
  if (!m || m.comando !== 'PRIVMSG') return null;
  let texto = m.texto;
  const accion = /^\u0001ACTION (.*)\u0001$/.exec(texto); if (accion) texto = accion[1];   // /me
  const b = insignias(m.tags.badges);
  return {
    plataforma: 'twitch', id: m.tags.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    canal: String(m.params[0] || '').replace(/^#/, ''), login: m.nick, usuario: m.tags['display-name'] || m.nick,
    texto, color: m.tags.color || '', t: +m.tags['tmi-sent-ts'] || Date.now(),
    mod: m.tags.mod === '1' || 'moderator' in b, streamer: 'broadcaster' in b, sub: m.tags.subscriber === '1' || 'subscriber' in b, vip: 'vip' in b,
    bits: +m.tags.bits || 0, primero: m.tags['first-msg'] === '1',
  };
}

// USERNOTICE (subs, raids…) y bits → alerta para el overlay
function alertaDe(m) {
  if (!m) return null;
  if (m.comando === 'PRIVMSG' && +m.tags.bits > 0) return { plataforma: 'twitch', tipo: 'bits', usuario: m.tags['display-name'] || m.nick, cantidad: +m.tags.bits, texto: m.texto };
  if (m.comando !== 'USERNOTICE') return null;
  const id = m.tags['msg-id'] || '', usuario = m.tags['msg-param-displayName'] || m.tags['display-name'] || m.tags.login || '';
  const tipo = { sub: 'sub', resub: 'sub', subgift: 'regalo', submysterygift: 'regalo', anonsubgift: 'regalo', giftpaidupgrade: 'sub', primepaidupgrade: 'sub', raid: 'raid', announcement: 'anuncio' }[id];
  if (!tipo) return null;
  const cantidad = tipo === 'raid' ? +m.tags['msg-param-viewerCount'] || 0 : id === 'submysterygift' ? +m.tags['msg-param-mass-gift-count'] || 1 : +m.tags['msg-param-cumulative-months'] || +m.tags['msg-param-months'] || 0;
  return { plataforma: 'twitch', tipo, subtipo: id, usuario, cantidad, para: m.tags['msg-param-recipient-display-name'] || '', texto: m.texto || '', sistema: m.tags['system-msg'] || '' };
}

// conexión con reconexión automática. alMensaje(msg), alAlerta(a), alEstado({estado, detalle})
function crearTwitch({ canal, usuario = '', oauth = '', WS = globalThis.WebSocket, url = URL_IRC, alMensaje = () => { }, alAlerta = () => { }, alEstado = () => { }, alBorrar = () => { }, log = () => { } } = {}) {
  canal = String(canal || '').trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/[/?].*$/, '');
  if (!/^[a-z0-9_]{2,25}$/.test(canal)) throw new Error('canal de Twitch no válido');
  if (!WS) throw new Error('este Node no tiene WebSocket (hace falta Node ≥ 22)');
  const conToken = !!(oauth && usuario);
  const nick = conToken ? String(usuario).toLowerCase() : `justinfan${10000 + Math.floor(Math.random() * 89999)}`;
  let ws = null, parado = false, intentos = 0, temporizador = null, estado = 'conectando', vivo = null;
  const ponerEstado = (e, detalle = '') => { estado = e; alEstado({ estado: e, detalle }); };
  const enviarCrudo = l => { try { if (ws && ws.readyState === 1) ws.send(l + '\r\n'); } catch { } };

  function conectar() {
    if (parado) return;
    ponerEstado('conectando');
    try { ws = new WS(url); } catch (e) { ponerEstado('error', e.message); return reintentar(); }
    ws.onopen = () => {
      enviarCrudo('CAP REQ :twitch.tv/tags twitch.tv/commands');
      enviarCrudo(`PASS ${conToken ? 'oauth:' + String(oauth).replace(/^oauth:/, '') : 'SCHMOOPIIE'}`);
      enviarCrudo(`NICK ${nick}`);
      enviarCrudo(`JOIN #${canal}`);
    };
    let buf = '';
    ws.onmessage = ev => {
      buf += typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
      const lineas = buf.split('\r\n'); buf = lineas.pop();
      for (const l of lineas) procesar(parsearIRC(l));
    };
    ws.onclose = () => { clearInterval(vivo); if (!parado) { ponerEstado('desconectado', 'reconectando…'); reintentar(); } };
    ws.onerror = () => { };
    clearInterval(vivo);
    vivo = setInterval(() => enviarCrudo('PING :tmi.twitch.tv'), 240_000);
  }
  function reintentar() {
    if (parado) return;
    clearTimeout(temporizador);
    const ms = Math.min(60_000, 1000 * 2 ** intentos++);
    temporizador = setTimeout(conectar, ms);
  }
  function procesar(m) {
    if (!m) return;
    if (m.comando === 'PING') return enviarCrudo(`PONG :${m.texto || 'tmi.twitch.tv'}`);
    if (m.comando === 'RECONNECT') { try { ws.close(); } catch { } return; }
    if (m.comando === 'NOTICE' && /login authentication failed|improperly formatted auth|invalid nick/i.test(m.texto)) {
      parado = true; ponerEstado('error', 'Twitch rechazó el OAuth del bot'); try { ws.close(); } catch { } return;
    }
    if (m.comando === 'ROOMSTATE' || (m.comando === 'JOIN' && m.nick === nick)) { if (estado !== 'conectado') { intentos = 0; ponerEstado('conectado', conToken ? `#${canal} como ${nick}` : `#${canal} (solo lectura)`); } return; }
    if (m.comando === 'CLEARCHAT' || m.comando === 'CLEARMSG') return alBorrar({ usuario: m.texto || '', id: m.tags['target-msg-id'] || '' });
    const a = alertaDe(m); if (a) alAlerta(a);
    const msg = mensajeDe(m); if (msg) alMensaje(msg);
  }
  conectar();
  return {
    canal, nick, puedeEscribir: conToken,
    estado: () => estado,
    escribir(texto) {
      if (!conToken) return false;
      const t = String(texto || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 480);
      if (!t) return false;
      enviarCrudo(`PRIVMSG #${canal} :${t}`); return true;
    },
    cerrar() { parado = true; clearTimeout(temporizador); clearInterval(vivo); try { ws && ws.close(); } catch { } ponerEstado('desconectado'); },
  };
}

module.exports = { parsearIRC, mensajeDe, alertaDe, crearTwitch, desescapar, URL_IRC };
