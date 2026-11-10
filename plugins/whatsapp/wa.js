// Lógica del canal de WhatsApp (Baileys) sin depender del SDK: se prueba con un Baileys falso. Misma funcionalidad que
// whatsapp.js de la app:
//   - vinculado como "WhatsApp Web" con QR (acción de canal 'vincular' → el panel pinta el QR que devuelve 'estado')
//   - SOLO tu chat contigo mismo (fromMe + tu jid PN o LID): ahí hablas con APOLO, permisos 1/2/3 (+#id), los peligrosos
//     piden "CONFIRMO id", tarjetas R<id>/D<id>, notas de voz → Whisper de la app
//   - mensajes de OTRAS personas: solo si el modo es avisar/auto, y solo se pasan a la app (canal.ajeno). El plugin NUNCA
//     responde solo a terceros: enviarA() lo llama la app (tu aprobación en una tarjeta o el modo auto que decide ella)
// Dependencias inyectadas:
//   cargar()      → módulo de Baileys (import dinámico; en los tests, uno falso)
//   qr(texto)     → data URL del QR (paquete qrcode)
//   canal         → lo que devuelve apolo.registrarCanal (recibir, estado, decidir, tarjeta, transcribir, ajeno)
//   almacen       → { leer, guardar, ruta } (la sesión va en <almacén>/auth)
//   config        → cfg.plugins.whatsapp (solo lectura): la config de whatsapp.json de la app para migrarla la 1.ª vez
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const wa = md => String(md ?? '').replace(/\*\*([^*]+)\*\*/g, '*$1*').replace(/__([^_]+)__/g, '_$1_').slice(0, 3800);
const coincide = (numero, n) => { const d = String(n || '').replace(/\D/g, ''); return d.length >= 6 && String(numero).endsWith(d); };
const normal = j => String(j || '').replace(/:\d+@/, '@');
const CONFIG_DEF = { modo: 'apagado', grupos: false, ignorar: [], auto: { contactos: [], instrucciones: 'Estoy ocupado ahora mismo. Responde breve y amable que vi el mensaje y que contesto en cuanto pueda. No prometas nada ni inventes datos.', maxHora: 3 } };
const DIAS_RECIENTES = 7;                                   // a quién se puede responder: solo a quien te escribió hace poco
// logger silencioso con la forma de pino (Baileys lo exige) sin depender de pino
const silencio = { level: 'silent', child() { return silencio; }, trace() { }, debug() { }, info() { }, warn() { }, error() { }, fatal() { } };

// mensaje de Baileys → lo que nos interesa (texto, audio, de quién). Desenvuelve efímeros, "ver una vez" y documentos con pie.
function extraer(m) {
  const k = m?.key || {};
  let msg = m?.message || {};
  for (let i = 0; i < 4; i++) {
    const dentro = msg.ephemeralMessage || msg.viewOnceMessage || msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension || msg.documentWithCaptionMessage || msg.editedMessage;
    if (!dentro || !dentro.message) break;
    msg = dentro.message;
  }
  const texto = String(msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || msg.documentMessage?.caption || '').trim();
  const tipo = msg.audioMessage ? 'audio' : msg.imageMessage ? 'imagen' : msg.videoMessage ? 'video' : msg.documentMessage ? 'documento' : msg.stickerMessage ? 'sticker' : texto ? 'texto' : 'otro';
  return { id: k.id || '', jid: k.remoteJid || '', alt: k.remoteJidAlt || '', fromMe: !!k.fromMe, participante: k.participant || '', participanteAlt: k.participantAlt || '', nombre: m?.pushName || '', texto, tipo, audio: tipo === 'audio' };
}
// el número de teléfono de verdad: en los chats @lid viene en el jid alternativo (si no hay, los dígitos del LID, como antes)
function numeroDe(x, grupo) {
  const candidatos = grupo ? [x.participanteAlt, x.participante] : [x.jid, x.alt];
  const pn = candidatos.find(j => /@s\.whatsapp\.net$/.test(j || ''));
  return String(pn || (grupo ? x.participante : x.jid) || '').split(/[:@]/)[0];
}
const sinAcentos = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// ¿es tu chat contigo mismo? (por número PN o por LID; sin el sufijo :dispositivo)
const esMiChat = (jid, yo) => !!yo && !!jid && (normal(jid) === yo.pn || (!!yo.lid && normal(jid) === yo.lid));
// jids que nunca se leen: estados, difusiones, canales
const jidIgnorado = jid => !jid || jid === 'status@broadcast' || /@(broadcast|newsletter)$/.test(jid);

function crearWhatsapp({ cargar, qr: hacerQr, canal, almacen, config = {}, log = () => { }, esperaBase = 2000 }) {
  const dir = path.join(almacen.ruta, 'auth');
  let conf = almacen.leer('config', null);
  if (!conf) { const g = config.conf || {}; conf = { ...CONFIG_DEF, ...g, auto: { ...CONFIG_DEF.auto, ...(g.auto || {}) } }; almacen.guardar('config', conf); }
  const recientes = new Map(Object.entries(almacen.leer('recientes', {}) || {}));   // jid → última vez que te escribió (para responderle)
  const guardarRecientes = () => { const lim = Date.now() - DIAS_RECIENTES * 864e5; for (const [j, t] of recientes) if (t < lim) recientes.delete(j); almacen.guardar('recientes', Object.fromEntries(recientes)); };
  // agenda: quien te escribió + lo que WhatsApp sincroniza + los que guardas tú (agenda:true, su nombre no lo pisa nadie)
  const contactos = new Map(Object.entries(almacen.leer('contactos', {}) || {}));
  let tGuardarContactos = null;
  const guardarContactos = () => { clearTimeout(tGuardarContactos); tGuardarContactos = setTimeout(() => almacen.guardar('contactos', Object.fromEntries(contactos)), 500); tGuardarContactos.unref?.(); };
  function verContacto({ jid, nombre, numero, agenda }) {
    if (!/@(s\.whatsapp\.net|lid)$/.test(jid || '') || jidIgnorado(jid)) return;
    const c = contactos.get(jid) || { jid, nombre: '', numero: '' };
    if (nombre && (agenda || !c.agenda)) c.nombre = String(nombre).slice(0, 80);
    if (numero) c.numero = String(numero);
    if (agenda) c.agenda = true;
    contactos.set(jid, c); guardarContactos();
    return c;
  }
  const historial = new Map();
  const anotar = (jid, de, texto) => { const h = historial.get(jid) || []; h.push({ de, texto: String(texto).slice(0, 500), t: Date.now() }); historial.set(jid, h.slice(-8)); };
  const autoEnviados = new Map();
  let B = null, sock = null, vivo = false, parado = false, qr = null, estado = 'sin vincular', yo = null, intentos = 0, temporizador = null;
  const enviadosIds = new Set();
  const perms = new Map();                                    // id (string) → p
  let ultimoPerm = null;
  const confirmar = new Set();
  const setEstado = e => { if (e === estado) return; estado = e; canal.estado(e === 'conectado' ? 'activo' : 'inactivo', e).catch(() => { }); };
  const hayCredenciales = () => fs.existsSync(path.join(dir, 'creds.json'));

  async function iniciar() {
    if (vivo) return;
    vivo = true;
    try {
      B = B || await cargar();
      const makeWASocket = B.default?.default || B.default || B.makeWASocket;
      fs.mkdirSync(dir, { recursive: true });
      const { state, saveCreds } = await B.useMultiFileAuthState(dir);
        let version; try { if (B.fetchLatestWaWebVersion) ({ version } = await B.fetchLatestWaWebVersion({})); } catch { }   // web.whatsapp.com (declarado)
      sock = makeWASocket({ ...(version ? { version } : {}), auth: state, logger: silencio, browser: B.Browsers ? B.Browsers.windows('APOLO') : ['APOLO', 'Chrome', '1'], markOnlineOnConnect: false, syncFullHistory: false, printQRInTerminal: false });
      sock.ev.on('creds.update', saveCreds);
    } catch (e) { vivo = false; throw e; }
    const s = sock;
    s.ev.on('connection.update', async u => {
      if (sock !== s) return;
      if (u.qr) { try { qr = await hacerQr(u.qr); } catch (e) { log('[whatsapp] qr', e.message); qr = null; } setEstado('escanea el QR'); }
      if (u.connection === 'open') {
        qr = null; intentos = 0;
        yo = { pn: normal(s.user?.id), lid: normal(s.user?.lid), numero: String(s.user?.id || '').split(/[:@]/)[0] };
        setEstado('conectado');
      }
      if (u.connection === 'close') {
        const codigo = u.lastDisconnect?.error?.output?.statusCode;
        const DR = B.DisconnectReason || {};
        sock = null; vivo = false;
        if (parado) return;
        if (codigo === DR.loggedOut) {                         // lo desvincularon desde el móvil
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
          yo = null; qr = null; setEstado('desvinculado');
          return;
        }
        if (!hayCredenciales() && codigo !== DR.restartRequired) { qr = null; setEstado('sin vincular'); return; }   // nadie escaneó: se para
        const espera = codigo === DR.restartRequired ? 500 : Math.min(60_000, esperaBase * 2 ** intentos++);
        setEstado('reconectando');
        clearTimeout(temporizador);
        temporizador = setTimeout(() => { if (!parado) iniciar().catch(e => log('[whatsapp]', e.message)); }, espera);
      }
    });
    s.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || sock !== s) return;
      for (const m of messages || []) recibir(m).catch(e => log('[whatsapp]', e.message));
    });
    const sincronizar = lista => { for (const c of lista || []) verContacto({ jid: c.id, nombre: c.name || c.notify || c.verifiedName, numero: /@s\.whatsapp\.net$/.test(c.id || '') ? String(c.id).split(/[:@]/)[0] : String(c.phoneNumber || '').split(/[:@]/)[0] }); };
    s.ev.on('contacts.upsert', sincronizar);
    s.ev.on('contacts.update', sincronizar);
    s.ev.on('messaging-history.set', h => sincronizar(h?.contacts));
    return s;
  }

  async function recibir(m) {
    const x = extraer(m);
    if (enviadosIds.has(x.id)) return;
    if (!esMiChat(x.jid, yo)) return ajeno(m, x);
    if (!x.fromMe) return;                                     // en tu chat contigo mismo, solo lo que escribes TÚ
    if (x.audio) {
      const t = await notaDeVoz(m);
      if (!t) return enviar('🎙 No entendí la nota de voz. ¿Me lo escribes?');
      enviar(`🎙 _${t}_`);
      escribiendo();
      return responder(await canal.recibir(t, { de: 'chat' }));
    }
    const texto = x.texto;
    if (!texto || texto.startsWith('🤖')) return;
    if (await respuestaCorta(texto)) return;
    if (/^\/?(ayuda|help)$/i.test(texto)) return enviar(AYUDA);
    escribiendo();
    responder(await canal.recibir(texto, { de: 'chat' }));
  }
  const responder = r => { if (r) return enviar(String(r)); };
  const escribiendo = () => { try { sock?.sendPresenceUpdate?.('composing', yo?.pn)?.catch?.(() => { }); } catch { } };

  // audio → <almacén>/voz-*.ogg → Whisper de la app (solo admite archivos del almacén)
  async function notaDeVoz(m) {
    if (!B?.downloadMediaMessage) return null;
    let ruta = null;
    try {
      const buf = await B.downloadMediaMessage(m, 'buffer', {}, { logger: silencio, reuploadRequest: sock?.updateMediaMessage });
      fs.mkdirSync(almacen.ruta, { recursive: true });
      ruta = path.join(almacen.ruta, `voz-${Date.now()}.ogg`);
      fs.writeFileSync(ruta, buf);
      const t = await canal.transcribir(ruta);
      return (t && t.texto) || null;
    } catch (e) { log('[whatsapp] voz', e.message); return null; }
    finally { if (ruta) fs.rm(ruta, () => { }); }
  }

  // ---------- mensajes de otras personas: solo con modo avisar/auto, y solo hacia la app ----------
  async function ajeno(m, x) {
    const jid = x.jid;
    const soloReglas = conf.modo === 'apagado';                // apagado + reglas activas: se lee solo para las reglas que programaste
    if ((soloReglas && !conf.reglasActivas) || jidIgnorado(jid)) return;
    const grupo = jid.endsWith('@g.us');
    if (grupo && !conf.grupos) return;
    const texto = x.texto || (x.audio ? '🎙 ' + ((await notaDeVoz(m)) || '(nota de voz)') : x.tipo === 'imagen' ? '📷 (foto)' : x.tipo === 'documento' ? '📄 (documento)' : '');
    if (!texto) return;
    const numero = numeroDe(x, grupo);
    if ((conf.ignorar || []).some(n => coincide(numero, n))) return;
    if (x.fromMe) { anotar(jid, 'yo', texto); return; }      // lo que contestas tú desde el móvil: solo contexto
    const c = grupo ? null : verContacto({ jid, nombre: x.nombre, numero });
    const nombre = (c && c.agenda && c.nombre) || x.nombre || '+' + numero;
    anotar(jid, nombre, texto);
    recientes.set(jid, Date.now()); guardarRecientes();
    await canal.ajeno({ jid, nombre, numero, texto, grupo, soloReglas, historial: historial.get(jid) || [], auto: puedeAuto(jid, numero) });
  }
  function puedeAuto(jid, numero) {
    if (conf.modo !== 'auto' || jid.endsWith('@g.us')) return false;
    const lista = conf.auto.contactos || [];
    if (lista.filter(n => String(n).replace(/\D/g, '').length >= 6).length && !lista.some(n => coincide(numero, n))) return false;
    const t = (autoEnviados.get(jid) || []).filter(v => Date.now() - v < 3600_000);
    return t.length < (conf.auto.maxHora || 3);
  }
  // SOLO lo llama la app (acción 'enviarA'): tarjeta aprobada o modo auto decidido por ella. Solo a quien te escribió hace poco.
  async function enviarA({ jid, texto, automatico = false } = {}) {
    jid = String(jid || '');
    if (!sock || estado !== 'conectado') throw new Error('WhatsApp no está conectado');
    if (!recientes.has(jid) || jidIgnorado(jid)) throw new Error('solo se puede responder a un chat que te escribió en los últimos días');
    if (automatico) {
      if (conf.modo !== 'auto') throw new Error('el modo automático está apagado');
      if (!puedeAuto(jid, contactos.get(jid)?.numero || jid.split(/[:@]/)[0])) throw new Error('límite de respuestas automáticas alcanzado para ese contacto');
    }
    const r = await sock.sendMessage(jid, { text: String(texto || '').slice(0, 3800) });
    if (r?.key?.id) enviadosIds.add(r.key.id);
    anotar(jid, 'yo', texto);
    if (automatico) autoEnviados.set(jid, [...(autoEnviados.get(jid) || []).filter(v => Date.now() - v < 3600_000), Date.now()]);
    return true;
  }

  // ---------- envíos que ordenas tú (herramientas, reglas y envíos programados de core/whatsapp-auto.js) ----------
  const dirSalida = path.join(almacen.ruta, 'salida');
  function archivoDeSalida(f) {                                // la app deja aquí la foto/voz ya preparada: nada de rutas libres
    const r = path.resolve(String(f || ''));
    if (!r.startsWith(path.resolve(dirSalida) + path.sep)) throw new Error('archivo fuera de la carpeta de salida');
    return r;
  }
  async function enviarOrden({ jid, texto, foto, voz } = {}) {
    jid = String(jid || '');
    if (!sock || estado !== 'conectado') throw new Error('WhatsApp no está conectado');
    if (!/@(s\.whatsapp\.net|lid)$/.test(jid)) throw new Error('destino no válido: solo chats individuales');
    const ids = [];
    // el id se anota ANTES de enviar: en tu propio chat el eco no debe confundirse con una orden tuya (una nota de voz se transcribiría)
    const mandar = async contenido => { const messageId = '3EB0' + crypto.randomBytes(9).toString('hex').toUpperCase(); enviadosIds.add(messageId); ids.push(messageId); await sock.sendMessage(jid, contenido, { messageId }); };
    if (foto) await mandar({ image: fs.readFileSync(archivoDeSalida(foto.archivo)), ...(foto.pie ? { caption: String(foto.pie).slice(0, 1000) } : {}), ...(foto.miniatura ? { jpegThumbnail: foto.miniatura } : {}), ...(foto.ancho ? { width: +foto.ancho, height: +foto.alto } : {}) });
    if (voz) await mandar({ audio: fs.readFileSync(archivoDeSalida(voz.archivo)), ptt: true, mimetype: 'audio/ogg; codecs=opus', ...(voz.segundos ? { seconds: Math.round(voz.segundos) } : {}), ...(Array.isArray(voz.onda) ? { waveform: Uint8Array.from(voz.onda) } : {}) });
    if (texto) await mandar({ text: String(texto).slice(0, 3800) });
    while (enviadosIds.size > 500) enviadosIds.delete(enviadosIds.values().next().value);
    anotar(jid, 'yo', texto || (voz ? '🎙 (nota de voz)' : '📷 (foto)'));
    return { ok: true, ids };
  }
  // destino: número con código de país, jid, o nombre (agenda primero; si hay varios o ninguno, lo dice en vez de adivinar)
  async function resolver({ destino } = {}) {
    const d = String(destino || '').trim();
    if (!d) throw new Error('falta el destino');
    if (/@(s\.whatsapp\.net|lid)$/.test(d)) return contactos.get(d) || { jid: d, nombre: '', numero: d.split(/[:@]/)[0] };
    const digitos = d.replace(/\D/g, '');
    if (/^[+\d\s().-]+$/.test(d) && digitos.length >= 7) {
      if (!sock?.onWhatsApp || estado !== 'conectado') throw new Error('WhatsApp no está conectado');
      const [r] = await sock.onWhatsApp(digitos);
      if (!r?.exists) throw new Error(`${d} no tiene WhatsApp (recuerda el código de país)`);
      return { nombre: [...contactos.values()].find(c => c.numero === digitos)?.nombre || '', numero: digitos, jid: r.jid };
    }
    const q = sinAcentos(d);
    const dedupe = l => [...new Map(l.map(c => [c.numero || c.jid, c])).values()];
    const todos = [...contactos.values()].filter(c => sinAcentos(c.nombre).includes(q));
    const exactos = todos.filter(c => sinAcentos(c.nombre) === q);
    const agenda = (exactos.length ? exactos : todos).filter(c => c.agenda);
    const lista = dedupe(agenda.length ? agenda : (exactos.length ? exactos : todos));
    if (lista.length === 1) return lista[0];
    if (!lista.length) throw new Error(`no tengo a "${d}" en la agenda: dime su número con código de país, o guárdalo en la agenda`);
    throw new Error(`hay varios "${d}": ${lista.slice(0, 8).map(c => `${c.nombre} (+${c.numero})`).join(', ')}. Dime cuál por su número`);
  }
  async function guardarContacto({ nombre, numero } = {}) {
    if (!String(nombre || '').trim()) throw new Error('falta el nombre');
    const r = await resolver({ destino: numero });
    return verContacto({ jid: r.jid, nombre: String(nombre).trim(), numero: r.numero, agenda: true });
  }
  function verContactos({ q } = {}) {
    const n = sinAcentos(q);
    return [...contactos.values()].filter(c => c.nombre || c.numero).filter(c => !n || sinAcentos(c.nombre).includes(n) || String(c.numero).includes(n))
      .sort((a, b) => Number(!!b.agenda) - Number(!!a.agenda) || String(a.nombre).localeCompare(String(b.nombre))).slice(0, 200);
  }
  function borrarContacto({ jid } = {}) { const c = contactos.delete(String(jid)); guardarContactos(); return { ok: c }; }

  // 1/2/3 (+ #id) · CONFIRMO id · R<id> [texto] / D<id>
  async function respuestaCorta(t) {
    let m;
    if ((m = t.match(/^confirmo\s*#?(\d+)?$/i))) {
      const id = String(m[1] || ultimoPerm || '');
      if (!confirmar.has(id)) return false;
      confirmar.delete(id); await canal.decidir(id, 'allow').catch(e => enviar('🤖 ' + e.message)); return true;
    }
    if ((m = t.match(/^([123])\s*(?:#?(\d+))?$/)) && perms.size) {
      const id = String(m[2] || ultimoPerm || ''), p = perms.get(id);
      if (!p) { enviar('🤖 Ese permiso ya no está pendiente.'); return true; }
      if (m[1] === '3') { await canal.decidir(id, 'deny').catch(e => enviar('🤖 ' + e.message)); return true; }
      if (p.peligro) { confirmar.add(id); enviar(`🤖 ⛔ *Esto es peligroso* (${p.peligro}).\nSi de verdad quieres permitirlo, escribe *CONFIRMO ${id}*`); return true; }
      await canal.decidir(id, m[1] === '2' ? 'always' : 'allow').catch(e => enviar('🤖 ' + e.message)); return true;
    }
    if ((m = t.match(/^([rd])\s*#?(\d+)(?:\s+([\s\S]+))?$/i))) {
      const r = m[1].toLowerCase() === 'r';
      const res = await canal.tarjeta(m[2], r ? 'enviar' : 'descartar', r ? m[3] : undefined).catch(e => '❌ ' + e.message);
      enviar('🤖 ' + wa(res)); return true;
    }
    return false;
  }

  async function enviar(texto) {
    if (!sock || estado !== 'conectado' || !yo?.pn) return null;
    try {
      const r = await sock.sendMessage(yo.pn, { text: String(texto).startsWith('🤖') ? wa(texto) : '🤖 ' + wa(texto) });
      if (r?.key?.id) { enviadosIds.add(r.key.id); if (enviadosIds.size > 500) enviadosIds.delete(enviadosIds.values().next().value); }
      return r;
    } catch (e) { log('[whatsapp]', e.message); return null; }
  }

  // ---------- lo que manda la app ----------
  async function permiso(p) {
    if (!sock || estado !== 'conectado') return false;
    const id = String(p.id);
    perms.set(id, p); ultimoPerm = id;
    const op = p.peligro ? '*1* Permitir (te pediré confirmación) · *3* Denegar' : '*1* Permitir · *2* Siempre · *3* Denegar';
    const r = await enviar(`${p.peligro ? '⛔ *PELIGRO*' : '⚠️'} *Permiso #${id}: ${p.tool}*\n📁 ${p.session}\n\`\`\`${String(p.detail || '').slice(0, 700)}\`\`\`${p.peligro ? `\n*Ojo:* ${p.peligro}` : ''}\n\nResponde ${op}`);
    if (!r) { perms.delete(id); return false; }
    return true;
  }
  function permisoResuelto(id, behavior, via) {
    id = String(id);
    if (!perms.has(id)) return;
    perms.delete(id); confirmar.delete(id);
    if (ultimoPerm === id) ultimoPerm = [...perms.keys()].pop() || null;
    if (behavior === 'expired') return enviar(`⌛ El permiso #${id} caducó sin respuesta.`);
    return enviar(`${behavior === 'deny' ? '✋ Denegado' : behavior === 'always' ? '✅ Permitido siempre' : '✅ Permitido'} #${id}${via && via !== 'WhatsApp' ? ` desde ${via}` : ''}`);
  }
  async function tarjeta(c) {
    if (!sock || estado !== 'conectado') return false;
    const r = await enviar(`${c.prioridad === 'urgente' ? '🔴 *URGENTE* · ' : ''}${c.kind === 'mail' ? '✉️' : '💬'} *${c.author || ''}*${c.guild ? ` · ${c.guild}` : ''}\n${c.resumen || ''}` +
      (c.respuesta ? `\n\n*Respuesta sugerida:*\n_${c.respuesta}_` : '') +
      `\n\n${c.respuesta && c.canSend ? `*R${c.id}* enviar esa respuesta · *R${c.id} tu texto* enviar otra · ` : ''}*D${c.id}* descartar`);
    return !!r;
  }
  const avisar = texto => enviar(texto);

  // ---------- panel / acciones ----------
  const estadoPublico = () => ({ modo: conf.modo, estado, vinculado: hayCredenciales() && estado !== 'desvinculado', conectado: estado === 'conectado', numero: yo?.numero || '', qr: estado === 'escanea el QR' ? qr : null, plugin: true });
  async function vincular() { parado = false; if (!vivo) await iniciar(); return estadoPublico(); }
  // para sin cerrar la sesión (la app la necesita así para copiar la sesión de whatsapp.js al almacén)
  async function parar() { parado = true; clearTimeout(temporizador); try { sock?.end?.(); } catch { } sock = null; vivo = false; setEstado(hayCredenciales() ? 'parado' : 'sin vincular'); return estadoPublico(); }
  async function desvincular() {
    parado = true; clearTimeout(temporizador);
    try { await sock?.logout?.(); } catch { }
    try { sock?.end?.(); } catch { }
    sock = null; vivo = false; yo = null; qr = null;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    setEstado('sin vincular');
    return estadoPublico();
  }
  function arrancar() { if (hayCredenciales()) { parado = false; return iniciar().catch(e => log('[whatsapp]', e.message)); } setEstado('sin vincular'); }
  function ponerConfig(c = {}) {
    conf = { ...conf, ...c, auto: { ...conf.auto, ...(c.auto || {}) } };
    if (!['apagado', 'avisar', 'auto'].includes(conf.modo)) conf.modo = 'apagado';
    conf.grupos = !!conf.grupos;
    conf.reglasActivas = !!conf.reglasActivas;
    conf.ignorar = (Array.isArray(conf.ignorar) ? conf.ignorar : []).map(String).slice(0, 200);
    conf.auto.contactos = (Array.isArray(conf.auto.contactos) ? conf.auto.contactos : []).map(String).slice(0, 200);
    conf.auto.instrucciones = String(conf.auto.instrucciones || '').slice(0, 2000);
    conf.auto.maxHora = Math.max(1, Math.min(20, +conf.auto.maxHora || 3));
    almacen.guardar('config', conf);
    return conf;
  }
  const AYUDA = '🤖 *Qué puedo hacer por aquí*\nEscríbeme en este chat (el tuyo contigo mismo) y lo paso al mejor modelo: programar, buscar en la web, usar el PC, tu correo, GitHub…\n• `gemma: …`, `chatgpt: …`, `claude: …` para elegir modelo\n• Permisos: responde *1* Permitir, *2* Siempre, *3* Denegar\n• Tarjetas: *R5* responder, *D5* descartar\n\nSolo leo este chat: tus conversaciones con otras personas no las toco.';

  return {
    arrancar, vincular, parar, desvincular, estado: estadoPublico, enviarA, config: () => conf, ponerConfig,
    enviarOrden, resolver, guardarContacto, contactos: verContactos, borrarContacto,
    permiso, permisoResuelto, tarjeta, avisar, prueba: async () => { await enviar('🤖 *Prueba:* así te llegarán los avisos.'); return estadoPublico(); },
    recibir, get conectado() { return estado === 'conectado'; },
    _probar: { ponerYo: y => { yo = y; }, ponerSock: s => { sock = s; }, ponerEstado: setEstado },
  };
}

module.exports = { crearWhatsapp, extraer, numeroDe, esMiChat, jidIgnorado, wa, coincide, CONFIG_DEF, silencio };
