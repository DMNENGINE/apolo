// Lógica del bot de Discord SIN discord.js: Gateway v10 por WebSocket (cliente del SDK) + REST con fetch. Para quien NO tiene
// el bot en una Raspberry Pi. Se prueba con un servidor WS falso y un fetch falso. Funciona así:
//   - Gateway: HELLO → latido (op 1) con jitter, IDENTIFY (op 2) o RESUME (op 6) si hay sesión; READY guarda session_id y
//     resume_gateway_url; op 7 reconectar → RESUME; op 9 sesión inválida → IDENTIFY de nuevo; latido sin ACK → zombi → RESUME.
//     Cierres 4004/4010-4014 = fatales (token o intents mal) → para y lo dice en el panel.
//   - Intents mínimos: DIRECT_MESSAGES (el contenido de los DMs con el bot no necesita Message Content). Con la categoría
//     opcional en tu servidor: + GUILDS, GUILD_MESSAGES y MESSAGE_CONTENT (activarlo en el portal de desarrolladores).
//   - SOLO el dueño: sus DMs (y su canal #hablar si hay categoría). Botones de permisos perm:<id>:allow|always|deny|ask
//     (peligroso = 2.º paso), tarjetas card:<id>:enviar|descartar|ruido, avisos, notas de voz → Whisper de la app.
// Dependencias inyectadas: fetch, conectarWS (require('@apolo/sdk/ws-cliente').conectar), canal, almacen, secretos, config.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://discord.com/api/v10';
const GATEWAY = 'wss://gateway.discord.gg';
const I = { GUILDS: 1, GUILD_MESSAGES: 1 << 9, DIRECT_MESSAGES: 1 << 12, MESSAGE_CONTENT: 1 << 15 };
const FATALES = { 4004: 'token no válido', 4010: 'shard no válido', 4011: 'hace falta sharding', 4012: 'versión de API no válida', 4013: 'intents no válidos', 4014: 'activa el intent Message Content en el portal de desarrolladores' };
const VER = 1024, ESCRIBIR = 2048, HISTORIAL = 65536, GESTIONAR_CANALES = 16, GESTIONAR_ROLES = 268435456;
const CATEGORIA = '🤖 APOLO';
const CANALES = [['permisos', '🔐・permisos'], ['avisos', '📣・avisos'], ['hablar', '💬・hablar']];
const AYUDA = '🤖 **Qué puedo hacer por aquí**\n• Escríbeme cualquier cosa: la paso al mejor modelo (programar, buscar en la web, usar el PC, tu correo, GitHub…).\n• `gemma: …`, `chatgpt: …`, `claude: …` para elegir modelo · `usa auto` / `usa claude code` para cambiar el destino.\n• Te pido permiso con botones cuando algo lo necesita (lo peligroso pide confirmación).\n• Mándame una nota de voz y la transcribo.\n\n`/ayuda` · `/estado` · `/nueva`';
const intentsDe = conServidor => I.DIRECT_MESSAGES | (conServidor ? I.GUILDS | I.GUILD_MESSAGES | I.MESSAGE_CONTENT : 0);
const recortar = (s, n = 1900) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const boton = (label, custom_id, style = 2) => ({ type: 2, style, label, custom_id });
const fila = (...b) => [{ type: 1, components: b }];

function crearDiscord({ fetch: f = globalThis.fetch, conectarWS, canal, almacen, secretos, config = {}, log = () => { }, gateway = GATEWAY,
  esperaReintento = 5000, aleatorio = Math.random }) {
  let token = '', vivo = false, ws = null, estado = 'sin configurar', latido = null, ack = true, seq = null, intentos = 0, reconexion = null;
  let sesion = null;                                           // { id, url } para RESUME
  let st = almacen.leer('estado', null) || {};
  const guardar = c => { st = { ...st, ...c }; almacen.guardar('estado', st); };
  const perms = new Map();                                     // id → { canalId, msgId, p }
  const tarjetas = new Map();                                  // id → { canalId, msgId, texto }
  const setEstado = e => { if (e === estado) return; estado = e; canal.estado(e === 'conectado' ? 'activo' : 'inactivo', e).catch(() => { }); };
  const espera = ms => new Promise(ok => setTimeout(ok, ms));

  async function rest(metodo, ruta, cuerpo, tk = token, reintento = true) {
    const r = await f(API + ruta, { method: metodo, headers: { authorization: 'Bot ' + tk, 'content-type': 'application/json', 'user-agent': 'DiscordBot (apolo, 1.0)' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(30_000) });
    if (r.status === 429 && reintento) { const j = await r.json().catch(() => ({})); await espera(Math.min(10, +j.retry_after || 1) * 1000); return rest(metodo, ruta, cuerpo, tk, false); }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((j && j.message) || `HTTP ${r.status}`); e.status = r.status; e.codigo = j && j.code; throw e; }
    return j;
  }
  const enviarA = (canalId, cuerpo) => rest('POST', `/channels/${canalId}/messages`, { allowed_mentions: { parse: [] }, ...cuerpo });
  const editarMsg = (canalId, msgId, cuerpo) => rest('PATCH', `/channels/${canalId}/messages/${msgId}`, cuerpo).catch(e => log('[discord] editar:', e.message));
  const responderInt = (d, tipo, data) => rest('POST', `/interactions/${d.id}/${d.token}/callback`, { type: tipo, ...(data ? { data } : {}) }).catch(e => log('[discord] interacción:', e.message));

  // canal privado con el dueño (se crea una vez y se recuerda)
  async function dm() {
    if (st.dm) return st.dm;
    if (!st.dueno) return null;
    const c = await rest('POST', '/users/@me/channels', { recipient_id: st.dueno });
    guardar({ dm: c.id }); return c.id;
  }
  const destino = async clave => (st.categoria && st.categoria.canales && st.categoria.canales[clave]) || dm();

  // ---------- gateway ----------
  function enviarGw(op, d) { if (ws) ws.enviarJSON({ op, d }); }
  function pararLatido() { clearTimeout(latido); clearInterval(latido); latido = null; }
  function latir() {
    if (!ack) { log('[discord] latido sin respuesta: reconecto'); try { ws && ws.cerrar(4000, 'zombi'); } catch { } return; }
    ack = false; enviarGw(1, seq);
  }
  async function conectarGateway() {
    if (!vivo) return;
    const base = sesion && sesion.url ? sesion.url : gateway;
    let w;
    try { w = await conectarWS(base.replace(/\/+$/, '') + '/?v=10&encoding=json'); }
    catch (e) { log('[discord] gateway:', e.message); return reintentar(); }
    if (!vivo) { try { w.cerrar(1000); } catch { } return; }
    ws = w; ack = true;
    w.on('texto', t => { let p; try { p = JSON.parse(t); } catch { return; } if (ws === w) alPaquete(p).catch(e => log('[discord]', e.message)); });
    w.on('cerrar', ({ codigo } = {}) => { if (ws === w) alCerrar(codigo); });
  }
  function reintentar(ms) {
    if (!vivo) return;
    const t = ms ?? Math.min(60_000, esperaReintento * 2 ** intentos++);
    setEstado('reconectando');
    clearTimeout(reconexion); reconexion = setTimeout(() => conectarGateway(), t);
  }
  function alCerrar(codigo) {
    pararLatido(); ws = null;
    if (!vivo) return;
    if (FATALES[codigo]) { vivo = false; sesion = null; setEstado(FATALES[codigo]); return; }
    if (codigo === 4007 || codigo === 4009) sesion = null;     // secuencia o sesión caducada → IDENTIFY
    reintentar(codigo === 4000 ? 200 : undefined);
  }
  async function alPaquete(p) {
    if (p.s !== null && p.s !== undefined) seq = p.s;
    switch (p.op) {
      case 10: {                                               // HELLO
        const iv = p.d.heartbeat_interval;
        pararLatido();
        latido = setTimeout(() => { latir(); latido = setInterval(latir, iv); }, Math.floor(iv * aleatorio()));
        if (sesion && sesion.id && seq !== null) enviarGw(6, { token, session_id: sesion.id, seq });
        else enviarGw(2, { token, intents: intentsDe(!!st.servidor), properties: { os: process.platform, browser: 'apolo', device: 'apolo' } });
        return;
      }
      case 11: ack = true; return;
      case 1: enviarGw(1, seq); return;
      case 7: try { ws.cerrar(4000, 'reconnect'); } catch { } return;     // RECONNECT → RESUME
      case 9:                                                  // INVALID SESSION
        if (!p.d) { sesion = null; seq = null; }
        await espera(1000 + Math.floor(aleatorio() * 4000));
        try { ws && ws.cerrar(4000, 'sesión inválida'); } catch { }
        return;
      case 0: return evento(p.t, p.d);
    }
  }
  async function evento(t, d) {
    if (t === 'READY') {
      sesion = { id: d.session_id, url: d.resume_gateway_url || gateway }; intentos = 0;
      if (d.user && d.user.id !== st.botId) guardar({ botId: d.user.id, bot: d.user.username });
      setEstado(st.dueno ? 'conectado' : 'esperando enlace');
      if (st.servidor && st.dueno) prepararCategoria().catch(e => log('[discord] categoría:', e.message));
      return;
    }
    if (t === 'RESUMED') { intentos = 0; setEstado(st.dueno ? 'conectado' : 'esperando enlace'); return; }
    if (t === 'MESSAGE_CREATE') return mensaje(d);
    if (t === 'INTERACTION_CREATE') return interaccion(d);
  }

  // ---------- mensajes ----------
  async function mensaje(d) {
    const autor = d.author || {};
    if (autor.bot || autor.id === st.botId) return;
    if (d.guild_id) {                                          // solo el #hablar de la categoría, y solo el dueño
      if (!st.categoria || d.channel_id !== st.categoria.canales?.hablar || autor.id !== st.dueno) return;
    } else if (autor.id !== st.dueno) {                        // DM de otra persona: ¿es el código de enlace?
      const t = String(d.content || '').trim();
      if (!st.dueno && st.codigo && t === st.codigo) {
        guardar({ dueno: autor.id, usuario: autor.username || '', codigo: null, dm: d.channel_id });
        setEstado('conectado');
        if (st.servidor) prepararCategoria().catch(e => log('[discord] categoría:', e.message));
        return enviarA(d.channel_id, { content: '✅ **Listo.** Este chat ya está enlazado con tu robot. Escríbeme lo que necesites; aquí te llegarán también los permisos y avisos.\n\n`/ayuda` para ver qué puedo hacer.' });
      }
      return enviarA(d.channel_id, { content: '🔒 Este bot es privado.' }).catch(() => { });
    } else if (d.channel_id !== st.dm) guardar({ dm: d.channel_id });
    const audio = (d.attachments || []).find(a => /^audio\//.test(a.content_type || '') || /\.(ogg|mp3|m4a|wav|webm)$/i.test(a.filename || ''));
    let texto = String(d.content || '').trim();
    if (audio && !texto) {
      texto = await notaDeVoz(audio, d.channel_id);
      if (!texto) return;
      enviarA(d.channel_id, { content: `🎙 *${recortar(texto, 1800)}*` }).catch(() => { });
    }
    if (!texto) return;
    if (/^\/?(ayuda|help)$/i.test(texto)) return enviarA(d.channel_id, { content: AYUDA });
    if (/^\/estado$/i.test(texto)) return enviarA(d.channel_id, { content: '🟢 Estoy encendido y escuchando.' });
    rest('POST', `/channels/${d.channel_id}/typing`).catch(() => { });
    const r = await canal.recibir(/^\/nueva$/i.test(texto) ? '/nueva' : texto, { de: d.guild_id ? 'servidor' : 'dm' });
    if (r) await enviarA(d.channel_id, { content: recortar(r) });
  }
  async function notaDeVoz(a, canalId) {
    if ((a.size || 0) > 25 * 1024 * 1024) { enviarA(canalId, { content: '🎙 Esa nota es demasiado larga.' }).catch(() => { }); return null; }
    let ruta = null;
    try {
      const u = new URL(a.url);
      if (!/(^|\.)discordapp\.(com|net)$/.test(u.hostname)) throw new Error('adjunto fuera de Discord');
      const r = await f(a.url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.mkdirSync(almacen.ruta, { recursive: true });
      ruta = path.join(almacen.ruta, `voz-${Date.now()}${(path.extname(a.filename || '') || '.ogg').replace(/[^\w.]/g, '')}`);
      fs.writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
      const t = await canal.transcribir(ruta);
      if (!t || !t.texto) { enviarA(canalId, { content: '🎙 No entendí la nota de voz' + (t && t.error ? ` (${t.error})` : '') + '. ¿Me lo escribes?' }).catch(() => { }); return null; }
      return t.texto;
    } catch (e) { log('[discord] voz:', e.message); enviarA(canalId, { content: '🎙 No pude descargar la nota de voz.' }).catch(() => { }); return null; }
    finally { if (ruta) fs.rm(ruta, () => { }); }
  }

  // ---------- botones ----------
  async function interaccion(d) {
    if (d.type !== 3) return;                                  // solo componentes (botones)
    const quien = (d.member && d.member.user) || d.user || {};
    if (!st.dueno || quien.id !== st.dueno) return responderInt(d, 4, { content: '🔒 Solo el dueño del robot puede usar estos botones.', flags: 64 });
    const [tipo, id, accion] = String(d.data?.custom_id || '').split(':');
    const msg = d.message || {};
    if (tipo === 'perm') {
      const s = perms.get(id);
      if (accion === 'ask') {                                  // peligroso: segundo paso
        return responderInt(d, 7, { content: recortar((s ? textoPerm(s.p) : msg.content || '') + '\n\n⛔ **¿Seguro? Esto es peligroso.**'),
          components: fila(boton('⛔ Sí, permitir', `perm:${id}:allow`, 4), boton('✋ No', `perm:${id}:deny`, 2)) });
      }
      if (!['allow', 'always', 'deny'].includes(accion)) return responderInt(d, 6);
      await responderInt(d, 6);                                // ACK en < 3 s; el mensaje lo edita permisoResuelto
      const ok = await canal.decidir(id, accion).catch(() => false);
      if (!ok) editarMsg(msg.channel_id || d.channel_id, msg.id, { content: recortar((msg.content || '') + '\n\n⌛ **Ya no está pendiente.**'), components: [] });
      return;
    }
    if (tipo === 'card') {
      await responderInt(d, 6);
      const r = await canal.tarjeta(id, accion).catch(e => '❌ ' + e.message);
      return editarMsg(msg.channel_id || d.channel_id, msg.id, { content: recortar((msg.content || '') + '\n\n' + r), components: [] });
    }
    return responderInt(d, 6);
  }

  // ---------- lo que manda la app ----------
  const textoPerm = p => `${p.peligro ? '⛔ **PELIGRO** · ' : '⚠️ '}**Permiso: ${p.tool}**\n📁 ${p.session}\n\`\`\`\n${recortar(String(p.detail || '').replace(/```/g, 'ˋˋˋ'), 900)}\n\`\`\`${p.peligro ? `\n**Ojo:** ${p.peligro}` : ''}`;
  async function permiso(p) {
    if (!vivo || !st.dueno) return false;
    const id = String(p.id), c = await destino('permisos').catch(() => null);
    if (!c) return false;
    const b = [boton(p.peligro ? '⚠️ Permitir (peligroso)' : '✅ Permitir', `perm:${id}:${p.peligro ? 'ask' : 'allow'}`, p.peligro ? 4 : 3)];
    if (!p.peligro) b.push(boton('🔁 Siempre', `perm:${id}:always`, 1));
    b.push(boton('✋ Denegar', `perm:${id}:deny`, 2));
    const m = await enviarA(c, { content: recortar(textoPerm(p)), components: fila(...b) }).catch(e => { log('[discord] permiso:', e.message); return null; });
    if (!m) return false;
    perms.set(id, { canalId: c, msgId: m.id, p });
    return true;
  }
  function permisoResuelto(id, behavior, via) {
    const s = perms.get(String(id)); if (!s) return; perms.delete(String(id));
    const r = behavior === 'expired' ? '⌛ Caducó sin respuesta' : behavior === 'deny' ? `✋ Denegado desde ${via}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} desde ${via}`;
    return editarMsg(s.canalId, s.msgId, { content: recortar(textoPerm(s.p) + `\n\n**${r}**`), components: [] });
  }
  async function tarjeta(c) {
    if (!vivo || !st.dueno) return false;
    const canalId = await destino('avisos').catch(() => null); if (!canalId) return false;
    const t = `${c.prioridad === 'urgente' ? '🔴 **URGENTE** · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} **${c.author || ''}**${c.guild ? ` · ${c.guild}` : ''}\n${c.resumen || ''}${c.respuesta ? `\n\n**Respuesta sugerida:**\n*${c.respuesta}*` : ''}`;
    const b = [];
    if (c.respuesta && c.canSend) b.push(boton(c.kind === 'mail' ? '📨 Responder' : '📨 Enviar', `card:${c.id}:enviar`, 3));
    b.push(boton('🗑 Descartar', `card:${c.id}:descartar`), boton('🔕 Ruido', `card:${c.id}:ruido`));
    const m = await enviarA(canalId, { content: recortar(t), components: fila(...b) }).catch(() => null);
    if (!m) return false;
    tarjetas.set(String(c.id), { canalId, msgId: m.id });
    return true;
  }
  async function avisar(texto) {
    if (!vivo || !st.dueno) return null;
    const c = await destino('avisos').catch(() => null);
    return c ? enviarA(c, { content: recortar(texto) }).catch(e => { log('[discord] aviso:', e.message); return null; }) : null;
  }

  // ---------- categoría opcional en tu servidor (#permisos #avisos #hablar, solo tú y el bot los veis) ----------
  async function prepararCategoria() {
    const g = st.servidor; if (!g || !st.dueno || !st.botId) return null;
    const lista = await rest('GET', `/guilds/${g}/channels`);
    const priv = [{ id: g, type: 0, deny: String(VER) }, { id: st.dueno, type: 1, allow: String(VER | ESCRIBIR | HISTORIAL) }, { id: st.botId, type: 1, allow: String(VER | ESCRIBIR | HISTORIAL) }];
    let cat = lista.find(c => c.type === 4 && c.name === CATEGORIA);
    if (!cat) cat = await rest('POST', `/guilds/${g}/channels`, { name: CATEGORIA, type: 4, permission_overwrites: priv });
    const canales = {};
    for (const [clave, nombre] of CANALES) {
      let c = lista.find(x => x.type === 0 && x.parent_id === cat.id && String(x.topic || '').includes(`apolo: ${clave}`));
      if (!c) c = await rest('POST', `/guilds/${g}/channels`, { name: nombre, type: 0, parent_id: cat.id, topic: `apolo: ${clave}`, permission_overwrites: priv });
      canales[clave] = c.id;
    }
    guardar({ categoria: { id: cat.id, canales } });
    return st.categoria;
  }

  // ---------- configuración (panel → acciones del canal) ----------
  const esId = s => /^\d{15,22}$/.test(String(s || ''));
  async function conectar({ token: nuevo, dueno, servidor } = {}) {
    nuevo = String(nuevo || '').trim() || token;
    if (!/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(nuevo)) throw new Error('Eso no parece un token de bot de Discord (Developer Portal → tu app → Bot → Reset Token).');
    if (dueno && !esId(dueno)) throw new Error('Tu id de usuario son solo números (Discord → Ajustes → Avanzado → Modo desarrollador → clic derecho en ti → Copiar ID).');
    if (servidor && !esId(servidor)) throw new Error('El id del servidor son solo números.');
    const yo = await rest('GET', '/users/@me', undefined, nuevo);            // ¿el token funciona?
    let app = null; try { app = await rest('GET', '/oauth2/applications/@me', undefined, nuevo); } catch { }
    const duenoApp = app && !app.team && app.owner ? app.owner.id : null;
    detener();
    token = nuevo; await secretos.guardar('discord:token', nuevo);
    const d = dueno || (st.dueno && !dueno ? st.dueno : null) || duenoApp;
    guardar({ botId: yo.id, bot: yo.username, appId: (app && app.id) || yo.id, dueno: d || null, usuario: '', dm: d === st.dueno ? st.dm : null,
      servidor: servidor === undefined ? st.servidor || null : servidor || null, categoria: servidor && servidor !== st.servidor ? null : st.categoria || null,
      codigo: d ? null : 'APOLO-' + crypto.randomBytes(3).toString('hex').toUpperCase() });
    iniciar();
    return estadoPublico();
  }
  function nuevoCodigo() { guardar({ dueno: null, dm: null, usuario: '', codigo: 'APOLO-' + crypto.randomBytes(3).toString('hex').toUpperCase() }); setEstado('esperando enlace'); return estadoPublico(); }
  async function desconectar() { detener(); token = ''; await secretos.guardar('discord:token', ''); st = {}; almacen.guardar('estado', {}); setEstado('sin configurar'); return estadoPublico(); }
  async function prueba() { await avisar('🤖 **Prueba:** así te llegarán los avisos.'); return estadoPublico(); }
  const estadoPublico = () => ({
    configurado: !!token, estado, bot: st.bot || null, enlazado: !!st.dueno, dueno: st.dueno || '', usuario: st.usuario || '',
    codigo: token && !st.dueno ? st.codigo || null : null, servidor: st.servidor || '', categoria: !!st.categoria,
    invitar: st.appId ? `https://discord.com/oauth2/authorize?client_id=${st.appId}&scope=bot&permissions=${st.servidor ? VER | ESCRIBIR | HISTORIAL | GESTIONAR_CANALES | GESTIONAR_ROLES : 0}` : null,
    bloqueado: config.bloqueado || '',
  });

  function iniciar() {
    if (!token || vivo) return;
    if (config.bloqueado) { setEstado('bloqueado: ' + config.bloqueado); return; }
    vivo = true; intentos = 0; setEstado('conectando');
    conectarGateway();
  }
  function detener() { vivo = false; pararLatido(); clearTimeout(reconexion); const w = ws; ws = null; sesion = null; seq = null; try { w && w.cerrar(1000, 'adiós'); } catch { } }
  async function arrancar() {
    if (config.bloqueado) { setEstado('bloqueado: ' + config.bloqueado); return estadoPublico(); }
    try { token = String(await secretos.leer('discord:token') || ''); } catch (e) { log('[discord] sin acceso al token:', e.message); token = ''; }
    if (!token) { setEstado('sin configurar'); return estadoPublico(); }
    iniciar();
    return estadoPublico();
  }

  return {
    arrancar, iniciar, detener, conectar, nuevoCodigo, desconectar, prueba, estado: estadoPublico,
    permiso, permisoResuelto, tarjeta, avisar, prepararCategoria,
    get sesion() { return sesion; }, get seq() { return seq; },
  };
}

module.exports = { crearDiscord, intentsDe, I, FATALES };
