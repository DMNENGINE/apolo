// Canal de Telegram: un bot propio de cada usuario (lo crea con @BotFather) ligado SOLO a su chat.
// Hablarle, permisos con botones (los peligrosos piden confirmación), avisos, tarjetas y respuestas.
// Sin dependencias: Bot API por HTTPS con long polling (funciona detrás del router, sin abrir puertos).
const crypto = require('crypto');

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

function crearTelegram({ almacen, decide, cardAction, onTalk, transcribir, onEstado = () => { }, log = console.log }) {
  let token = almacen.secreto('tg:token') || '';
  const cfg = () => almacen.config().telegram || {};
  const ponerCfg = c => almacen.ponerConfig({ telegram: { ...cfg(), ...c } });
  let bot = cfg().bot || null, offset = 0, vivo = false, ctl = null, estado = token ? 'conectando' : 'sin configurar';
  const perms = new Map();                                    // id de permiso → { msgId, p }
  const tarjetas = new Map();                                 // id de tarjeta → msgId
  const setEstado = e => { estado = e; onEstado(e); };

  async function llamar(metodo, datos = {}, tk = token) {
    const r = await fetch(API + tk + '/' + metodo, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos), signal: ctl?.signal || AbortSignal.timeout(70_000) });
    const j = await r.json().catch(() => ({ ok: false, description: 'respuesta no válida' }));
    if (!j.ok) { const e = new Error(j.description || `HTTP ${r.status}`); e.codigo = j.error_code; throw e; }
    return j.result;
  }
  const chat = () => cfg().chatId;
  const enviar = (texto, extra = {}) => chat() ? llamar('sendMessage', { chat_id: chat(), text: texto, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch(e => { log('[telegram]', e.message); return null; }) : Promise.resolve(null);
  const editar = (msgId, texto, teclado) => llamar('editMessageText', { chat_id: chat(), message_id: msgId, text: texto, parse_mode: 'HTML', reply_markup: teclado || { inline_keyboard: [] } }).catch(() => { });

  // ---------- recibir (long polling) ----------
  async function bucle() {
    while (vivo) {
      try {
        const ups = await llamar('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        if (estado !== 'conectado' && estado !== 'esperando enlace') setEstado(chat() ? 'conectado' : 'esperando enlace');
        for (const u of ups) { offset = u.update_id + 1; await procesar(u).catch(e => log('[telegram]', e.message)); }
      } catch (e) {
        if (!vivo) return;
        if (e.codigo === 401) { setEstado('token no válido'); vivo = false; return; }
        if (e.codigo === 409) setEstado('otro programa usa este bot');
        else setEstado('sin conexión, reintentando');
        await new Promise(ok => setTimeout(ok, 5000));
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
      if (cfg().codigo && cod === cfg().codigo) {
        ponerCfg({ chatId: m.chat.id, usuario: m.from?.username || m.from?.first_name || '', codigo: null, enlazado: new Date().toISOString() });
        setEstado('conectado');
        return enviar(`✅ <b>Listo, ${esc(m.from?.first_name || '')}.</b> Este chat ya está enlazado con tu robot.\n\nEscríbeme lo que necesites. Aquí te llegarán también los permisos y avisos cuando no estés en el PC.\n\n/ayuda para ver qué puedo hacer.`);
      }
      return llamar('sendMessage', { chat_id: m.chat.id, text: '🔒 Este bot es privado. Para enlazarlo, abre el enlace que aparece en el panel del robot (Configuración → Canales → Telegram).' }).catch(() => { });
    }
    if (m.chat.id !== chat()) return llamar('sendMessage', { chat_id: m.chat.id, text: '🔒 Este bot es privado.' }).catch(() => { });
    if (m.voice || m.audio) {                                  // nota de voz → Whisper → como si lo hubieras escrito
      const t = await notaDeVoz(m.voice || m.audio);
      if (!t) return;
      enviar(`🎙 <i>${esc(t)}</i>`);
      llamar('sendChatAction', { chat_id: chat(), action: 'typing' }).catch(() => { });
      return responder(await onTalk(t));
    }
    if (!texto) return;
    if (/^\/(ayuda|help|start)\b/i.test(texto)) return enviar(AYUDA);
    if (/^\/estado\b/i.test(texto)) return enviar('🟢 Estoy encendido y escuchando.');
    if (/^\/nueva\b/i.test(texto)) return responder(await onTalk('/nueva'));
    llamar('sendChatAction', { chat_id: chat(), action: 'typing' }).catch(() => { });
    responder(await onTalk(texto));
  }
  const responder = r => { if (r && r.msg) enviar(html(String(r.msg))); };
  async function notaDeVoz(v) {
    if (!transcribir) { enviar('🎙 Las notas de voz no están disponibles en este PC.'); return null; }
    if ((v.file_size || 0) > 20 * 1024 * 1024) { enviar('🎙 Esa nota es demasiado larga.'); return null; }
    llamar('sendChatAction', { chat_id: chat(), action: 'typing' }).catch(() => { });
    try {
      const f = await llamar('getFile', { file_id: v.file_id });
      const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(60_000) });
      const ruta = require('path').join(require('os').tmpdir(), `apolo-voz-${Date.now()}${require('path').extname(f.file_path) || '.ogg'}`);
      require('fs').writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
      const t = await transcribir(ruta);
      require('fs').rm(ruta, () => { });
      if (!t.text) { enviar('🎙 No entendí la nota de voz' + (t.error ? ` (${esc(t.error)})` : '') + '. ¿Me lo escribes?'); return null; }
      return t.text;
    } catch (e) { log('[telegram] voz', e.message); enviar('🎙 No pude descargar la nota de voz.'); return null; }
  }

  async function boton(q) {
    const resp = (t = '') => llamar('answerCallbackQuery', { callback_query_id: q.id, text: t }).catch(() => { });
    if (q.message?.chat?.id !== chat()) return resp('🔒');
    const [tipo, id, accion] = String(q.data || '').split(':');
    if (tipo === 'perm') {
      const s = perms.get(+id);
      if (accion === 'ask') {                                  // peligroso: segunda confirmación
        if (s) await editar(s.msgId, textoPerm(s.p) + '\n\n⛔ <b>¿Seguro? Esto es peligroso.</b>', { inline_keyboard: [[{ text: '⛔ Sí, permitir', callback_data: `perm:${id}:allow` }, { text: '✋ No', callback_data: `perm:${id}:deny` }]] });
        return resp();
      }
      const ok = decide(+id, accion, 'Telegram');
      return resp(ok ? (accion === 'deny' ? 'Denegado' : 'Permitido') : 'Ya no está pendiente');
    }
    if (tipo === 'card') { const r = await cardAction(+id, accion); if (tarjetas.has(+id)) editar(tarjetas.get(+id), esc(q.message.text || '') + '\n\n' + html(r)); return resp(); }
    resp();
  }

  // ---------- enviar al móvil (misma interfaz que el bot de Discord) ----------
  const textoPerm = p => `${p.peligro ? '⛔ <b>PELIGRO</b> · ' : '⚠️ '}<b>Permiso: ${esc(p.tool)}</b>\n📁 ${esc(p.session)}\n<pre>${esc(String(p.detail || '').slice(0, 900))}</pre>${p.peligro ? `\n<b>Ojo:</b> ${esc(p.peligro)}` : ''}`;
  async function sendPerm(p) {
    const fila = [{ text: p.peligro ? '⚠️ Permitir (peligroso)' : '✅ Permitir', callback_data: `perm:${p.id}:${p.peligro ? 'ask' : 'allow'}` }];
    if (!p.peligro) fila.push({ text: '🔁 Siempre', callback_data: `perm:${p.id}:always` });
    fila.push({ text: '✋ Denegar', callback_data: `perm:${p.id}:deny` });
    const m = await enviar(textoPerm(p), { reply_markup: { inline_keyboard: [fila] } });
    if (m) perms.set(p.id, { msgId: m.message_id, p });
  }
  function resolvePerm(id, behavior, via) {
    const s = perms.get(id); if (!s) return; perms.delete(id);
    const r = behavior === 'expired' ? '⌛ Caducó sin respuesta' : behavior === 'deny' ? `✋ Denegado desde ${esc(via)}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${esc(via)}`;
    editar(s.msgId, textoPerm(s.p) + `\n\n<b>${r}</b>`);
  }
  async function sendCard(c) {
    const t = `${c.prioridad === 'urgente' ? '🔴 <b>URGENTE</b> · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} <b>${esc(c.author || '')}</b>${c.guild ? ` · ${esc(c.guild)}` : ''}\n${esc(c.resumen || '')}${c.respuesta ? `\n\n<b>Respuesta sugerida:</b>\n<i>${esc(c.respuesta)}</i>` : ''}`;
    const fila = [];
    if (c.respuesta && c.canSend) fila.push({ text: c.kind === 'mail' ? '📨 Responder' : '📨 Enviar', callback_data: `card:${c.id}:enviar` });
    fila.push({ text: '🗑 Descartar', callback_data: `card:${c.id}:descartar` }, { text: '🔕 Ruido', callback_data: `card:${c.id}:ruido` });
    const m = await enviar(t, { reply_markup: { inline_keyboard: [fila] } });
    if (m) tarjetas.set(c.id, m.message_id);
  }
  const sendAviso = texto => enviar(html(texto));
  const reply = md => enviar(html(md));

  // ---------- configuración (panel) ----------
  async function conectar(nuevo) {
    nuevo = String(nuevo || '').trim();
    if (!/^\d+:[\w-]{30,}$/.test(nuevo)) throw new Error('Eso no parece un token de bot (es algo como 123456789:AAH…). Lo da @BotFather.');
    const yo = await llamar('getMe', {}, nuevo);                // ¿el token funciona?
    detener();
    token = nuevo; almacen.guardarSecreto('tg:token', nuevo);
    const codigo = crypto.randomBytes(6).toString('hex');
    ponerCfg({ bot: yo.username, codigo, chatId: null, usuario: '', enlazado: null });
    bot = yo.username;
    iniciar();
    return estadoPublico();
  }
  function nuevoEnlace() { const codigo = crypto.randomBytes(6).toString('hex'); ponerCfg({ codigo, chatId: null, usuario: '', enlazado: null }); setEstado('esperando enlace'); return estadoPublico(); }
  function desconectar() { detener(); token = ''; almacen.guardarSecreto('tg:token', ''); almacen.ponerConfig({ telegram: {} }); bot = null; setEstado('sin configurar'); return estadoPublico(); }
  const estadoPublico = () => {
    const c = cfg();
    return { configurado: !!token, estado, bot: c.bot || null, enlazado: !!c.chatId, usuario: c.usuario || '',
      enlace: token && !c.chatId && c.codigo && c.bot ? `https://t.me/${c.bot}?start=${c.codigo}` : null };
  };

  function iniciar() {
    if (!token || vivo) return;
    vivo = true; ctl = new AbortController(); setEstado(chat() ? 'conectando' : 'esperando enlace');
    llamar('getMe').then(() => { if (vivo) setEstado(chat() ? 'conectado' : 'esperando enlace'); }).catch(e => { if (e.codigo === 401) setEstado('token no válido'); });
    llamar('setMyCommands', { commands: [{ command: 'ayuda', description: 'Qué puedo hacer' }, { command: 'estado', description: '¿Estás encendido?' }, { command: 'nueva', description: 'Nueva conversación' }] }).catch(() => { });
    bucle();
  }
  function detener() { vivo = false; try { ctl?.abort(); } catch { } ctl = null; }

  const AYUDA = '🤖 <b>Qué puedo hacer por aquí</b>\n• Escríbeme cualquier cosa: la paso al mejor modelo (programar, buscar en la web, usar el PC, tu correo, GitHub…).\n• <code>gemma: …</code>, <code>chatgpt: …</code>, <code>claude: …</code> para elegir modelo.\n• <code>usa auto</code> / <code>usa claude code</code> para cambiar el destino.\n• Te pido permiso con botones cuando algo lo necesita.\n• Te aviso de correos y mensajes importantes cuando no estás en el PC.\n\n/estado · /nueva · /ayuda';

  return {
    get enabled() { return !!token && !!chat(); }, get status() { return estado; },
    iniciar, detener, conectar, nuevoEnlace, desconectar, estado: estadoPublico,
    sendPerm, resolvePerm, sendCard, sendAviso, reply,
  };
}

module.exports = { crearTelegram };
