// Cerebro del robot: usa Claude Code con TU PLAN (claude -p, sin API de pago) para:
//  1) Tarjetas de acción: resume cada aviso y prepara una respuesta (Enviar / Copiar / Descartar).
//  2) Prioridad inteligente (urgente / normal / ruido) que aprende de tus correcciones.
//  3) Resumen diario.   5) "¿Dónde me quedé?".   6) Preguntas sobre tu historial.   7) Reglas en lenguaje normal.
//  (4, límites del plan, lo calcula main.js y llama a setPaused cuando te acercas al límite.)
// Todo se guarda en local: %APPDATA%\robot-companion\cerebro\
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DAY = 86400_000;
const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function createCerebro({ dataDir, onCard, onAnswer, notifyUrgent, getSessions, nucleo }) {
  const dir = path.join(dataDir, 'cerebro'); fs.mkdirSync(dir, { recursive: true });
  const work = path.join(dir, 'trabajo'); fs.mkdirSync(work, { recursive: true });   // carpeta vacía para claude -p
  const F = n => path.join(dir, n);
  const readJ = (n, d) => { try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch { return d; } };
  const writeJ = (n, v) => fs.writeFileSync(F(n), JSON.stringify(v, null, 2));
  let cfg = readJ('config.json', null);
  if (!cfg) writeJ('config.json', cfg = { resumenHora: 8, modelo: 'haiku', modeloResumen: 'haiku', ultimoResumen: '' });
  let ejemplos = readJ('aprendizaje.json', []);     // correcciones de prioridad
  let reglas = readJ('reglas_auto.json', []);
  const firings = [];
  let paused = false;

  // ---------- historial (jsonl, 30 días) ----------
  const histFile = F('historial.jsonl');
  let hist = [];
  try { hist = fs.readFileSync(histFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => Date.now() - e.t < 30 * DAY); } catch { }
  fs.writeFileSync(histFile, hist.map(e => JSON.stringify(e)).join('\n') + (hist.length ? '\n' : ''));
  function record(e) { e.t = e.t || Date.now(); hist.push(e); fs.appendFileSync(histFile, JSON.stringify(e) + '\n'); return e; }

  // ---------- llamada a Claude Code (plan del usuario) ----------
  let busy = Promise.resolve();
  const usaPlan = m => !String(m).includes('/') || String(m).startsWith('claudecode/');     // gasta del plan de Claude
  function llm({ prompt, schema, system, model }) {
    const m = model || cfg.modelo;
    if (nucleo && String(m).includes('/')) {                      // cualquier modelo vía el núcleo
      if (paused && usaPlan(m)) return Promise.resolve(null);
      const run = () => nucleo.generarJSON({ modelo: m, prompt, schema, system: system || 'Eres el cerebro de un robot asistente de escritorio. Respondes en español, breve y claro.' })
        .then(r => r.datos).catch(e => { console.error('[cerebro]', m, e.message); return null; });
      const p = busy.then(run); busy = p.catch(() => { }); return p;
    }
    const run = () => new Promise(ok => {
      const args = ['-p', prompt, '--model', model || cfg.modelo, '--output-format', 'json', '--no-session-persistence',
        '--tools', '', '--setting-sources', '', '--strict-mcp-config',
        '--system-prompt', system || 'Eres el cerebro de un robot asistente de escritorio. Respondes en español, breve y claro.'];
      if (schema) args.push('--json-schema', JSON.stringify(schema));
      execFile('claude', args, { cwd: work, timeout: 120_000, maxBuffer: 8 << 20, windowsHide: true, shell: false, env: { ...process.env, ROBOT_INTERNAL: '1' } },
        (err, out) => {
          try { const j = JSON.parse(out); ok(j.structured_output ?? j.result ?? null); }
          catch { console.error('[cerebro] llm', err ? err.message : 'salida no válida'); ok(null); }
        });
    });
    const p = busy.then(run); busy = p.catch(() => { }); return p;        // de una en una
  }

  // ---------- 7) reglas automáticas ----------
  function horaEn(rango) {                       // "1-7" -> true si la hora actual está en el rango
    const m = String(rango || '').match(/^(\d{1,2})\s*-\s*(\d{1,2})$/); if (!m) return true;
    const h = new Date().getHours(), a = +m[1], b = +m[2];
    return a <= b ? h >= a && h < b : h >= a || h < b;
  }
  function matchRule(r, it) {
    const c = r.cuando || {};
    if (c.tipo && c.tipo !== it.kind) return false;
    if (c.servidor && !strip(it.guild).includes(strip(c.servidor))) return false;
    if (c.canal && !strip(it.channel).includes(strip(c.canal))) return false;
    if (c.autor && !strip(it.author).includes(strip(c.autor))) return false;
    if (c.contiene && !strip(it.text).includes(strip(c.contiene))) return false;
    if (c.horas && !horaEn(c.horas)) return false;
    return true;
  }
  async function addRule(texto) {
    const r = await llm({
      prompt: `Convierte esta regla del usuario en JSON. Tipos de aviso: server (mensaje de un servidor de Discord), dm (mensaje privado), pi (alerta de la Raspberry Pi), claude (sesión de Claude Code). Acciones: urgente, normal, ruido (guardar en silencio), voz (que el robot lo diga en voz alta), dm (mandarlo al móvil por Discord), silenciar (ni guardar). "horas" es un rango "H-H" en 24h si la regla tiene horario.\nRegla: "${texto}"`,
      schema: { type: 'object', properties: { descripcion: { type: 'string' }, cuando: { type: 'object', properties: { tipo: { type: 'string', enum: ['server', 'dm', 'pi', 'claude'] }, servidor: { type: 'string' }, canal: { type: 'string' }, autor: { type: 'string' }, contiene: { type: 'string' }, horas: { type: 'string' } } }, accion: { type: 'string', enum: ['urgente', 'normal', 'ruido', 'voz', 'dm', 'silenciar'] } }, required: ['descripcion', 'cuando', 'accion'] },
    });
    if (!r) return '❌ No pude entender la regla (o el cerebro está en pausa).';
    reglas.push({ ...r, creada: Date.now() }); writeJ('reglas_auto.json', reglas);
    return `✅ Regla ${reglas.length}: ${r.descripcion} → **${r.accion}**`;
  }
  const listRules = () => reglas.length ? reglas.map((r, i) => `${i + 1}. ${r.descripcion} → **${r.accion}**`).join('\n') + (firings.length ? `\n\nÚltimas aplicadas:\n${firings.slice(-5).map(f => `· ${f}`).join('\n')}` : '') : 'No tienes reglas. Ejemplo: `regla: silencia el canal general de 1 a 7`';
  function delRule(n) { if (!reglas[n - 1]) return 'No existe esa regla.'; const r = reglas.splice(n - 1, 1)[0]; writeJ('reglas_auto.json', reglas); return `🗑 Borrada: ${r.descripcion}`; }

  // ---------- 1 + 2) clasificación por lotes y tarjetas ----------
  let batch = [], timer = null, nextCard = 1;
  const cards = new Map();
  function ingest(it) {
    it.t = Date.now();
    let forced = null, extra = [];
    for (const r of reglas) if (matchRule(r, it)) {
      firings.push(`${new Date().toLocaleTimeString()} · ${r.descripcion}`); if (firings.length > 30) firings.shift();
      if (r.accion === 'silenciar') return;
      if (['urgente', 'normal', 'ruido'].includes(r.accion)) forced = r.accion; else extra.push(r.accion);
    }
    it.forced = forced; it.extra = extra;
    batch.push(it);
    clearTimeout(timer);
    timer = setTimeout(flush, it.kind === 'dm' || it.mention || it.kind === 'pi' ? 1500 : 8000);
  }
  async function flush() {
    const items = batch.splice(0); if (!items.length) return;
    const need = items.filter(i => !i.forced);
    let res = [];
    if (need.length && !(paused && usaPlan(cfg.modelo))) {
      const ej = ejemplos.slice(-30).map(e => `- [${e.kind}] ${e.author}${e.guild ? ' en ' + e.guild : ''}: "${e.text}" → el usuario dijo: ${e.prioridad}`).join('\n');
      const r = await llm({
        system: 'Eres el filtro de avisos de un robot asistente. Decides qué merece interrumpir al usuario (urgente), qué es informativo (normal) y qué es ruido. Para mensajes que piden algo, redactas una respuesta corta, natural, en el idioma del mensaje, como si la escribiera el usuario.',
        prompt: `Avisos nuevos:\n${need.map((x, i) => `${i}. [${x.kind}] ${x.author}${x.guild ? ` en ${x.guild} #${x.channel}` : ''}${x.mention ? ' (te mencionó)' : ''}: "${x.text}"`).join('\n')}\n\n${ej ? `Preferencias aprendidas del usuario (respétalas):\n${ej}` : ''}`,
        schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, prioridad: { type: 'string', enum: ['urgente', 'normal', 'ruido'] }, resumen: { type: 'string' }, necesita_respuesta: { type: 'boolean' }, respuesta: { type: 'string' } }, required: ['i', 'prioridad', 'resumen', 'necesita_respuesta'] } } }, required: ['items'] },
      });
      res = (r && r.items) || [];
    }
    need.forEach((x, i) => {
      const a = res.find(z => z.i === i);
      x.prioridad = a ? a.prioridad : (x.kind === 'dm' || x.mention || x.kind === 'pi' || x.kind === 'mail' ? 'normal' : 'ruido');
      x.resumen = a ? a.resumen : x.text.slice(0, 140);
      x.respuesta = a && a.necesita_respuesta ? (a.respuesta || '') : '';
    });
    for (const x of items) {
      if (x.forced) { x.prioridad = x.forced; x.resumen = x.text.slice(0, 140); x.respuesta = ''; }
      record({ kind: x.kind, guild: x.guild, channel: x.channel, author: x.author, text: x.text, prioridad: x.prioridad, resumen: x.resumen });
      if (x.prioridad === 'ruido' && !x.extra.length) continue;
      const card = {
        id: nextCard++, kind: x.kind, prioridad: x.prioridad, author: x.author, guild: x.guild, channel: x.channel,
        resumen: x.resumen, text: x.text, respuesta: x.respuesta, canSend: (!!x.msgId && x.kind === 'server') || x.kind === 'mail', correo: x.correo,
        link: x.kind === 'mail' ? null : x.guildId && x.channelId ? `https://discord.com/channels/${x.guildId}/${x.channelId}${x.msgId ? '/' + x.msgId : ''}` : 'discord://',
        msgId: x.msgId, channelId: x.channelId, extra: x.extra, t: x.t,
      };
      cards.set(card.id, card);
      onCard(card);
      if (card.prioridad === 'urgente' || x.extra.includes('dm')) notifyUrgent(card);
    }
  }
  function learn(cardId, prioridad) {
    const c = cards.get(cardId); if (!c) return;
    ejemplos.push({ kind: c.kind, author: c.author, guild: c.guild, text: String(c.text).slice(0, 100), prioridad });
    if (ejemplos.length > 60) ejemplos = ejemplos.slice(-60);
    writeJ('aprendizaje.json', ejemplos);
  }

  // ---------- 3) resumen diario ----------
  async function briefing() {
    const since = Date.now() - DAY, h = hist.filter(e => e.t >= since);
    const imp = h.filter(e => e.prioridad !== 'ruido').slice(-60);
    const ruido = h.filter(e => e.prioridad === 'ruido').length;
    const ses = getSessions();
    const r = await llm({
      model: cfg.modeloResumen,
      prompt: `Haz el resumen de las últimas 24 h para el usuario.\nAvisos importantes:\n${imp.map(e => `- [${e.kind}/${e.prioridad}] ${e.author || ''}${e.guild ? ' en ' + e.guild : ''}: ${e.resumen || e.text}`).join('\n') || '(ninguno)'}\nAvisos de ruido guardados: ${ruido}\nSesiones de Claude Code:\n${ses.map(s => `- ${s.name}: ${s.last || 'sin datos'}`).join('\n') || '(ninguna)'}\nUso del plan: ${JSON.stringify(getSessions.usage ? getSessions.usage() : {})}`,
      schema: { type: 'object', properties: { voz: { type: 'string', description: '2-3 frases para decir en voz alta' }, texto: { type: 'string', description: 'resumen completo en markdown corto' } }, required: ['voz', 'texto'] },
    });
    cfg.ultimoResumen = new Date().toDateString(); writeJ('config.json', cfg);
    return r || { voz: 'No pude preparar el resumen.', texto: 'No pude preparar el resumen (¿cerebro en pausa?).' };
  }
  const briefingDue = () => new Date().getHours() >= cfg.resumenHora && cfg.ultimoResumen !== new Date().toDateString();

  // ---------- 5) ¿dónde me quedé? ----------
  async function whereWasI() {
    const ses = getSessions();
    if (!ses.length) return { voz: 'No hay sesiones recientes.', texto: 'No hay sesiones recientes de Claude Code.' };
    const r = await llm({
      prompt: `Para cada sesión de Claude Code, dime en 1-2 frases en qué estaba el usuario y qué quedó pendiente.\n${ses.map(s => `## ${s.name}\nÚltimo pedido del usuario: ${s.lastPrompt || '?'}\nÚltima respuesta de Claude: ${String(s.last || '').slice(0, 900)}`).join('\n\n')}`,
      schema: { type: 'object', properties: { voz: { type: 'string' }, texto: { type: 'string' } }, required: ['voz', 'texto'] },
    });
    return r || { voz: 'No pude revisar tus sesiones.', texto: 'No pude revisar tus sesiones.' };
  }

  // ---------- 6) preguntas sobre el historial ----------
  async function ask(q) {
    const words = strip(q).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && !['que', 'como', 'cuando', 'donde', 'quien', 'dijo', 'ayer', 'hoy', 'para', 'por', 'con', 'una', 'los', 'las', 'del'].includes(w));
    const now = Date.now();
    const scored = hist.map(e => {
      const s = strip(`${e.author} ${e.guild} ${e.channel} ${e.text} ${e.resumen}`);
      const hits = words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
      return { e, sc: hits * 3 + Math.max(0, 2 - (now - e.t) / DAY) };
    }).filter(x => x.sc > 0.5).sort((a, b) => b.sc - a.sc).slice(0, 30).map(x => x.e).sort((a, b) => a.t - b.t);
    const r = await llm({
      prompt: `Pregunta del usuario: "${q}"\nResponde usando SOLO estos registros (si no está, dilo):\n${scored.map(e => `- ${new Date(e.t).toLocaleString('es')} [${e.kind}] ${e.author || ''}${e.guild ? ' en ' + e.guild + ' #' + e.channel : ''}: ${e.text || e.resumen}`).join('\n') || '(sin registros relacionados)'}`,
      schema: { type: 'object', properties: { voz: { type: 'string' }, texto: { type: 'string' } }, required: ['voz', 'texto'] },
    });
    return r || { voz: 'No pude buscar eso ahora.', texto: 'No pude buscar eso ahora.' };
  }

  // ---------- órdenes en lenguaje normal (desde Discord, la isla o la voz) ----------
  async function command(text) {
    const t = text.trim(), s = strip(t);
    let m;
    if ((m = t.match(/^regla\s*[:,]?\s*(.+)$/is))) return { texto: await addRule(m[1]) };
    if (/^reglas$/.test(s)) return { texto: listRules() };
    if ((m = s.match(/^borra(?:r)?\s+(?:la\s+)?regla\s+(\d+)/))) return { texto: delRule(+m[1]) };
    if (/^(resumen|briefing|resumen del dia)$/.test(s)) return briefing();
    if (/(donde me quede|en que estaba|en que me quede)/.test(s)) return whereWasI();
    if ((m = t.match(/^(?:\?|pregunta\s*[:,]?|busca\s*[:,]?)\s*(.+)$/is))) return ask(m[1]);
    return null;                                              // no es para el cerebro: va a Claude Code
  }

  return {
    ingest, learn, command, briefing, briefingDue, record,
    card: id => cards.get(id), dropCard: id => cards.delete(id),
    setPaused: v => { paused = v; }, get paused() { return paused && usaPlan(cfg.modelo); },
    config: () => ({ modelo: cfg.modelo, modeloResumen: cfg.modeloResumen, resumenHora: cfg.resumenHora, gastaPlan: usaPlan(cfg.modelo) || usaPlan(cfg.modeloResumen) }),
    setConfig(c) {
      for (const k of ['modelo', 'modeloResumen']) if (typeof c[k] === 'string' && c[k].trim()) cfg[k] = c[k].trim();
      if (Number.isInteger(c.resumenHora) && c.resumenHora >= 0 && c.resumenHora <= 23) cfg.resumenHora = c.resumenHora;
      writeJ('config.json', cfg); return this.config();
    },
  };
}

module.exports = { createCerebro };
