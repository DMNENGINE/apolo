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
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, shell, globalShortcut, clipboard } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const esPeligroso = require('./shared/peligro.js');
const { createDiscord } = require('./bot-discord.js');
const { createTalk } = require('./hablar.js');
let talk = null;
const { createCerebro } = require('./cerebro.js');
let cerebro = null;
const { crearNucleo } = require('./core');
const { iniciar: iniciarDaemon } = require('./core/daemon');
const { createPuente } = require('./puente-nucleo.js');
const { crearOverlay } = require('./control-overlay.js');
let nucleo = null, puente = null;
const nombreCompanero = () => { try { return nucleo ? nucleo.personalidad.nombre() : 'Robot'; } catch { return 'Robot'; } };

const PORT = 47823;
const WIN_W = 900, WIN_H = 640;
const HOOK_JS = path.join(__dirname, 'hook', 'hook.js').replace(/\\/g, '/');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const TOKEN_FILE = path.join(CLAUDE_DIR, 'robot-companion.token');
const RULES_FILE = () => path.join(app.getPath('userData'), 'reglas.json');
const DISCORD_CFG = () => path.join(app.getPath('userData'), 'discord.json');
const AWAY_MS = 60_000;               // sin mover el ratón 1 min = no estás en la PC
const DISCORD_GRACE_MS = 20_000;      // si estás, solo va a Discord si no contestas en 20 s
let lastMove = Date.now();
const isAway = () => Date.now() - lastMove > AWAY_MS;
let discord = { enabled: false, status: 'sin configurar', sendPerm() { }, resolvePerm() { }, sendAviso() { }, reply() { }, sendCard() { }, replyTo() { return false; }, stop() { } };
const HOOK_EVENTS = [
  ['SessionStart', 10], ['SessionEnd', 10], ['UserPromptSubmit', 10], ['PreToolUse', 10], ['PostToolUse', 10],
  ['PostToolUseFailure', 10], ['PermissionRequest', 120], ['Notification', 10], ['Stop', 10], ['StopFailure', 10],
  ['SubagentStart', 10], ['SubagentStop', 10],
];

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
let rules = [];
const loadRules = () => { try { rules = JSON.parse(fs.readFileSync(RULES_FILE(), 'utf8')); } catch { rules = []; } };
const saveRules = () => fs.writeFileSync(RULES_FILE(), JSON.stringify(rules, null, 2));
function ruleFor(tool, inp = {}) {
  if (tool === 'Bash' || tool === 'PowerShell') {
    const w = String(inp.command || '').trim().split(/\s+/);
    const pre = w[1] && !w[1].startsWith('-') ? `${w[0]} ${w[1]}` : w[0];
    return { tool, prefix: pre, label: `${tool}: ${pre} …` };
  }
  if (inp.file_path) {
    const dir = path.dirname(String(inp.file_path)).replace(/\\/g, '/');
    return { tool, prefix: dir, label: `${tool} en ${dir}` };
  }
  return { tool, prefix: '', label: tool };
}
function matchesRule(tool, inp = {}) {
  return rules.find(r => {
    if (r.tool !== tool) return false;
    if (tool === 'Bash' || tool === 'PowerShell') {
      const c = String(inp.command || '').trim();
      return c === r.prefix || c.startsWith(r.prefix + ' ');
    }
    if (r.prefix) return String(inp.file_path || '').replace(/\\/g, '/').startsWith(r.prefix + '/');
    return true;
  });
}
const allowJSON = () => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H,
    x: Math.round(workArea.x + (workArea.width - WIN_W) / 2), y: workArea.y,
    frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });     // clics pasan a través salvo encima de la isla
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

// voz neural (edge-tts, Microsoft es-ES-Alvaro) → mp3 en caché; null si falla (la isla usa entonces la voz de Windows)
const VOZ_TTS = { voz: 'es-ES-AlvaroNeural', rate: '+8%', pitch: '+12Hz' };
ipcMain.handle('tts', (_e, text) => new Promise(ok => {
  text = String(text || '').slice(0, 600); if (!text.trim()) return ok(null);
  const dir = path.join(os.tmpdir(), 'robot-tts'); try { fs.mkdirSync(dir, { recursive: true }); } catch { }
  const f = path.join(dir, crypto.createHash('sha1').update(VOZ_TTS.voz + VOZ_TTS.rate + VOZ_TTS.pitch + text).digest('hex').slice(0, 16) + '.mp3');
  if (fs.existsSync(f)) return ok(f);
  const p = require('child_process').spawn('python', ['-m', 'edge_tts', '--voice', VOZ_TTS.voz, '--rate=' + VOZ_TTS.rate, '--pitch=' + VOZ_TTS.pitch, '--text', text, '--write-media', f], { windowsHide: true });
  const t = setTimeout(() => { try { p.kill(); } catch { } ok(null); }, 12_000);
  p.on('error', () => { clearTimeout(t); ok(null); });
  p.on('exit', c => { clearTimeout(t); ok(c === 0 && fs.existsSync(f) ? f : null); });
}));

ipcMain.on('interactive', (_e, on) => { if (win) win.setIgnoreMouseEvents(!on, { forward: true }); });

// ---------- juego / vídeo a pantalla completa en el monitor de la isla → se va rodando a otro y vuelve al terminar ----------
let pantallaCasa = null, mudada = false, animMudanza = null;
const posIsla = d => ({ x: Math.round(d.workArea.x + (d.workArea.width - WIN_W) / 2), y: d.workArea.y });
function displayDeIsla() { const b = win.getBounds(); return screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: 80 }); }
function rodarA(d) {
  if (!win || win.isDestroyed()) return;
  const desde = win.getBounds(), hasta = posIsla(d), t0 = Date.now(), DUR = 900;
  win.webContents.send('mudanza', hasta.x > desde.x ? 1 : -1);          // el robot rueda en esa dirección
  clearInterval(animMudanza);
  // si los monitores no se tocan en horizontal, salta directo (rodando igual)
  animMudanza = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / DUR), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    win.setBounds({ x: Math.round(desde.x + (hasta.x - desde.x) * e), y: Math.round(desde.y + (hasta.y - desde.y) * e), width: WIN_W, height: WIN_H });
    if (k >= 1) clearInterval(animMudanza);
  }, 16);
}
function otroMonitor(excluir) {
  const otros = screen.getAllDisplays().filter(d => d.id !== excluir.id);
  // el más grande; a igualdad, el horizontal (la isla queda mejor arriba de una pantalla apaisada)
  return otros.sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height) || (b.bounds.width >= b.bounds.height) - (a.bounds.width >= a.bounds.height))[0];
}
function vigilarPantallaCompleta() {
  const p = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tools', 'pantalla-completa.ps1')], { windowsHide: true });
  let buf = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim().replace(/^﻿/, ''); buf = buf.slice(i + 1);
      let j; try { j = JSON.parse(l); } catch { continue; }
      if (!win || win.isDestroyed()) continue;
      if (!pantallaCasa) pantallaCasa = displayDeIsla();
      if (j.completa) {
        const ocupado = screen.getDisplayMatching({ x: j.x, y: j.y, width: j.ancho, height: j.alto });
        if (ocupado.id === displayDeIsla().id) {
          const destino = otroMonitor(ocupado);
          if (destino) { if (!mudada) pantallaCasa = ocupado; mudada = true; console.log(`[isla] ${j.proceso} a pantalla completa → me voy al otro monitor`); rodarA(destino); }
        }
      } else if (mudada) {
        mudada = false;
        const casa = screen.getAllDisplays().find(d => d.id === pantallaCasa.id) || screen.getPrimaryDisplay();
        console.log('[isla] se acabó la pantalla completa → vuelvo'); rodarA(casa);
      }
    }
  });
  p.on('exit', () => setTimeout(vigilarPantallaCompleta, 5000));          // si se cae, se relanza
  app.on('will-quit', () => { try { p.kill(); } catch { } });
}

// mover a mano (grabar vídeo en el principal): 'otro' = fuera del monitor principal, 'casa' = vuelve
function moverIsla(a) {
  const prim = screen.getPrimaryDisplay();
  mudada = false;
  rodarA(a === 'casa' ? prim : otroMonitor(prim));
}

// respuesta a un permiso desde la isla (o Stream Deck / Discord): 'allow' | 'deny' | 'always'
function decide(id, behavior, via = '?') {
  console.log(`[decide] id=${id} ${behavior} via=${via} pendiente=${pending.has(id)}`);
  const p = pending.get(id);
  if (!p) return false;
  clearTimeout(p.timer); pending.delete(id);
  if (p.nucleoId) {                                            // permiso del núcleo multi-modelo (sus reglas las guarda él)
    nucleo.permisos.resolver(p.nucleoId, behavior);
    if (win && !win.isDestroyed()) win.webContents.send('decided', id, behavior);
    discord.resolvePerm(id, behavior, via);
    return true;
  }
  if (behavior === 'always' && !esPeligroso(p.ev.tool_name, p.ev.tool_input)) {
    const r = ruleFor(p.ev.tool_name, p.ev.tool_input);
    if (!rules.some(x => x.tool === r.tool && x.prefix === r.prefix)) { rules.push(r); saveRules(); }
  }
  const decision = behavior === 'deny' ? { behavior: 'deny', message: `Denegado desde ${nombreCompanero()}` } : { behavior: 'allow' };
  p.res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }));
  if (win && !win.isDestroyed()) win.webContents.send('decided', id, behavior);
  discord.resolvePerm(id, behavior, via);
  return true;
}
ipcMain.on('decision', (_e, id, behavior) => decide(id, behavior, 'isla'));

// ---------- tokens: lee el final del transcript y saca el uso del último mensaje ----------
function readContext(transcript) {
  try {
    if (!transcript || !fs.existsSync(transcript)) return null;
    const st = fs.statSync(transcript), len = Math.min(st.size, 256 * 1024);
    const fd = fs.openSync(transcript, 'r'); const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const l of lines) {
      if (!l.includes('"usage"')) continue;
      try {
        const j = JSON.parse(l), u = j.message && j.message.usage;
        if (!u) continue;
        return {
          ctx: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
          out: u.output_tokens || 0, model: j.message.model || '',
        };
      } catch { /* línea cortada al inicio del bloque */ }
    }
  } catch { }
  return null;
}

// ---------- uso de hoy (todas las sesiones): tokens y mensajes ----------
const usage = { day: '', tokens: 0, nuevo: 0, cache: 0, out: 0, msgs: 0, offsets: new Map(), seen: new Set(), ev: [], hits: [] };
const LIMITS = () => path.join(app.getPath('userData'), 'limites.json');
let limits = null;
const loadLimits = () => { try { limits = JSON.parse(fs.readFileSync(LIMITS(), 'utf8')); } catch { limits = { ventana5h: null, semanal: null, avisarAl: 0.8, pausarAl: 0.92 }; fs.writeFileSync(LIMITS(), JSON.stringify(limits, null, 2)); } };
function scanUsage() {
  const today = new Date().toDateString();
  if (!limits) loadLimits();
  if (usage.day !== today) Object.assign(usage, { day: today, tokens: 0, nuevo: 0, cache: 0, out: 0, msgs: 0 });
  const root = path.join(CLAUDE_DIR, 'projects');
  let dirs = []; try { dirs = fs.readdirSync(root); } catch { return; }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 86400_000;
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const fp = path.join(root, d, f);
      let st; try { st = fs.statSync(fp); } catch { continue; }
      if (st.mtimeMs < weekAgo) continue;
      const from = usage.offsets.get(fp) || 0;
      if (st.size <= from) continue;
      try {
        const fd = fs.openSync(fp, 'r'), buf = Buffer.alloc(st.size - from);
        fs.readSync(fd, buf, 0, buf.length, from); fs.closeSync(fd);
        const txt = buf.toString('utf8'), cut = txt.lastIndexOf('\n');
        usage.offsets.set(fp, from + Buffer.byteLength(txt.slice(0, cut + 1)));
        for (const l of txt.slice(0, cut).split('\n')) {
          // aviso REAL de límite: lo genera Claude Code como mensaje sintético de error (no texto normal de una conversación)
          if ((l.includes('"isApiErrorMessage":true') || l.includes('"model":"<synthetic>"')) && /usage limit|limit reached|l[ií]mite de uso/i.test(l)) {
            try { const j = JSON.parse(l); const ts = new Date(j.timestamp).getTime(); if (ts > Date.now() - 6 * 3600_000 && !usage.hits.includes(ts)) usage.hits.push(ts); } catch { }
          }
          if (!l.includes('"usage"')) continue;
          try {
            const j = JSON.parse(l), u = j.message && j.message.usage;
            if (!u || !j.timestamp) continue;
            const ts = new Date(j.timestamp).getTime();
            if (ts < weekAgo) continue;
            const key = j.message.id || j.uuid;                          // un mensaje puede venir en varias líneas
            if (key && usage.seen.has(key)) continue;
            if (key) usage.seen.add(key);
            const tk = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
            usage.ev.push([ts, tk]);
            if (ts >= start.getTime()) { usage.msgs++; usage.out += u.output_tokens || 0; usage.tokens += tk; usage.cache += u.cache_read_input_tokens || 0; usage.nuevo += tk - (u.cache_read_input_tokens || 0); }
          } catch { }
        }
      } catch { }
    }
  }
  // ventanas: 5 h y 7 días; si Claude Code avisó de límite, ese consumo se toma como el límite real (autocalibrado)
  const now = Date.now();
  usage.ev = usage.ev.filter(([t]) => t > now - 7 * 86400_000);
  const h5 = usage.ev.reduce((n, [t, k]) => n + (t > now - 5 * 3600_000 ? k : 0), 0);
  const week = usage.ev.reduce((n, [, k]) => n + k, 0);
  for (const hit of usage.hits.splice(0)) {
    const at = usage.ev.reduce((n, [t, k]) => n + (t > hit - 5 * 3600_000 && t <= hit ? k : 0), 0);
    if (at > 0) { limits.ventana5h = at; fs.writeFileSync(LIMITS(), JSON.stringify(limits, null, 2)); discord.sendAviso(`⛔ Llegaste al límite de la ventana de 5 h del plan (~${Math.round(at / 1e6)}M tokens). Lo apunto para avisarte antes la próxima vez.`, 'red'); }
  }
  const p5 = limits.ventana5h ? h5 / limits.ventana5h : 0, pW = limits.semanal ? week / limits.semanal : 0;
  const near = Math.max(p5, pW);
  if (cerebro) cerebro.setPaused(near >= limits.pausarAl);
  if (near >= limits.avisarAl && !usage.warned) { usage.warned = true; discord.sendAviso(`⚠️ Llevas el ${Math.round(near * 100)}% del límite del plan (${p5 >= pW ? 'ventana de 5 h' : 'semana'}). El cerebro del robot se pausa al ${Math.round(limits.pausarAl * 100)}%.`, 'amber'); }
  if (near < limits.avisarAl * 0.8) usage.warned = false;
  if (win && !win.isDestroyed()) win.webContents.send('usage', { tokens: usage.tokens, nuevo: usage.nuevo, cache: usage.cache, out: usage.out, msgs: usage.msgs, h5, week, p5, pW, paused: cerebro ? cerebro.paused : false });
}

// ---------- ventana de terminal de cada sesión ----------
const sessionWin = new Map();       // session_id -> { hwnd, name } | 'buscando'
function ps(script) {
  return new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000 },
    (err, out) => ok(err ? '' : String(out).trim())));
}
async function resolveTerminal(sid, ppid) {
  if (!ppid || sessionWin.has(sid)) return;
  sessionWin.set(sid, 'buscando');
  // sube por los procesos padre hasta encontrar uno con ventana (Windows Terminal, VS Code, consola…)
  const out = await ps(`$p=${Number(ppid)}; for($i=0;$i -lt 15 -and $p;$i++){ $pr=Get-Process -Id $p -EA SilentlyContinue; if($pr -and $pr.MainWindowHandle -ne 0){ "$($pr.MainWindowHandle)|$($pr.ProcessName)"; break }; $p=(Get-CimInstance Win32_Process -Filter "ProcessId=$p").ParentProcessId }`);
  const [hwnd, name] = out.split('|');
  if (hwnd) sessionWin.set(sid, { hwnd, name }); else sessionWin.delete(sid);
}
async function focusTerminal(sid) {
  const w = sessionWin.get(sid);
  if (!w || w === 'buscando') return false;
  await ps(`Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);'; $h=[IntPtr]${w.hwnd}; if([U.W]::IsIconic($h)){[U.W]::ShowWindowAsync($h,9)|Out-Null}; [U.W]::SetForegroundWindow($h)|Out-Null`);
  return true;
}
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
  if (origin === 'discord') discord.reply(r.texto);
  else if (win && !win.isDestroyed()) win.webContents.send('answer', r);
  return { ok: true, msg: origin === 'discord' ? r.texto : '🧠 Listo (mira la isla).' };
}
// ---------- acciones de las tarjetas (isla o Discord) ----------
async function cardAction(id, action, text) {
  const c = cerebro && cerebro.card(id);
  if (!c) return 'Esa tarjeta ya no existe.';
  const msg = text || c.respuesta || '';
  if (action === 'enviar') {
    const ok = c.canSend && msg && await discord.replyTo(c.channelId, c.msgId, msg);
    if (ok) { cerebro.dropCard(id); win && win.webContents.send('card-done', id); }
    return ok ? '📨 Respuesta enviada.' : '❌ No pude enviarla.';
  }
  if (action === 'copiar') { clipboard.writeText(msg); shell.openExternal(c.link || 'discord://'); return '📋 Copiada; pégala en Discord.'; }
  if (['urgente', 'normal', 'ruido'].includes(action)) {
    cerebro.learn(id, action);
    if (action === 'ruido') { cerebro.dropCard(id); win && win.webContents.send('card-done', id); }
    return action === 'ruido' ? '🔕 Entendido: la próxima vez lo trato como ruido.' : '✓ Aprendido.';
  }
  cerebro.dropCard(id); win && win.webContents.send('card-done', id);
  return '🗑 Descartada.';
}
// ---------- voz: Whisper (servidor Python persistente); respaldo: reconocedor de Windows ----------
const { spawn } = require('child_process');
let whisper = null, whisperReady = false, whisperWait = null, whisperBuf = '';
function startWhisper() {
  try {
    whisper = spawn('python', [path.join(__dirname, 'tools', 'whisper_srv.py')], { windowsHide: true, env: { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONIOENCODING: 'utf-8' } });
  } catch { return; }
  whisper.stdout.setEncoding('utf8');
  whisper.stdout.on('data', d => {
    whisperBuf += d; let i;
    while ((i = whisperBuf.indexOf('\n')) >= 0) {
      const line = whisperBuf.slice(0, i).trim(); whisperBuf = whisperBuf.slice(i + 1);
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.ready) { whisperReady = true; console.log('[whisper] listo en', j.device, j.model); continue; }
      if (whisperWait) { const w = whisperWait; whisperWait = null; w(j); }
    }
  });
  whisper.on('exit', () => { whisperReady = false; whisper = null; });
}
// Whisper bajo demanda: se carga al pulsar el micro (o Ctrl+Alt+Espacio) y se descarga tras 2 min sin usarlo (~660 MB)
let whisperApagar = null;
function whisperListo(ms = 25_000) {
  if (whisperReady) return Promise.resolve(true);
  if (!whisper) startWhisper();
  return new Promise(ok => { const t0 = Date.now(); const iv = setInterval(() => { if (whisperReady || !whisper || Date.now() - t0 > ms) { clearInterval(iv); ok(whisperReady); } }, 100); });
}
function apagarWhisperLuego() { clearTimeout(whisperApagar); whisperApagar = setTimeout(() => { try { whisper && whisper.kill(); console.log('[whisper] descargado (sin uso)'); } catch { } }, 120_000); }
ipcMain.handle('listen', async () => { const ok = await whisperListo(); apagarWhisperLuego(); return ok && !whisperWait ? listenWhisper() : listenWindows(); });
const listenWhisper = () =>
  new Promise(ok => { whisperWait = ok; whisper.stdin.write('listen\n'); setTimeout(() => { if (whisperWait === ok) { whisperWait = null; ok({ text: '', conf: 0 }); } }, 30000); });
const listenWindows = () => new Promise(ok => execFile('powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tools', 'listen.ps1')],
  { windowsHide: true, timeout: 15000 }, (err, out) => { try { ok(JSON.parse(String(out).trim())); } catch { ok({ text: '', conf: 0, error: err ? err.message : 'sin respuesta' }); } }));

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
      discord.sendAviso('🤖 **Prueba:** así te llegarán los avisos del Robot Companion.', 'blue');
      res.writeHead(200); return res.end();
    }
    if (req.method === 'POST' && req.url.startsWith('/mover')) {     // mover la isla: ?a=otro (fuera del principal) | ?a=casa
      moverIsla(/a=casa/.test(req.url) ? 'casa' : 'otro');
      res.writeHead(200); return res.end();
    }
    if (req.method === 'POST' && req.url === '/poke') {             // botón de estado del Stream Deck
      if (win && !win.isDestroyed()) win.webContents.send('poke');
      res.writeHead(200); return res.end();
    }
    if (req.method !== 'POST' || req.url !== '/event') { res.writeHead(404); return res.end(); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let ev; try { ev = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
      ev._id = nextId++;
      ev._t = Date.now();
      const u = readContext(ev.transcript_path);
      if (u) ev._usage = u;
      if (ev._ppid && ev.session_id) resolveTerminal(ev.session_id, ev._ppid);
      if (talk) talk.onEvent(ev);
      if (!win || win.isDestroyed()) return res.end();
      if (ev.hook_event_name === 'PermissionRequest') {
        ev._peligro = esPeligroso(ev.tool_name, ev.tool_input);
        const rule = !ev._peligro && matchesRule(ev.tool_name, ev.tool_input);
        if (rule) {                                                   // regla "Permitir siempre": sin molestar
          ev._auto = rule.label;
          win.webContents.send('event', ev);
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(allowJSON());
        }
        win.webContents.send('event', ev);
        res.writeHead(200, { 'content-type': 'application/json' });
        // sin respuesta en 105 s -> vacío: Claude Code pregunta en la terminal
        const timer = setTimeout(() => { pending.delete(ev._id); res.end(); win && win.webContents.send('expired', ev._id); discord.resolvePerm(ev._id, 'expired', 'tiempo'); }, 105_000);
        pending.set(ev._id, { res, timer, ev });
        // al móvil: ya si no estás en la PC, o si nadie contesta en 20 s
        permToDiscord(ev);
        res.on('close', () => { if (pending.has(ev._id)) { clearTimeout(timer); pending.delete(ev._id); win && win.webContents.send('expired', ev._id); } });
      } else {
        win.webContents.send('event', ev);
        res.end();
        if (isAway() && ev.hook_event_name === 'Stop') discord.sendAviso(`✅ Claude terminó en **${path.basename(ev.cwd || '') || 'una sesión'}**`, 'green');
        if (isAway() && ev.hook_event_name === 'StopFailure') discord.sendAviso(`❌ Claude terminó con error en **${path.basename(ev.cwd || '') || 'una sesión'}**`, 'red');
      }
    });
  });
  srv.on('error', e => dialog.showErrorBox('Robot Companion', `No pude abrir el puerto ${PORT}: ${e.message}`));
  srv.listen(PORT, '127.0.0.1');
}
// al móvil: ya si no estás en la PC, o si nadie contesta en 20 s
function permToDiscord(ev) {
  const toDiscord = () => pending.has(ev._id) && discord.sendPerm({
    id: ev._id, tool: ev._nucleo ? `${ev.tool_name} · ${ev._nucleo}` : ev.tool_name, peligro: ev._peligro, session: path.basename(ev.cwd || '') || '—',
    detail: String(ev.tool_input?.command || ev.tool_input?.file_path || ev.tool_input?.url || JSON.stringify(ev.tool_input || {})),
  });
  if (isAway() || ev._forceDiscord) toDiscord(); else setTimeout(toDiscord, DISCORD_GRACE_MS);   // _forceDiscord: pruebas
}

// panel web del núcleo: el token va en el #hash (no viaja al servidor) y el panel lo guarda y lo borra de la URL
function abrirPanel() {
  if (!nucleo) return;
  let tok = ''; try { tok = fs.readFileSync(path.join(nucleo.cfg.dir, 'token'), 'utf8').trim(); } catch { }
  shell.openExternal(`http://127.0.0.1:${nucleo.cfg.puerto}/#token=${tok}`);
}

// ---------- núcleo multi-modelo (core/): API en 127.0.0.1:47900 + puente con la isla ----------
let overlayControl = null;
async function startNucleo() {
  nucleo = nucleo || crearNucleo();
  nucleo.cerebro = { leer: () => cerebro.config(), guardar: c => cerebro.setConfig(c) };
  try { const d = await iniciarDaemon({ nucleo }); console.log(`[núcleo] API en :${d.puerto}${(nucleo.cfg.red?.permitidos || []).length ? ` (LAN solo: ${nucleo.cfg.red.permitidos.join(", ")})` : " (solo este equipo)"} · modelo por defecto ${nucleo.cfg.modeloPorDefecto}`); }
  catch (e) { console.error('[núcleo] sin API HTTP:', e.message); }
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
      if (origin === 'discord' || isAway()) discord.reply(`**${titulo}**\n${texto}`);   // si no estás en la PC, también al móvil
      if (origin !== 'discord' && win && !win.isDestroyed()) win.webContents.send('answer', { titulo, texto, voz: origin === 'voz' || extra.tarea ? texto.slice(0, 400) : undefined });
    },
  });
  // canales del robot visibles en el panel
  const canalesRobot = () => {
    nucleo.canales.registrar('isla', { nombre: 'Isla de escritorio', tipo: 'isla', estado: 'activo', detalle: `Destino: ${puente.destino('isla') || 'Claude Code'}` });
    nucleo.canales.registrar('discord', { nombre: 'Discord', tipo: 'discord', estado: /conectado/i.test(discord.status) ? 'activo' : 'inactivo', detalle: `${discord.status} · destino: ${puente.destino('discord') || 'Claude Code'}` });
    nucleo.canales.registrar('voz', { nombre: 'Voz', tipo: 'voz', estado: 'activo', detalle: whisperReady ? 'Whisper cargado · Ctrl+Alt+Espacio' : 'Whisper se carga al hablar · Ctrl+Alt+Espacio' });
    nucleo.canales.registrar('streamdeck', { nombre: 'Stream Deck', tipo: 'streamdeck', estado: fs.existsSync(path.join(process.env.APPDATA || '', 'Elgato', 'StreamDeck', 'Plugins', 'com.robotcompanion.sdPlugin')) ? 'activo' : 'inactivo', detalle: 'Permitir / Denegar / Estado' });
    nucleo.canales.registrar('gemini', { nombre: 'Gemini CLI (hooks)', tipo: 'claudecode', estado: geminiHooksInstalled() ? 'activo' : 'inactivo', detalle: geminiHooksInstalled() ? 'Hooks instalados: permisos y actividad en la isla' : cliInstalado.gemini ? 'Instálalos desde la bandeja' : 'Gemini CLI no está instalado (npm i -g @google/gemini-cli)' });
    nucleo.canales.registrar('codex', { nombre: 'Codex CLI', tipo: 'claudecode', estado: 'inactivo', detalle: 'Sus hooks son experimentales y aún no funcionan en Windows' });
    nucleo.canales.registrar('claudecode', { nombre: 'Claude Code (hooks)', tipo: 'claudecode', estado: hooksInstalled() ? 'activo' : 'inactivo', detalle: hooksInstalled() ? 'Hooks instalados' : 'Instálalos desde la bandeja' });
  };
  canalesRobot(); setInterval(canalesRobot, 15_000);
  // avisos de agentes externos (MCP: Antigravity, Cursor…) → isla con voz + Discord si urgente o no estás
  nucleo.bus.on('aviso-externo', a => {
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: `📣 ${a.origen}`, texto: a.texto, voz: a.texto.slice(0, 300) });
    if (a.urgente || isAway()) discord.sendAviso(`📣 **${a.origen}:** ${a.texto.slice(0, 1800)}`, a.urgente ? 'red' : 'blue');
  });
  // control del ratón/teclado: borde rojo en todos los monitores, aviso en la isla y en Discord si no estás
  const panicoControl = via => {
    const est = nucleo.control.estado();
    nucleo.control.soltarTodo(`el usuario lo detuvo (${via})`);
    for (const c of est) nucleo.agente.cancelar(c.sesion);
  };
  overlayControl = crearOverlay({ alPanico: panicoControl });
  nucleo.bus.on('control', c => {
    if (c.activo) overlayControl.mostrar(c.motivo);
    else if (!nucleo.control.estado().length) overlayControl.ocultar();
    const texto = c.activo ? `🖱️ Tomo el control del ratón y teclado: ${c.motivo}` : `✋ Control devuelto: ${c.razon || 'terminado'}`;
    if (win && !win.isDestroyed()) win.webContents.send('answer', { titulo: '🤖 Control del PC', texto });
    if (isAway()) discord.sendAviso(texto, c.activo ? 'red' : 'blue');
  });
  nucleo.bus.on('permiso-resuelto', ({ id: nid }) => {          // contestado por otra vía (API, tiempo agotado)
    for (const [id, p] of pending) if (p.nucleoId === nid) {
      pending.delete(id);
      if (win && !win.isDestroyed()) win.webContents.send('expired', id);
      discord.resolvePerm(id, 'expired', 'núcleo');
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
  };
}

// ---------- instalar / quitar hooks en ~/.claude/settings.json ----------
const isOurs = h => typeof h.command === 'string' && h.command.includes('RobotCompanion/hook/hook.js');
function readSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } }
function backup() {
  if (fs.existsSync(SETTINGS)) {
    const b = SETTINGS + '.robot-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(SETTINGS, b); return b;
  }
  return null;
}
function stripOurs(s) {
  if (!s.hooks) return s;
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] || []).map(m => ({ ...m, hooks: (m.hooks || []).filter(h => !isOurs(h)) })).filter(m => m.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}
function installHooks() {
  const s = stripOurs(readSettings());
  s.hooks = s.hooks || {};
  for (const [ev, timeout] of HOOK_EVENTS) {
    (s.hooks[ev] = s.hooks[ev] || []).push({ hooks: [{ type: 'command', command: `node "${HOOK_JS}" ${ev}`, timeout }] });
  }
  const b = backup();
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
  dialog.showMessageBox({ message: 'Hooks instalados.', detail: `Copia de seguridad: ${b || '(no había settings.json)'}\nAbre una sesión nueva de Claude Code para que los use.` });
}
function removeHooks() {
  const b = backup();
  fs.writeFileSync(SETTINGS, JSON.stringify(stripOurs(readSettings()), null, 2));
  dialog.showMessageBox({ message: 'Hooks quitados.', detail: `Copia de seguridad: ${b}` });
}
const hooksInstalled = () => JSON.stringify(readSettings()).includes('RobotCompanion/hook/hook.js');

// ---------- motor Gemini CLI: mismos hooks, traducidos por hook/motores.js ----------
const GEMINI_SETTINGS = path.join(os.homedir(), '.gemini', 'settings.json');
const GEMINI_EVENTS = [['SessionStart', 10000], ['SessionEnd', 10000], ['BeforeAgent', 10000], ['AfterAgent', 10000], ['BeforeTool', 120000], ['AfterTool', 10000], ['Notification', 10000]];   // ms
const leerJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const geminiHooksInstalled = () => JSON.stringify(leerJSON(GEMINI_SETTINGS)).includes('RobotCompanion/hook/hook.js');
function geminiHooks(instalar) {
  const s = stripOurs(leerJSON(GEMINI_SETTINGS));
  if (instalar) {
    s.hooks = s.hooks || {};
    for (const [ev, timeout] of GEMINI_EVENTS) (s.hooks[ev] = s.hooks[ev] || []).push({ ...(ev.includes('Tool') ? { matcher: '.*' } : {}), hooks: [{ name: 'robot-companion', type: 'command', command: `node "${HOOK_JS}" ${ev} --motor=gemini`, timeout }] });
  }
  let b = null;
  if (fs.existsSync(GEMINI_SETTINGS)) { b = GEMINI_SETTINGS + '.robot-backup-' + new Date().toISOString().replace(/[:.]/g, '-'); fs.copyFileSync(GEMINI_SETTINGS, b); }
  fs.mkdirSync(path.dirname(GEMINI_SETTINGS), { recursive: true });
  fs.writeFileSync(GEMINI_SETTINGS, JSON.stringify(s, null, 2));
  dialog.showMessageBox({ message: instalar ? 'Hooks de Gemini CLI instalados.' : 'Hooks de Gemini CLI quitados.', detail: `Copia de seguridad: ${b || '(no había settings.json)'}${instalar ? '\nAbre una sesión nueva de Gemini CLI. Puedes comprobarlos con /hooks.' : ''}` });
}
const tieneCLI = n => { try { require('child_process').execSync(`where ${n}`, { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; } };
const cliInstalado = { gemini: tieneCLI('gemini'), codex: tieneCLI('codex') };

// ---------- arranque con Windows ----------
const loginOpts = () => ({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] });
const autoStart = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
const setAutoStart = v => app.setLoginItemSettings({ openAtLogin: v, ...loginOpts() });

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
    { label: hooksInstalled() ? '✓ Hooks de Claude Code instalados' : 'Hooks NO instalados', enabled: false },
    { label: 'Instalar hooks', click: installHooks },
    { label: 'Quitar hooks', click: removeHooks },
    { label: geminiHooksInstalled() ? '✓ Hooks de Gemini CLI instalados' : `Gemini CLI: hooks no instalados${cliInstalado.gemini ? '' : ' (CLI no encontrado)'}`, enabled: false },
    { label: geminiHooksInstalled() ? 'Quitar hooks de Gemini CLI' : 'Instalar hooks de Gemini CLI', click: () => geminiHooks(!geminiHooksInstalled()) },
    { type: 'separator' },
    { label: 'Iniciar con Windows', type: 'checkbox', checked: autoStart(), click: i => setAutoStart(i.checked) },
    { type: 'separator' },
    { label: `🤖 Núcleo: isla → ${(puente && puente.destino('isla')) || 'Claude Code'} · Discord → ${(puente && puente.destino('discord')) || 'Claude Code'}`, enabled: false },
    { label: '🖥️ Abrir panel de control', click: abrirPanel },
    { label: '🧩 Copiar token para la extensión del navegador', click: () => { try { clipboard.writeText(fs.readFileSync(path.join(nucleo.cfg.dir, 'token'), 'utf8').trim()); } catch { } } },
    { label: '🧩 Abrir carpeta de la extensión', click: () => shell.openPath(path.join(__dirname, 'extension')) },
    { label: 'Configurar modelos (abrir config del núcleo)…', click: () => nucleo && shell.openPath(path.join(nucleo.cfg.dir, 'config.json')) },
    { type: 'separator' },
    { label: `Discord: ${discord.status}`, enabled: false },
    { label: 'Configurar Discord (abrir archivo)…', click: () => { ensureDiscordCfg(); shell.openPath(DISCORD_CFG()); } },
    { label: 'Reconectar Discord', click: startDiscord },
    { label: '☀️ Resumen del día ahora', click: () => runBriefing() },
    { label: `🧠 Cerebro: ${cerebro && cerebro.paused ? 'en pausa (cerca del límite del plan)' : 'activo'}`, enabled: false },
    { label: 'Enviarme un aviso de prueba', click: () => discord.sendAviso('🤖 **Prueba:** así te llegarán los avisos del Robot Companion.', 'blue') },
    { label: `Avisos de DMs: ${dmsStatus}`, enabled: false },
    {
      label: `Reglas "Permitir siempre" (${rules.length})`, submenu: rules.length ? [
        ...rules.map((r, i) => ({ label: `✕ quitar: ${r.label}`, click: () => { rules.splice(i, 1); saveRules(); } })),
        { type: 'separator' }, { label: 'Quitar todas', click: () => { rules = []; saveRules(); } },
      ] : [{ label: '(ninguna)', enabled: false }],
    },
    { type: 'separator' },
    { label: '↔ Mover isla fuera del monitor principal', click: () => moverIsla('otro') },
    { label: '↩ Volver la isla al monitor principal', click: () => moverIsla('casa') },
    { label: '🎬 Demo Gemini + Flow (escribe solo)', click: () => win.webContents.send('demo-flow') },
    { label: '🎬 Presentación (vídeo TikTok)', click: () => win.webContents.send('presentacion') },
    { label: 'Evento de prueba', click: () => win.webContents.send('demo') },
    { label: 'Herramientas de desarrollo', click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
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
  discord.reply(`☀️ **Resumen del día**\n${r.texto}`);
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
function startDiscord() {
  try { discord.stop(); } catch { }
  let dcfg = {}; try { dcfg = JSON.parse(fs.readFileSync(DISCORD_CFG(), 'utf8')); } catch { }
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

// ---------- avisos de DMs (notificaciones de Windows de la app de Discord) ----------
let dmsStatus = 'iniciando', dmsLast = -1;
function startDms() {
  const script = path.join(__dirname, 'tools', 'dms_reader.py');
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
  ensureToken(); loadRules(); ensureDiscordCfg();
  // primera vez que arranca en este PC: se activa "Iniciar con Windows" (luego se puede quitar en la bandeja)
  const primera = path.join(app.getPath('userData'), 'primer-arranque');
  if (!fs.existsSync(primera)) { try { setAutoStart(true); fs.writeFileSync(primera, new Date().toISOString()); } catch (e) { console.error('[autoarranque]', e.message); } }
  nucleo = crearNucleo();                                    // antes que el cerebro: el cerebro usa sus modelos
  cerebro = createCerebro({
    nucleo,
    dataDir: app.getPath('userData'),
    onCard: c => win && !win.isDestroyed() && win.webContents.send('card', c),
    notifyUrgent: c => {
      if (win && !win.isDestroyed()) win.webContents.send('urgent', c);
      if (isAway() || (c.extra || []).includes('dm')) discord.sendCard(c);
    },
    getSessions: () => talk ? talk.recent() : [],
  });
  talk = createTalk({
    onStop: (name, txt, fail) => cerebro.record({ kind: 'claude', author: name, text: String(txt).slice(0, 300), resumen: `${fail ? 'Error' : 'Terminó'}: ${String(txt).slice(0, 140)}`, prioridad: 'normal' }),
    dataDir: app.getPath('userData'),
    getHwnd: sid => { const w = sessionWin.get(sid); return w && w !== 'buscando' ? w.hwnd : null; },
    reply: (origin, md, plain) => {
      if (origin === 'discord') discord.reply(md);
      else if (win && !win.isDestroyed()) win.webContents.send('say', plain);
    },
  });
  // Ctrl+Alt+Espacio: hablarle al robot por voz
  app.whenReady().then(() => globalShortcut.register('Control+Alt+Space', () => win && win.webContents.send('listen-key')));
  createWindow(); startServer(); startNucleo(); buildTray(); trackCursor(); startDiscord(); startDms();
  vigilarPantallaCompleta();
  win.webContents.once('did-finish-load', () => { scanUsage(); setInterval(scanUsage, 60_000); });
  // nombre del compañero (identidad del núcleo): isla, bandeja y textos
  const enviarNombre = () => { const n = nombreCompanero(); if (win && !win.isDestroyed()) win.webContents.send('nombre', n); if (tray) tray.setToolTip(n === 'Robot' ? 'Robot Companion' : `${n} · Robot Companion`); };
  win.webContents.on('did-finish-load', enviarNombre);
  nucleo.bus.on('evento', e => { if (e && e.tipo === 'identidad') enviarNombre(); });
  enviarNombre();
  setInterval(async () => {                                   // ☀️ resumen del día: a la hora fijada y si estás en la PC
    if (!cerebro || !cerebro.briefingDue() || Date.now() - lastMove > 10 * 60_000) return;
    runBriefing();
  }, 5 * 60_000);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { try { whisper && whisper.kill(); } catch { } try { nucleo?.control.cerrar(); } catch { } });
