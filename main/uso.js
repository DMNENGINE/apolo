// Uso del plan de Claude: tokens de hoy y ventanas de 5 h / 7 días leyendo los transcripts de ~/.claude/projects,
// y el contexto del último mensaje de una sesión. Si Claude Code avisa de límite, ese consumo se toma como el límite real.
const fs = require('fs');
const path = require('path');

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

// avisar(texto, tono) → móvil; alUso(datos) → isla; cerebro() → el cerebro (se pausa cerca del límite)
function crearUso({ claudeDir, dirDatos, avisar, alUso, cerebro }) {
  const usage = { day: '', tokens: 0, nuevo: 0, cache: 0, out: 0, msgs: 0, offsets: new Map(), seen: new Set(), ev: [], hits: [] };
  const LIMITS = () => path.join(dirDatos(), 'limites.json');
  let limits = null;
  const loadLimits = () => { try { limits = JSON.parse(fs.readFileSync(LIMITS(), 'utf8')); } catch { limits = { ventana5h: null, semanal: null, avisarAl: 0.8, pausarAl: 0.92 }; fs.writeFileSync(LIMITS(), JSON.stringify(limits, null, 2)); } };
  function scanUsage() {
    const today = new Date().toDateString();
    if (!limits) loadLimits();
    if (usage.day !== today) Object.assign(usage, { day: today, tokens: 0, nuevo: 0, cache: 0, out: 0, msgs: 0 });
    const root = path.join(claudeDir, 'projects');
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
      if (at > 0) { limits.ventana5h = at; fs.writeFileSync(LIMITS(), JSON.stringify(limits, null, 2)); avisar(`⛔ Llegaste al límite de la ventana de 5 h del plan (~${Math.round(at / 1e6)}M tokens). Lo apunto para avisarte antes la próxima vez.`, 'red'); }
    }
    const p5 = limits.ventana5h ? h5 / limits.ventana5h : 0, pW = limits.semanal ? week / limits.semanal : 0;
    const near = Math.max(p5, pW);
    const cb = cerebro();
    if (cb) cb.setPaused(near >= limits.pausarAl);
    if (near >= limits.avisarAl && !usage.warned) { usage.warned = true; avisar(`⚠️ Llevas el ${Math.round(near * 100)}% del límite del plan (${p5 >= pW ? 'ventana de 5 h' : 'semana'}). El cerebro del robot se pausa al ${Math.round(limits.pausarAl * 100)}%.`, 'amber'); }
    if (near < limits.avisarAl * 0.8) usage.warned = false;
    alUso({ tokens: usage.tokens, nuevo: usage.nuevo, cache: usage.cache, out: usage.out, msgs: usage.msgs, h5, week, p5, pW, paused: cb ? cb.paused : false });
  }
  return { scanUsage };
}

module.exports = { readContext, crearUso };
