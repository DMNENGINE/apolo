// Isla: sesiones de Claude Code, subagentes, permisos y tokens, con el robot como indicador.
import { createRobot } from './robot.js';
import { emit, COLORS, sound } from './fx.js';

const $ = id => document.getElementById(id);
// i18n: ../core/ui/i18n.js (script clásico, va antes) deja tr() global; sin él, el español tal cual
const tr = window.tr || ((k, v) => String(k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] !== undefined ? v[x] : m)));
try { window.I18N?.estaticos(); } catch { }

// ---------- iconos SVG (trazo, heredan el color del texto) ----------
let NOMBRE = 'Robot';                                  // nombre del compañero (lo manda main desde la identidad del núcleo)
let tSel = null, tTimer = null, tFirma = '';          // chat con una terminal (más abajo)
const ICO = (() => {
  const P = {
    voz: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9v2M12 7v6M16 9v2"/>',
    sonido: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    mudo: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    enviar: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    abrir: '<path d="M7 17 17 7M8 7h9v9"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    arriba: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    silenciar: '<path d="M13.7 21a2 2 0 0 1-3.4 0M18 8a6 6 0 0 0-9.3-5M6 8c0 7-3 9-3 9h14M2 2l20 20"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    pi: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v2M15 13v2"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    peligro: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M8 12h8"/>',
  };
  const f = n => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
  return Object.fromEntries(Object.keys(P).map(k => [k, f(k)]));
})();
const island = $('island');
const bridge = window.bridge || makeStubBridge();      // sin Electron (navegador): modo demo

// ---------- robot (un solo canvas que se mueve entre la barra y el panel) ----------
const cv = document.createElement('canvas');
const rwrap = document.createElement('div'); rwrap.className = 'rwrap';
const badge = document.createElement('div'); badge.id = 'badge';
rwrap.append(cv, badge);
$('mini').appendChild(rwrap);
const robot = createRobot(cv);
const center = () => { const r = rwrap.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
let lastCode = null;                  // último cambio de código para la tarjeta "en vivo"

// tocar al robot: 1 clic = sacudida; 3 clics rápidos = da vueltas con ojos de remolino; si sigues, más vueltas y más mareo
let clicks = [], mareoHasta = 0, nivelMareo = 0;
rwrap.addEventListener('click', e => {
  e.stopPropagation();
  const now = Date.now(); clicks = clicks.filter(t => now - t < 1500); clicks.push(now);
  const [x, y] = center();
  lastActivity = now;
  if (clicks.length >= 3) {
    nivelMareo = now < mareoHasta ? Math.min(3, nivelMareo + 1) : 1;      // seguir tocando mientras está mareado = peor
    clicks = []; mareoHasta = now + 4000 + nivelMareo * 1100;
    robot.dizzy(nivelMareo); sound.play('mareo');
    emit(x, y, 18 + nivelMareo * 10, ['#b58cff', '#7fe3ff', '#ff7ad9'], 'burst');
    if (nivelMareo >= 3) say(tr('¡Para, para! Todo me da vueltas'));
  } else { robot.poke(); sound.play('poke'); emit(x, y, 10, COLORS.listo, 'burst'); }
});

// ---------- vida propia: de vez en cuando hace algo (en reposo o dormido, con la isla cerrada) ----------
// dormido también: se "despierta" el rato del gesto (msg '' = cara despierta) y vuelve a dormirse; FPS altos solo durante el gesto
const GESTOS = [                                            // [peso, nombre, segundos, mensaje]
  [3, 'reloj', 5, ''], [2, 'saludo', 2.6, '¡HOLA!'], [2, 'guino', 1.4, ''], [2, 'mirar', 4.5, ''],
  [1, 'corazon', 2.5, '♥'], [1, 'sorpresa', 1.6, ''], [1, 'si', 1.4, ''],
  [2, 'pensativo', 4, ''], [1, 'estornudo', 2.2, '¡ACHÍS!'], [1, 'bostezo', 2.4, ''],
];
function hacerGesto(nombre, secs, msg) {
  robot.setFps(40);
  robot.gesto(nombre, secs, msg ? tr(msg) : msg);
  setTimeout(ajustarFps, secs * 1000 + 400);
}
let proximoGesto = Date.now() + 20_000, ultimaHora = -1;

// reacción a un evento (tarea lista, error, permiso): ojos y cabeza del gesto, a 40 fps mientras dura
function reaccion(nombre, secs) { robot.setFps(40); robot.gesto(nombre, secs); setTimeout(ajustarFps, secs * 1000 + 400); }

// al despertarse bosteza; la primera vez del día por la mañana (5–12 h) además da los buenos días
function despertar() {
  sound.play('abrir'); hacerGesto('bostezo', 2.2, '');
  const hoy = new Date().toDateString(), h = new Date().getHours();
  let ya = ''; try { ya = localStorage.getItem('robot-buenosdias') || ''; } catch { }
  if (h >= 5 && h < 12 && ya !== hoy) {
    try { localStorage.setItem('robot-buenosdias', hoy); } catch { }
    setTimeout(() => { robot.greet(tr('¡BUENOS DÍAS!')); say(tr('¡Buenos días!')); const [x, y] = center(); emit(x, y, 24, ['#ffd25a', '#ffb020', '#7fe3ff'], 'burst'); }, 2300);
  }
}

// el cursor se acerca al robot (isla cerrada): se sorprende; si lo dejas encima un rato, se pone contento
let lejos = true, encimaDesde = 0, ultimaCercania = 0;
function cercania(p) {
  if (open) { lejos = true; encimaDesde = 0; return; }
  const [x, y] = center(), d = Math.hypot(p.x - x, p.y - y), now = Date.now();
  const libre = !robot.ocupado() && (lastState === 'reposo' || lastState === 'dormido');
  if (d > 220) { lejos = true; encimaDesde = 0; return; }
  if (lejos && d < 130) {
    lejos = false;
    if (libre && now - ultimaCercania > 25_000) { ultimaCercania = now; hacerGesto('sorpresa', 1.1, lastState === 'dormido' ? '' : undefined); }
  }
  if (d < 45) {
    if (!encimaDesde) encimaDesde = now;
    else if (now - encimaDesde > 1500 && libre && now - ultimaCercania > 8000) { ultimaCercania = now; encimaDesde = now + 60_000; hacerGesto('feliz', 2, ''); }
  } else encimaDesde = 0;
}
setInterval(() => {
  const now = Date.now(), d = new Date();
  if ((lastState !== 'reposo' && lastState !== 'dormido') || open || robot.ocupado() || now - lastActivity < 4000) return;
  // en punto (y a la media) enseña la hora
  const marca = d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
  if ((d.getMinutes() === 0 || d.getMinutes() === 30) && marca !== ultimaHora) { ultimaHora = marca; hacerGesto('reloj', 6, ''); sound.play('blip'); return; }
  if (now < proximoGesto) return;
  // despierto: cada 45 s – 2 min; dormido: cada 4 – 8 min (que no esté siempre moviéndose)
  proximoGesto = now + (lastState === 'dormido' ? 240_000 + Math.random() * 240_000 : 45_000 + Math.random() * 75_000);
  let r = Math.random() * GESTOS.reduce((n, g) => n + g[0], 0);
  for (const [peso, nombre, secs, msg] of GESTOS) { if ((r -= peso) <= 0) { hacerGesto(nombre, secs, msg); break; } }
}, 2000);

// ---------- estado ----------
// carpetas que no dicen nada del proyecto: la sesión se nombra por su primer mensaje
const GENERIC_RE = /^(system32|windows|users?|desktop|escritorio|documents|documentos|downloads|descargas|home|~|[a-z]:)$/i;
const GENERIC = { test: c => GENERIC_RE.test(c) || (!!window.bridge?.usuario && String(c).toLowerCase() === window.bridge.usuario.toLowerCase()) };   // + la carpeta del usuario
const sessions = new Map();      // session_id -> sesión
const perms = [];                // permisos pendientes
const DONE_MS = 8000;
const base = p => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || '?';

function ses(ev) {
  const id = ev.session_id || 'sin-id';
  let s = sessions.get(id);
  if (!s) {
    s = { id, name: base(ev.cwd), state: 'reposo', act: '', subs: new Map(), pendingTask: [], usage: null, t: Date.now(), doneAt: 0, steps: 0 };
    sessions.set(id, s);
  }
  if (ev.cwd) { s.folder = base(ev.cwd); s.name = GENERIC.test(s.folder) ? (s.title ? s.title : ev._motor === 'gemini' ? 'Gemini CLI' : 'Claude Code') : s.folder; }
  s.t = Date.now();
  if (ev._usage) s.usage = ev._usage;
  return s;
}

function toolText(name, inp = {}) {
  const short = (v, n = 60) => { v = String(v ?? ''); return v.length > n ? v.slice(0, n) + '…' : v; };
  switch (name) {
    case 'Bash': case 'PowerShell': return `${name}  ${short(inp.command)}`;
    case 'Read': case 'Write': case 'Edit': case 'NotebookEdit': return `${name}  ${base(inp.file_path || inp.notebook_path)}`;
    case 'Grep': return `Grep  "${short(inp.pattern, 40)}"`;
    case 'Glob': return `Glob  ${short(inp.pattern, 40)}`;
    case 'WebFetch': try { return `WebFetch  ${new URL(inp.url).host}`; } catch { return 'WebFetch'; }
    case 'WebSearch': return `WebSearch  ${short(inp.query, 40)}`;
    case 'Task': case 'Agent': return `${tr('Agente')}  ${short(inp.description || inp.subagent_type, 50)}`;
    case 'navegador_abrir': try { return `${tr('Navegador')}  ${tr('abre')} ${new URL(/^[a-z]+:/i.test(inp.url) ? inp.url : 'https://' + inp.url).host}`; } catch { return `${tr('Navegador')}  ${tr('abre')}`; }
    case 'navegador_escribir': return `${tr('Navegador')}  ${tr('escribe')} "${short(inp.texto, 30)}"${inp.enviar ? ' ⏎' : ''}`;
    case 'navegador_clic': return `${tr('Navegador')}  ${tr('clic')} [${inp.ref}]`;
    case 'navegador_esperar': return `${tr('Navegador')}  ${tr('esperando {n} s', { n: inp.segundos || '' })}`;
    default: return name && name.startsWith('mcp__') ? `MCP  ${name.split('__').slice(1).join(' › ')}` : (name || '');
  }
}
function permDetail(name, inp = {}) {
  if (name === 'Bash' || name === 'PowerShell' || inp.command) return inp.command || '';
  if (inp.file_path) return inp.file_path;
  if (inp.url) return inp.url;
  return JSON.stringify(inp, null, 1).slice(0, 400);
}

// ---------- eventos del hook ----------
function onEvent(ev) {
  const e = ev.hook_event_name;
  const s = ses(ev);
  const inSub = ev.agent_id && s.subs.get(ev.agent_id);
  switch (e) {
    case 'SessionStart':
      s.state = 'reposo'; s.act = tr('sesión iniciada'); robot.pushLog(`▶ ${s.name}`); break;
    case 'UserPromptSubmit':
      if (!s.title && ev.prompt) { s.title = String(ev.prompt).trim().split(/\s+/).slice(0, 5).join(' ').slice(0, 32); if (GENERIC.test(s.folder || '')) s.name = s.title; }
      s.state = 'trabajando'; s.act = tr('pensando…'); s.steps = 0; robot.pushLog(`> ${String(ev.prompt || '').slice(0, 40)}`); break;
    case 'PreToolUse': {
      const txt = toolText(ev.tool_name, ev.tool_input);
      if (!inSub) s.steps++;
      codeFrom(s, ev.tool_name, ev.tool_input || {});
      fxTool();
      if (inSub) inSub.act = txt; else { s.state = 'trabajando'; s.act = txt; }
      if (String(ev.tool_name).startsWith('navegador_')) {   // usando la web: ojos-globo + lo que hace en el visor
        robot.setFps(40); robot.gesto('navegando', ev.tool_name === 'navegador_esperar' ? Math.min(60, (ev.tool_input?.segundos || 10) + 3) : 7,
          '🌐 ' + txt.replace(/^\S+\s+/, '').replace(/^navegador_/, '').toUpperCase().slice(0, 22));
        clearTimeout(window._navFps); window._navFps = setTimeout(ajustarFps, 8000);
      }
      if (ev.tool_name === 'Task' || ev.tool_name === 'Agent') {
        s.pendingTask.push({ type: ev.tool_input?.subagent_type || 'agente', desc: ev.tool_input?.description || '' });
      }
      robot.pushLog(txt); break;
    }
    case 'PostToolUse':
      if (ev.tool_name === 'Task' || ev.tool_name === 'Agent') {
        // cierra el subagente más antiguo con esa descripción que siga corriendo
        const d = ev.tool_input?.description;
        const sa = [...s.subs.values()].find(x => x.running && (!d || x.desc === d)) || [...s.subs.values()].find(x => x.running);
        if (sa) { sa.running = false; sa.end = Date.now(); }
      }
      break;
    case 'PostToolUseFailure':
      robot.pushLog(`✗ ${tr('{x} falló', { x: ev.tool_name || '' })}`); break;
    case 'SubagentStart': {
      const p = s.pendingTask.shift() || {};
      const id = ev.agent_id || 'sa' + ev._id;
      s.subs.set(id, { id, type: ev.agent_type || p.type || 'agente', desc: p.desc || '', running: true, start: Date.now(), act: '' });
      robot.pushLog(`⧉ ${tr('subagente')} ${ev.agent_type || p.type || ''}`); break;
    }
    case 'SubagentStop': {
      const sa = (ev.agent_id && s.subs.get(ev.agent_id)) || [...s.subs.values()].find(x => x.running);
      if (sa) { sa.running = false; sa.end = Date.now(); }
      robot.pushLog(`✓ ${tr('subagente {x} terminó', { x: sa ? sa.type : '' })}`); break;
    }
    case 'PermissionRequest':
      if (ev._auto) {                                           // regla "Permitir siempre": ya contestado
        robot.pushLog(`✓ auto: ${ev.tool_name}`); toast(`✓ ${tr('Permitido automáticamente')} · ${ev._auto}`);
        s.state = 'trabajando'; break;
      }
      s.state = 'permiso';
      perms.push({ id: ev._id, ses: s.id, name: s.name, tool: ev.tool_name, detail: permDetail(ev.tool_name, ev.tool_input),
        peligro: ev._peligro || (window.esPeligroso ? window.esPeligroso(ev.tool_name, ev.tool_input) : ''), t: Date.now() });
      robot.pushLog(`? ${tr('permiso')}: ${ev.tool_name}`);
      speakPerm(perms[perms.length - 1], ev.tool_input || {}); reaccion('duda', 2.4); break;
    case 'Notification':
      robot.pushLog(`! ${String(ev.message || '').slice(0, 40)}`); break;
    case 'Stop':
      s.state = 'listo'; s.act = tr('listo ✓'); s.doneAt = Date.now(); robot.pushLog(`✓ ${s.name}: ${tr('terminado')}`); say(tr('Listo, terminé en {x}', { x: s.name })); reaccion('celebrar', 2.4); break;
    case 'StopFailure':
      s.state = 'error'; s.act = tr('terminó con error'); s.doneAt = Date.now(); robot.pushLog(`✗ ${s.name}: error`); say(tr('Algo falló en {x}', { x: s.name })); reaccion('triste', 3); break;
    case 'SessionEnd':
      robot.pushLog(`■ ${tr('{x} cerrada', { x: s.name })}`); setTimeout(() => { sessions.delete(s.id); render(); }, 3000); break;
  }
  if (!ev._auto) fxEvent(e, ev);
  lastActivity = Date.now();
  render();
}

// ---------- tarjeta de código en vivo (Edit/Write/Bash) ----------
function codeFrom(s, tool, inp) {
  const lines = (t, kind, n) => String(t || '').split('\n').slice(0, n).map(text => ({ kind, text }));
  if (tool === 'Edit') lastCode = { ses: s.name, file: base(inp.file_path), path: inp.file_path, rows: [...lines(inp.old_string, 'del', 4), ...lines(inp.new_string, 'add', 5)] };
  else if (tool === 'MultiEdit') lastCode = { ses: s.name, file: base(inp.file_path), path: inp.file_path, rows: (inp.edits || []).slice(0, 2).flatMap(e => [...lines(e.old_string, 'del', 2), ...lines(e.new_string, 'add', 3)]) };
  else if (tool === 'Write') lastCode = { ses: s.name, file: base(inp.file_path), path: inp.file_path, rows: lines(inp.content, 'add', 8) };
  else if (tool === 'Bash' || tool === 'PowerShell') lastCode = { ses: s.name, file: 'terminal', path: s.name, rows: [{ kind: 'cmd', text: '$ ' + String(inp.command || '').split('\n')[0] }] };
  else return;
  lastCode.t = Date.now(); lastCode.key = Math.random();
}
let codeKey = null;
function renderCode() {
  const el = $('code');
  if (!lastCode || Date.now() - lastCode.t > 60_000) { el.innerHTML = ''; el.className = ''; codeKey = null; return; }
  if (codeKey === lastCode.key) return;                   // no re-animar si no cambió
  codeKey = lastCode.key; el.className = 'code';
  el.innerHTML = `<div class="h"><b>${esc(lastCode.file)}</b><span>${esc(lastCode.ses)}</span></div><pre>${lastCode.rows.map((r, i) =>
    `<span class="l ${r.kind}" style="animation-delay:${i * .07}s">${r.kind === 'del' ? '- ' : r.kind === 'add' ? '+ ' : ''}${esc(r.text)}</span>`).join('')}</pre>`;
}

// ---------- bolitas y sonidos según lo que pasa ----------
function fxTool() { const [x, y] = center(); emit(x, y, 3, COLORS.trabajando, 'float'); sound.play('blip'); }
function fxEvent(e, ev = {}) {
  const [x, y] = center();
  if (e === 'Stop') { emit(x, y, 46, COLORS.listo, 'burst'); sound.play('listo'); }
  else if (e === 'StopFailure' || e === 'PostToolUseFailure') { emit(x, y, 18, COLORS.error, 'burst'); if (e === 'StopFailure') sound.play('error'); }
  else if (e === 'PermissionRequest') { const bad = perms.at(-1)?.peligro; emit(x, y, 18, bad ? COLORS.error : COLORS.permiso, 'ring'); sound.play(bad ? 'alarma' : 'permiso'); }
  else if (e === 'SubagentStart') emit(x, y, 12, ['#b58cff', '#d7b8ff'], 'ring');
  else if (e === 'SessionStart') emit(x, y, 14, COLORS.reposo, 'ring');
}
setInterval(() => {                                       // emisión continua según el estado global
  const [x, y] = center();
  if (lastState === 'trabajando') emit(x + (Math.random() - .5) * 30, y, 1, COLORS.trabajando, 'float');
}, 160);
setInterval(() => { if (lastState === 'permiso') { const [x, y] = center(); emit(x, y, 16, COLORS.permiso, 'ring'); } }, 1100);

function decide(id, behavior) {
  const i = perms.findIndex(p => p.id === id);
  if (i < 0) return;
  const p = perms.splice(i, 1)[0];
  bridge.decide(id, behavior);
  const s = sessions.get(p.ses);
  if (s) { s.state = behavior === 'deny' ? 'reposo' : 'trabajando'; }
  robot.pushLog(behavior === 'deny' ? `✗ ${tr('denegado')}: ${p.tool}` : behavior === 'always' ? `✓ ${tr('siempre')}: ${p.tool}` : `✓ ${tr('permitido')}: ${p.tool}`);
  if (behavior === 'always') toast(tr('✓ Regla guardada: la próxima vez no pregunto ({x})', { x: p.tool }));
  render();
}
bridge.onEvent(onEvent);
if (bridge.onDecided) bridge.onDecided((id, b) => {             // contestado desde Stream Deck / Discord
  const i = perms.findIndex(p => p.id === id);
  if (i >= 0) { const p = perms.splice(i, 1)[0]; robot.pushLog(`${b === 'deny' ? '✗' : '✓'} ${p.tool} (${tr('remoto')})`); render(); }
});
if (bridge.onUsage) bridge.onUsage(u => { usageToday = u; render(); });
// ---------- avisos de Discord (servidores y DMs) ----------
function notif(n) {
  const box = $('notifs'), el = document.createElement('div');
  el.className = `nt ${n.kind}${n.mention ? ' mention' : ''}`;
  el.innerHTML = n.kind === 'dm'
    ? `<div class="w">${ICO.chat} ${esc(n.author)}</div><div class="x">${esc(n.text)}</div>`
    : `<div class="w"># ${esc(n.channel)} · ${esc(n.guild)} — ${esc(n.author)}</div><div class="x">${esc(n.text)}</div>`;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
  const [x, y] = center(); emit(x, y, 8, n.kind === 'dm' ? ['#ff7ad9', '#ffb3ec'] : ['#7289da', '#aab4ff'], 'ring');
  sound.play('blip'); lastActivity = Date.now();
  robot.pushLog(n.kind === 'dm' ? `@${n.author}` : `# ${n.channel}: ${n.author}`);
  if (n.kind === 'dm' || n.mention) say(n.kind === 'dm' ? tr('Mensaje de {x}', { x: n.author }) : tr('{a} te mencionó en {g}', { a: n.author, g: n.guild }));
}
if (bridge.onNotif) bridge.onNotif(notif);

// ---------- cerebro: tarjetas de acción, urgentes, respuestas ----------
const cards = [];
const KIND = { server: '#', dm: ICO.chat, pi: ICO.pi, claude: ICO.bot, mail: '✉', whatsapp: ICO.chat };
function renderCards() {
  $('cards').innerHTML = cards.map(c => `<div class="card ${c.prioridad} ${c.kind}" data-card="${c.id}">
    <div class="h"><span>${KIND[c.kind] || '•'}</span><b>${esc(c.author || '')}</b>${c.guild ? `<span>${esc(c.guild)}${c.channel ? ' #' + esc(c.channel) : ''}</span>` : ''}${c.prioridad === 'urgente' ? `<span class="pill" style="color:var(--bad);border-color:var(--bad)">${tr('urgente')}</span>` : ''}</div>
    <div class="rs">${esc(c.resumen)}</div><div class="tx">${esc(c.text)}</div>
    ${c.respuesta ? `<textarea data-txt="${c.id}">${esc(c.respuesta)}</textarea>` : ''}
    <div class="acts">
      ${c.respuesta && c.canSend ? `<button class="go" data-a="enviar">${ICO.enviar} ${tr(c.kind === 'mail' || c.kind === 'whatsapp' ? 'Responder' : 'Enviar (como bot)')}</button>` : ''}
      ${c.respuesta ? `<button data-a="copiar" title="${tr('Copia la respuesta y abre Discord para que la mandes tú')}">${ICO.copiar} ${tr('Copiar y abrir')}</button>` : `<button data-a="copiar">${ICO.abrir} ${tr('Abrir')}</button>`}
      <button data-a="descartar" title="${tr('Descartar')}">${ICO.x}</button>
      <button data-a="urgente" title="${tr('Esto es importante')}">${ICO.arriba}</button><button data-a="ruido" title="${tr('Esto no me importa')}">${ICO.silenciar}</button>
    </div></div>`).join('');
}
$('cards').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const el = b.closest('[data-card]'), id = +el.dataset.card, ta = el.querySelector('textarea');
  const r = await bridge.cardAction(id, b.dataset.a, ta ? ta.value : undefined);
  toast(r);
  if (['enviar', 'descartar', 'ruido'].includes(b.dataset.a) && !/No pude|Couldn't/i.test(r)) { const i = cards.findIndex(c => c.id === id); if (i >= 0) cards.splice(i, 1); renderCards(); }
});
if (bridge.onCard) bridge.onCard(c => {
  cards.unshift(c); if (cards.length > 8) cards.pop(); renderCards();
  notif({ kind: c.kind === 'server' ? 'server' : 'dm', guild: c.guild || '', channel: c.channel || c.kind, author: c.author || '', text: c.resumen, mention: c.prioridad === 'urgente' });
});
if (bridge.onUrgent) bridge.onUrgent(c => {
  robot.hud(tr('URGENTE'), 4, 'error'); sound.play('permiso');
  say(tr('Urgente: {x}', { x: c.resumen })); abrirUnRato(25_000);
});
if (bridge.onCardDone) bridge.onCardDone(id => { const i = cards.findIndex(c => c.id === id); if (i >= 0) { cards.splice(i, 1); renderCards(); } });
if (bridge.onThinking) bridge.onThinking(v => { if (v) robot.hud(tr('PENSANDO…'), 30, 'trabajando'); else robot.hud('', 0.01, 'reposo'); });
if (bridge.onAnswer) bridge.onAnswer(a => {
  const el = $('answer');
  el.innerHTML = `<b class="t">${esc(tr(a.titulo || 'Respuesta'))}</b>${esc(a.texto || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}`;
  el.classList.add('on'); abrirUnRato(25_000);
  if (a.voz) say(a.voz);
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 90_000);
});
$('answer').addEventListener('click', e => {
  const b = e.target.closest('button[data-upd]');
  if (b) {
    if (b.dataset.upd === 'ahora') { bridge.actualizarAhora(); robot.hud(tr('ACTUALIZANDO…'), 30, 'trabajando'); say(tr('Me actualizo. Vuelvo en un momento.')); }
    else { bridge.actualizarLuego(); toast(tr('Te lo recuerdo mañana. También en la bandeja: Buscar actualizaciones.')); }
  }
  $('answer').classList.remove('on');
});
// hay una versión nueva en GitHub: la isla se abre, lo dice y pregunta
if (bridge.onActualizacion) bridge.onActualizacion(i => {
  const el = $('answer');
  const lista = (i.cambios || []).map(c => '• ' + esc(c)).join('\n');
  el.innerHTML = `<b class="t">⬆ ${tr('Actualización disponible')}</b>${lista || tr('Hay una versión nueva de {x}.', { x: esc(NOMBRE) })}` +
    `<div class="upd"><button data-upd="ahora">${tr('Actualizar ahora')}</button><button data-upd="luego">${tr('Más tarde')}</button></div>`;
  el.classList.add('on'); abrirUnRato(60_000);
  robot.setFps(40); robot.gesto('sorpresa', 1.6, tr('¡NOVEDADES!')); sound.play('permiso');
  say(tr('Hay una actualización disponible. ¿Quieres instalarla?'));
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 120_000);
});

// ---------- hablarle a Claude: texto o voz ----------
async function sendAsk(text, origin = 'isla') {
  text = String(text || '').trim(); if (!text || !bridge.talk) return;
  $('askIn').value = '';
  robot.hud(tr('ENVIANDO…'), 1.5);
  const r = await bridge.talk(text, origin);
  toast(r.msg.replace(/\*\*/g, '').replace(/`/g, ''));
}
$('askGo').addEventListener('click', () => sendAsk($('askIn').value));
$('askIn').addEventListener('keydown', e => { if (e.key === 'Enter') sendAsk($('askIn').value); });
let listening = false;
async function startListen() {
  if (listening || !bridge.listen) return;
  listening = true; $('mic').classList.add('on');
  abrirUnRato(25_000);                                         // abre la isla para que veas lo que entendió
  robot.hud(tr('TE ESCUCHO…'), 9, 'permiso'); sound.play('abrir');
  const r = await bridge.listen();
  listening = false; $('mic').classList.remove('on');
  if (!r.text) { robot.hud(tr('NO TE ENTENDÍ'), 2, 'error'); toast(tr('No entendí nada. Prueba otra vez (Ctrl+Alt+Espacio).')); return; }
  $('askIn').value = r.text;
  if (r.conf >= .6) { say(tr('Entendido: {x}', { x: r.text })); sendAsk(r.text, 'voz'); }
  else toast(tr('¿Esto es lo que dijiste? Revísalo y pulsa Enviar (confianza {n}%)', { n: Math.round(r.conf * 100) }));
}
$('mic').addEventListener('click', startListen);
if (bridge.onListenKey) bridge.onListenKey(startListen);
if (bridge.onSay) bridge.onSay(t => { robot.hud(tr('RESPUESTA'), 4, 'listo'); say(String(t).replace(/[`*#>_]/g, '').slice(0, 400)); });
if (bridge.onPoke) bridge.onPoke(() => { const [x, y] = center(); robot.poke(); sound.play('poke'); emit(x, y, 14, COLORS.listo, 'burst'); lastActivity = Date.now(); render(); });
bridge.onExpired(id => { const i = perms.findIndex(p => p.id === id); if (i >= 0) { perms.splice(i, 1); render(); } });

// ---------- estado global del robot ----------
function globalState() {
  const now = Date.now(), all = [...sessions.values()];
  if (perms.length) return 'permiso';
  if (all.some(s => s.state === 'error' && now - s.doneAt < DONE_MS)) return 'error';
  if (all.some(s => s.state === 'trabajando')) return 'trabajando';
  if (all.some(s => s.state === 'listo' && now - s.doneAt < DONE_MS)) return 'listo';
  return 'reposo';
}

// ---------- render ----------
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M' : n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n);
const ctxMax = u => (/\[1m\]/i.test(u?.model || '') || (u?.ctx || 0) > 200_000) ? 1_000_000 : 200_000;   // >200k => ventana de 1M
let lastState = '';
function render() {
  const now = Date.now();
  for (const s of sessions.values()) {                       // caducar estados "listo/error"
    if ((s.state === 'listo' || s.state === 'error') && now - s.doneAt > DONE_MS) s.state = 'reposo';
    if (now - s.t > 30 * 60_000 && s.state === 'reposo') sessions.delete(s.id);
  }
  let st = globalState();
  if (hovering) lastActivity = now;
  if (st === 'reposo' && now - lastActivity > SLEEP_MS) st = 'dormido';
  if (st !== lastState) {
    if (st === 'dormido') sound.play('bostezo');
    else if (lastState === 'dormido') despertar();
    const bad = st === 'permiso' && perms[0]?.peligro;
    robot.setState(bad ? 'error' : st, st === 'permiso' ? (bad ? `${tr('PELIGRO')}: ${perms[0].tool}` : `${tr('¿PERMISO?')} ${perms[0]?.tool || ''}`) : '');
    if (bridge.robotState) bridge.robotState(st);
    lastState = st;
    ajustarFps();
  }
  const all = [...sessions.values()].sort((a, b) => b.t - a.t);
  const working = all.filter(s => s.state === 'trabajando');
  const subsActive = all.reduce((n, s) => n + [...s.subs.values()].filter(x => x.running).length, 0);
  const maxCtx = all.reduce((m, s) => s.usage ? Math.max(m, s.usage.ctx / ctxMax(s.usage)) : m, 0);

  const titles = { permiso: tr('Claude necesita tu permiso'), trabajando: tr('Trabajando…'), listo: tr('Tarea terminada'), error: tr('Algo falló'), reposo: tr('{x} listo', { x: NOMBRE }) };
  $('t1').textContent = st === 'trabajando' && working.length === 1 ? `${working[0].name}` : titles[st];
  $('t2').textContent = perms[0] ? `${perms[0].tool}: ${perms[0].detail}` : (working[0]?.act || all[0]?.act || tr('esperando a Claude Code…'));
  $('pSes').textContent = `${tr('{n} sesión|{n} sesiones', { n: all.length })}${subsActive ? ` · ${subsActive} ⧉` : ''}`;
  $('h2').textContent = titles[st];
  $('hp').textContent = st === 'trabajando' ? tr('{n} sesión trabajando|{n} sesiones trabajando', { n: working.length }) : perms.length ? tr('{n} permiso esperando|{n} permisos esperando', { n: perms.length }) : tr('No hay nada pendiente.');
  $('kSes').textContent = all.length; $('kSub').textContent = subsActive;
  $('kCtx').textContent = maxCtx ? Math.round(maxCtx * 100) + '%' : '—';
  if (usageToday && usageToday.h5 !== undefined) {
    $('k5h').textContent = fmtK(usageToday.h5) + (usageToday.p5 ? ` · ${Math.round(usageToday.p5 * 100)}%` : '');
    $('kSem').textContent = fmtK(usageToday.week) + (usageToday.pW ? ` · ${Math.round(usageToday.pW * 100)}%` : '');
    $('kpi5h').title = tr(usageToday.p5 ? 'Ventana de 5 h (límite aprendido del plan)' : 'Ventana de 5 h. El % aparece cuando el robot aprenda tu límite (la primera vez que lo alcances) o si lo pones en limites.json');
    $('steps').classList.toggle('pausa', !!usageToday.paused);
  }
  if (usageToday) {                                               // lo nuevo grande; la relectura de caché (cuenta mucho menos) aparte
    $('kHoy').textContent = fmtK(usageToday.nuevo ?? usageToday.tokens);
    $('kHoyCache').textContent = usageToday.cache != null ? tr('+{x} caché', { x: fmtK(usageToday.cache) }) : '';
    $('kpiHoy').title = tr('{m} mensajes · {o} escritos por Claude · {n} nuevos · {c} relectura de caché (total {t})', { m: usageToday.msgs, o: fmtK(usageToday.out), n: fmtK(usageToday.nuevo ?? 0), c: fmtK(usageToday.cache ?? 0), t: fmtK(usageToday.tokens) });
  }

  $('orbs').innerHTML = all.slice(0, 6).map(s => {
    const n = [...s.subs.values()].filter(x => x.running).length;
    return `<span class="orb ${s.state}" title="${esc(s.name)}">${Array.from({ length: Math.min(n, 3) }, (_, i) => `<i class="sat" style="animation-delay:${-i * .53}s"></i>`).join('')}</span>`;
  }).join('');
  badge.className = st;
  badge.innerHTML = st === 'trabajando' ? '<span class="dots"><i></i><i></i><i></i></span>' : { permiso: '!', listo: ICO.ok, error: ICO.x, reposo: '', dormido: 'z' }[st];
  const cur0 = working[0] || all[0];
  $('steps').textContent = cur0 && cur0.steps ? tr('paso {n}', { n: cur0.steps }) : '';
  $('steps').style.display = cur0 && cur0.steps ? '' : 'none';
  renderCode();
  // los botones solo se recrean si cambia la lista: si se rehiciera cada segundo, un clic que cae justo en ese momento se pierde
  const firmaPerms = perms.map(p => `${p.id}:${p.name}:${p.peligro ? 1 : 0}`).join('|');
  if (firmaPerms === $('perms').dataset.firma) {
    for (const p of perms) { const i = $('perms').querySelector(`.perm[data-pid="${p.id}"] .bar i`); if (i) i.style.width = `${Math.max(0, 105 - (now - p.t) / 1000) / 105 * 100}%`; }
  } else $('perms').dataset.firma = firmaPerms, $('perms').innerHTML = perms.map(p => {
    const left = Math.max(0, 105 - (now - p.t) / 1000);
    return `<div class="perm${p.peligro ? ' peligro' : ''}" data-pid="${p.id}"><div class="h"><b>${p.peligro ? ICO.peligro + ` ${tr('PELIGRO')} · ` : ICO.alerta + ' '}${esc(p.tool)}</b><span class="pill">${esc(p.name)}</span></div>
      ${p.peligro ? `<div class="why">${tr('Ojo: {x}. Revísalo bien antes de permitir.', { x: esc(p.peligro) })}</div>` : ''}
      <pre>${esc(p.detail)}</pre>
      <div class="btns"><button class="yes" data-id="${p.id}" data-b="allow">${ICO.ok} ${tr('Permitir')}</button>${p.peligro ? '' : `<button class="always" data-id="${p.id}" data-b="always" title="${tr('No volver a preguntar por esto')}">${ICO.ok} ${tr('Siempre')}</button>`}<button class="no" data-id="${p.id}" data-b="deny">${ICO.x} ${tr('Denegar')}</button></div>
      <div class="bar"><i style="width:${left / 105 * 100}%"></i></div></div>`;
  }).join('');

  if (tSel && !sessions.has(tSel)) { tSel = null; clearInterval(tTimer); $('tchat').classList.remove('on'); }
  // una línea por terminal: primero las que piden permiso o trabajan; los subagentes y el contexto, en el tooltip
  const ORDEN = { permiso: 0, trabajando: 1, error: 2, listo: 3, reposo: 4 };
  const filas = [...all].sort((a, b) => (ORDEN[a.state] ?? 5) - (ORDEN[b.state] ?? 5) || b.t - a.t);
  $('tCnt').textContent = all.length;
  $('sesT').textContent = all.length ? `${tr('Terminales')} · ${all.length}${working.length ? ` · ${tr('{n} trabajando', { n: working.length })}` : ''}` : tr('Terminales');
  $('sessions').classList.toggle('largo', filas.length > 4);
  $('sessions').innerHTML = filas.length ? filas.map(s => {
    const subs = [...s.subs.values()].filter(x => x.running);
    const pct = s.usage ? Math.min(100, s.usage.ctx / ctxMax(s.usage) * 100) : 0;
    const color = pct > 85 ? 'var(--bad)' : pct > 65 ? 'var(--warn)' : 'var(--ok)';
    const tip = [`${s.name}`, s.act || '', s.usage ? tr('contexto: {x} tokens ({p}%)', { x: fmtK(s.usage.ctx), p: Math.round(pct) }) : '',
      ...subs.map(x => `⧉ ${x.type}: ${x.act || x.desc}`), tr('Clic: chatear con ella aquí · flecha: ir a su ventana')].filter(Boolean).join('\n');
    return `<div class="ses s-${s.state}${s.id === tSel ? ' sel' : ''}" data-sid="${esc(s.id)}" title="${esc(tip)}"><span class="dot ${s.state}"></span>
      <span class="name">${esc(s.name)}</span><span class="act">${esc(s.act || '—')}</span>
      ${subs.length ? `<span class="sa"><span class="spin"></span>${subs.length}</span>` : ''}
      ${s.usage ? `<span class="anillo" style="--p:${pct.toFixed(0)};--c:${color}"></span>` : ''}<span class="go">${ICO.abrir}</span></div>`;
  }).join('') : `<div class="empty">${tr('Sin sesiones de Claude Code todavía.')}</div>`;
  setOpen(hovering || perms.length > 0);
}
async function irATerminal(sid) {
  if (!bridge.focusTerminal) return;
  const ok = await bridge.focusTerminal(sid);
  if (!ok) toast(tr('No encontré la ventana de esa terminal todavía (se detecta con el siguiente evento de la sesión).'));
}
$('sessions').addEventListener('click', e => {
  const el = e.target.closest('.ses[data-sid]'); if (!el) return;
  if (e.target.closest('.go')) return irATerminal(el.dataset.sid);
  el.dataset.sid === tSel ? cerrarChat() : abrirChat(el.dataset.sid);
});

// ---------- chat con una terminal, dentro de la isla (lee su historial y le escribe en su ventana) ----------
function abrirChat(sid) {
  tSel = sid; tFirma = ''; $('tmsgs').innerHTML = `<div class="empty">${tr('Cargando…')}</div>`;
  $('tchat').classList.add('on'); cargarChat();
  clearInterval(tTimer); tTimer = setInterval(() => { if (open) cargarChat(); }, 2500);
  render(); setTimeout(() => $('tinT').focus(), 50);
}
function cerrarChat() { tSel = null; clearInterval(tTimer); $('tchat').classList.remove('on'); render(); }
async function cargarChat() {
  const sid = tSel; if (!sid) return;
  const s = sessions.get(sid);
  $('tN').textContent = s ? s.name : 'Terminal'; $('tSt').textContent = s ? (s.act || s.state) : '';
  if (sid.startsWith('nucleo:') || !bridge.sesChat) { $('tmsgs').innerHTML = `<div class="empty">${tr('Esta conversación es del núcleo: ábrela en el panel de control.')}</div>`; return; }
  const r = await bridge.sesChat(sid);
  if (sid !== tSel) return;
  const firma = JSON.stringify(r); if (firma === tFirma) return;
  const primera = !tFirma; tFirma = firma;
  const box = $('tmsgs'), abajo = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = !r.ok ? `<div class="empty">${esc(tr(r.msg))}</div>`
    : (r.mensajes.length ? r.mensajes.map(m => `<div class="tm ${m.rol}">${esc(m.texto)}</div>`).join('') : `<div class="empty">${tr('Sin mensajes todavía.')}</div>`)
      + (r.busy ? `<div class="tm herr">${tr('trabajando…')}</div>` : '') + (r.cola ? `<div class="tm herr">${tr('{n} en cola', { n: r.cola })}</div>` : '');
  if (primera || abajo) box.scrollTop = box.scrollHeight;
}
async function enviarChat() {
  const t = $('tinT').value.trim(); if (!t || !tSel || !bridge.sesSend) return;
  $('tinT').value = '';
  const r = await bridge.sesSend(tSel, t);
  if (!r.ok) { toast(r.msg); $('tinT').value = t; return; }
  if (r.msg !== 'Enviado.' && r.msg !== 'Sent.') toast(tr(r.msg));
  $('tmsgs').insertAdjacentHTML('beforeend', `<div class="tm yo">${esc(t)}</div>`); $('tmsgs').scrollTop = $('tmsgs').scrollHeight;
  setTimeout(cargarChat, 1500);
}
$('tinT').addEventListener('keydown', e => { if (e.key === 'Enter') enviarChat(); });
$('tGo').addEventListener('click', enviarChat);
$('tX').addEventListener('click', cerrarChat);
$('tIr').addEventListener('click', () => tSel && irATerminal(tSel));
// interruptor: muestra u oculta la columna de terminales (se recuerda)
let termOn = false;
try { termOn = localStorage.getItem('robot-terminales') === '1'; } catch { }
function setTerm(v) {
  termOn = v; island.classList.toggle('term', v); $('tTog').classList.toggle('on', v);
  try { localStorage.setItem('robot-terminales', v ? '1' : '0'); } catch { }
  if (!v && tSel) cerrarChat();
}
$('tIco').innerHTML = ICO.terminal; setTerm(termOn);
$('tTog').addEventListener('click', () => { setTerm(!termOn); sound.play('blip'); });
$('tGo').innerHTML = ICO.enviar; $('tX').innerHTML = ICO.x; $('tIr').innerHTML = ICO.abrir;
$('perms').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) decide(+b.dataset.id, b.dataset.b); });
setInterval(render, 1000);

// ---------- abrir/cerrar y clics a través de la ventana ----------
let hovering = false, open = false, leaveTimer = null, cursorDentro = false, cerrarTras = 10_000;
let lastActivity = Date.now(), usageToday = null;
const SLEEP_MS = 3 * 60_000;                               // se duerme tras 3 min sin actividad
function setOpen(v) {
  if (v === open) return;
  open = v; island.classList.toggle('open', v);
  (v ? $('big') : $('mini')).appendChild(rwrap);
  if (v) sound.play('abrir');
  ajustarFps();
}
// FPS según lo que pasa: abierta 60; cerrada 24 si hay acción, 15 en reposo, 6 dormido (los gestos suben a 40 mientras duran).
// Cada fotograma de una ventana transparente en Windows cuesta CPU en el proceso de GPU de Electron (~30 ms de CPU por fotograma, medido 2026-10-01): menos FPS = menos gasto
function ajustarFps() {
  robot.setFps(open ? 60 : lastState === 'dormido' ? 6 : lastState === 'reposo' ? 15 : 24);
}
// abierta por algo que no es el ratón (respuesta, urgente, voz): se cierra sola aunque no muevas el ratón
function abrirUnRato(ms) { hovering = true; cerrarTras = ms; render(); }
function programarCierre() {
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { leaveTimer = null; if (!cursorDentro) { hovering = false; cerrarTras = 10_000; render(); } }, cerrarTras);   // margen antes de cerrar
}
setInterval(() => { if (hovering && !cursorDentro && !leaveTimer && bridge.onCursor) { bridge.interactive(false); programarCierre(); } }, 1000);
island.addEventListener('mouseenter', () => { hovering = true; bridge.interactive(true); render(); });
island.addEventListener('mouseleave', () => { if (!bridge.onCursor) { hovering = false; setTimeout(render, 1200); } });   // en Electron lo decide el cursor global

// ---------- voz (Windows) ----------
let voiceOn = true;
try { voiceOn = localStorage.getItem('robot-voz') !== '0'; } catch { }
let vozAudio = null, vozTurno = 0;
function say(text) {
  if (!voiceOn) return;
  const turno = ++vozTurno;
  try { speechSynthesis.cancel(); } catch { }
  if (vozAudio) { vozAudio.pause(); vozAudio = null; }
  if (!bridge.tts) return sayWin(text);
  bridge.tts(text).then(f => {                               // voz neural (Álvaro); si falla, la de Windows
    if (turno !== vozTurno) return;                          // ya se pidió otra frase
    if (!f) return sayWin(text);
    vozAudio = new Audio('file:///' + f.replace(/\\/g, '/'));
    vozAudio.play().catch(() => sayWin(text));
  }).catch(() => sayWin(text));
}
function sayWin(text) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  const l = (window.I18N?.idioma() || 'es');                   // la voz de Windows del idioma elegido
  const v = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(l));
  if (v) u.voice = v;
  u.lang = v ? v.lang : (l === 'es' ? 'es-ES' : 'en-US'); u.rate = 1.05; u.pitch = 1.15;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function speakPerm(p, inp) {
  const que = { Bash: tr('ejecutar un comando'), PowerShell: tr('ejecutar un comando'), Edit: tr('editar {x}', { x: base(inp.file_path) }), Write: tr('crear {x}', { x: base(inp.file_path) }), WebFetch: tr('entrar a una web') }[p.tool] || tr('usar {x}', { x: p.tool });
  say(p.peligro ? tr('Cuidado. Claude quiere hacer algo peligroso: {x}', { x: p.peligro }) : tr('Necesito tu permiso para {x}', { x: que }));
}
$('voz').style.opacity = voiceOn ? 1 : .45;
$('voz').addEventListener('click', () => { voiceOn = !voiceOn; try { localStorage.setItem('robot-voz', voiceOn ? '1' : '0'); } catch { } $('voz').style.opacity = voiceOn ? 1 : .45; if (voiceOn) say(tr('Voz activada')); });
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4500); }

$('voz').innerHTML = ICO.voz; $('mic').innerHTML = ICO.mic; $('askGo').innerHTML = ICO.enviar;
$('snd').innerHTML = sound.muted ? ICO.mudo : ICO.sonido;
$('snd').addEventListener('click', () => { $('snd').innerHTML = sound.toggle() ? ICO.mudo : ICO.sonido; });
// FASE 9 · kill switch: STOP = pánico global; mientras dure, el botón dice REANUDAR y la cabecera lo avisa
let panicoOn = false;
const pintarPanico = s => { panicoOn = !!(s && s.activo); const b = $('panic'); if (!b) return; b.textContent = panicoOn ? 'REANUDAR' : 'STOP'; b.style.color = panicoOn ? '#4dff88' : '#ff4d4d'; if (panicoOn) $('h2').textContent = '🛑 PÁNICO — todo parado'; };
if (window.bridge && bridge.onPanico) { bridge.onPanico(pintarPanico); bridge.panicoEstado().then(pintarPanico).catch(() => { }); }
$('panic') && $('panic').addEventListener('click', () => { if (!window.bridge || !bridge.panico) return; if (panicoOn || confirm('¿Parar TODO? (turnos, control del PC, tareas, permisos)')) bridge.panico(!panicoOn); });
setTimeout(() => {                                        // saludo al arrancar
  robot.greet(tr('¡HOLA! 👋')); sound.play('hola'); say(tr('Hola, estoy listo'));
  const [x, y] = center(); emit(x, y, 36, COLORS.listo, 'burst'); emit(0, 0, 40, ['#ffffff', '#7fe3ff', '#b58cff'], 'star');
  island.classList.remove('intro');
}, 900);

// ---------- demo (bandeja > "Evento de prueba", o navegador sin Electron) ----------
function demo() {
  const sid = 'demo-' + Math.random().toString(36).slice(2, 6), cwd = 'D:/RobotCompanion';
  const E = (hook_event_name, extra = {}, _usage) => onEvent({ hook_event_name, session_id: sid, cwd, _id: Math.random() * 1e9 | 0, _usage, ...extra });
  const seq = [
    [0, () => E('SessionStart')],
    [400, () => E('UserPromptSubmit', { prompt: 'arregla los tests del hook' })],
    [900, () => E('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'PermissionRequest' } }, { ctx: 48210, model: 'claude-opus-5-5' })],
    [1700, () => E('PreToolUse', { tool_name: 'Task', tool_input: { subagent_type: 'Explore', description: 'buscar hooks en el código' } })],
    [1900, () => E('SubagentStart', { agent_id: 'a1', agent_type: 'Explore' })],
    [2600, () => E('PreToolUse', { agent_id: 'a1', tool_name: 'Read', tool_input: { file_path: 'D:/RobotCompanion/main.js' } })],
    [3400, () => E('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'D:/RobotCompanion/hook/hook.js', old_string: 'const FIRE_BUDGET_MS = 1_500;', new_string: 'const FIRE_BUDGET_MS = 2_000;   // más margen\nconst RETRIES = 2;' } }, { ctx: 61800, model: 'claude-opus-5-5' })],
    [4200, () => E('SubagentStop', { agent_id: 'a1' })],
    [4800, () => E('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test -- --runInBand' } })],
    [5600, () => notif({ kind: 'server', guild: 'BOT CENTRAL', channel: 'general', author: 'dmnshop', text: 'probando los avisos del robot 🤖' })],
    [6400, () => notif({ kind: 'dm', author: 'Amigo', text: '¿ya terminaste el robot?' })],
  ];
  seq.forEach(([t, f]) => setTimeout(f, t));
}
bridge.onDemo(demo);


if (bridge.onNombre) bridge.onNombre(n => { NOMBRE = n || 'Robot'; document.title = NOMBRE; render(); });
// idioma elegido en el panel (config del núcleo) o el del sistema: lo manda main al cargar y cuando cambia
if (bridge.onIdioma) bridge.onIdioma(l => {
  if (!window.I18N || !l) return;
  window.I18N.poner(l); try { localStorage.setItem('robot-idioma', l); } catch { }
  window.I18N.estaticos(); lastState = ''; renderCards(); render();
});
if (bridge.onMudanza) bridge.onMudanza(dir => {                 // juego a pantalla completa: se va rodando a otro monitor
  robot.setFps(60); robot.rodar(dir); sound.play('blip');
  const [x, y] = center(); emit(x, y, 14, COLORS.trabajando, 'burst');
  setTimeout(ajustarFps, 1500);
});
if (bridge.onCursor) bridge.onCursor(p => {            // cursor en toda la pantalla
  robot.lookAtClient(p.x, p.y);
  cercania(p);
  // hover fiable: el mouseleave no llega si el cursor salta fuera de la ventana
  const r = island.getBoundingClientRect(), inside = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  cursorDentro = inside;
  if (inside) {
    clearTimeout(leaveTimer); leaveTimer = null;
    if (!hovering) { hovering = true; bridge.interactive(true); render(); }
  } else if (hovering && !leaveTimer) {
    bridge.interactive(false);
    programarCierre();
  }
});

function makeStubBridge() {
  const h = {};
  setTimeout(() => { demo(); hovering = true; render(); }, 300);   // en el navegador abre y lanza la demo
  window.islaDemo = demo;                                          // pruebas en navegador: más sesiones de ejemplo
  return {
    onEvent: f => (h.ev = f), onExpired: f => (h.ex = f), onDemo: f => (h.demo = f),
    decide: (id, b) => console.log('decisión', id, b), interactive: () => {},
  };
}
