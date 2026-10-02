// Canal de WhatsApp vinculado como "WhatsApp Web" (QR) con Baileys. NO es la API oficial: el panel lo avisa.
// Privacidad: APOLO SOLO lee y escribe en tu chat contigo mismo ("Tú" / "Mensaje para ti"); nunca toca otras conversaciones.
// Permisos por respuesta corta: 1 = Permitir · 2 = Siempre · 3 = Denegar (los peligrosos piden CONFIRMO).
const fs = require('fs');
const path = require('path');

// markdown de la app (**negrita**) → formato de WhatsApp (*negrita*)
const wa = md => String(md ?? '').replace(/\*\*([^*]+)\*\*/g, '*$1*').replace(/__([^_]+)__/g, '_$1_').slice(0, 3800);

function crearWhatsapp({ dir, decide, cardAction, onTalk, onEstado = () => { }, log = console.log }) {
  let parado = false;                                        // desvinculado a propósito: no reconectar
  let sock = null, vivo = false, qr = null, estado = 'sin vincular', yo = null, intentos = 0;
  const enviadosIds = new Set();                              // lo que escribe APOLO (para no leerse a sí mismo)
  const perms = new Map();                                    // id → p
  let ultimoPerm = null;
  const confirmar = new Set();                                // permisos peligrosos esperando "CONFIRMO"
  const setEstado = e => { estado = e; onEstado(e); };
  const hayCredenciales = () => fs.existsSync(path.join(dir, 'creds.json'));
  const normal = j => String(j || '').replace(/:\d+@/, '@');

  async function iniciar() {
    if (vivo) return;
    vivo = true;
    const B = await import('@whiskeysockets/baileys');
    const makeWASocket = B.default?.default || B.default || B.makeWASocket;
    fs.mkdirSync(dir, { recursive: true });
    const { state, saveCreds } = await B.useMultiFileAuthState(dir);
    let version; try { ({ version } = await B.fetchLatestBaileysVersion()); } catch { }
    const logger = require('pino')({ level: 'silent' });
    sock = makeWASocket({ version, auth: state, logger, browser: B.Browsers.windows('APOLO'), markOnlineOnConnect: false, syncFullHistory: false, printQRInTerminal: false });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async u => {
      if (u.qr) { qr = await require('qrcode').toDataURL(u.qr, { margin: 1, width: 280 }); setEstado('escanea el QR'); }
      if (u.connection === 'open') {
        qr = null; intentos = 0;
        yo = { pn: normal(sock.user?.id), lid: normal(sock.user?.lid), numero: String(sock.user?.id || '').split(/[:@]/)[0] };
        setEstado('conectado');
      }
      if (u.connection === 'close') {
        const codigo = u.lastDisconnect?.error?.output?.statusCode;
        sock = null; vivo = false;
        if (parado) return;
        if (codigo === B.DisconnectReason.loggedOut) {       // lo desvincularon desde el móvil
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
          yo = null; qr = null; setEstado('desvinculado');
          return;
        }
        // sin vincular y nadie escaneó el QR: se para (se vuelve a pedir con el botón). Tras escanear llega restartRequired
        if (!hayCredenciales() && codigo !== B.DisconnectReason.restartRequired) { qr = null; setEstado('sin vincular'); return; }
        const espera = Math.min(60_000, 2000 * 2 ** intentos++);   // reconexión con espera creciente
        setEstado('reconectando');
        setTimeout(() => iniciar().catch(e => log('[whatsapp]', e.message)), codigo === B.DisconnectReason.restartRequired ? 500 : espera);
      }
    });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) recibir(m).catch(e => log('[whatsapp]', e.message));
    });
  }

  // ¿es un mensaje tuyo en tu chat contigo mismo?
  const esMiChat = jid => yo && (normal(jid) === yo.pn || (yo.lid && normal(jid) === yo.lid));
  const miChat = () => yo?.pn;

  async function recibir(m) {
    const jid = m.key?.remoteJid;
    if (!m.key?.fromMe || !esMiChat(jid) || enviadosIds.has(m.key.id)) return;   // solo lo que TÚ escribes en TU chat
    const msg = m.message?.ephemeralMessage?.message || m.message || {};
    const texto = String(msg.conversation || msg.extendedTextMessage?.text || '').trim();
    if (msg.audioMessage) return enviar('🎙 Todavía no entiendo notas de voz por aquí. Escríbemelo, porfa.');
    if (!texto || texto.startsWith('🤖')) return;
    if (await respuestaCorta(texto)) return;
    if (/^\/?(ayuda|help)$/i.test(texto)) return enviar(AYUDA);
    try { await sock.sendPresenceUpdate('composing', jid); } catch { }
    const r = await onTalk(texto);
    if (r && r.msg) enviar(String(r.msg));
  }

  // 1/2/3 (+ #id) para permisos · CONFIRMO para los peligrosos · R#id / D#id para tarjetas
  async function respuestaCorta(t) {
    let m;
    if ((m = t.match(/^confirmo\s*#?(\d+)?$/i))) {
      const id = +(m[1] || ultimoPerm);
      if (!confirmar.has(id)) return false;
      confirmar.delete(id); decide(id, 'allow', 'WhatsApp'); return true;
    }
    if ((m = t.match(/^([123])\s*(?:#?(\d+))?$/)) && perms.size) {
      const id = +(m[2] || ultimoPerm), p = perms.get(id);
      if (!p) { enviar('🤖 Ese permiso ya no está pendiente.'); return true; }
      if (m[1] === '3') { decide(id, 'deny', 'WhatsApp'); return true; }
      if (p.peligro) { confirmar.add(id); enviar(`🤖 ⛔ *Esto es peligroso* (${p.peligro}).\nSi de verdad quieres permitirlo, escribe *CONFIRMO ${id}*`); return true; }
      decide(id, m[1] === '2' ? 'always' : 'allow', 'WhatsApp'); return true;
    }
    if ((m = t.match(/^([rd])\s*#?(\d+)$/i))) {
      const r = await cardAction(+m[2], m[1].toLowerCase() === 'r' ? 'enviar' : 'descartar');
      enviar('🤖 ' + wa(r)); return true;
    }
    return false;
  }

  async function enviar(texto) {
    if (!sock || estado !== 'conectado' || !miChat()) return null;
    try {
      const r = await sock.sendMessage(miChat(), { text: texto.startsWith('🤖') ? wa(texto) : '🤖 ' + wa(texto) });
      if (r?.key?.id) { enviadosIds.add(r.key.id); if (enviadosIds.size > 500) enviadosIds.delete(enviadosIds.values().next().value); }
      return r;
    } catch (e) { log('[whatsapp]', e.message); return null; }
  }

  // ---------- misma interfaz que Discord / Telegram ----------
  function sendPerm(p) {
    perms.set(p.id, p); ultimoPerm = p.id;
    const op = p.peligro ? '*1* Permitir (te pediré confirmación) · *3* Denegar' : '*1* Permitir · *2* Siempre · *3* Denegar';
    enviar(`${p.peligro ? '⛔ *PELIGRO*' : '⚠️'} *Permiso #${p.id}: ${p.tool}*\n📁 ${p.session}\n\`\`\`${String(p.detail || '').slice(0, 700)}\`\`\`${p.peligro ? `\n*Ojo:* ${p.peligro}` : ''}\n\nResponde ${op}`);
  }
  function resolvePerm(id, behavior, via) {
    if (!perms.has(id)) return;
    perms.delete(id); confirmar.delete(id);
    if (ultimoPerm === id) ultimoPerm = [...perms.keys()].pop() || null;
    if (via === 'WhatsApp' || behavior === 'expired') { if (behavior === 'expired') enviar(`⌛ El permiso #${id} caducó sin respuesta.`); else enviar(behavior === 'deny' ? `✋ Denegado #${id}` : `✅ ${behavior === 'always' ? 'Permitido siempre' : 'Permitido'} #${id}`); }
    else enviar(`${behavior === 'deny' ? '✋ Denegado' : '✅ Permitido'} #${id} desde ${via}`);
  }
  function sendCard(c) {
    enviar(`${c.prioridad === 'urgente' ? '🔴 *URGENTE* · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} *${c.author || ''}*${c.guild ? ` · ${c.guild}` : ''}\n${c.resumen || ''}` +
      (c.respuesta ? `\n\n*Respuesta sugerida:*\n_${c.respuesta}_` : '') +
      `\n\n${c.respuesta && c.canSend ? `*R${c.id}* responder · ` : ''}*D${c.id}* descartar`);
  }
  const sendAviso = texto => enviar(texto);
  const reply = md => enviar(md);

  // ---------- panel ----------
  const estadoPublico = () => ({ estado, vinculado: hayCredenciales() && estado !== 'desvinculado', conectado: estado === 'conectado', numero: yo?.numero || '', qr: estado === 'escanea el QR' ? qr : null });
  async function vincular() { parado = false; if (!vivo) await iniciar(); return estadoPublico(); }
  async function desvincular() {
    parado = true;
    try { await sock?.logout(); } catch { }
    try { sock?.end?.(); } catch { }
    sock = null; vivo = false; yo = null; qr = null;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    setEstado('sin vincular');
    return estadoPublico();
  }
  // al arrancar la app: solo se conecta solo si ya estaba vinculado
  function arrancar() { if (hayCredenciales()) iniciar().catch(e => log('[whatsapp]', e.message)); }

  const AYUDA = '🤖 *Qué puedo hacer por aquí*\nEscríbeme en este chat (el tuyo contigo mismo) y lo paso al mejor modelo: programar, buscar en la web, usar el PC, tu correo, GitHub…\n• `gemma: …`, `chatgpt: …`, `claude: …` para elegir modelo\n• Permisos: responde *1* Permitir, *2* Siempre, *3* Denegar\n• Tarjetas: *R5* responder, *D5* descartar\n\nSolo leo este chat: tus conversaciones con otras personas no las toco.';

  return {
    get enabled() { return estado === 'conectado'; }, get status() { return estado; },
    arrancar, vincular, desvincular, estado: estadoPublico,
    sendPerm, resolvePerm, sendCard, sendAviso, reply, prueba: () => enviar('🤖 *Prueba:* así te llegarán los avisos.'),
  };
}

module.exports = { crearWhatsapp };
