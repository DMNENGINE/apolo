// Lógica del bot de Telegram (sin depender del SDK: se prueba con un fetch falso). La misma funcionalidad que telegram.js de la app:
//   enlace con t.me/<bot>?start=<código>, SOLO el chat enlazado, permisos con botones (los peligrosos piden confirmación),
//   tarjetas, respuestas, avisos y notas de voz (se descargan en el almacén del plugin y las transcribe la app).
// Dependencias inyectadas:
//   fetch                       el fetch del proceso (vigilado: solo api.telegram.org)
//   canal                       lo que devuelve apolo.registrarCanal: recibir, estado, decidir, tarjeta, transcribir
//   almacen                     { leer(clave, defecto), guardar(clave, valor), ruta }
//   secretos                    { leer(nombre), guardar(nombre, valor) } → 'tg:token' (almacén cifrado de la app)
//   config                      cfg.plugins.telegram (solo lectura): { chatId, bot, usuario } para migrar el enlace de telegram.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://api.telegram.org/bot';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// el resto de la app escribe en "markdown de Discord": **negrita**, `código`, ```bloques``` → HTML de Telegram
function html(md) {
  return esc(md)
    .replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .slice(0, 4000);
}
const AYUDA = '🤖 <b>Qué puedo hacer por aquí</b>\n• Escríbeme cualquier cosa: la paso al mejor modelo (programar, buscar en la web, usar el PC, tu correo, GitHub…).\n• <code>gemma: …</code>, <code>chatgpt: …</code>, <code>claude: …</code> para elegir modelo.\n• <code>usa auto</code> / <code>usa claude code</code> para cambiar el destino.\n• Te pido permiso con botones cuando algo lo necesita.\n• Te aviso de correos y mensajes importantes cuando no estás en el PC.\n• Mándame una nota de voz y la transcribo.\n\n/estado · /nueva · /ayuda';

function crearBot({ fetch: f = globalThis.fetch, canal, almacen, secretos, config = {}, log = () => { }, esperaReintento = 5000 }) {
  let token = '', vivo = false, ctl = null, estado = 'sin configurar', offset = 0, bucleEnCurso = null;
  // estado persistente en el almacén del plugin; la 1.ª vez se migra el enlace del antiguo telegram.js (cfg.plugins.telegram)
  // y se GUARDA en el momento. También se repara un estado guardado sin enlace por un arranque que aún no tenía esa config
  // (sin chat, sin código pendiente y sin desconexión a propósito): conectar/nuevoEnlace dejan código y desconectar deja la marca.
  const desdeConfig = { chatId: config.chatId || null, bot: config.bot || null, usuario: config.usuario || '', codigo: config.codigo || null, enlazado: config.enlazado || null };
  let st = almacen.leer('estado', null);
  if (config.chatId && (!st || (!st.migrado && !st.chatId && !st.codigo && !st.desconectado))) {
    st = { ...(st || {}), ...desdeConfig, bot: (st && st.bot) || desdeConfig.bot, migrado: true };
    almacen.guardar('estado', st);
  }
  st = st || desdeConfig;
  const guardar = c => { st = { ...st, ...c }; almacen.guardar('estado', st); };
  const perms = new Map();                                    // id de permiso → { msgId, p }
  const tarjetas = new Map();                                 // id de tarjeta → msgId
  const setEstado = e => { if (e === estado) return; estado = e; canal.estado(e === 'conectado' ? 'activo' : 'inactivo', e).catch(() => { }); };

  async function llamar(metodo, datos = {}, tk = token) {
    const r = await f(API + tk + '/' + metodo, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos), signal: ctl?.signal || AbortSignal.timeout(70_000) });
    const j = await r.json().catch(() => ({ ok: false, description: 'respuesta no válida' }));
    if (!j.ok) { const e = new Error(j.description || `HTTP ${r.status}`); e.codigo = j.error_code; throw e; }
    return j.result;
  }
  const chat = () => st.chatId;
  const enviar = (texto, extra = {}) => chat() ? llamar('sendMessage', { chat_id: chat(), text: texto, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch(e => { log('[telegram]', e.message); return null; }) : Promise.resolve(null);
  const editar = (msgId, texto, teclado) => llamar('editMessageText', { chat_id: chat(), message_id: msgId, text: texto, parse_mode: 'HTML', reply_markup: teclado || { inline_keyboard: [] } }).catch(() => { });
  const escribiendo = () => llamar('sendChatAction', { chat_id: chat(), action: 'typing' }).catch(() => { });

  // ---------- recibir (long polling) ----------
  async function bucle() {
    while (vivo) {
      try {
        const ups = await llamar('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        if (estado !== 'conectado' && estado !== 'esperando enlace') setEstado(chat() ? 'conectado' : 'esperando enlace');
        for (const u of ups || []) { offset = u.update_id + 1; await procesar(u).catch(e => log('[telegram]', e.message)); }
      } catch (e) {
        if (!vivo) return;
        if (e.codigo === 401) { setEstado('token no válido'); vivo = false; return; }
        setEstado(e.codigo === 409 ? 'otro programa usa este bot' : 'sin conexión, reintentando');
        await new Promise(ok => setTimeout(ok, esperaReintento));
      }
    }
  }

  async function procesar(u) {
    if (u.callback_query) return boton(u.callback_query);
    const m = u.message; if (!m || !m.chat) return;
    const texto = String(m.text || '').trim();
    // enlace: /start CÓDIGO (o el código a secas) desde t.me/<bot>?start=CÓDIGO
    if (!chat()) {
      const cod = (texto.match(/^\/start\s+(\S+)/) || [, texto])[1];
      if (st.codigo && cod === st.codigo) {
        guardar({ chatId: m.chat.id, usuario: m.from?.username || m.from?.first_name || '', codigo: null, enlazado: new Date().toISOString() });
        setEstado('conectado');
        return enviar(`✅ <b>Listo, ${esc(m.from?.first_name || '')}.</b> Este chat ya está enlazado con tu robot.\n\nEscríbeme lo que necesites. Aquí te llegarán también los permisos y avisos cuando no estés en el PC.\n\n/ayuda para ver qué puedo hacer.`);
      }
      return llamar('sendMessage', { chat_id: m.chat.id, text: '🔒 Este bot es privado. Para enlazarlo, abre el enlace que aparece en el panel del robot (Configuración → Canales → Telegram).' }).catch(() => { });
    }
    if (m.chat.id !== chat()) return llamar('sendMessage', { chat_id: m.chat.id, text: '🔒 Este bot es privado.' }).catch(() => { });
    if (m.voice || m.audio) {                                  // nota de voz → Whisper (en la app) → como si lo hubieras escrito
      const t = await notaDeVoz(m.voice || m.audio);
      if (!t) return;
      enviar(`🎙 <i>${esc(t)}</i>`);
      escribiendo();
      return responder(await canal.recibir(t, { de: 'chat' }));
    }
    if (!texto) return;
    if (/^\/(ayuda|help|start)\b/i.test(texto)) return enviar(AYUDA);
    if (/^\/estado\b/i.test(texto)) return enviar('🟢 Estoy encendido y escuchando.');
    escribiendo();
    responder(await canal.recibir(/^\/nueva\b/i.test(texto) ? '/nueva' : texto, { de: 'chat' }));
  }
  const responder = r => { if (r) return enviar(html(String(r))); };

  async function notaDeVoz(v) {
    if ((v.file_size || 0) > 20 * 1024 * 1024) { enviar('🎙 Esa nota es demasiado larga.'); return null; }
    escribiendo();
    let ruta = null;
    try {
      const fi = await llamar('getFile', { file_id: v.file_id });
      const r = await f(`https://api.telegram.org/file/bot${token}/${fi.file_path}`, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.mkdirSync(almacen.ruta, { recursive: true });
      ruta = path.join(almacen.ruta, `voz-${Date.now()}${(path.extname(fi.file_path || '') || '.ogg').replace(/[^\w.]/g, '')}`);
      fs.writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
      const t = await canal.transcribir(ruta);
      if (!t || !t.texto) { enviar('🎙 No entendí la nota de voz' + (t?.error ? ` (${esc(t.error)})` : '') + '. ¿Me lo escribes?'); return null; }
      return t.texto;
    } catch (e) { log('[telegram] voz', e.message); enviar('🎙 No pude descargar la nota de voz.'); return null; }
    finally { if (ruta) fs.rm(ruta, () => { }); }
  }

  async function boton(q) {
    const resp = (t = '') => llamar('answerCallbackQuery', { callback_query_id: q.id, text: t }).catch(() => { });
    if (!chat() || q.message?.chat?.id !== chat()) return resp('🔒');
    const [tipo, id, accion] = String(q.data || '').split(':');
    if (tipo === 'perm') {
      const s = perms.get(id);
      if (accion === 'ask') {                                  // peligroso: segunda confirmación
        if (s) await editar(s.msgId, textoPerm(s.p) + '\n\n⛔ <b>¿Seguro? Esto es peligroso.</b>', { inline_keyboard: [[{ text: '⛔ Sí, permitir', callback_data: `perm:${id}:allow` }, { text: '✋ No', callback_data: `perm:${id}:deny` }]] });
        return resp();
      }
      if (!['allow', 'always', 'deny'].includes(accion)) return resp();
      const ok = await canal.decidir(id, accion).catch(() => false);
      return resp(ok ? (accion === 'deny' ? 'Denegado' : 'Permitido') : 'Ya no está pendiente');
    }
    if (tipo === 'card') {
      const r = await canal.tarjeta(id, accion).catch(e => '❌ ' + e.message);
      if (tarjetas.has(id)) editar(tarjetas.get(id), esc(q.message?.text || '') + '\n\n' + html(r));
      return resp();
    }
    resp();
  }

  // ---------- lo que manda la app (permisos, tarjetas, avisos, respuestas) ----------
  const textoPerm = p => `${p.peligro ? '⛔ <b>PELIGRO</b> · ' : '⚠️ '}<b>Permiso: ${esc(p.tool)}</b>\n📁 ${esc(p.session)}\n<pre>${esc(String(p.detail || '').slice(0, 900))}</pre>${p.peligro ? `\n<b>Ojo:</b> ${esc(p.peligro)}` : ''}`;
  async function permiso(p) {
    if (!token || !chat()) return false;
    const id = String(p.id);
    const fila = [{ text: p.peligro ? '⚠️ Permitir (peligroso)' : '✅ Permitir', callback_data: `perm:${id}:${p.peligro ? 'ask' : 'allow'}` }];
    if (!p.peligro) fila.push({ text: '🔁 Siempre', callback_data: `perm:${id}:always` });
    fila.push({ text: '✋ Denegar', callback_data: `perm:${id}:deny` });
    const m = await enviar(textoPerm(p), { reply_markup: { inline_keyboard: [fila] } });
    if (!m) return false;
    perms.set(id, { msgId: m.message_id, p });
    return true;
  }
  function permisoResuelto(id, behavior, via) {
    const s = perms.get(String(id)); if (!s) return; perms.delete(String(id));
    const r = behavior === 'expired' ? '⌛ Caducó sin respuesta' : behavior === 'deny' ? `✋ Denegado desde ${esc(via)}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${esc(via)}`;
    return editar(s.msgId, textoPerm(s.p) + `\n\n<b>${r}</b>`);
  }
  async function tarjeta(c) {
    if (!token || !chat()) return false;
    const t = `${c.prioridad === 'urgente' ? '🔴 <b>URGENTE</b> · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} <b>${esc(c.author || '')}</b>${c.guild ? ` · ${esc(c.guild)}` : ''}\n${esc(c.resumen || '')}${c.respuesta ? `\n\n<b>Respuesta sugerida:</b>\n<i>${esc(c.respuesta)}</i>` : ''}`;
    const fila = [];
    if (c.respuesta && c.canSend) fila.push({ text: c.kind === 'mail' ? '📨 Responder' : '📨 Enviar', callback_data: `card:${c.id}:enviar` });
    fila.push({ text: '🗑 Descartar', callback_data: `card:${c.id}:descartar` }, { text: '🔕 Ruido', callback_data: `card:${c.id}:ruido` });
    const m = await enviar(t, { reply_markup: { inline_keyboard: [fila] } });
    if (!m) return false;
    tarjetas.set(String(c.id), m.message_id);
    return true;
  }
  const avisar = texto => enviar(html(texto));

  // ---------- configuración (panel → acciones del canal) ----------
  async function conectar({ token: nuevo } = {}) {
    nuevo = String(nuevo || '').trim();
    if (!/^\d+:[\w-]{30,}$/.test(nuevo)) throw new Error('Eso no parece un token de bot (es algo como 123456789:AAH…). Lo da @BotFather.');
    const yo = await llamar('getMe', {}, nuevo);                // ¿el token funciona?
    detener();
    token = nuevo; await secretos.guardar('tg:token', nuevo);
    guardar({ bot: yo.username, codigo: crypto.randomBytes(6).toString('hex'), chatId: null, usuario: '', enlazado: null });
    iniciar();
    return estadoPublico();
  }
  function nuevoEnlace() { guardar({ codigo: crypto.randomBytes(6).toString('hex'), chatId: null, usuario: '', enlazado: null }); setEstado('esperando enlace'); return estadoPublico(); }
  async function desconectar() { detener(); token = ''; await secretos.guardar('tg:token', ''); st = { desconectado: true }; almacen.guardar('estado', st); setEstado('sin configurar'); return estadoPublico(); }
  async function prueba() { await avisar('🤖 **Prueba:** así te llegarán los avisos.'); return estadoPublico(); }
  const estadoPublico = () => ({
    configurado: !!token, estado, bot: st.bot || null, enlazado: !!st.chatId, usuario: st.usuario || '',
    enlace: token && !st.chatId && st.codigo && st.bot ? `https://t.me/${st.bot}?start=${st.codigo}` : null,
  });

  function iniciar() {
    if (!token || vivo) return;
    vivo = true; ctl = new AbortController(); setEstado(chat() ? 'conectando' : 'esperando enlace');
    llamar('getMe').then(yo => { if (yo?.username && yo.username !== st.bot) guardar({ bot: yo.username }); if (vivo) setEstado(chat() ? 'conectado' : 'esperando enlace'); }).catch(e => { if (e.codigo === 401) setEstado('token no válido'); });
    llamar('setMyCommands', { commands: [{ command: 'ayuda', description: 'Qué puedo hacer' }, { command: 'estado', description: '¿Estás encendido?' }, { command: 'nueva', description: 'Nueva conversación' }] }).catch(() => { });
    bucleEnCurso = bucle();
  }
  function detener() { vivo = false; try { ctl?.abort(); } catch { } ctl = null; }
  // arranque: el token sale del almacén cifrado de la app (puede tardar si el usuario tiene que aprobarlo)
  async function arrancar() {
    try { token = String(await secretos.leer('tg:token') || ''); } catch (e) { log('[telegram] sin acceso al token:', e.message); token = ''; }
    if (!token) { setEstado('sin configurar'); return estadoPublico(); }
    iniciar();
    return estadoPublico();
  }

  return {
    arrancar, iniciar, detener, conectar, nuevoEnlace, desconectar, prueba, estado: estadoPublico,
    permiso, permisoResuelto, tarjeta, avisar, procesar,
    get bucle() { return bucleEnCurso; },
  };
}

module.exports = { crearBot, html, esc };
