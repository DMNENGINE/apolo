// Lógica del canal de Slack (sin depender del SDK: se prueba con fetch y WebSocket falsos).
//   Socket Mode: apps.connections.open (token de app xapp-) → WebSocket; cada sobre (envelope_id) se confirma con un ack.
//   Web API (token de bot xoxb-): chat.postMessage / chat.update / conversations.open / auth.test.
//   SOLO el dueño: se enlaza mandando al bot por DM el código del panel; los demás reciben "privado" y no pasan.
//   Permisos con botones Block Kit (Permitir / Siempre / Denegar; los peligrosos piden un segundo paso), tarjetas, avisos,
//   respuestas y notas de voz (clips de audio de Slack → almacén del plugin → Whisper de la app).
// Dependencias inyectadas:
//   fetch       el fetch del proceso (vigilado: solo slack.com y *.slack.com)
//   conectarWS  (url, opciones) → Promise<Conexion> de @apolo/sdk/ws-cliente ('texto', 'cerrar', enviarJSON, cerrar)
//   canal       lo que devuelve apolo.registrarCanal: recibir, estado, decidir, tarjeta, transcribir
//   almacen     { leer(clave, defecto), guardar(clave, valor), ruta }
//   secretos    { leer(nombre), guardar(nombre, valor) } → 'slack:app' (xapp-) y 'slack:bot' (xoxb-)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://slack.com/api/';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// "markdown de Discord" del resto de la app (**negrita**, `código`, ```bloques```) → mrkdwn de Slack (*negrita*)
function mrkdwn(md) {
  const partes = String(md ?? '').split(/(```[\s\S]*?```)/g);
  return partes.map((p, i) => (i % 2 ? esc(p.replace(/^```\w*\n/, '```')) : esc(p).replace(/\*\*([^*\n]+)\*\*/g, '*$1*').replace(/__([^_\n]+)__/g, '_$1_'))).join('').slice(0, 2900);
}
const AYUDA = '🤖 *Qué puedo hacer por aquí*\n• Escríbeme cualquier cosa: la paso al mejor modelo (programar, buscar en la web, usar el PC, tu correo, GitHub…).\n• `gemma: …`, `chatgpt: …`, `claude: …` para elegir modelo.\n• Te pido permiso con botones cuando algo lo necesita.\n• Te aviso de correos y mensajes importantes cuando no estás en el PC.\n• Mándame un clip de audio y lo transcribo.\n\n`estado` · `nueva` · `ayuda`';
const ERRORES_TOKEN = ['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive', 'token_expired'];

function crearSlack({ fetch: f = globalThis.fetch, conectarWS, canal, almacen, secretos, config = {}, log = () => { }, esperaReintento = 5000 }) {
  let tokApp = '', tokBot = '', vivo = false, ws = null, estado = 'sin configurar', bucleEnCurso = null;
  let st = almacen.leer('estado', null) || { dueno: config.dueno || null, dm: null, usuario: '', equipo: '', equipoId: '', bot: '', botId: '', codigo: null };
  const guardar = c => { st = { ...st, ...c }; almacen.guardar('estado', st); };
  const perms = new Map();                                    // id de permiso → { ts, canal, p }
  const tarjetas = new Map();                                 // id de tarjeta → { ts, canal, texto }
  const vistos = new Set();                                   // eventos ya procesados (Slack reintenta)
  const setEstado = e => { if (e === estado) return; estado = e; Promise.resolve(canal.estado(e === 'conectado' ? 'activo' : 'inactivo', e)).catch(() => { }); };
  const esperar = ms => new Promise(ok => setTimeout(ok, ms));

  async function api(metodo, datos = {}, tk = tokBot) {
    const r = await f(API + metodo, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + tk }, body: JSON.stringify(datos), signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (!j.ok) { const e = new Error('Slack: ' + (j.error || 'error')); e.codigo = j.error; throw e; }
    return j;
  }
  const publicar = (canalId, texto, blocks) => api('chat.postMessage', { channel: canalId, text: String(texto).slice(0, 3000), ...(blocks ? { blocks } : {}), unfurl_links: false, unfurl_media: false })
    .catch(e => { log('[slack]', e.message); return null; });
  const actualizar = (canalId, ts, texto, blocks) => api('chat.update', { channel: canalId, ts, text: String(texto).slice(0, 3000), blocks: blocks || [] }).catch(() => { });
  async function dm() {
    if (!st.dueno) return null;
    if (!st.dm) { try { const r = await api('conversations.open', { users: st.dueno }); guardar({ dm: r.channel?.id || null }); } catch (e) { log('[slack]', e.message); } }
    return st.dm;
  }
  const enviar = async (texto, blocks) => { const c = await dm(); return c ? publicar(c, texto, blocks) : null; };
  const seccion = t => ({ type: 'section', text: { type: 'mrkdwn', text: String(t).slice(0, 2900) } });
  const boton = (texto, action_id, value, style) => ({ type: 'button', text: { type: 'plain_text', text: texto, emoji: true }, action_id, value: String(value), ...(style ? { style } : {}) });

  // ---------- Socket Mode ----------
  async function bucle() {
    while (vivo) {
      try {
        const { url } = await api('apps.connections.open', {}, tokApp);
        const c = await conectarWS(url, { timeoutMs: 15_000 });
        if (!vivo) { c.cerrar(1000); return; }
        ws = c;
        await new Promise(fin => {
          c.on('texto', s => alTexto(c, s));
          c.on('cerrar', fin);
        });
        ws = null;
        if (vivo && estado === 'conectado') setEstado('reconectando');
      } catch (e) {
        if (!vivo) return;
        if (ERRORES_TOKEN.includes(e.codigo)) { setEstado('token no válido'); vivo = false; return; }
        setEstado('sin conexión, reintentando');
        log('[slack]', e.message);
      }
      if (vivo) await esperar(esperaReintento);
    }
  }
  // cada mensaje del WebSocket: primero el ack (Slack reenvía lo que no se confirma en 3 s), luego se procesa
  function alTexto(c, s) {
    let m; try { m = JSON.parse(s); } catch { return; }
    if (m.envelope_id) c.enviarJSON({ envelope_id: m.envelope_id });
    if (m.type === 'hello') return setEstado(st.dueno ? 'conectado' : 'esperando enlace');
    if (m.type === 'disconnect') return c.cerrar(1000, 'refresco');          // Slack pide reconectar: el bucle abre otra URL
    const equipoOk = p => !st.equipoId || !p?.team_id && !p?.team?.id || (p.team_id || p.team?.id) === st.equipoId;
    if (m.type === 'events_api' && equipoOk(m.payload)) return evento(m.payload?.event).catch(e => log('[slack]', e.message));
    if (m.type === 'interactive' && equipoOk(m.payload)) return interaccion(m.payload).catch(e => log('[slack]', e.message));
  }

  async function evento(ev) {
    if (!ev || ev.type !== 'message' || ev.channel_type !== 'im') return;                 // solo mensajes directos
    if (ev.bot_id || (st.botId && ev.user === st.botId) || (ev.subtype && ev.subtype !== 'file_share')) return;
    const clave = ev.client_msg_id || `${ev.channel}:${ev.ts}`;
    if (vistos.has(clave)) return; vistos.add(clave); if (vistos.size > 500) vistos.delete(vistos.values().next().value);
    const texto = String(ev.text || '').trim();
    if (!st.dueno) {                                          // enlace: el código del panel por DM
      if (st.codigo && texto.toUpperCase().includes(st.codigo)) {
        guardar({ dueno: ev.user, dm: ev.channel, usuario: ev.user, codigo: null, enlazado: new Date().toISOString() });
        try { const u = await api('users.info', { user: ev.user }); guardar({ usuario: u.user?.real_name || u.user?.name || ev.user }); } catch { }
        setEstado('conectado');
        return publicar(ev.channel, '✅ Listo. Este chat ya está enlazado con tu robot.', [seccion('✅ *Listo.* Este chat ya está enlazado con tu robot.\n\nEscríbeme lo que necesites. Aquí te llegarán también los permisos y avisos cuando no estés en el PC.\n\nEscribe `ayuda` para ver qué puedo hacer.')]);
      }
      return publicar(ev.channel, '🔒 Este bot es privado. Para enlazarlo, mándale el código que aparece en el panel del robot (Configuración → Canales → Slack).');
    }
    if (ev.user !== st.dueno) return publicar(ev.channel, '🔒 Este bot es privado.');
    if (ev.channel !== st.dm) guardar({ dm: ev.channel });
    const audio = (ev.files || []).find(x => /^audio\//.test(x.mimetype || '') || x.subtype === 'slack_audio');
    if (audio) {
      const t = await notaDeVoz(audio);
      if (!t) return;
      await publicar(st.dm, `🎙 _${esc(t)}_`);
      return responder(await canal.recibir(t, { de: 'chat' }));
    }
    if (!texto) return;
    if (/^\/?(ayuda|help)\b/i.test(texto)) return publicar(st.dm, AYUDA);
    if (/^\/?estado$/i.test(texto)) return publicar(st.dm, '🟢 Estoy encendido y escuchando.');
    responder(await canal.recibir(/^\/?nueva$/i.test(texto) ? '/nueva' : texto, { de: 'chat' }));
  }
  const responder = r => { if (r) return publicar(st.dm, mrkdwn(r)); };

  async function notaDeVoz(a) {
    if ((a.size || 0) > 20 * 1024 * 1024) { publicar(st.dm, '🎙 Ese audio es demasiado largo.'); return null; }
    const url = a.url_private_download || a.url_private;
    let ruta = null;
    try {
      if (!url || !/^https:\/\/([\w-]+\.)*slack\.com\//.test(url)) throw new Error('URL de archivo inesperada');
      const r = await f(url, { headers: { authorization: 'Bearer ' + tokBot }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.mkdirSync(almacen.ruta, { recursive: true });
      ruta = path.join(almacen.ruta, `voz-${Date.now()}.${String(a.filetype || 'm4a').replace(/[^\w]/g, '').slice(0, 5) || 'm4a'}`);
      fs.writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
      const t = await canal.transcribir(ruta);
      if (!t || !t.texto) { publicar(st.dm, '🎙 No entendí el audio' + (t?.error ? ` (${t.error})` : '') + '. ¿Me lo escribes?'); return null; }
      return t.texto;
    } catch (e) { log('[slack] voz', e.message); publicar(st.dm, '🎙 No pude descargar el audio (¿le diste a la app el permiso files:read?).'); return null; }
    finally { if (ruta) fs.rm(ruta, () => { }); }
  }

  // botones Block Kit: SOLO del dueño; "perm:ask" = segundo paso de los peligrosos
  async function interaccion(p) {
    if (!p || p.type !== 'block_actions' || !st.dueno || p.user?.id !== st.dueno) return;
    const a = (p.actions || [])[0]; if (!a) return;
    const [tipo, accion] = String(a.action_id || '').split(':'), id = String(a.value || '');
    const cid = p.channel?.id || p.container?.channel_id, ts = p.message?.ts || p.container?.message_ts;
    if (tipo === 'perm') {
      const s = perms.get(id);
      if (accion === 'ask') {
        if (s) await actualizar(s.canal, s.ts, 'Permiso peligroso: ¿seguro?', [seccion(textoPerm(s.p) + '\n\n⛔ *¿Seguro? Esto es peligroso.*'),
          { type: 'actions', block_id: 'perm-' + id, elements: [boton('⛔ Sí, permitir', 'perm:allow', id, 'danger'), boton('✋ No', 'perm:deny', id)] }]);
        return;
      }
      if (!['allow', 'always', 'deny'].includes(accion)) return;
      const ok = await Promise.resolve(canal.decidir(id, accion)).catch(() => false);
      if (!ok && cid && ts) await actualizar(cid, ts, 'Ya no está pendiente', [seccion((s ? textoPerm(s.p) + '\n\n' : '') + '⌛ *Ya no está pendiente.*')]);
      return;
    }
    if (tipo === 'card') {
      const r = await Promise.resolve(canal.tarjeta(id, accion)).catch(e => '❌ ' + e.message);
      const t = tarjetas.get(id);
      if (t) await actualizar(t.canal, t.ts, 'Tarjeta', [seccion(t.texto + '\n\n' + mrkdwn(r))]);
    }
  }

  // ---------- lo que manda la app (permisos, tarjetas, avisos, respuestas) ----------
  const textoPerm = p => `${p.peligro ? '⛔ *PELIGRO* · ' : '⚠️ '}*Permiso: ${esc(p.tool)}*\n📁 ${esc(p.session)}\n\`\`\`${esc(String(p.detail || '').slice(0, 900))}\`\`\`${p.peligro ? `\n*Ojo:* ${esc(p.peligro)}` : ''}`;
  async function permiso(p) {
    if (!tokBot || !st.dueno) return false;
    const id = String(p.id);
    const botones = [boton(p.peligro ? '⚠️ Permitir (peligroso)' : '✅ Permitir', p.peligro ? 'perm:ask' : 'perm:allow', id, p.peligro ? undefined : 'primary')];
    if (!p.peligro) botones.push(boton('🔁 Siempre', 'perm:always', id));
    botones.push(boton('✋ Denegar', 'perm:deny', id, 'danger'));
    const m = await enviar(`Permiso: ${p.tool}`, [seccion(textoPerm(p)), { type: 'actions', block_id: 'perm-' + id, elements: botones }]);
    if (!m) return false;
    perms.set(id, { ts: m.ts, canal: m.channel, p });
    return true;
  }
  function permisoResuelto(id, behavior, via) {
    const s = perms.get(String(id)); if (!s) return; perms.delete(String(id));
    const r = behavior === 'expired' ? '⌛ Caducó sin respuesta' : behavior === 'deny' ? `✋ Denegado desde ${esc(via)}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${esc(via)}`;
    return actualizar(s.canal, s.ts, r, [seccion(textoPerm(s.p) + `\n\n*${r}*`)]);
  }
  async function tarjeta(c) {
    if (!tokBot || !st.dueno) return false;
    const t = `${c.prioridad === 'urgente' ? '🔴 *URGENTE* · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} *${esc(c.author || '')}*${c.guild ? ` · ${esc(c.guild)}` : ''}\n${esc(c.resumen || '')}${c.respuesta ? `\n\n*Respuesta sugerida:*\n_${esc(c.respuesta)}_` : ''}`;
    const id = String(c.id), botones = [];
    if (c.respuesta && c.canSend) botones.push(boton(c.kind === 'mail' ? '📨 Responder' : '📨 Enviar', 'card:enviar', id, 'primary'));
    botones.push(boton('🗑 Descartar', 'card:descartar', id), boton('🔕 Ruido', 'card:ruido', id));
    const m = await enviar(`${c.author || ''}: ${c.resumen || ''}`, [seccion(t), { type: 'actions', block_id: 'card-' + id, elements: botones }]);
    if (!m) return false;
    tarjetas.set(id, { ts: m.ts, canal: m.channel, texto: t });
    return true;
  }
  const avisar = texto => enviar(mrkdwn(texto));

  // ---------- configuración (panel → acciones del canal). Los tokens nunca vuelven al panel ----------
  async function conectar({ appToken, botToken } = {}) {
    const app = String(appToken || '').trim() || tokApp, bot = String(botToken || '').trim() || tokBot;
    if (!/^xapp-[\w-]{20,}$/.test(app)) throw new Error('Falta el token de app (empieza por xapp-). Se crea en Basic Information → App-Level Tokens con el permiso connections:write.');
    if (!/^xoxb-[\w-]{20,}$/.test(bot)) throw new Error('Falta el token de bot (empieza por xoxb-). Está en OAuth & Permissions después de instalar la app.');
    const yo = await api('auth.test', {}, bot);                         // ¿el token de bot funciona?
    await api('apps.connections.open', {}, app);                         // ¿y el de app (Socket Mode activado)?
    detener();
    tokApp = app; tokBot = bot;
    await secretos.guardar('slack:app', app); await secretos.guardar('slack:bot', bot);
    const mismoEquipo = st.equipoId && st.equipoId === yo.team_id && st.dueno;
    guardar({ equipo: yo.team || '', equipoId: yo.team_id || '', bot: yo.user || '', botId: yo.user_id || '',
      ...(mismoEquipo ? {} : { dueno: null, dm: null, usuario: '', enlazado: null, codigo: codigoNuevo() }) });
    iniciar();
    return estadoPublico();
  }
  const codigoNuevo = () => 'APOLO-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  function nuevoEnlace() { guardar({ codigo: codigoNuevo(), dueno: null, dm: null, usuario: '', enlazado: null }); setEstado('esperando enlace'); return estadoPublico(); }
  async function desconectar() {
    detener(); tokApp = ''; tokBot = '';
    await secretos.guardar('slack:app', ''); await secretos.guardar('slack:bot', '');
    st = {}; almacen.guardar('estado', {}); setEstado('sin configurar'); return estadoPublico();
  }
  async function prueba() { if (!await avisar('🤖 **Prueba:** así te llegarán los avisos.')) throw new Error('No se pudo enviar: ¿está enlazado tu usuario?'); return estadoPublico(); }
  const estadoPublico = () => ({
    configurado: !!(tokApp && tokBot), estado, equipo: st.equipo || null, bot: st.bot || null, enlazado: !!st.dueno, usuario: st.usuario || '',
    codigo: tokApp && tokBot && !st.dueno ? st.codigo || null : null,
  });

  function iniciar() {
    if (!tokApp || !tokBot || vivo) return;
    vivo = true; setEstado(st.dueno ? 'conectando' : 'esperando enlace');
    bucleEnCurso = bucle();
  }
  function detener() { vivo = false; try { ws?.cerrar(1000); } catch { } ws = null; }
  async function arrancar() {
    try { tokApp = String(await secretos.leer('slack:app') || ''); tokBot = String(await secretos.leer('slack:bot') || ''); }
    catch (e) { log('[slack] sin acceso a los tokens:', e.message); tokApp = tokBot = ''; }
    if (!tokApp || !tokBot) { setEstado('sin configurar'); return estadoPublico(); }
    if (!st.dueno && !st.codigo) guardar({ codigo: codigoNuevo() });
    iniciar();
    return estadoPublico();
  }

  return {
    arrancar, iniciar, detener, conectar, nuevoEnlace, desconectar, prueba, estado: estadoPublico,
    permiso, permisoResuelto, tarjeta, avisar, alTexto, evento, interaccion,
    get bucle() { return bucleEnCurso; },
  };
}

module.exports = { crearSlack, mrkdwn, esc };
