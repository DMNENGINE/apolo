// "Hablarle al robot": lleva un mensaje (de Discord, de la isla o por voz) a Claude Code.
//  - Hay sesión libre  -> lo escribe en su terminal (portapapeles + Enter).
//  - Está ocupada      -> lo encola y lo manda cuando termine (evento Stop).
//  - No hay ninguna    -> abre una sesión nueva en Windows Terminal: claude "<mensaje>".
//  Cuando Claude termina, devuelve su respuesta a donde se pidió (DM de Discord o voz del robot).
// Prefijo opcional de proyecto: "en RobotCompanion: ..." o "@RobotCompanion ...".
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const GENERIC = /^(system32|windows|users?|desktop|escritorio|documents|documentos|downloads|descargas|home|[a-z]:)$/i;
const USUARIO = (() => { try { return os.userInfo().username.toLowerCase(); } catch { return ''; } })();
const norm = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function createTalk({ dataDir, getHwnd, send, reply, onStop }) {
  const projFile = path.join(dataDir, 'proyectos.json');
  let cfg = { defaultDir: os.homedir().replace(/\\/g, '/'), proyectos: {} };   // los proyectos se aprenden solos
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(projFile, 'utf8')) }; } catch { fs.writeFileSync(projFile, JSON.stringify(cfg, null, 2)); }
  const saveCfg = () => fs.writeFileSync(projFile, JSON.stringify(cfg, null, 2));

  const sessions = new Map();          // sid -> { sid, cwd, busy, last, transcript, origin, queue }
  const pendingNew = [];               // sesiones que abrimos y aún no han dado SessionStart
  const name = s => path.basename(s.cwd || '') || 'sesión';

  function lastPrompt(transcript) {                 // último mensaje escrito por el usuario
    try {
      const st = fs.statSync(transcript), len = Math.min(st.size, 512 * 1024);
      const fd = fs.openSync(transcript, 'r'), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
      for (const l of buf.toString('utf8').split('\n').reverse()) {
        if (!l.includes('"user"')) continue;
        try {
          const j = JSON.parse(l); if (j.type !== 'user') continue;
          const c = j.message?.content;
          const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : '';
          if (t && !t.startsWith('<')) return t.slice(0, 400);
        } catch { }
      }
    } catch { }
    return '';
  }
  function lastReply(transcript) {
    try {
      const st = fs.statSync(transcript), len = Math.min(st.size, 512 * 1024);
      const fd = fs.openSync(transcript, 'r'), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
      for (const l of buf.toString('utf8').split('\n').reverse()) {
        if (!l.includes('"assistant"')) continue;
        try {
          const j = JSON.parse(l);
          if (j.type !== 'assistant' || !Array.isArray(j.message?.content)) continue;
          const t = j.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
          if (t) return t;
        } catch { }
      }
    } catch { }
    return '';
  }

  function typeInto(hwnd, text) {
    return new Promise(ok => {
      const f = path.join(os.tmpdir(), `robot-msg-${Date.now()}.txt`);
      fs.writeFileSync(f, text, 'utf8');
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', require('./core/rutas').fuera(path.join(__dirname, 'tools', 'escribir.ps1')), '-Hwnd', String(hwnd), '-File', f],
        { windowsHide: true, timeout: 10000 }, (err, out) => { try { fs.unlinkSync(f); } catch { } ok(!err && String(out).includes('OK')); });
    });
  }

  function openNew(dir, text, origin) {
    // wt usa ";" para separar comandos: lo cambiamos para que no rompa el mensaje
    const safe = text.replace(/;/g, ',').replace(/"/g, "'");
    execFile('wt.exe', ['-w', 'new', '-d', dir, 'claude', ...(safe ? [safe] : [])], { windowsHide: false }, () => { });
    pendingNew.push({ dir: norm(dir), origin, t: Date.now() });
  }

  async function deliver(s, item) {
    const hwnd = getHwnd(s.sid);
    if (!hwnd) return false;
    const ok = await typeInto(hwnd, item.text);
    if (ok) { s.origin = item.origin; s.busy = true; }
    return ok;
  }

  // ---------- entrada: un mensaje para Claude ----------
  async function talk(raw, origin) {
    let text = String(raw || '').trim();
    if (!text) return { ok: false, msg: 'Mensaje vacío.' };
    // orden para el robot: "nueva sesión [en Proyecto]: <mensaje>" -> siempre abre una sesión nueva
    const ns = text.match(/^(?:crea(?:r)?|abre|abrir|inicia(?:r)?|empieza|empezar|haz|nueva)\s+(?:una\s+)?(?:nueva\s+)?(?:sesi[oó]n|conversaci[oó]n|terminal)(?:\s+de\s+claude)?(?:\s+(?:en|para)\s+(?:el\s+proyecto\s+)?([\w\-.]{2,40}))?\s*[:,.]?\s*(?:y\s+|para\s+que\s+|que\s+)?(.*)$/is)
            || text.match(/^nueva\s+sesi[oó]n(?:\s+en\s+([\w\-.]{2,40}))?\s*[:,.]?\s*(.*)$/is);
    if (ns) {
      const key = ns[1] && Object.keys(cfg.proyectos).find(k => k.toLowerCase() === ns[1].toLowerCase());
      if (ns[1] && !key) return { ok: false, msg: `No conozco el proyecto "${ns[1]}". Proyectos: ${Object.keys(cfg.proyectos).join(', ')}` };
      const d = key ? cfg.proyectos[key] : cfg.defaultDir;
      openNew(d, ns[2].trim(), origin);
      return { ok: true, msg: `🚀 Abrí una sesión nueva en \`${d}\`${ns[2].trim() ? ' con tu pedido' : ''}.` };
    }
    let proj = null;
    const m = text.match(/^(?:en|@)\s*([\w\-. ]{2,40}?)\s*[:,]\s*(.+)$/is) || text.match(/^@([\w\-.]{2,40})\s+(.+)$/is);
    if (m) { proj = m[1].trim(); text = m[2].trim(); }

    const all = [...sessions.values()].filter(s => Date.now() - s.last < 6 * 3600_000).sort((a, b) => b.last - a.last);
    let target = null, dir = null;
    if (proj) {
      const key = Object.keys(cfg.proyectos).find(k => k.toLowerCase() === proj.toLowerCase());
      dir = key ? cfg.proyectos[key] : null;
      target = all.find(s => path.basename(s.cwd || '').toLowerCase() === proj.toLowerCase() || (dir && norm(s.cwd) === norm(dir)));
      if (!target && !dir) return { ok: false, msg: `No conozco el proyecto "${proj}". Proyectos: ${Object.keys(cfg.proyectos).join(', ')}` };
    } else {
      target = all.find(s => !s.busy && getHwnd(s.sid)) || all.find(s => getHwnd(s.sid));
    }

    if (target && getHwnd(target.sid)) {
      if (target.busy) {
        target.queue.push({ text, origin });
        return { ok: true, msg: `⏳ **${name(target)}** está trabajando; se lo paso en cuanto termine.` };
      }
      if (await deliver(target, { text, origin })) return { ok: true, msg: `📨 Enviado a **${name(target)}**.` };
      // no se pudo escribir en su ventana: abrimos una nueva en la misma carpeta
      dir = target.cwd;
    }
    dir = dir || cfg.defaultDir;
    openNew(dir, text, origin);
    return { ok: true, msg: `🚀 No había sesión libre: abrí una **nueva** en \`${dir}\`.` };
  }

  // ---------- eventos del hook ----------
  function onEvent(ev) {
    const sid = ev.session_id; if (!sid) return;
    let s = sessions.get(sid);
    if (!s) sessions.set(sid, s = { sid, cwd: ev.cwd, busy: false, last: Date.now(), transcript: null, origin: null, queue: [] });
    s.last = Date.now(); if (ev.cwd) s.cwd = ev.cwd; if (ev.transcript_path) s.transcript = ev.transcript_path;
    const e = ev.hook_event_name;
    if (e === 'SessionStart') {
      const i = pendingNew.findIndex(p => p.dir === norm(ev.cwd) && Date.now() - p.t < 120_000);
      if (i >= 0) { s.origin = pendingNew[i].origin; pendingNew.splice(i, 1); }
      const b = path.basename(ev.cwd || '');
      if (b && !GENERIC.test(b) && b.toLowerCase() !== USUARIO && !cfg.proyectos[b]) { cfg.proyectos[b] = String(ev.cwd).replace(/\\/g, '/'); saveCfg(); }   // aprende proyectos
    }
    if (e === 'UserPromptSubmit' || e === 'PreToolUse') s.busy = true;
    if (e === 'Stop' || e === 'StopFailure') {
      s.busy = false;
      if (onStop) onStop(name(s), (s.transcript && lastReply(s.transcript)) || '', e === 'StopFailure');
      if (s.origin) {
        const txt = (s.transcript && lastReply(s.transcript)) || (e === 'StopFailure' ? 'Terminó con error.' : 'Listo.');
        reply(s.origin, `**${name(s)}** ${e === 'StopFailure' ? '❌' : '✅'}\n${txt}`, txt);
        s.origin = null;
      }
      const next = s.queue.shift();
      if (next) setTimeout(() => deliver(s, next).then(ok => { if (!ok) s.queue.unshift(next); }), 1500);
    }
    if (e === 'SessionEnd') sessions.delete(sid);
  }

  function summary() {
    const all = [...sessions.values()].sort((a, b) => b.last - a.last);
    if (!all.length) return 'No hay sesiones abiertas. Si me pides algo, abro una nueva.';
    return all.map(s => `${s.busy ? '🔵 trabajando' : '🟢 libre'} · **${name(s)}**${s.queue.length ? ` (${s.queue.length} en cola)` : ''}`).join('\n')
      + `\n\nProyectos que conozco: ${Object.keys(cfg.proyectos).join(', ')}`;
  }

  function recent() {                               // para el cerebro: en qué estaba cada sesión (24 h)
    return [...sessions.values()].filter(s => Date.now() - s.last < 86400_000 && s.transcript)
      .map(s => ({ name: name(s), lastPrompt: lastPrompt(s.transcript), last: lastReply(s.transcript) }));
  }
  // ---------- chat de la isla con UNA terminal concreta ----------
  function conversacion(sid, max = 14) {
    const s = sessions.get(sid);
    if (!s || !s.transcript) return { ok: false, msg: 'Aún no tengo el historial de esta terminal (llega con su próximo evento).' };
    const out = [];
    try {
      const st = fs.statSync(s.transcript), len = Math.min(st.size, 512 * 1024);
      const fd = fs.openSync(s.transcript, 'r'), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
      for (const l of buf.toString('utf8').split('\n')) {
        if (!l.includes('"message"')) continue;
        try {
          const j = JSON.parse(l), c = j.message && j.message.content;
          if (j.isMeta || j.isSidechain) continue;
          if (j.type === 'user') {
            const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : '';
            if (t && !t.trim().startsWith('<')) out.push({ rol: 'yo', texto: t.trim().slice(0, 1500) });
          } else if (j.type === 'assistant' && Array.isArray(c)) {
            for (const x of c) {
              if (x.type === 'text' && x.text.trim()) out.push({ rol: 'claude', texto: x.text.trim().slice(0, 1500) });
              else if (x.type === 'tool_use') {
                const i = x.input || {}, det = i.command || i.file_path || i.pattern || i.description || i.url || '';
                out.push({ rol: 'herr', texto: `${x.name}${det ? ' · ' + String(det).replace(/\s+/g, ' ').slice(0, 90) : ''}` });
              }
            }
          }
        } catch { }
      }
    } catch { }
    return { ok: true, nombre: name(s), busy: s.busy, cola: s.queue.length, puedeEscribir: !!getHwnd(sid), mensajes: out.slice(-max) };
  }
  async function talkTo(sid, raw, origin) {
    const s = sessions.get(sid), text = String(raw || '').trim();
    if (!text) return { ok: false, msg: 'Mensaje vacío.' };
    if (!s || !getHwnd(sid)) return { ok: false, msg: 'No encuentro la ventana de esa terminal todavía.' };
    if (s.busy) { s.queue.push({ text, origin }); return { ok: true, msg: 'Está trabajando: se lo paso en cuanto termine.' }; }
    return await deliver(s, { text, origin }) ? { ok: true, msg: 'Enviado.' } : { ok: false, msg: 'No pude escribir en su ventana.' };
  }
  return { talk, onEvent, summary, recent, conversacion, talkTo };
}

module.exports = { createTalk };
