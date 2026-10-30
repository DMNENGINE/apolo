// Aprender de Claude Code: cada noche lee lo nuevo de las conversaciones de Claude Code (~/.claude/projects/*/*.jsonl),
// resume cada sesión con el modelo del cerebro y guarda lo duradero en la memoria (origen 'claude-code').
// Los resúmenes quedan en <datos>/aprender-cc/AAAA-MM-DD.jsonl: salen en la línea de tiempo (tipo 'claude') y en el diario.
// Solo lee el texto de la conversación (lo que pide el usuario y lo que contesta Claude), no las salidas de herramientas;
// las claves y contraseñas se tapan antes de mandarlo al modelo. cfg.aprenderClaude { activo, hora, dir, maxSesiones, otros }.
// También aprende de las conversaciones de Codex, Gemini CLI, Qwen Code y opencode (lectores de core/conversaciones-agentes.js;
// cfg.aprenderClaude.otros === false lo apaga): por sesión guarda cuántos mensajes ya resumió y solo manda los nuevos.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SECRETO, TIPOS } = require('./memoria');

const DEF = { activo: true, hora: '03:20', maxSesiones: 30, primeraVezDias: 3 };
const TAPAR = new RegExp(SECRETO.source, 'gi');
const ESQ = {
  type: 'object', required: ['resumen', 'recuerdos'],
  properties: {
    resumen: { type: 'string', description: '2-5 frases: qué hizo el usuario con el agente en esta sesión, en qué proyecto y cómo acabó' },
    recuerdos: { type: 'array', maxItems: 6, items: { type: 'object', required: ['texto', 'tipo'], properties: { texto: { type: 'string' }, tipo: { type: 'string', enum: TIPOS } } } },
  },
};
const sistema = (agente = 'Claude Code') => `Eres la memoria de un asistente personal. Te paso una conversación del usuario con ${agente} (otro asistente de programación). ` +
  'Resume qué hicieron y extrae SOLO lo duradero que te sirva para ayudar al usuario en el futuro: cómo le gusta trabajar y que le hablen, ' +
  'decisiones y estado de sus proyectos, sus gustos, personas y datos de su vida. Nada de pasos técnicos de un solo uso, rutas temporales ni ' +
  'detalles que caducan mañana. NUNCA guardes claves, tokens, contraseñas ni datos de acceso. Cada recuerdo es una frase corta en español ' +
  'y en tercera persona ("El usuario…", "El proyecto X…"). Si no hay nada duradero, recuerdos vacío. Responde solo JSON.';

function crearAprenderCC({ cfg, memoria, generarJSON, modelo, tareas, registro, lectores = [] }) {
  const conf = () => ({ ...DEF, ...(cfg.aprenderClaude || {}) });
  const dirCC = () => conf().dir || path.join(os.homedir(), '.claude', 'projects');
  const dir = path.join(cfg.dir, 'aprender-cc'), fEstado = path.join(dir, 'estado.json');
  const leerEstado = () => { try { return JSON.parse(fs.readFileSync(fEstado, 'utf8')); } catch { return { offsets: {} }; } };
  const dia = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let enCurso = null;

  // texto legible de las líneas nuevas: [{rol, texto, t}] + carpeta del proyecto
  function extraer(lineas) {
    const msgs = []; let cwd = '';
    for (const l of lineas) {
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.cwd) cwd = o.cwd;
      if (o.isMeta || o.isSidechain || !o.message) continue;
      const t = Date.parse(o.timestamp) || 0, c = o.message.content;
      let texto = '';
      if (o.type === 'user') texto = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(p => p.type === 'text').map(p => p.text).join('\n') : '';
      else if (o.type === 'assistant' && Array.isArray(c)) texto = c.filter(p => p.type === 'text').map(p => p.text).join('\n');
      texto = texto.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
      if (!texto || /^(<command-|<local-command|Caveat:|This session is being continued|\[Request interrupted)/.test(texto)) continue;
      msgs.push({ rol: o.type === 'user' ? 'USUARIO' : 'CLAUDE', texto: texto.replace(TAPAR, '[secreto]').slice(0, 1500), t });
    }
    return { msgs, cwd };
  }

  async function aprender({ dias } = {}) {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const c = conf(), est = leerEstado(), primera = !Object.keys(est.offsets).length;
      const desde = Date.now() - (dias || (primera ? c.primeraVezDias : 30)) * 86400_000;
      let archivos = [];
      try {
        for (const p of fs.readdirSync(dirCC())) {
          const d = path.join(dirCC(), p); let ls = []; try { ls = fs.readdirSync(d); } catch { continue; }
          for (const f of ls) if (f.endsWith('.jsonl')) { const r = path.join(d, f); const st = fs.statSync(r); if (st.mtimeMs >= desde && st.size > (est.offsets[r] || 0)) archivos.push({ r, st }); }
        }
      } catch { archivos = []; }                                  // sin Claude Code: se sigue con los demás agentes
      archivos = archivos.sort((a, b) => a.st.mtimeMs - b.st.mtimeMs).slice(-c.maxSesiones);
      fs.mkdirSync(dir, { recursive: true });
      let sesiones = 0, recuerdos = 0;
      for (const { r, st } of archivos) {
        if (Date.now() - st.mtimeMs < 10 * 60_000) continue;                     // sesión viva: la próxima vez
        const ini = est.offsets[r] || 0, fd = fs.openSync(r, 'r');
        const buf = Buffer.alloc(st.size - ini); fs.readSync(fd, buf, 0, buf.length, ini); fs.closeSync(fd);
        const txt = buf.toString('utf8'), fin = txt.lastIndexOf('\n') + 1;   // solo líneas completas
        const { msgs, cwd } = extraer(txt.slice(0, fin).split('\n'));
        const nuevo = ini + Buffer.byteLength(txt.slice(0, fin), 'utf8');
        if (msgs.filter(m => m.rol === 'USUARIO').reduce((n, m) => n + m.texto.length, 0) < 40) { est.offsets[r] = nuevo; continue; }
        let conv = msgs.map(m => `${m.rol}: ${m.texto}`).join('\n\n');
        if (conv.length > 40_000) conv = conv.slice(0, 8_000) + '\n\n[…]\n\n' + conv.slice(-32_000);
        try {
          const { datos } = await generarJSON({ modelo: modelo(), system: sistema(), schema: ESQ, prompt: `Proyecto (carpeta): ${cwd || '?'}\n\n${conv}`, signal: AbortSignal.timeout(180_000) });
          let n = 0;
          for (const x of (datos?.recuerdos || []).slice(0, 6)) {
            try { if (x?.texto && !SECRETO.test(x.texto)) { memoria.recordar({ texto: String(x.texto).slice(0, 400), tipo: x.tipo, origen: 'claude-code' }); n++; } } catch { }
          }
          const tUlt = msgs.at(-1)?.t || st.mtimeMs;
          fs.appendFileSync(path.join(dir, `${dia(tUlt)}.jsonl`), JSON.stringify({ t: tUlt, inicio: msgs[0]?.t || tUlt, sesion: path.basename(r, '.jsonl'), proyecto: cwd,
            resumen: String(datos?.resumen || '').replace(TAPAR, '[secreto]').slice(0, 1200), recuerdos: n }) + '\n');
          est.offsets[r] = nuevo; sesiones++; recuerdos += n;
          fs.writeFileSync(fEstado, JSON.stringify(est));
        } catch (e) { registro?.add?.('aviso', 'aprender-claude', `${path.basename(r)}: ${e.message}`); }
      }
      const porAgente = {};
      if (c.otros !== false) {
        est.otros = est.otros || {}; est.agentes = est.agentes || {};
        const pend = [];
        for (const lec of lectores) {
          const desdeA = Date.now() - (dias || (est.agentes[lec.id] ? 30 : c.primeraVezDias)) * 86400_000;
          let ses = []; try { ses = await lec.sesiones({ desde: desdeA }); } catch (e) { registro?.add?.('aviso', 'aprender-claude', `${lec.nombre}: ${e.message}`); }
          for (const x of ses) { const p = est.otros[x.clave]; if (!p || p.mtime !== x.mtime) pend.push({ lec, x }); }
          est.agentes[lec.id] = true;
        }
        for (const { lec, x } of pend.sort((a, b) => a.x.mtime - b.x.mtime).slice(0, Math.max(0, c.maxSesiones - sesiones))) {
          if (Date.now() - x.mtime < 10 * 60_000) continue;                   // sesión viva: la próxima vez
          try {
            const { msgs = [], cwd = '' } = await x.leer(), ya = est.otros[x.clave]?.n || 0, nuevos = msgs.slice(ya);
            if (nuevos.filter(m => m.rol === 'USUARIO').reduce((n, m) => n + m.texto.length, 0) >= 40) {
              const n = await resumirOtro(lec, x.clave, nuevos, cwd, x.mtime);
              sesiones++; recuerdos += n; porAgente[lec.nombre] = (porAgente[lec.nombre] || 0) + n;
            }
            est.otros[x.clave] = { n: msgs.length, mtime: x.mtime };
            fs.writeFileSync(fEstado, JSON.stringify(est));
          } catch (e) { registro?.add?.('aviso', 'aprender-claude', `${lec.nombre} ${x.clave}: ${e.message}`); }
        }
      }
      fs.writeFileSync(fEstado, JSON.stringify(est));
      return Object.keys(porAgente).length ? { sesiones, recuerdos, porAgente } : { sesiones, recuerdos };
    })().finally(() => { enCurso = null; });
    return enCurso;
  }

  // conversación de otro agente: misma receta que la de Claude Code; devuelve los recuerdos guardados
  async function resumirOtro(lec, clave, msgs, cwd, mtime) {
    let conv = msgs.map(m => `${m.rol}: ${m.texto.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(TAPAR, '[secreto]').slice(0, 1500)}`).join('\n\n');
    if (conv.length > 40_000) conv = conv.slice(0, 8_000) + '\n\n[…]\n\n' + conv.slice(-32_000);
    const { datos } = await generarJSON({ modelo: modelo(), system: sistema(lec.nombre), schema: ESQ, prompt: `Proyecto (carpeta): ${cwd || '?'}\n\n${conv}`, signal: AbortSignal.timeout(180_000) });
    let n = 0;
    for (const x of (datos?.recuerdos || []).slice(0, 6)) {
      try { if (x?.texto && !SECRETO.test(x.texto)) { memoria.recordar({ texto: String(x.texto).slice(0, 400), tipo: x.tipo, origen: lec.id }); n++; } } catch { }
    }
    const tUlt = msgs.at(-1)?.t || mtime;
    fs.appendFileSync(path.join(dir, `${dia(tUlt)}.jsonl`), JSON.stringify({ t: tUlt, inicio: msgs[0]?.t || tUlt, sesion: clave, agente: lec.nombre, proyecto: cwd,
      resumen: String(datos?.resumen || '').replace(TAPAR, '[secreto]').slice(0, 1200), recuerdos: n }) + '\n');
    return n;
  }

  // para la línea de tiempo (y el diario, que la consulta)
  function resumenes({ desde = 0, hasta = Date.now() + 60_000 } = {}) {
    const out = []; let fs_ = []; try { fs_ = fs.readdirSync(dir).filter(f => /^\d{4}-\d\d-\d\d\.jsonl$/.test(f)); } catch { }
    for (const f of fs_) {
      const d = Date.parse(f.slice(0, 10)); if (d > hasta || d + 2 * 86400_000 < desde) continue;
      for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l) continue; try { const x = JSON.parse(l); if (x.t >= desde && x.t <= hasta) out.push(x); } catch { } }
    }
    return out;
  }

  function programar() {
    if (!tareas) return null;
    tareas.registrarInterna('aprender-claude', async () => {
      const r = await aprender();
      return { registro: r.error || `aprendí de ${r.sesiones} sesión(es) de tus agentes de programación · ${r.recuerdos} recuerdo(s) nuevo(s)` };
    });
    const c = conf(), [h, m] = String(c.hora).split(':').map(Number), cron = `${m || 0} ${h || 3} * * *`;
    const ya = tareas.lista().find(t => t.accion?.tipo === 'interna' && t.accion.nombre === 'aprender-claude');
    if (!c.activo) { if (ya) tareas.borrar(ya.id); return null; }
    if (ya && ya.cuando?.cron === cron) return ya;
    if (ya) tareas.borrar(ya.id);
    return tareas.crear({ nombre: 'Aprender de tus agentes de programación', cuando: { cron }, accion: { tipo: 'interna', nombre: 'aprender-claude' }, canal: 'isla' });
  }

  // API /v1/aprender-claude: GET = estado y resúmenes de 7 días · POST = aprender ahora { dias? }
  async function http(M, p, b = {}) {
    if (M === 'GET') return { conf: conf(), resumenes: resumenes({ desde: Date.now() - 7 * 86400_000 }).sort((a, b) => b.t - a.t), trabajando: !!enCurso };
    if (M === 'POST') return aprender({ dias: +b.dias || undefined });
    throw Object.assign(new Error('método'), { status: 405 });
  }

  return { aprender, resumenes, programar, http, extraer };
}

module.exports = { crearAprenderCC };
