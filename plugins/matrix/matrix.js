// Lógica del canal de Matrix (sin depender del SDK: se prueba con un fetch falso).
//   Client-Server API v3: /sync en long-poll con "since" (incremental y persistido), sala privada creada por el bot e
//   invitación al dueño; solo se acepta la invitación del dueño (las demás se rechazan) y solo se leen SUS mensajes en ESA sala.
//   Permisos: reacciones 👍 / 🔁 / 👎 en el mensaje del permiso, o respondiendo 1 / 2 / 3 (con #n si hay varios pendientes).
//   Los peligrosos nunca tienen "siempre" y piden un segundo paso: CONFIRMO n. Tarjetas con 📨 / 🗑 / 🔕.
//   Notas de voz (m.audio): se descargan en el almacén y las transcribe la app.
//   SIN cifrado de extremo a extremo (v1): la sala se crea sin cifrar; si llega un evento cifrado se avisa.
// Dependencias inyectadas: fetch (vigilado), canal (registrarCanal), almacen, secretos ('matrix:token'), config, log.
const fs = require('fs');
const path = require('path');

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function html(md) {
  return esc(md)
    .replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}
const plano = md => String(md ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/```(?:\w+\n)?/g, '');
const REACCION = { '👍': 'allow', '🔁': 'always', '👎': 'deny', '📨': 'enviar', '🗑': 'descartar', '🔕': 'ruido' };
const sinVS = s => String(s || '').replace(/️/g, '');
const AYUDA = '🤖 **Qué puedo hacer por aquí**\n• Escríbeme cualquier cosa: la paso al mejor modelo.\n• `gemma: …`, `chatgpt: …`, `claude: …` para elegir modelo.\n• Permisos: reacciona 👍 / 🔁 / 👎 o responde 1 / 2 / 3 (los peligrosos piden CONFIRMO n).\n• Mándame una nota de voz y la transcribo.\n\n`estado` · `nueva` · `ayuda`';

// homeserver: https obligatorio salvo en este equipo (pruebas con un servidor local)
function normalizarHs(h) {
  let s = String(h || '').trim(); if (!s) throw new Error('Falta el homeserver (por ejemplo https://matrix.org).');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error('El homeserver debe usar https://');
  return u.origin;
}

function crearMatrix({ fetch: f = globalThis.fetch, canal, almacen, secretos, config = {}, log = () => { }, esperaReintento = 5000, timeoutSync = 30_000 }) {
  let token = '', vivo = false, ctl = null, estado = 'sin configurar', bucleEnCurso = null, txn = 0, corto = 0, avisoCifrado = false;
  let st = almacen.leer('estado', null) || { homeserver: config.homeserver || null, yo: null, dueno: config.dueno || null, sala: null, since: null, duenoUnido: false };
  const guardar = c => { st = { ...st, ...c }; almacen.guardar('estado', st); };
  const perms = new Map();                                    // id de permiso → { evento, n, p, confirmar }
  const porEvento = new Map();                                // event_id del mensaje → { tipo: 'perm'|'card', id }
  const tarjetas = new Map();                                 // id de tarjeta → event_id
  const setEstado = e => { if (e === estado) return; estado = e; Promise.resolve(canal.estado(e === 'conectado' ? 'activo' : 'inactivo', e)).catch(() => { }); };
  const esperar = ms => new Promise(ok => setTimeout(ok, ms));

  async function api(metodo, ruta, cuerpo, { tk = token, hs = st.homeserver, query = null, ms = 30_000, base = '/_matrix/client/v3' } = {}) {
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== null && v !== undefined)).toString() : '';
    const r = await f(hs + base + ruta + qs, { method: metodo, headers: { 'content-type': 'application/json', ...(tk ? { authorization: 'Bearer ' + tk } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: ctl?.signal ? AbortSignal.any([ctl.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('Matrix: ' + (j.error || j.errcode || `HTTP ${r.status}`)); e.codigo = j.errcode; e.status = r.status; throw e; }
    return j;
  }
  const sala = encodeURIComponent;
  async function mandar(tipo, contenido) {
    if (!st.sala) return null;
    const r = await api('PUT', `/rooms/${sala(st.sala)}/send/${tipo}/apolo${Date.now().toString(36)}${++txn}`, contenido).catch(e => { log('[matrix]', e.message); return null; });
    return r?.event_id || null;
  }
  const enviar = md => mandar('m.room.message', { msgtype: 'm.text', body: plano(md).slice(0, 8000), format: 'org.matrix.custom.html', formatted_body: html(md).slice(0, 16000) });
  const editar = (evento, md) => mandar('m.room.message', { msgtype: 'm.text', body: '* ' + plano(md), 'm.new_content': { msgtype: 'm.text', body: plano(md), format: 'org.matrix.custom.html', formatted_body: html(md) }, 'm.relates_to': { rel_type: 'm.replace', event_id: evento } });
  const reaccionar = (evento, clave) => mandar('m.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: evento, key: clave } });

  // ---------- /sync incremental ----------
  async function bucle() {
    while (vivo) {
      try {
        const primero = !st.since;
        const j = await api('GET', '/sync', undefined, { query: { since: st.since, timeout: primero ? 0 : timeoutSync, filter: JSON.stringify({ presence: { not_types: ['*'] }, account_data: { not_types: ['*'] }, room: { timeline: { limit: 30 }, ephemeral: { not_types: ['*'] } } }) }, ms: timeoutSync + 20_000 });
        await procesarSync(j, primero);
        if (j.next_batch) guardar({ since: j.next_batch });   // se guarda: al reiniciar sigue donde iba (sin repetir mensajes)
        if (vivo) setEstado(st.duenoUnido ? 'conectado' : 'esperando al dueño');
      } catch (e) {
        if (!vivo) return;
        if (e.codigo === 'M_UNKNOWN_TOKEN' || e.status === 401) { setEstado('token no válido'); vivo = false; return; }
        setEstado('sin conexión, reintentando'); log('[matrix]', e.message);
        await esperar(esperaReintento);
      }
    }
  }
  async function procesarSync(j, primero) {
    const rooms = j.rooms || {};
    for (const [id, r] of Object.entries(rooms.invite || {})) {          // invitaciones: solo la del dueño
      const inv = (r.invite_state?.events || []).find(e => e.type === 'm.room.member' && e.state_key === st.yo && e.content?.membership === 'invite');
      if (inv && inv.sender === st.dueno) {
        await api('POST', `/rooms/${sala(id)}/join`, {}).catch(e => log('[matrix] join', e.message));
        if (!st.sala || !st.duenoUnido) guardar({ sala: id, duenoUnido: true });
      } else await api('POST', `/rooms/${sala(id)}/leave`, {}).catch(() => { });
    }
    const r = (rooms.join || {})[st.sala]; if (!r) return;
    for (const e of [...(r.state?.events || []), ...(r.timeline?.events || [])]) {
      if (e.type === 'm.room.member' && e.state_key === st.dueno) guardar({ duenoUnido: e.content?.membership === 'join' });
    }
    if (primero) return;                                       // el primer sync es historial: no se responde a mensajes viejos
    for (const e of r.timeline?.events || []) await procesar(e).catch(x => log('[matrix]', x.message));
  }

  async function procesar(ev) {
    if (!ev || ev.sender === st.yo) return;
    if (ev.sender !== st.dueno) return;                         // nadie más, aunque se cuele en la sala
    if (!st.duenoUnido) guardar({ duenoUnido: true });
    const c = ev.content || {};
    if (ev.type === 'm.room.encrypted') { if (!avisoCifrado) { avisoCifrado = true; enviar('🔒 Esta sala está **cifrada** y la v1 del canal de Matrix no lee mensajes cifrados. Usa la sala sin cifrar que creó el robot (ver docs/canales/matrix.md).'); } return; }
    if (ev.type === 'm.reaction') {
      const rel = c['m.relates_to'] || {}; if (rel.rel_type !== 'm.annotation') return;
      const obj = porEvento.get(rel.event_id), acc = REACCION[sinVS(rel.key)];
      if (!obj || !acc) return;
      if (obj.tipo === 'perm' && ['allow', 'always', 'deny'].includes(acc)) return decidirPerm(obj.id, acc);
      if (obj.tipo === 'card' && ['enviar', 'descartar', 'ruido'].includes(acc)) return accionTarjeta(obj.id, acc);
      return;
    }
    if (ev.type !== 'm.room.message' || c['m.relates_to']?.rel_type === 'm.replace') return;
    if (c.msgtype === 'm.audio') {
      const t = await notaDeVoz(c); if (!t) return;
      await enviar(`🎙 _${t}_`);
      return responder(await canal.recibir(t, { de: 'chat' }));
    }
    if (!['m.text', 'm.notice'].includes(c.msgtype)) return;
    const texto = String(c.body || '').replace(/^(> .*\n)+\n?/, '').trim();       // quita la cita de una respuesta
    const objetivo = porEvento.get(c['m.relates_to']?.['m.in_reply_to']?.event_id);
    if (await respuestaRapida(texto, objetivo)) return;
    if (!texto) return;
    if (/^\/?(ayuda|help)$/i.test(texto)) return enviar(AYUDA);
    if (/^\/?estado$/i.test(texto)) return enviar('🟢 Estoy encendido y escuchando.');
    responder(await canal.recibir(/^\/?nueva$/i.test(texto) ? '/nueva' : texto, { de: 'chat' }));
  }
  const responder = r => { if (r) return enviar(String(r)); };

  // "1", "2 #3", "3", "CONFIRMO 3"; "enviar/descartar/ruido" respondiendo a una tarjeta
  async function respuestaRapida(t, objetivo) {
    const conf = /^confirmo\s*#?(\d+)$/i.exec(t);
    if (conf) { const s = [...perms.entries()].find(([, v]) => v.n === +conf[1]); if (!s) { enviar('⌛ Ese permiso ya no está pendiente.'); return true; } if (s[1].p.peligro && !s[1].confirmar) { enviar(`Primero reacciona 👍 o responde \`1 #${s[1].n}\`.`); return true; }
      if (!await Promise.resolve(canal.decidir(s[0], 'allow')).catch(() => false)) enviar('⌛ Ese permiso ya no está pendiente.'); return true; }
    const m = /^([123])(?:\s*#\s*(\d+))?$/.exec(t);
    if (m) {
      let id = objetivo?.tipo === 'perm' ? objetivo.id : null;
      if (!id && m[2]) id = ([...perms.entries()].find(([, v]) => v.n === +m[2]) || [])[0];
      if (!id && perms.size === 1) id = [...perms.keys()][0];
      if (!id) { if (perms.size) enviar('¿Cuál? Hay varios permisos pendientes: escribe por ejemplo `1 #' + [...perms.values()][0].n + '`.'); return !!perms.size; }
      return decidirPerm(id, { 1: 'allow', 2: 'always', 3: 'deny' }[m[1]]).then(() => true);
    }
    if (objetivo?.tipo === 'card' && /^(enviar|descartar|ruido)$/i.test(t)) { await accionTarjeta(objetivo.id, t.toLowerCase()); return true; }
    return false;
  }
  async function decidirPerm(id, accion) {
    const s = perms.get(id);
    if (s && s.p.peligro && accion !== 'deny') {                 // peligroso: nunca "siempre" y segundo paso
      if (!s.confirmar) { s.confirmar = true; await enviar(`⛔ **¿Seguro? Esto es peligroso.** Escribe \`CONFIRMO ${s.n}\` para permitirlo o \`3 #${s.n}\` para denegarlo.`); }
      return;
    }
    const ok = await Promise.resolve(canal.decidir(id, accion)).catch(() => false);
    if (!ok) enviar('⌛ Ese permiso ya no está pendiente.');
  }
  async function accionTarjeta(id, acc) {
    const r = await Promise.resolve(canal.tarjeta(id, acc)).catch(e => '❌ ' + e.message);
    if (r) enviar(String(r));
  }

  async function notaDeVoz(c) {
    if ((c.info?.size || 0) > 20 * 1024 * 1024) { enviar('🎙 Esa nota es demasiado larga.'); return null; }
    const m = /^mxc:\/\/([^/]+)\/([\w-]+)$/.exec(String(c.url || ''));
    if (!m) { enviar('🎙 No pude leer esa nota (¿está cifrada?).'); return null; }
    let ruta = null;
    try {
      let r = await f(`${st.homeserver}/_matrix/client/v1/media/download/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(60_000) });
      if (r.status === 404) r = await f(`${st.homeserver}/_matrix/media/v3/download/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`, { signal: AbortSignal.timeout(60_000) });   // servidores antiguos
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.mkdirSync(almacen.ruta, { recursive: true });
      ruta = path.join(almacen.ruta, `voz-${Date.now()}.ogg`);
      fs.writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
      const t = await canal.transcribir(ruta);
      if (!t || !t.texto) { enviar('🎙 No entendí la nota de voz' + (t?.error ? ` (${t.error})` : '') + '. ¿Me lo escribes?'); return null; }
      return t.texto;
    } catch (e) { log('[matrix] voz', e.message); enviar('🎙 No pude descargar la nota de voz.'); return null; }
    finally { if (ruta) fs.rm(ruta, () => { }); }
  }

  // ---------- lo que manda la app ----------
  const textoPerm = (p, n) => `${p.peligro ? '⛔ **PELIGRO** · ' : '⚠️ '}**Permiso #${n}: ${p.tool}**\n📁 ${p.session}\n\`\`\`\n${String(p.detail || '').slice(0, 900)}\n\`\`\`${p.peligro ? `\n**Ojo:** ${p.peligro}` : ''}`;
  async function permiso(p) {
    if (!token || !st.sala || !st.duenoUnido) return false;
    const id = String(p.id), n = ++corto;
    const pie = p.peligro ? `\n\nReacciona 👍 (te pediré \`CONFIRMO ${n}\`) o 👎 · o responde \`1\` / \`3\`` : `\n\nReacciona 👍 permitir · 🔁 siempre · 👎 denegar · o responde \`1\` / \`2\` / \`3\``;
    const evento = await enviar(textoPerm(p, n) + pie);
    if (!evento) return false;
    perms.set(id, { evento, n, p, confirmar: false }); porEvento.set(evento, { tipo: 'perm', id });
    for (const k of p.peligro ? ['👍', '👎'] : ['👍', '🔁', '👎']) await reaccionar(evento, k);   // "botones": basta con pulsar la reacción
    return true;
  }
  function permisoResuelto(id, behavior, via) {
    const s = perms.get(String(id)); if (!s) return; perms.delete(String(id)); porEvento.delete(s.evento);
    const r = behavior === 'expired' ? '⌛ Caducó sin respuesta' : behavior === 'deny' ? `✋ Denegado desde ${via}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${via}`;
    return editar(s.evento, textoPerm(s.p, s.n) + `\n\n**${r}**`);
  }
  async function tarjeta(c) {
    if (!token || !st.sala || !st.duenoUnido) return false;
    const t = `${c.prioridad === 'urgente' ? '🔴 **URGENTE** · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} **${c.author || ''}**${c.guild ? ` · ${c.guild}` : ''}\n${c.resumen || ''}${c.respuesta ? `\n\n**Respuesta sugerida:**\n${c.respuesta}` : ''}\n\n${c.respuesta && c.canSend ? '📨 enviar · ' : ''}🗑 descartar · 🔕 ruido`;
    const evento = await enviar(t); if (!evento) return false;
    tarjetas.set(String(c.id), evento); porEvento.set(evento, { tipo: 'card', id: String(c.id) });
    return true;
  }
  const avisar = texto => enviar(texto);

  // ---------- configuración (panel) ----------
  async function conectar({ homeserver, usuario, password, token: tk, dueno } = {}) {
    const hs = normalizarHs(homeserver || st.homeserver);
    dueno = String(dueno || st.dueno || '').trim();
    if (!/^@[^:\s]+:[^\s]+$/.test(dueno)) throw new Error('Tu usuario de Matrix debe tener la forma @tu_usuario:servidor.');
    let nuevo = String(tk || '').trim(), yo;
    if (nuevo) yo = (await api('GET', '/account/whoami', undefined, { tk: nuevo, hs })).user_id;
    else if (usuario && password) {
      const r = await api('POST', '/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: String(usuario).trim() }, password: String(password), initial_device_display_name: 'APOLO' }, { tk: '', hs });
      nuevo = r.access_token; yo = r.user_id;
    } else throw new Error('Pon el usuario y la contraseña de la cuenta del BOT (o su token de acceso).');
    if (!nuevo || !yo) throw new Error('El homeserver no devolvió una sesión.');
    if (yo === dueno) throw new Error('La cuenta del bot tiene que ser DISTINTA de la tuya (crea una cuenta solo para APOLO).');
    detener();
    token = nuevo; await secretos.guardar('matrix:token', nuevo);
    const mismaSala = st.sala && st.yo === yo && st.dueno === dueno && st.homeserver === hs;
    guardar({ homeserver: hs, yo, dueno, ...(mismaSala ? {} : { sala: null, since: null, duenoUnido: false }) });
    if (!st.sala) {                                             // sala privada SIN cifrar (v1) e invitación al dueño
      const r = await api('POST', '/createRoom', { preset: 'trusted_private_chat', is_direct: true, invite: [dueno], name: 'APOLO', topic: 'Tu robot APOLO (sin cifrado de extremo a extremo)' });
      guardar({ sala: r.room_id });
    }
    iniciar();
    return estadoPublico();
  }
  async function desconectar() {
    detener();
    if (token && st.sala) await api('POST', `/rooms/${sala(st.sala)}/leave`, {}).catch(() => { });
    if (token) await api('POST', '/logout', {}).catch(() => { });
    token = ''; await secretos.guardar('matrix:token', '');
    st = {}; almacen.guardar('estado', {}); setEstado('sin configurar'); return estadoPublico();
  }
  async function prueba() { if (!st.duenoUnido || !await avisar('🤖 **Prueba:** así te llegarán los avisos.')) throw new Error('No se pudo enviar: ¿aceptaste la invitación a la sala APOLO?'); return estadoPublico(); }
  const estadoPublico = () => ({ configurado: !!token, estado, homeserver: st.homeserver || null, cuenta: st.yo || null, dueno: st.dueno || null, enlazado: !!(st.sala && st.duenoUnido), cifrado: false });

  function iniciar() {
    if (!token || vivo || !st.homeserver) return;
    vivo = true; ctl = new AbortController(); setEstado('conectando');
    bucleEnCurso = bucle();
  }
  function detener() { vivo = false; try { ctl?.abort(); } catch { } ctl = null; }
  async function arrancar() {
    try { token = String(await secretos.leer('matrix:token') || ''); } catch (e) { log('[matrix] sin acceso al token:', e.message); token = ''; }
    if (!token || !st.homeserver) { setEstado('sin configurar'); return estadoPublico(); }
    iniciar();
    return estadoPublico();
  }

  return {
    arrancar, iniciar, detener, conectar, desconectar, prueba, estado: estadoPublico,
    permiso, permisoResuelto, tarjeta, avisar, procesar,
    get bucle() { return bucleEnCurso; },
  };
}

module.exports = { crearMatrix, html, normalizarHs };
