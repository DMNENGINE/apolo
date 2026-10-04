// Robot Companion — proceso principal (Electron)
// - Ventana "isla" transparente, siempre encima, pegada arriba al centro de la pantalla.
// - Servidor HTTP local (127.0.0.1:47823) que recibe los eventos del hook de Claude Code (con clave secreta).
// - PermissionRequest: la respuesta HTTP se queda abierta hasta que pulses Permitir/Denegar
//   (o se contesta sola si hay una regla "Permitir siempre" y el comando no es peligroso).
// - Localiza la ventana de terminal de cada sesión para traerla al frente con un clic.
// - Cuenta el uso de hoy leyendo los transcripts de ~/.claude/projects.
// - Bandeja: hooks, arranque con Windows, reglas, salir.
// Si a la app la arrancó una sesión de Claude Code, hereda sus variables internas (CLAUDE_CODE_CHILD_SESSION,
// socket y token de mensajería…). Las terminales de Claude que abra el robot creerían ser sesiones "hijas":
// no guardarían transcripción (el uso de hoy saldría a 0) y recibirían el token de otra sesión. Se borran al arrancar.
for (const k of Object.keys(process.env)) if (/^(CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)/.test(k)) delete process.env[k];
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell, globalShortcut, clipboard, safeStorage } = require('electron');
const { crearConectores } = require('./conectores');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const esPeligroso = require('./shared/peligro.js');
const { decidirDiscord } = require('./shared/canales-flags');
const { createDiscord } = require('./bot-discord.js');
const { createTalk } = require('./hablar.js');
let talk = null;
const { createCerebro } = require('./cerebro.js');
let cerebro = null;
const { crearNucleo } = require('./core');
const { iniciar: iniciarDaemon } = require('./core/daemon');
const { createPuente } = require('./puente-nucleo.js');
const { crearOverlay } = require('./control-overlay.js');
let nucleo = null, puente = null, conectores = null;
// idioma de la app (bandeja, avisos, isla): el elegido en el panel (config del núcleo `idioma`) o el del sistema. Mismo diccionario que el panel.
const I18N = require('./core/ui/i18n.js');
const idiomaApp = () => I18N.normal((nucleo && nucleo.cfg && nucleo.cfg.idioma) || (app.isReady() ? app.getLocale() : '') || 'es');
const tr = (k, v) => { I18N.poner(idiomaApp()); return I18N.tr(k, v); };
const nombreCompanero = () => { try { return nucleo ? nucleo.personalidad.nombre() : 'Robot'; } catch { return 'Robot'; } };

const PORT = +process.env.APOLO_PUERTO || 47823;          // APOLO_PUERTO: solo pruebas (el hook usa 47823)
// tamaño de la ventana de la isla: IslaGeo.VENT_W x VENT_H (900 x 640, se recorta si el área de trabajo es menor)
const { fuera } = require('./core/rutas');                 // app instalada: lo que usan procesos externos está en app.asar.unpacked
const { crearHooksConfig, tieneCLI, CLAUDE_DIR } = require('./main/hooks-config');
const { crearVoz } = require('./main/voz');
const { readContext, crearUso } = require('./main/uso');
const { resolveTerminal, focusTerminal, hwndDe } = require('./main/terminales');
const { crearReglas } = require('./main/reglas');
const { crearIsla } = require('./main/isla-ventana');
const { crearDispositivos } = require('./main/dispositivos');
const TOKEN_FILE = path.join(CLAUDE_DIR, 'robot-companion.token');
const { crearActualizador } = require('./actualizador');
let actualizador = null;
const RULES_FILE = () => path.join(app.getPath('userData'), 'reglas.json');
const DISCORD_CFG = () => path.join(app.getPath('userData'), 'discord.json');
const AWAY_MS = 60_000;               // sin mover el ratón 1 min = no estás en la PC
const DISCORD_GRACE_MS = 20_000;      // si estás, solo va a Discord si no contestas en 20 s
let lastMove = Date.now();
const isAway = () => Date.now() - lastMove > AWAY_MS;
let discord = { enabled: false, status: 'sin configurar', sendPerm() { }, resolvePerm() { }, sendAviso() { }, reply() { }, sendCard() { }, replyTo() { return false; }, stop() { } };
let telegram = { enabled: false, status: 'sin configurar', sendPerm() { }, resolvePerm() { }, sendAviso() { }, reply() { }, sendCard() { }, iniciar() { }, detener() { },
  estado: () => ({ configurado: false, estado: 'arrancando', bot: null, enlazado: false, usuario: '', enlace: null }) };
let whatsapp = { enabled: false, status: 'sin vincular', sendPerm() { }, resolvePerm() { }, sendAviso() { }, reply() { }, sendCard() { } };
// canales de plugins del SDK (Slack, Matrix, Signal…); telegram, whatsapp y discord quedan fuera: tienen su adaptador propio
const CON_ADAPTADOR = ['telegram', 'whatsapp', 'discord'];
const canalesPlugin = {
  P: () => (typeof nucleo !== 'undefined' && nucleo && nucleo.plugins) || null,
  err: e => console.error('[plugins] canal:', e.message),
  sendAviso(t) { const P = this.P(); if (P) P.difundir(t, { excluir: CON_ADAPTADOR }).catch(this.err); },
  sendPerm(p) { const P = this.P(); if (P) P.mostrarPermiso(p, { excluir: CON_ADAPTADOR }).catch(this.err); },
  resolvePerm(id, b, via) { const P = this.P(); if (P) P.permisoResuelto(id, b, via); },
  sendCard(c) { const P = this.P(); if (P) P.mostrarTarjeta(c, { excluir: CON_ADAPTADOR }).catch(this.err); },
  reply(md) { this.sendAviso(md); },
};
// al móvil: Discord, Telegram, WhatsApp y los canales plugin a la vez (cada uno ignora lo suyo si no está configurado)
const movil = {
  sendAviso: (...a) => { discord.sendAviso(...a); telegram.sendAviso(...a); whatsapp.sendAviso(...a); canalesPlugin.sendAviso(a[0]); },
  sendPerm: p => { discord.sendPerm(p); telegram.sendPerm(p); whatsapp.sendPerm(p); canalesPlugin.sendPerm(p); },
  resolvePerm: (...a) => { discord.resolvePerm(...a); telegram.resolvePerm(...a); whatsapp.resolvePerm(...a); canalesPlugin.resolvePerm(...a); },
  sendCard: c => { discord.sendCard(c); telegram.sendCard(c); whatsapp.sendCard(c); canalesPlugin.sendCard(c); },
  reply: md => { discord.reply(md); telegram.reply(md); whatsapp.reply(md); canalesPlugin.reply(md); },
};
const esRemoto = o => o === 'discord' || o === 'telegram' || o === 'whatsapp';
const responderA = (o, md) => ({ telegram, whatsapp }[o] || discord).reply(md);

let win, tray;
const pending = new Map();          // id -> { res, timer, ev }
let nextId = 1;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- clave secreta compartida con el hook ----------
let TOKEN;
function ensureToken() {
  try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { }
  if (!TOKEN || TOKEN.length < 32) {
    TOKEN = crypto.randomBytes(24).toString('hex');
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o600 });
  }
}

// ---------- reglas "Permitir siempre" ----------
const reglas = crearReglas(RULES_FILE);
const allowJSON = () => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });

// ---------- isla (ventana, posición, arrastre, pantalla completa: main/isla-ventana.js) ----------
const isla = crearIsla({ alPantallaCompleta: e => { if (nucleo) nucleo.bus.emit('pantalla-completa', e); } });   // co-host: modo comentarista
function createWindow() { win = isla.crearVentana(); }

// ---------- voz: TTS (Fish / edge-tts) y Whisper (main/voz.js) ----------
const voz = crearVoz({ dirDatos: () => app.getPath('userData'), idioma: () => idiomaApp() });
const transcribirArchivo = ruta => voz.transcribirArchivo(ruta);
// lo que dice la isla también sale por el altavoz del ojo si la petición vino del ojo (o cfg.nodos.vozSiempre)
ipcMain.handle('tts', async (_e, text) => { const f = await voz.generarTts(text); vozAlOjo(f); return f; });
ipcMain.handle('listen', () => voz.escuchar());

// ---------- hooks en ~/.claude y ~/.gemini (main/hooks-config.js) ----------
const hooksCfg = crearHooksConfig({ empaquetado: () => app.isPackaged, mensaje: o => dialog.showMessageBox(o), tr: (k, v) => tr(k, v) });

// ---------- uso del plan (main/uso.js) ----------
const uso = crearUso({ claudeDir: CLAUDE_DIR, dirDatos: () => app.getPath('userData'), cerebro: () => cerebro,
  avisar: (t, tono) => movil.sendAviso(t, tono), alUso: d => { ultimoUso = d; if (win && !win.isDestroyed()) win.webContents.send('usage', d); } });
let ultimoUso = null, ultimaSid = null;                      // para las teclas del Stream Deck (uso del plan, ir a la terminal)
const dispositivos = crearDispositivos({ getWin: () => win, getNucleo: () => nucleo, abrirPanel: r => abrirPanel(r), handleText: (t, o) => handleText(t, o),
  focusTerminal: sid => focusTerminal(sid), ultimaSesion: () => { const p = [...pending.values()].find(x => x.ev && x.ev.session_id && !x.nucleoId); return (p && p.ev.session_id) || ultimaSid; } });

ipcMain.on('upd-ahora', () => { if (!actualizador) return; actualizador.actualizar(); });
ipcMain.on('upd-luego', () => { if (actualizador) actualizador.posponer(24); });
async function buscarActualizacion() {
  const r = await actualizador.comprobar(true);
  const txt = { 'al-dia': tr('Tienes la última versión.'), desarrollo: tr('Esta es una copia de desarrollo (git): actualízala con git pull.'),
    desconocido: tr('No sé qué versión tienes: reinstala con el comando de una línea para recibir avisos.'), error: tr('No pude consultar GitHub: {x}', { x: r.error || '' }) }[r.estado];
  if (txt && win && !win.isDestroyed()) win.webContents.send('answer', { titulo: tr('Actualizaciones'), texto: txt });
}

// respuesta a un permiso desde la isla (o Stream Deck / Discord): 'allow' | 'deny' | 'always'
function decide(id, behavior, via = '?') {
  console.log(`[decide] id=${id} ${behavior} via=${via} pendiente=${pending.has(id)}`);
  const p = pending.get(id);
  if (!p) return false;
  clearTimeout(p.timer); pending.delete(id);
  ojoRefrescar();
  if (p.nucleoId) {                                            // permiso del núcleo multi-modelo (sus reglas las guarda él)
    nucleo.permisos.resolver(p.nucleoId, behavior, undefined, via);   // via = isla | discord | telegram | streamdeck… (auditoría)
    if (win && !win.isDestroyed()) win.webContents.send('decided', id, behavior);
    movil.resolvePerm(id, behavior, via);
    return true;
  }
  if (behavior === 'always' && !esPeligroso(p.ev.tool_name, p.ev.tool_input)) reglas.agregar(p.ev.tool_name, p.ev.tool_input);
  const decision = behavior === 'deny' ? { behavior: 'deny', message: `Denegado desde ${nombreCompanero()}` } : { behavior: 'allow' };
  p.res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }));
  if (win && !win.isDestroyed()) win.webContents.send('decided', id, behavior);
  movil.resolvePerm(id, behavior, via);
  return true;
}
ipcMain.on('decision', (_e, id, behavior) => decide(id, behavior, 'isla'));

ipcMain.handle('focus-terminal', (_e, sid) => focusTerminal(sid));
ipcMain.handle('talk', (_e, text, origin) => talk ? handleText(text, origin || 'isla') : { ok: false, msg: 'no listo' });
ipcMain.handle('ses-chat', (_e, sid) => talk ? talk.conversacion(sid) : { ok: false, msg: 'no listo' });
ipcMain.handle('ses-send', (_e, sid, text) => talk ? talk.talkTo(sid, text, null) : { ok: false, msg: 'no listo' });
ipcMain.handle('card-action', (_e, id, action, text) => cardAction(id, action, text));

// ---------- texto del usuario: ¿orden para el cerebro o mensaje para Claude Code? ----------
async function handleText(text, origin) {
  const isBrain = cerebro && /^(regla|reglas$|borra|resumen|briefing|\?|pregunta|busca)|d[oó]nde me qued|en qu[eé] (estaba|me qued)/i.test(String(text).trim());
  // núcleo multi-modelo: "qwen: …", "usa gpt", modo automático… (las órdenes del cerebro van antes)
  const n = !isBrain && puente ? await puente.handle(text, origin) : null;
  if (n && n.claude) return talk.talk(n.claude, origin);              // "claude: …" = ese mensaje a Claude Code
  if (n) return n;
  if (!isBrain) return talk.talk(text, origin);
  if (win && !win.isDestroyed()) win.webContents.send('thinking', true);
  const r = await cerebro.command(text);
  if (win && !win.isDestroyed()) win.webContents.send('thinking', false);
  if (!r) return talk.talk(text, origin);
  if (esRemoto(origin)) responderA(origin, r.texto);
  else if (win && !win.isDestroyed()) win.webContents.send('answer', r);
  return { ok: true, msg: esRemoto(origin) ? r.texto : '🧠 Listo (mira la isla).' };
}
// ---------- acciones de las tarjetas (isla o Discord) ----------
async function cardAction(id, action, text) {
  const c = cerebro && cerebro.card(id);
  if (!c) return 'Esa tarjeta ya no existe.';
  const msg = text || c.respuesta || '';
  if (action === 'enviar' && c.kind === 'mail' && c.correo && conectores) {   // tarjeta de correo: "Responder" = tu aprobación
    try {
      const cu = conectores.correo.cuenta(c.correo.cuenta), o = await conectores.correo.leer(cu, c.correo.uid);
      const para = (o.de.match(/<([^>]+)>/) || [, o.de])[1];
      await conectores.correo.enviar(cu, { para, asunto: /^re:/i.test(o.asunto) ? o.asunto : 'Re: ' + o.asunto, texto: msg, enRespuestaA: o.messageId, referencias: [...o.referencias, o.messageId].filter(Boolean) });
      cerebro.dropCard(id); win && win.webContents.send('card-done', id);
      return `📨 Respuesta enviada a ${para}.`;
    } catch (e) { return '❌ No pude enviarla: ' + e.message; }
  }
  if (action === 'enviar' && c.kind === 'whatsapp' && c.whatsapp) {     // tarjeta de WhatsApp: "Responder" = tu aprobación
    if (!msg) return '❌ No hay texto para enviar.';
    try { await whatsapp.enviarA(c.whatsapp.jid, msg); cerebro.dropCard(id); win && win.webContents.send('card-done', id); return `📨 Enviado a ${c.author} por WhatsApp.`; }
    catch (e) { return '❌ No pude enviarlo: ' + e.message; }
  }
  if (action === 'enviar') {
    const ok = c.canSend && msg && await discord.replyTo(c.channelId, c.msgId, msg);
    if (ok) { cerebro.dropCard(id); win && win.webContents.send('card-done', id); }
    return ok ? '📨 Respuesta enviada.' : '❌ No pude enviarla.';
  }
  if (action === 'copiar') { clipboard.writeText(msg); if (c.kind === 'mail') return '📋 Respuesta copiada.'; shell.openExternal(c.link || 'discord://'); return '📋 Copiada; pégala en Discord.'; }
  if (['urgente', 'normal', 'ruido'].includes(action)) {
    cerebro.learn(id, action);
    if (action === 'ruido') { cerebro.dropCard(id); win && win.webContents.send('card-done', id); }
    return action === 'ruido' ? '🔕 Entendido: la próxima vez lo trato como ruido.' : '✓ Aprendido.';
  }
  cerebro.dropCard(id); win && win.webContents.send('card-done', id);
  return '🗑 Descartada.';
}
// ---------- servidor de eventos ----------
function startServer() {
  const srv = http.createServer((req, res) => {
    if (req.headers['x-robot-token'] !== TOKEN) { res.writeHead(403); return res.end(); }   // solo nuestro hook
    if (req.method === 'GET' && req.url === '/state') {              // para el Stream Deck
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(stateForDevices()));
    }
    if (req.method === 'POST' && req.url.startsWith('/decide')) {    // Stream Deck / Discord
      const u = new URL(req.url, 'http://x'), id = +u.searchParams.get('id') || [...pending.keys()][0];
      let ok = id ? decide(id, u.searchParams.get('b') || 'allow', 'http') : false;
      if (!ok && u.searchParams.get('b') === 'deny' && nucleo?.control.estado().length) {   // Denegar sin permisos pendientes = recuperar el control
        const est = nucleo.control.estado(); nucleo.control.soltarTodo('el usuario lo detuvo (Stream Deck)');
        for (const c of est) nucleo.agente.cancelar(c.sesion); ok = true;
      }
      res.writeHead(ok ? 200 : 404); return res.end();
    }
    if (req.method === 'POST' && req.url === '/test-discord') {     // aviso de prueba al DM
      movil.sendAviso('🤖 **Prueba:** así te llegarán los avisos del Robot Companion.', 'blue');
      res.writeHead(200); return res.end();
    }
    if (req.method === 'POST' && req.url.startsWith('/mover')) {     // mover la isla: ?a=otro (fuera del principal) | ?a=casa
      isla.mover(/a=reset/.test(req.url) ? 'reset' : /a=casa/.test(req.url) ? 'casa' : 'otro');
      res.writeHead(200); return res.end();
    }
    if (req.method === 'POST' && req.url === '/panico') {           // Stream Deck: Denegar mantenido 2 s = pánico global (FASE 9)
      const ok = !!nucleo?.panico; if (ok) nucleo.panico.activar('streamdeck');
      res.writeHead(ok ? 200 : 503); return res.end();
    }
    if (req.method === 'POST' && req.url === '/poke') {             // botón de estado del Stream Deck
      if (win && !win.isDestroyed()) win.webContents.send('poke');
      res.writeHead(200); return res.end();
    }
    if (dispositivos.atender(req, res)) return;                     // Stream Deck: micro, panel, mensaje, pánico, gamer, terminal
    if (req.method !== 'POST' || req.url !== '/event') { res.writeHead(404); return res.end(); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let ev; try { ev = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
      ev._id = nextId++;
      ev._t = Date.now();
      const u = readContext(ev.transcript_path);
      if (u) ev._usage = u;
      if (ev._ppid && ev.session_id) { resolveTerminal(ev.session_id, ev._ppid); ultimaSid = ev.session_id; }
      if (talk) talk.onEvent(ev);
      ojoHook(ev);                                                    // las terminales de Claude Code también mueven el ojo
      if (!win || win.isDestroyed()) return res.end();
      if (ev.hook_event_name === 'PermissionRequest') {
        ev._peligro = esPeligroso(ev.tool_name, ev.tool_input);
        const rule = !ev._peligro && reglas.coincide(ev.tool_name, ev.tool_input);
        if (rule) {                                                   // regla "Permitir siempre": sin molestar
          ev._auto = rule.label;
          win.webContents.send('event', ev);
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(allowJSON());
        }
        win.webContents.send('event', ev);
        res.writeHead(200, { 'content-type': 'application/json' });
        // sin respuesta en 105 s -> vacío: Claude Code pregunta en la terminal
        const timer = setTimeout(() => { pending.delete(ev._id); res.end(); win && win.webContents.send('expired', ev._id); movil.resolvePerm(ev._id, 'expired', 'tiempo'); ojoRefrescar(); }, 105_000);
        pending.set(ev._id, { res, timer, ev });
        ojoPermiso(ev);                                               // el ojo lo enseña y su botón lo puede resolver (peligrosos NO)
        // al móvil: ya si no estás en la PC, o si nadie contesta en 20 s
        permToDiscord(ev);
        res.on('close', () => { if (pending.has(ev._id)) { clearTimeout(timer); pending.delete(ev._id); win && win.webContents.send('expired', ev._id); ojoRefrescar(); } });
      } else {
        win.webContents.send('event', ev);
        res.end();
        if (isAway() && ev.hook_event_name === 'Stop') movil.sendAviso(`✅ Claude terminó en **${path.basename(ev.cwd || '') || 'una sesión'}**`, 'green');
        if (isAway() && ev.hook_event_name === 'StopFailure') movil.sendAviso(`❌ Claude terminó con error en **${path.basename(ev.cwd || '') || 'una sesión'}**`, 'red');
      }
    });
  });
  srv.on('error', e => dialog.showErrorBox('Robot Companion', tr('No pude abrir el puerto {p}: {e}', { p: PORT, e: e.message })));
  srv.listen(PORT, '127.0.0.1');
}
// al móvil: ya si no estás en la PC, o si nadie contesta en 20 s
function permToDiscord(ev) {
  const toDiscord = () => pending.has(ev._id) && movil.sendPerm({
    id: ev._id, tool: ev._nucleo ? `${ev.tool_name} · ${ev._nucleo}` : ev.tool_name, peligro: ev._peligro, session: path.basename(ev.cwd || '') || '—',
    detail: String(ev.tool_input?.command || ev.tool_input?.file_path || ev.tool_input?.url || JSON.stringify(ev.tool_input || {})),
  });
  if (isAway() || ev._forceDiscord) toDiscord(); else setTimeout(toDiscord, DISCORD_GRACE_MS);   // _forceDiscord: pruebas
}

// ---------- ojo de escritorio (core/nodos, ESP32): voz, TTS, estados y permisos de Claude Code ----------
// voz del ojo → Whisper → el mismo enrutado que la voz de la isla; la respuesta que dice la isla también sale por el ojo
let ojoHabloEn = 0;
const OJO_VOZ_MS = () => (+(nucleo && nucleo.cfg.nodos && nucleo.cfg.nodos.vozVentanaSeg) || 300) * 1000;
const ojoBus = (tipo, datos) => { try { if (nucleo && nucleo.nodos) nucleo.bus.emit(tipo, datos); } catch { } };
const ojoRefrescar = () => ojoBus('nodo-refrescar', {});
const detallePerm = ev => String(ev.tool_input?.command || ev.tool_input?.file_path || ev.tool_input?.url || JSON.stringify(ev.tool_input || {}));
function conectarOjo() {
  const nodos = nucleo && nucleo.nodos; if (!nodos) return;
  nodos.transcriptor = async ruta => { const r = await transcribirArchivo(ruta); return (r && r.text) || ''; };
  // permisos de los hooks (no los del núcleo, que el ojo ya ve): el botón corto permite, el largo deniega, los peligrosos NO
  nodos.permisosExternos = {
    pendientes: () => [...pending.entries()].filter(([, p]) => !p.nucleoId && p.res).map(([id, p]) => ({ id, resumen: `${p.ev.tool_name}: ${detallePerm(p.ev)}`, peligro: p.ev._peligro || '', creado: p.ev._t })),
    resolver: (id, b, via) => decide(id, b === 'deny' ? 'deny' : 'allow', via || 'ojo'),
  };
  nucleo.bus.on('nodo-texto', ({ texto }) => {
    texto = String(texto || '').trim(); if (!texto) return;
    ojoHabloEn = Date.now();
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: '🎙 Ojo', texto });
    Promise.resolve(talk ? handleText(texto, 'voz') : null).catch(e => console.error('[ojo] voz:', e.message));
  });
}
function vozAlOjo(f) {
  if (!f || !nucleo || !nucleo.nodos || !nucleo.nodos.conectados().length) return;
  if (!(nucleo.cfg.nodos && nucleo.cfg.nodos.vozSiempre) && Date.now() - ojoHabloEn > OJO_VOZ_MS()) return;
  nucleo.nodos.reproducirArchivo(f).catch(e => console.error('[ojo] audio:', e.message));
}
// hooks de Claude Code → 'nodo-estado' (trabajando / listo / error / reposo)
function ojoHook(ev) {
  if (!nucleo || !nucleo.nodos) return;
  const h = ev.hook_event_name, sitio = path.basename(ev.cwd || '') || 'Claude Code';
  if (h === 'PreToolUse') ojoBus('nodo-estado', { estado: 'trabajando', msg: String(ev.tool_name || ''), segundos: 120 });
  else if (h === 'UserPromptSubmit') ojoBus('nodo-estado', { estado: 'trabajando', msg: sitio, segundos: 120 });
  else if (h === 'Stop') ojoBus('nodo-estado', { estado: 'listo', msg: 'LISTO', flash: true, segundos: 3 });
  else if (h === 'StopFailure') ojoBus('nodo-estado', { estado: 'error', msg: 'ERROR', flash: true, segundos: 4 });
  else if (h === 'SessionEnd') ojoBus('nodo-estado', { estado: 'reposo', msg: '', segundos: 1 });
}
function ojoPermiso(ev) { ojoBus('nodo-permiso', { id: ev._id, resumen: `${ev.tool_name}: ${detallePerm(ev)}`, peligro: ev._peligro || '' }); }

// ---------- Telegram: el plugin del SDK plugins/telegram (telegram.js de la app ya no existe) ----------
// El plugin corre en su proceso (solo api.telegram.org); el token sale del almacén cifrado (conectores) por el proveedor de secretos;
// los permisos que resuelve son SOLO los que se le mostraron. Si se rompe, el gestor lo reintenta y el panel lo enseña como ROTO.
const DIR_PLUGIN_TG = fuera(path.join(__dirname, 'plugins', 'telegram'));
const esNuestroTg = o => !!o && o.tipo === 'local' && path.resolve(String(o.fuente || '')).toLowerCase() === path.resolve(DIR_PLUGIN_TG).toLowerCase();
const esperarPlugin = async (P, n) => { for (let i = 0; i < 150 && ['arrancando', 'reiniciando'].includes(P.estadoDe(n)); i++) await new Promise(ok => setTimeout(ok, 200)); };
// interfaz de canal de la app (movil, responderA, panel /v1/telegram)
function adaptadorTelegramPlugin() {
  const P = nucleo.plugins, acc = (a, d) => P.accionCanal('telegram', 'telegram', a, d), err = e => console.error('[telegram] plugin:', e.message);
  let estado = 'conectando';
  nucleo.bus.on('evento', e => { if (e && e.tipo === 'plugins' && e.nombre === 'telegram' && e.accion === 'canal') { estado = e.detalle || e.estado; console.log('[telegram]', estado); } });
  return {
    plugin: true,
    get enabled() { return P.activo('telegram') && estado === 'conectado'; }, get status() { return P.activo('telegram') ? estado : 'plugin parado'; },
    iniciar() { }, detener() { },
    estado: () => acc('estado'), conectar: token => acc('conectar', { token }), nuevoEnlace: () => acc('enlace'), desconectar: () => acc('desconectar'),
    sendPerm: p => { P.mostrarPermiso(p, { plugin: 'telegram' }).catch(err); },
    resolvePerm: (id, b, via) => P.permisoResuelto(id, b, via),
    sendCard: c => { P.mostrarTarjeta(c, { plugin: 'telegram' }).catch(err); },
    sendAviso: t => P.enviarCanal('telegram', 'telegram', t).catch(err),
    reply: md => P.enviarCanal('telegram', 'telegram', md).catch(err),
  };
}
async function telegramComoPlugin() {
  const P = nucleo.plugins, alm = conectores.almacen;
  P.ponerSecretos({ leer: n => alm.secreto(n) || '', guardar: (n, v) => alm.guardarSecreto(n, v),
    permitir: ({ plugin, nombre, origen }) => plugin === 'telegram' && nombre === 'tg:token' && esNuestroTg(origen) });   // el de la app, sin preguntar
  P.mediar({ resolverPermiso: (id, b, via) => decide(id, b, via), accionTarjeta: (id, a, t) => cardAction(id, a, t), transcribir: ruta => transcribirArchivo(ruta),
    recibir: ({ plugin, texto }) => (CON_ADAPTADOR.includes(plugin) ? handleText(texto, plugin) : undefined), ajeno: ajenoPlugin });
  // el enlace del antiguo telegram.js (chat, bot) pasa al plugin la 1.ª vez por su config (solo en memoria)
  const viejo = alm.config().telegram || {};
  nucleo.cfg.plugins = nucleo.cfg.plugins || {};
  if (!nucleo.cfg.plugins.telegram) nucleo.cfg.plugins.telegram = { chatId: viejo.chatId || null, bot: viejo.bot || null, usuario: viejo.usuario || '', codigo: viejo.codigo || null };
  await esperarPlugin(P, 'telegram');                                // que acabe el arranque automático de plugins
  const version = JSON.parse(fs.readFileSync(path.join(DIR_PLUGIN_TG, 'apolo-plugin.json'), 'utf8')).version;
  const ya = P.lista().find(x => x.nombre === 'telegram');
  if (!ya || (esNuestroTg(ya.origen) && ya.version !== version)) await P.instalar(DIR_PLUGIN_TG, { reemplazar: true });
  if (P.activo('telegram')) await P.recargar('telegram'); else await P.activar('telegram', true);   // recarga: ya con secretos y mediador
  if (!P.activo('telegram')) throw new Error('no arrancó');
  telegram = adaptadorTelegramPlugin();
  console.log('[telegram] usando el plugin del SDK (plugins/telegram)');
  nucleo.bus.on('evento', e => {
    if (e && e.tipo === 'plugins' && e.nombre === 'telegram' && e.accion === 'roto') console.error('[telegram] el plugin quedó roto (míralo en Panel → Plugins)');
  });
}

// ---------- WhatsApp (siempre plugin) y Discord (plugin solo con cfg.plugins.discordComoPlugin) ----------
// Mismo patrón que Telegram: instalar/actualizar desde plugins/<n>, activar, y un adaptador con la interfaz de canal de la app
// (movil, responderA). Discord: NUNCA con el modo Pi ni el bot local.
const DIR_PLUGIN = n => fuera(path.join(__dirname, 'plugins', n));
const esNuestro = (n, o) => !!o && o.tipo === 'local' && path.resolve(String(o.fuente || '')).toLowerCase() === path.resolve(DIR_PLUGIN(n)).toLowerCase();
async function activarNuestro(n) {
  const P = nucleo.plugins;
  await esperarPlugin(P, n);
  const version = JSON.parse(fs.readFileSync(path.join(DIR_PLUGIN(n), 'apolo-plugin.json'), 'utf8')).version;
  const ya = P.lista().find(x => x.nombre === n);
  if (!ya || (esNuestro(n, ya.origen) && ya.version !== version)) await P.instalar(DIR_PLUGIN(n), { reemplazar: true });
  if (P.activo(n)) await P.recargar(n); else await P.activar(n, true);
  if (!P.activo(n)) throw new Error('no arrancó');
}
async function apagarPlugin(n) {
  const P = nucleo.plugins; await esperarPlugin(P, n);
  const ya = P.lista().find(x => x.nombre === n);
  if (ya && ya.activo) { console.log(`[${n}] desactivo el plugin ${n} (su flag está apagado)`); await P.activar(n, false); }
}
// lo común de los canales con adaptador: estado por el bus y envío por el gestor SOLO a ese plugin
function adaptadorCanal(n) {
  const P = nucleo.plugins, err = e => console.error(`[${n}] plugin:`, e.message);
  let estado = 'conectando';
  nucleo.bus.on('evento', e => { if (e && e.tipo === 'plugins' && e.nombre === n && e.accion === 'canal') { estado = e.detalle || e.estado; console.log(`[${n}]`, estado); } });
  return {
    plugin: true, acc: (a, d) => P.accionCanal(n, n, a, d),
    get enabled() { return P.activo(n) && estado === 'conectado'; }, get status() { return P.activo(n) ? estado : 'plugin parado'; },
    sendPerm: p => { P.mostrarPermiso(p, { plugin: n }).catch(err); },
    resolvePerm: (id, b, via) => P.permisoResuelto(id, b, via),
    sendCard: c => { P.mostrarTarjeta(c, { plugin: n }).catch(err); },
    sendAviso: t => P.enviarCanal(n, n, t).catch(err),
    reply: md => P.enviarCanal(n, n, md).catch(err),
    replyTo() { return false; }, stop() { },
  };
}
const DIR_WA_APP = () => path.join(app.getPath('userData'), 'whatsapp-auth');
const DIR_WA_PLUGIN = () => path.join(nucleo.cfg.dir, 'plugins-datos', 'whatsapp', 'auth');
function adaptadorWhatsappPlugin() {
  const b = adaptadorCanal('whatsapp');
  let conf = null;
  b.acc('config').then(c => { conf = c; }).catch(() => { });
  return Object.assign(b, {
    arrancar() { },
    config: () => conf || { modo: 'apagado', grupos: false, ignorar: [], auto: { contactos: [], instrucciones: '', maxHora: 3 } },
    ponerConfig: async c => (conf = await b.acc('ponerConfig', c)),
    // "usar la sesión actual": hay sesión del antiguo whatsapp.js y el plugin todavía no está vinculado
    estado: async () => { const r = await b.acc('estado'); r.sesionApp = !r.vinculado && fs.existsSync(path.join(DIR_WA_APP(), 'creds.json')); return r; },
    vincular: () => b.acc('vincular'), desvincular: () => b.acc('desvincular'),
    prueba: () => b.acc('prueba'),
    enviarA: (jid, texto, o = {}) => b.acc('enviarA', { jid, texto, automatico: !!o.automatico }),
  });
}
async function whatsappComoPlugin() {
  // la config de "mensajes que te llegan" (whatsapp.json) pasa al plugin la 1.ª vez (solo en memoria)
  let conf = {}; try { conf = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'whatsapp.json'), 'utf8')); } catch { }
  nucleo.cfg.plugins = nucleo.cfg.plugins || {};
  if (!nucleo.cfg.plugins.whatsapp) nucleo.cfg.plugins.whatsapp = { conf };
  await activarNuestro('whatsapp');
  whatsapp = adaptadorWhatsappPlugin();
  console.log('[whatsapp] usando el plugin del SDK (plugins/whatsapp)');
  nucleo.bus.on('evento', e => {
    if (e && e.tipo === 'plugins' && e.nombre === 'whatsapp' && e.accion === 'roto') console.error('[whatsapp] el plugin quedó roto (míralo en Panel → Plugins)');
  });
  // quien venía de whatsapp.js (la app antigua) conserva su vinculación: se copia sola la 1.ª vez (la original no se toca)
  try {
    const e = await whatsapp.estado();
    if (e && e.sesionApp) { await migrarSesionWhatsapp({ confirmar: true }); console.log('[whatsapp] vinculación de la app antigua pasada al plugin'); }
  } catch (e) { console.error('[whatsapp] no pude pasar la sesión antigua:', e.message); }
}
// copia la sesión del antiguo whatsapp.js al almacén del plugin (confirmar:true; la original no se toca)
async function migrarSesionWhatsapp(b = {}) {
  if (!whatsapp.plugin) { const e = new Error('WhatsApp no está en modo plugin'); e.status = 409; throw e; }
  if (b.confirmar !== true) { const e = new Error('falta confirmar'); e.status = 400; throw e; }
  if (!fs.existsSync(path.join(DIR_WA_APP(), 'creds.json'))) { const e = new Error('no hay sesión de WhatsApp en la app'); e.status = 404; throw e; }
  await whatsapp.acc('parar');
  fs.rmSync(DIR_WA_PLUGIN(), { recursive: true, force: true });
  fs.cpSync(DIR_WA_APP(), DIR_WA_PLUGIN(), { recursive: true });
  console.log('[whatsapp] sesión de la app copiada al plugin');
  return whatsapp.acc('vincular');
}
// mensajes de OTRAS personas que llegan por el plugin de WhatsApp → modo avisar/auto de siempre (la app decide)
function ajenoPlugin({ plugin, datos }) {
  if (plugin !== 'whatsapp' || !datos || !datos.jid) return;
  const a = { jid: String(datos.jid), nombre: String(datos.nombre || ''), numero: String(datos.numero || ''), texto: String(datos.texto || '').slice(0, 4000), grupo: !!datos.grupo,
    historial: Array.isArray(datos.historial) ? datos.historial.slice(-8).map(h => ({ de: String(h.de || ''), texto: String(h.texto || '').slice(0, 500), t: +h.t || 0 })) : [], auto: !!datos.auto };
  mensajeWhatsapp(a).catch(e => console.error('[whatsapp]', e.message));
}
async function discordComoPlugin() {
  await activarNuestro('discord');
  discord = adaptadorCanal('discord');
  console.log('[discord] usando el plugin del SDK (plugins/discord)');
}

// panel web del núcleo: el token va en el #hash (no viaja al servidor) y el panel lo guarda y lo borra de la URL
function abrirPanel(ruta = '') {
  if (!nucleo) return;
  let tok = ''; try { tok = fs.readFileSync(path.join(nucleo.cfg.dir, 'token'), 'utf8').trim(); } catch { }
  shell.openExternal(`http://127.0.0.1:${nucleo.cfg.puerto}/#${ruta ? ruta + '&' : ''}token=${tok}`);
}
// sin ningún modelo disponible en este PC (sin Ollama, sin keys, sin Claude/ChatGPT): explicar cómo conectar uno
function revisarModelos() {
  if (!nucleo || !win || win.isDestroyed()) return;
  const l = nucleo.proveedores.listos();
  if (!Object.keys(l).length || Object.values(l).some(Boolean)) return;
  win.webContents.send('answer', { titulo: tr('Conecta un modelo para hablar conmigo'),
    texto: tr('Ahora mismo no tengo ningún modelo de IA disponible. Lo más fácil:\n• **¿Pagas ChatGPT?** Bandeja → **Conectar ChatGPT**.\n• **¿Tienes Claude?** Instala Claude Code y ya está.\n• **Gratis:** una key de Gemini (aistudio.google.com) en Panel → Modelos.'),
    voz: tr('Para hablar conmigo necesito un modelo. Si pagas ChatGPT, pulsa Conectar ChatGPT en la bandeja.') });
}

// ---------- núcleo multi-modelo (core/): API en 127.0.0.1:47900 + puente con la isla ----------
let overlayControl = null;
async function startNucleo() {
  nucleo = nucleo || crearNucleo();
  nucleo.cerebro = { leer: () => cerebro.config(), guardar: c => cerebro.setConfig(c),
    tarjetas: () => (cerebro ? cerebro.tarjetas() : []), accion: (id, a, t) => cardAction(id, a, t) };   // tarjetas para la app móvil
  // co-host de streaming (core/stream): genera el mp3 con la voz de la isla; el overlay de OBS lo reproduce
  nucleo.bus.on('stream-decir', ({ texto, responder }) => {
    voz.generarTts(texto).then(f => responder && responder(null, f), e => responder && responder(e));
  });
  // notas de voz de la app móvil (POST /v1/voz/transcribir) → Whisper
  nucleo.bus.on('transcribir-audio', ({ ruta, responder }) => {
    transcribirArchivo(ruta).then(r => responder(r && r.error && !r.text ? r.error : null, (r && r.text) || ''), e => responder(e));
  });
  // reuniones (core/reuniones.js): REC en la isla mientras graba, tarjeta con el resumen al terminar, "enviar al móvil"
  nucleo.bus.on('reunion', e => {
    if (!win || win.isDestroyed()) return;
    if (e.accion === 'empezada' || e.accion === 'parada') win.webContents.send('reunion', { grabando: e.accion === 'empezada', titulo: e.titulo, fuente: e.fuente });
    if (e.accion === 'resumida' && e.resumen) win.webContents.send('answer', { titulo: `📋 ${tr('Reunión')}: ${e.titulo}`,
      texto: [e.resumen.resumen, ...e.resumen.tareas.map(t => `• ${t.quien ? t.quien + ': ' : ''}${t.que}`)].join('\n') });
  });
  nucleo.bus.on('reunion-enviar', ({ texto }) => movil.reply(texto));
  try { const d = await iniciarDaemon({ nucleo }); console.log(`[núcleo] API en :${d.puerto}${(nucleo.cfg.red?.permitidos || []).length ? ` (LAN solo: ${nucleo.cfg.red.permitidos.join(", ")})` : " (solo este equipo)"} · modelo por defecto ${nucleo.cfg.modeloPorDefecto}`); }
  catch (e) { console.error('[núcleo] sin API HTTP:', e.message); }
  try { conectarOjo(); } catch (e) { console.error('[ojo]', e.message); }   // nucleo.nodos lo crea iniciarDaemon
  const toIsland = ev => { ev._id = nextId++; ev._t = Date.now(); if (win && !win.isDestroyed()) win.webContents.send('event', ev); };
  puente = createPuente({
    nucleo, dataDir: app.getPath('userData'), toIsland,
    onPermiso: (nid, ev) => {
      ev._id = nextId++; ev._t = Date.now();
      pending.set(ev._id, { ev, nucleoId: nid, timer: null });
      if (win && !win.isDestroyed()) win.webContents.send('event', ev);
      permToDiscord(ev);
    },
    reply: (origin, texto, modelo, extra = {}) => {
      const titulo = extra.tarea ? modelo : `🤖 ${modelo}`;          // en tareas, "modelo" ya es el título
      if (esRemoto(origin)) responderA(origin, `**${titulo}**\n${texto}`);
      else if (isAway()) movil.reply(`**${titulo}**\n${texto}`);       // si no estás en la PC, también al móvil
      if (!esRemoto(origin) && win && !win.isDestroyed()) win.webContents.send('answer', { titulo, texto, voz: origin === 'voz' || extra.tarea ? texto.slice(0, 400) : undefined });
    },
  });
  // canales del robot visibles en el panel
  const canalesRobot = () => {
    // nombre/detalle en el idioma de la app (el panel los vuelve a pasar por tr por si cambió); `instalado` lo usa el asistente de bienvenida
    nucleo.canales.registrar('isla', { nombre: tr('Isla de escritorio'), tipo: 'isla', estado: 'activo', detalle: `${tr('Destino:')} ${puente.destino('isla') || 'Claude Code'}` });
    nucleo.canales.registrar('discord', { nombre: 'Discord', tipo: 'discord', estado: /conectado/i.test(discord.status) ? 'activo' : 'inactivo', detalle: `${tr(discord.status)} · ${tr('destino:')} ${puente.destino('discord') || 'Claude Code'}` });
    nucleo.canales.registrar('telegram', { nombre: 'Telegram', tipo: 'telegram', estado: telegram.enabled && telegram.status === 'conectado' ? 'activo' : 'inactivo', detalle: `${tr(telegram.status)} · ${tr('destino:')} ${puente.destino('telegram') || tr('automático')}` });
    nucleo.canales.registrar('whatsapp', { nombre: 'WhatsApp', tipo: 'whatsapp', estado: whatsapp.enabled ? 'activo' : 'inactivo', detalle: `${tr(whatsapp.status)} · ${tr('destino:')} ${puente.destino('whatsapp') || tr('automático')}` });
    nucleo.canales.registrar('voz', { nombre: tr('Voz'), tipo: 'voz', estado: 'activo', detalle: tr(voz.whisperCargado() ? 'Whisper cargado · Ctrl+Alt+Espacio' : 'Whisper se carga al hablar · Ctrl+Alt+Espacio') });
    nucleo.canales.registrar('streamdeck', { nombre: 'Stream Deck', tipo: 'streamdeck', estado: fs.existsSync(path.join(process.env.APPDATA || '', 'Elgato', 'StreamDeck', 'Plugins', 'com.robotcompanion.sdPlugin')) ? 'activo' : 'inactivo', detalle: tr('Permitir / Denegar / Estado') });
    nucleo.canales.registrar('gemini', { nombre: 'Gemini CLI (hooks)', tipo: 'claudecode', instalado: cliInstalado.gemini, estado: hooksCfg.geminiInstalados() ? 'activo' : 'inactivo', detalle: tr(hooksCfg.geminiInstalados() ? 'Hooks instalados: permisos y actividad en la isla' : cliInstalado.gemini ? 'Instálalos desde la bandeja' : 'Gemini CLI no está instalado (npm i -g @google/gemini-cli)') });
    nucleo.canales.registrar('codex', { nombre: 'Codex CLI', tipo: 'claudecode', instalado: cliInstalado.codex, estado: 'inactivo', detalle: tr('Sus hooks son experimentales y aún no funcionan en Windows') });
    nucleo.canales.registrar('claudecode', { nombre: 'Claude Code (hooks)', tipo: 'claudecode', estado: hooksCfg.instalados() ? 'activo' : 'inactivo', detalle: tr(hooksCfg.instalados() ? 'Hooks instalados' : 'Instálalos desde la bandeja') });
  };
  for (const n of CON_ADAPTADOR) nucleo.canales.ocultar(`plugin:${n}:${n}`);
  canalesRobot(); setInterval(canalesRobot, 15_000);
  // avisos de agentes externos (MCP: Antigravity, Cursor…) → isla con voz + Discord si urgente o no estás
  nucleo.bus.on('aviso-externo', a => {
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: `📣 ${a.origen}`, texto: a.texto, voz: a.texto.slice(0, 300) });
    if (a.urgente || isAway()) movil.sendAviso(`📣 **${a.origen}:** ${a.texto.slice(0, 1800)}`, a.urgente ? 'red' : 'blue');
  });
  // control del ratón/teclado: borde rojo en todos los monitores, aviso en la isla y en Discord si no estás
  const panicoControl = (via, o = {}) => {
    if (o.grabando || nucleo.demo?.grabando?.()) { nucleo.demo.parar({ motivo: via }).catch(() => { }); return; }   // grabando una demo: Ctrl+Alt+Esc la para
    const est = nucleo.control.estado();
    nucleo.control.soltarTodo(`el usuario lo detuvo (${via})`);
    for (const c of est) nucleo.agente.cancelar(c.sesion);
  };
  overlayControl = crearOverlay({ alPanico: panicoControl, atajoPropio: false });
  // FASE 9 · kill switch global: Ctrl+Alt+Esc SIEMPRE (si se graba una demo, solo la para). core/panico.js hace el resto.
  try { globalShortcut.register('Control+Alt+Escape', () => (nucleo.demo?.grabando?.() ? panicoControl('Ctrl+Alt+Esc', { grabando: true }) : nucleo.panico.activar('Ctrl+Alt+Esc'))); } catch { }
  const avisarPanico = () => { if (win && !win.isDestroyed()) win.webContents.send('panico', nucleo.panico.estado()); };
  nucleo.bus.on('panico', e => {                                // deniega también los permisos de los hooks (Claude Code, Gemini CLI…)
    for (const [id, p] of [...pending]) if (!p.nucleoId) decide(id, 'deny', 'pánico');
    avisarPanico();
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: `🛑 ${tr('PÁNICO')}`, texto: `${tr('Todo parado')} (${e.origen}). ${tr('Pulsa Reanudar en la isla o el panel.')}` });
    movil.sendAviso(`🛑 **${tr('PÁNICO')}** (${e.origen}): ${tr('todo parado hasta reanudar.')}`, 'red');
  });
  nucleo.bus.on('panico-fin', avisarPanico);
  ipcMain.on('panico', (_e, on) => (on ? nucleo.panico.activar('isla') : nucleo.panico.reanudar('isla')));
  ipcMain.handle('panico-estado', () => nucleo.panico.estado());
  // FASE 3: grabando una demostración → borde rojo discontinuo + etiqueta "GRABANDO" (indicador SIEMPRE visible)
  nucleo.bus.on('evento', e => {
    if (e.tipo !== 'demo') return;
    if (e.estado === 'grabando' && e.eventos === 0) overlayControl.mostrar(e.nombre || '', { grabando: true });
    else if (e.estado === 'parada' && !nucleo.control.estado().length) overlayControl.ocultar();
    if (e.estado === 'skill' && win && !win.isDestroyed()) win.webContents.send('answer', { titulo: `🎬 ${tr('Demostración aprendida')}`, texto: `${tr('Skill borrador creada:')} ${e.slug}` });
  });
  nucleo.bus.on('control', c => {
    if (c.activo) overlayControl.mostrar(c.motivo);
    else if (!nucleo.control.estado().length && !nucleo.escritorioRemoto?.activa?.()) overlayControl.ocultar();
    const texto = c.activo ? `🖱️ ${tr('Tomo el control del ratón y teclado:')} ${c.motivo}` : `✋ ${tr('Control devuelto:')} ${c.razon || tr('terminado')}`;
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: `🤖 ${tr('Control del PC')}`, texto });
    if (isAway()) movil.sendAviso(texto, c.activo ? 'red' : 'blue');
  });
  // escritorio remoto desde el móvil (core/escritorio/remoto.js): cada sesión se aprueba AQUÍ + borde rojo con el nombre del móvil
  nucleo.bus.on('escritorio-solicitud', q => {
    dialog.showMessageBox({ type: 'warning', buttons: [tr('Rechazar'), tr('Permitir')], defaultId: 0, cancelId: 0, noLink: true, title: tr('Escritorio remoto'),
      message: tr('{m} quiere ver y controlar este PC', { m: q.dispositivo }),
      detail: tr('Verá tu pantalla (las ventanas protegidas salen en negro) y podrá usar el ratón y el teclado. Si tocas el ratón o el teclado, se corta.') })
      .then(r => nucleo.escritorioRemoto?.resolver(q.id, r.response === 1, 'PC')).catch(() => { });
  });
  nucleo.bus.on('escritorio-remoto', e => {
    if (e.activo) overlayControl.mostrar(e.dispositivo, { remoto: true });
    else if (!nucleo.control.estado().length) overlayControl.ocultar();
    const texto = e.activo ? `📱 ${tr('Control remoto activo desde')} ${e.dispositivo}` : `✋ ${tr('Escritorio remoto terminado:')} ${e.razon || ''}`;
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: `📱 ${tr('Escritorio remoto')}`, texto });
  });
  nucleo.bus.on('permiso-resuelto', ({ id: nid }) => {          // contestado por otra vía (API, tiempo agotado)
    for (const [id, p] of pending) if (p.nucleoId === nid) {
      pending.delete(id);
      if (win && !win.isDestroyed()) win.webContents.send('expired', id);
      movil.resolvePerm(id, 'expired', 'núcleo');
    }
  });
}

let lastRobotState = 'reposo';
ipcMain.on('robot-state', (_e, st) => { lastRobotState = st; });
function stateForDevices() {
  const first = [...pending.values()][0];
  return {
    state: lastRobotState, pending: pending.size,
    perm: first ? { id: first.ev._id, tool: first.ev.tool_name, detail: String(first.ev.tool_input?.command || first.ev.tool_input?.file_path || ''), peligro: first.ev._peligro || '' } : null,
    panico: !!(nucleo && nucleo.panico && nucleo.panico.activo()),
    gamer: !!(nucleo && nucleo.gamer && nucleo.gamer.estado().activo),
    uso: ultimoUso ? { p5: ultimoUso.p5, pW: ultimoUso.pW, tokens: ultimoUso.tokens, msgs: ultimoUso.msgs, pausado: !!ultimoUso.paused } : null,
    islaFuera: isla.fueraDeSuSitio(),
    nombre: nombreCompanero(),
  };
}

const cliInstalado = { gemini: tieneCLI('gemini'), codex: tieneCLI('codex') };

// ---------- arranque con Windows ----------
const loginOpts = () => ({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] });
const autoStart = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
const setAutoStart = v => app.setLoginItemSettings({ openAtLogin: v, ...loginOpts() });
// el instalador .exe deja autoarranque.txt junto a APOLO.exe ("1"/"0" = casilla "Iniciar con Windows"); sin él, se activa
const autoArranqueInicial = () => { try { return fs.readFileSync(path.join(path.dirname(process.execPath), 'autoarranque.txt'), 'utf8').trim() !== '0'; } catch { return true; } };
// voz neural + micrófono (Python, edge-tts, faster-whisper): el .exe no los trae; se instalan bajo demanda en una ventana visible
function instalarVoz() {
  require('child_process').spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fuera(path.join(__dirname, 'tools', 'instalar-voz.ps1'))],
    { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

// ---------- bandeja ----------
function trayIcon() {
  const S = 16, buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), i = (y * S + x) * 4;
    if (d < 7) { buf[i] = d < 4 ? 140 : 60; buf[i + 1] = 230; buf[i + 2] = d < 4 ? 120 : 40; buf[i + 3] = 255; }  // BGRA
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S });
}
function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Robot Companion');
  const menu = () => Menu.buildFromTemplate([
    { label: tr(hooksCfg.instalados() ? '✓ Hooks de Claude Code instalados' : 'Hooks NO instalados'), enabled: false },
    { label: tr('Instalar hooks'), click: () => hooksCfg.instalar() },
    { label: tr('Quitar hooks'), click: () => hooksCfg.quitar() },
    { label: hooksCfg.geminiInstalados() ? tr('✓ Hooks de Gemini CLI instalados') : `${tr('Gemini CLI: hooks no instalados')}${cliInstalado.gemini ? '' : ' ' + tr('(CLI no encontrado)')}`, enabled: false },
    { label: tr(hooksCfg.geminiInstalados() ? 'Quitar hooks de Gemini CLI' : 'Instalar hooks de Gemini CLI'), click: () => hooksCfg.gemini(!hooksCfg.geminiInstalados()) },
    { type: 'separator' },
    { label: `⬆ ${tr('Buscar actualizaciones')}`, click: () => buscarActualizacion() },
    { label: `🎙 ${tr('Instalar voz y micrófono (Python + Whisper)')}`, click: () => instalarVoz() },
    { label: tr('Iniciar con Windows'), type: 'checkbox', checked: autoStart(), click: i => setAutoStart(i.checked) },
    { type: 'separator' },
    { label: `🤖 ${tr('Núcleo')}: ${tr('isla')} → ${(puente && puente.destino('isla')) || 'Claude Code'} · Discord → ${(puente && puente.destino('discord')) || 'Claude Code'}`, enabled: false },
    { label: `🖥️ ${tr('Abrir panel de control')}`, click: () => abrirPanel() },
    nucleo?.panico?.activo() ? { label: `▶ ${tr('Reanudar (salir del pánico)')}`, click: () => nucleo.panico.reanudar('bandeja') } : { label: `🛑 ${tr('Pánico: parar todo')}  Ctrl+Alt+Esc`, click: () => nucleo?.panico?.activar('bandeja') },
    { label: `✨ ${tr('Asistente de bienvenida')}`, click: () => abrirPanel('/bienvenida') },
    { label: `💬 ${tr('Conectar ChatGPT (tu plan, sin API key)')}`, click: () => abrirPanel('/ajustes/modelos') },
    { label: `🧩 ${tr('Copiar token para la extensión del navegador')}`, click: () => { try { clipboard.writeText(fs.readFileSync(path.join(nucleo.cfg.dir, 'token'), 'utf8').trim()); } catch { } } },
    { label: `🧩 ${tr('Abrir carpeta de la extensión')}`, click: () => shell.openPath(fuera(path.join(__dirname, 'extension'))) },
    { label: tr('Configurar modelos (abrir config del núcleo)…'), click: () => nucleo && shell.openPath(path.join(nucleo.cfg.dir, 'config.json')) },
    { type: 'separator' },
    { label: `Discord: ${tr(discord.status)}`, enabled: false },
    { label: tr('Configurar Discord (abrir archivo)…'), click: () => { ensureDiscordCfg(); shell.openPath(DISCORD_CFG()); } },
    { label: tr('Reconectar Discord'), click: startDiscord },
    { label: `☀️ ${tr('Resumen del día ahora')}`, click: () => runBriefing() },
    { label: `🧠 ${tr('Cerebro')}: ${tr(cerebro && cerebro.paused ? 'en pausa (cerca del límite del plan)' : 'activo')}`, enabled: false },
    { label: tr('Enviarme un aviso de prueba'), click: () => movil.sendAviso(tr('🤖 **Prueba:** así te llegarán los avisos del Robot Companion.'), 'blue') },
    { label: `${tr('Avisos de DMs')}: ${tr(dmsStatus)}`, enabled: false },
    {
      label: tr('Reglas "Permitir siempre" ({n})', { n: reglas.lista().length }), submenu: reglas.lista().length ? [
        ...reglas.lista().map((r, i) => ({ label: `✕ ${tr('quitar')}: ${r.label}`, click: () => reglas.quitar(i) })),
        { type: 'separator' }, { label: tr('Quitar todas'), click: () => reglas.quitarTodas() },
      ] : [{ label: tr('(ninguna)'), enabled: false }],
    },
    { type: 'separator' },
    { label: `↔ ${tr('Mover isla fuera del monitor principal')}`, click: () => isla.mover('otro') },
    ...(isla.fueraDeSuSitio() ? [{ label: `↩ ${tr('Traer la isla de vuelta')}`, click: () => isla.mover('casa') }] : []),
    { label: `⟲ ${tr('Volver la isla a su sitio')}`, click: () => isla.mover('reset') },
    { label: tr('Evento de prueba'), click: () => win.webContents.send('demo') },
    { label: tr('Herramientas de desarrollo'), click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: tr('Salir'), click: () => app.quit() },
  ]);
  tray.on('click', () => tray.popUpContextMenu(menu()));
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
}

// posición global del cursor -> la isla (con la ventana "atravesable" Windows no manda el mousemove fuera de ella)
function trackCursor() {
  let lx = -1, ly = -1;
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    if (p.x === lx && p.y === ly) return;
    lx = p.x; ly = p.y; lastMove = Date.now();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 33);
}

async function runBriefing() {
  if (win && !win.isDestroyed()) win.webContents.send('thinking', true);
  const r = await cerebro.briefing();
  if (win && !win.isDestroyed()) { win.webContents.send('thinking', false); win.webContents.send('answer', { ...r, titulo: '☀️ Resumen del día' }); }
  movil.reply(`☀️ **Resumen del día**\n${r.texto}`);
}
// ---------- Discord ----------
function ensureDiscordCfg() {
  if (fs.existsSync(DISCORD_CFG())) return;
  fs.writeFileSync(DISCORD_CFG(), JSON.stringify({
    token: '', ownerId: '', centralGuildId: '', mutedGuilds: [],
    _ayuda: 'Pega el token del bot en "token", tu id de usuario en "ownerId" y el id de tu servidor en "centralGuildId", guarda, y en la bandeja pulsa "Reconectar Discord". mutedGuilds = ids de servidores que no quieres ver.',
  }, null, 2));
}
// Discord en la Pi: aquí solo queda un proxy que manda lo que hay que enviar por eventos 'remoto' del núcleo,
// y el bot de la Pi llama de vuelta a /v1/remoto/* (decidir, texto, tarjeta, resumen, ingest).
function discordRemoto() {
  const enviar = (metodo, ...args) => nucleo.bus.emit('remoto', { metodo, args });
  const api = {
    enabled: true,
    get status() { return nucleo.remotos > 0 ? 'en la Pi · conectado' : 'en la Pi · esperando a la Pi'; },
    sendPerm: p => enviar('sendPerm', p), resolvePerm: (id, b, via) => enviar('resolvePerm', id, b, via),
    sendAviso: (t, tono) => enviar('sendAviso', t, tono), reply: md => enviar('reply', md), sendCard: c => enviar('sendCard', c),
    replyTo: async (canal, msg, texto) => { enviar('replyTo', canal, msg, texto); return true; }, stop() { },
  };
  nucleo.remoto = {
    decidir: ({ id, b, via }) => decide(id, b, via || 'discord'),
    texto: ({ texto }) => handleText(String(texto || ''), 'discord'),
    tarjeta: ({ id, accion }) => cardAction(id, accion),
    resumen: () => talk.summary(),
    ingest: ({ m }) => { if (m && cerebro) cerebro.ingest(m); return true; },
  };
  nucleo.bus.on('remoto-conexion', e => console.log('[discord] Pi', e.conectados ? 'conectada' : 'desconectada'));
  return api;
}
let discordVigilado = false;
function startDiscord() {
  try { discord.stop(); } catch { }
  let dcfg = {}; try { dcfg = JSON.parse(fs.readFileSync(DISCORD_CFG(), 'utf8')); } catch { }
  const dec = decidirDiscord(nucleo && nucleo.cfg.plugins, dcfg);
  if (nucleo) {                                                // el plugin lee config.bloqueado y el panel lo enseña
    nucleo.cfg.plugins = nucleo.cfg.plugins || {};
    nucleo.cfg.plugins.discord = { ...(nucleo.cfg.plugins.discord || {}), bloqueado: dec.bloqueado };
    if (dec.aviso) console.warn('[discord]', dec.aviso);
    if (!discordVigilado) {                                    // activado a mano desde el panel sin poder: se vuelve a apagar
      discordVigilado = true;
      nucleo.bus.on('evento', e => {
        if (!e || e.tipo !== 'plugins' || e.nombre !== 'discord' || e.accion !== 'activado') return;
        let d = {}; try { d = JSON.parse(fs.readFileSync(DISCORD_CFG(), 'utf8')); } catch { }
        const x = decidirDiscord(nucleo.cfg.plugins, d);
        if (!x.plugin) { console.warn('[discord] el plugin no puede correr a la vez que', x.actual === 'pi' ? 'el modo Pi' : x.actual === 'local' ? 'el bot local' : 'sin su flag'); nucleo.plugins.activar('discord', false).catch(() => { }); }
      });
    }
    if (dec.plugin) { discordComoPlugin().catch(e => console.error('[discord] el plugin no arrancó:', e.message)); return; }
    apagarPlugin('discord').catch(e => console.error('[discord]', e.message));
  }
  if (dcfg.modo === 'pi' && nucleo) { discord = discordRemoto(); console.log('[discord] modo Pi: el bot corre en la Raspberry'); return; }
  discord = createDiscord(DISCORD_CFG(), {
    decide: (id, b, via) => decide(id, b, via),
    onServerMessage: m => cerebro && cerebro.ingest(m),
    cardAction: (id, action) => cardAction(id, action),
    onStatus: st => console.log('[discord]', st),
    onTalk: text => handleText(text, 'discord'),
    onSummary: () => talk.summary(),
  });
}

// ---------- WhatsApp: mensajes que te llegan de otras personas (modo avisar / auto en el panel) ----------
async function mensajeWhatsapp(a) {
  const conv = a.historial.map(h => `${h.de === 'yo' ? 'YO' : h.de}: ${h.texto}`).join('\n');
  if (a.auto && nucleo) {
    try {
      const { datos } = await nucleo.generarJSON({ modelo: nucleo.cfg.modeloPorDefecto,
        system: 'Respondes mensajes de WhatsApp EN NOMBRE del usuario, como si fueras él (primera persona, natural, breve, en el idioma del mensaje). ' +
          'Sigue estas instrucciones del usuario: "' + whatsapp.config().auto.instrucciones + '". ' +
          'NO respondas (responder=false) si el mensaje pide dinero, pagos, contraseñas, datos privados, una cita o decisión importante, o si es urgente o delicado: eso lo decide el usuario.',
        prompt: `Conversación reciente con ${a.nombre}:\n${conv}\n\n¿Respondo al último mensaje? Si sí, ¿qué digo?`,
        schema: { type: 'object', properties: { responder: { type: 'boolean' }, texto: { type: 'string' }, motivo: { type: 'string' } }, required: ['responder', 'texto'] } });
      if (datos.responder && datos.texto) {
        await whatsapp.enviarA(a.jid, datos.texto, { automatico: true });
        const aviso = `🤖 Respondí a **${a.nombre}** por WhatsApp\n› ${a.texto.slice(0, 300)}\n**Yo:** ${datos.texto}`;
        if (win && !win.isDestroyed()) win.webContents.send('notif', { kind: 'dm', author: `🤖 → ${a.nombre}`, text: datos.texto });
        movil.sendAviso(aviso);
        return;
      }
    } catch (e) { console.error('[whatsapp auto]', e.message); }
  }
  // avisar (o auto que decidió no responder): el cerebro lo clasifica y deja una tarjeta con respuesta sugerida
  if (cerebro) cerebro.ingest({ kind: 'whatsapp', author: a.nombre, guild: a.grupo ? 'Grupo de WhatsApp' : 'WhatsApp', text: conv || a.texto, whatsapp: { jid: a.jid } });
  else if (win && !win.isDestroyed()) win.webContents.send('notif', { kind: 'dm', author: a.nombre, text: a.texto });
}

// ---------- avisos de DMs (notificaciones de Windows de la app de Discord) ----------
let dmsStatus = 'iniciando', dmsLast = -1;
function startDms() {
  const script = fuera(path.join(__dirname, 'tools', 'dms_reader.py'));
  const tick = () => execFile('python', [script, String(dmsLast)], { windowsHide: true, timeout: 8000 }, (err, out) => {
    if (err) { dmsStatus = 'no disponible (¿Python?)'; return; }
    try {
      const r = JSON.parse(out);
      if (dmsLast >= 0) for (const n of r.items || []) cerebro && cerebro.ingest({ kind: 'dm', author: n.title, text: n.body });
      dmsLast = r.last; dmsStatus = 'activo';
    } catch { dmsStatus = 'error leyendo'; }
  });
  tick(); setInterval(tick, 5000);
}

app.whenReady().then(() => {
  ensureToken(); reglas.cargar(); ensureDiscordCfg();
  // primera vez que arranca en este PC: se activa "Iniciar con Windows" (luego se puede quitar en la bandeja)
  const primera = path.join(app.getPath('userData'), 'primer-arranque');
  if (!fs.existsSync(primera)) { try { setAutoStart(autoArranqueInicial()); fs.writeFileSync(primera, new Date().toISOString()); } catch (e) { console.error('[autoarranque]', e.message); } }
  actualizador = crearActualizador({ dirApp: __dirname, dirDatos: app.getPath('userData'),
    avisar: info => { if (win && !win.isDestroyed()) win.webContents.send('actualizacion', info); } });
  actualizador.iniciar();
  setTimeout(() => revisarModelos(), 25_000);                 // da tiempo a que el núcleo compruebe qué hay instalado
  nucleo = crearNucleo();                                    // antes que el cerebro: el cerebro usa sus modelos
  try {                                                       // correo (varias cuentas), GitHub, Hugging Face, ElevenLabs
    const cifra = safeStorage.isEncryptionAvailable();
    conectores = crearConectores({
      dir: app.getPath('userData'), nucleo, abrir: url => shell.openExternal(url),
      cifrar: cifra ? s => safeStorage.encryptString(s) : null, descifrar: b => safeStorage.decryptString(b),
      alNuevoCorreo: (c, m) => {                              // correo nuevo → el cerebro lo clasifica y hace tarjeta (con borrador de respuesta)
        if (cerebro) cerebro.ingest({ kind: 'mail', author: m.de, guild: c.email, channel: m.asunto, text: `${m.asunto}\n${m.trozo || ''}`.trim(), correo: { cuenta: c.id, uid: m.uid } });
        else if (win && !win.isDestroyed()) win.webContents.send('notif', { kind: 'dm', author: `✉ ${m.de}`, text: m.asunto });
      },
    });
    nucleo.extensiones.conectores = conectores;
    nucleo.extensiones.telegram = { http: async (M, p, b) => {
      if (M === 'GET') return telegram.estado();
      if (M === 'PUT') return telegram.conectar(b.token);
      if (M === 'POST' && p[2] === 'enlace') return telegram.nuevoEnlace();
      if (M === 'POST' && p[2] === 'prueba') { await telegram.sendAviso('🤖 **Prueba:** así te llegarán los avisos.'); return telegram.estado(); }
      if (M === 'DELETE') return telegram.desconectar();
      const e = new Error('ruta'); e.status = 404; throw e;
    } };
    // la app media SIEMPRE los canales plugin: así los permisos de Claude Code (hooks) y los del núcleo les llegan con el id de la app
    nucleo.plugins.mediar({ resolverPermiso: (id, b, via) => decide(id, b, via), accionTarjeta: (id, a, t) => cardAction(id, a, t), transcribir: ruta => transcribirArchivo(ruta),
      recibir: ({ plugin, texto }) => (CON_ADAPTADOR.includes(plugin) ? handleText(texto, plugin) : undefined), ajeno: ajenoPlugin });
    telegramComoPlugin().catch(e => console.error('[telegram] el plugin no arrancó:', e.message));
    whatsappComoPlugin().catch(e => console.error('[whatsapp] el plugin no arrancó:', e.message));
    nucleo.extensiones.whatsapp = { http: async (M, p, b) => {
      if (M === 'POST' && p[2] === 'migrar') return migrarSesionWhatsapp(b);
      if (M === 'GET' && p[2] === 'config') return whatsapp.config();
      if (M === 'PATCH' && p[2] === 'config') return whatsapp.ponerConfig(b);
      if (M === 'GET') return whatsapp.estado();
      if (M === 'POST' && p[2] === 'vincular') return whatsapp.vincular();
      if (M === 'POST' && p[2] === 'prueba') { await whatsapp.prueba(); return whatsapp.estado(); }
      if (M === 'DELETE') return whatsapp.desvincular();
      const e = new Error('ruta'); e.status = 404; throw e;
    } };
  } catch (e) { console.error('[conectores]', e.message); }
  cerebro = createCerebro({
    nucleo,
    dataDir: app.getPath('userData'),
    onCard: c => win && !win.isDestroyed() && win.webContents.send('card', c),
    notifyUrgent: c => {
      if (win && !win.isDestroyed()) win.webContents.send('urgent', c);
      if (isAway() || (c.extra || []).includes('dm') || c.kind === 'whatsapp') movil.sendCard(c);
    },
    getSessions: () => talk ? talk.recent() : [],
  });
  talk = createTalk({
    onStop: (name, txt, fail) => cerebro.record({ kind: 'claude', author: name, text: String(txt).slice(0, 300), resumen: `${fail ? 'Error' : 'Terminó'}: ${String(txt).slice(0, 140)}`, prioridad: 'normal' }),
    dataDir: app.getPath('userData'),
    getHwnd: hwndDe,
    reply: (origin, md, plain) => {
      if (esRemoto(origin)) responderA(origin, md);
      else if (win && !win.isDestroyed()) win.webContents.send('say', plain);
    },
  });
  // Ctrl+Alt+Espacio: hablarle al robot por voz
  app.whenReady().then(() => globalShortcut.register('Control+Alt+Space', () => win && win.webContents.send('listen-key')));
  createWindow(); startServer(); startNucleo(); buildTray(); trackCursor(); startDiscord(); startDms();
  isla.vigilarPantallaCompleta(); isla.vigilarMonitores();
  win.webContents.once('did-finish-load', () => { uso.scanUsage(); setInterval(uso.scanUsage, 60_000); });
  // nombre del compañero (identidad del núcleo): isla, bandeja y textos
  const enviarNombre = () => { const n = nombreCompanero(); if (win && !win.isDestroyed()) win.webContents.send('nombre', n); if (tray) tray.setToolTip(n === 'Robot' ? 'Robot Companion' : `${n} · Robot Companion`); };
  win.webContents.on('did-finish-load', enviarNombre);
  nucleo.bus.on('evento', e => { if (e && e.tipo === 'identidad') enviarNombre(); });
  // Modo Gamer (core/gamer): la isla se duerme (6 fps, sin gestos ni sonidos) mientras dure la partida
  const enviarGamer = () => { if (win && !win.isDestroyed()) win.webContents.send('gamer', !!nucleo.gamer?.estado?.().activo); };
  win.webContents.on('did-finish-load', enviarGamer);
  nucleo.bus.on('evento', e => { if (e && e.tipo === 'gamer' && win && !win.isDestroyed()) win.webContents.send('gamer', !!e.activo); });
  enviarNombre();
  // Estudio de Avatares: skin 2D del compañero en la isla (solo si el usuario activó "Usar avatar en lugar del casco")
  const enviarAvatar = () => { try { if (win && !win.isDestroyed() && nucleo.avatar) win.webContents.send('avatar', nucleo.avatar.paraIsla()); } catch { } };
  win.webContents.on('did-finish-load', enviarAvatar);
  nucleo.bus.on('evento', e => { if (e && e.tipo === 'avatar') enviarAvatar(); });
  // idioma: a la isla al cargar y cada vez que cambie en el panel (PATCH /v1/config {idioma} cambia nucleo.cfg en memoria)
  let idiomaEnviado = '';
  const enviarIdioma = forzar => { const l = idiomaApp(); if (!forzar && l === idiomaEnviado) return; idiomaEnviado = l; if (win && !win.isDestroyed()) win.webContents.send('idioma', l); };
  win.webContents.on('did-finish-load', () => enviarIdioma(true));
  setInterval(() => enviarIdioma(false), 3000);
  setInterval(async () => {                                   // ☀️ resumen del día: a la hora fijada y si estás en la PC
    if (!cerebro || !cerebro.briefingDue() || Date.now() - lastMove > 10 * 60_000) return;
    runBriefing();
  }, 5 * 60_000);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { voz.cerrar(); try { nucleo?.control.cerrar(); } catch { } });
