// Espejo de Claude Code: cada sesión de Claude Code (~/.claude/projects/**/*.jsonl) es también una conversación de APOLO
// (canal 'claude-code', modelo 'claudecode/<modelo>'), con su título, carpeta, tokens, lo que pidió el usuario, lo que
// contestó Claude y qué herramientas usó (sin sus salidas; las claves se tapan). Así el Wrapped, la página de Uso, las
// rachas, el historial y buscar_historial cuentan TODO el trabajo, con el modelo que sea.
// En vivo: los hooks de Claude Code (UserPromptSubmit/Stop/SessionEnd) llaman a tocar(transcript) y se lee lo nuevo de
// ese archivo; además actualizar() repasa todos (incremental por bytes, estado en <datos>/espejo-cc.json).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = 1;
const MAX_TEXTO = 4000;
const tapar = t => { try { return require('./seguridad').redactar(String(t)); } catch { return String(t); } };

// una sesión principal es <uuid>.jsonl; un subagente, <uuid>/subagents/agent-<hex>.jsonl
function idsDe(f) {
  const base = path.basename(f, '.jsonl').toLowerCase();
  const m = f.replace(/\\/g, '/').match(/\/([0-9a-f-]{36})\/subagents\/agent-([0-9a-z]+)\.jsonl$/i);
  if (m) return { id: `cc-${m[2].toLowerCase()}`.slice(0, 40), padre: `cc-${m[1].toLowerCase()}` };
  return /^[0-9a-f-]{36}$/.test(base) ? { id: `cc-${base}` } : null;
}

// texto de lo que escribió una PERSONA (no avisos de tareas, recordatorios del sistema ni comandos internos)
function textoHumano(j) {
  const c = j.message?.content;
  if (typeof c !== 'string' || j.isMeta) return null;
  if (j.turnOrigin && j.turnOrigin !== 'human') return null;
  if (!j.turnOrigin && /^\s*<(command|local-command|system|task|bash-)/i.test(c)) return null;
  const t = c.trim(); return t || null;
}

function crearEspejoCC({ cfg, sesiones, dirClaude, log = () => { } }) {
  const raiz = dirClaude || cfg?.claudeCode?.dir || path.join(os.homedir(), '.claude', 'projects');
  const fEstado = path.join(cfg.dir, 'espejo-cc.json');
  let est = { version: VERSION, archivos: {} };
  try { const d = JSON.parse(fs.readFileSync(fEstado, 'utf8')); if (d.version === VERSION) est = d; } catch { }
  const activo = () => cfg?.claudeCode?.espejo !== false;
  const guardar = () => { try { fs.writeFileSync(fEstado, JSON.stringify(est)); } catch (e) { log('[espejo-cc] guardar', e.message); } };

  function archivos(dir, out = []) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents) { const f = path.join(dir, e.name); if (e.isDirectory()) archivos(f, out); else if (e.name.endsWith('.jsonl')) out.push(f); }
    return out;
  }

  // lee lo nuevo de un transcript y lo pasa a su conversación de APOLO. Devuelve cuántos mensajes nuevos hubo
  async function leer(f) {
    const ids = idsDe(f); if (!ids) return 0;
    const st = fs.statSync(f);
    let a = est.archivos[f];
    if (!a || st.size < a.bytes) a = est.archivos[f] = { bytes: 0, ultimoId: null, herr: {}, meta: { id: ids.id, ...(ids.padre ? { padre: ids.padre } : {}), canal: 'claude-code', externo: 'claude-code', uso: { entrada: 0, salida: 0, cacheLeida: 0 } } };
    if (st.size === a.bytes) return 0;
    const m = a.meta, nuevos = [];
    const fd = await fs.promises.open(f, 'r');
    try {
      let pos = a.bytes, resto = '';
      const buf = Buffer.alloc(4 << 20);
      for (;;) {
        const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        const lineas = (resto + buf.toString('utf8', 0, bytesRead)).split('\n');
        resto = lineas.pop();                           // la última puede estar a medias
        for (const l of lineas) {
          let j; try { j = JSON.parse(l); } catch { continue; }
          const t = Date.parse(j.timestamp);
          if (j.cwd && !m.cwd) m.cwd = j.cwd;
          if (j.type === 'ai-title' && j.aiTitle) { m.titulo = String(j.aiTitle).slice(0, 80); continue; }
          if (!Number.isFinite(t)) continue;
          if (j.type === 'user') {
            const txt = textoHumano(j);
            if (txt) {
              nuevos.push({ role: 'user', content: tapar(txt).slice(0, MAX_TEXTO), t });
              if (!m.titulo) m.titulo = txt.replace(/\s+/g, ' ').slice(0, 60);
            } else if (Array.isArray(j.message?.content)) {
              for (const b of j.message.content) if (b?.type === 'tool_result' && b.tool_use_id) {
                nuevos.push({ role: 'tool', toolCallId: b.tool_use_id, name: a.herr[b.tool_use_id] || 'herramienta', content: '', t });
                delete a.herr[b.tool_use_id];
              }
            }
          } else if (j.type === 'assistant' && j.message) {
            const msg = j.message, u = msg.usage;
            if (msg.model && msg.model !== '<synthetic>') m.modelo = `claudecode/${msg.model}`;
            if (u && msg.id !== a.ultimoId) {           // una respuesta llega en varias líneas (una por bloque): sus tokens, una vez
              a.ultimoId = msg.id;
              const cc = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
              m.uso.entrada += (u.input_tokens || 0) + cc + cr; m.uso.salida += u.output_tokens || 0; m.uso.cacheLeida += cr;
            }
            const bloques = Array.isArray(msg.content) ? msg.content : [];
            const texto = bloques.filter(b => b?.type === 'text').map(b => b.text).join('\n').trim();
            const calls = bloques.filter(b => b?.type === 'tool_use').map(b => { a.herr[b.id] = b.name; return { id: b.id, name: b.name, args: {} }; });
            if (texto || calls.length) nuevos.push({ role: 'assistant', content: tapar(texto).slice(0, MAX_TEXTO), ...(calls.length ? { toolCalls: calls } : {}), t });
          }
          if (Number.isFinite(t)) { if (!m.creada || t < m.creada) m.creada = t; if (!m.actualizada || t > m.actualizada) m.actualizada = t; }
        }
      }
      a.bytes = pos - Buffer.byteLength(resto, 'utf8');
    } finally { await fd.close(); }
    if (!m.creada) return 0;                            // aún nada con fecha (sesión recién abierta)
    if (!m.titulo) m.titulo = ids.padre ? '⤷ subagente de Claude Code' : 'Claude Code';
    if (ids.padre && !m.titulo.startsWith('⤷')) m.titulo = `⤷ ${m.titulo}`;
    sesiones.espejar({ ...m, titulo: m.titulo, modelo: m.modelo || 'claudecode/claude', cwd: m.cwd || os.homedir() }, nuevos);
    return nuevos.length;
  }

  let enCurso = null, ultimo = 0;
  // repasa todos los transcripts (la primera vez son gigas: ~3 s; luego milisegundos)
  function actualizar({ forzar = false } = {}) {
    if (!activo()) return Promise.resolve(0);
    if (enCurso) return enCurso;
    if (!forzar && Date.now() - ultimo < 60_000) return Promise.resolve(0);
    enCurso = (async () => {
      let n = 0;
      for (const f of archivos(raiz)) { try { n += await leer(f); } catch (e) { log('[espejo-cc]', f, e.message); } }
      guardar(); ultimo = Date.now();
      return n;
    })().finally(() => { enCurso = null; });
    return enCurso;
  }
  // en vivo, desde un hook: solo ese transcript (y sus subagentes), con un poco de espera para que Claude Code termine de escribir
  const pendientes = new Map();
  function tocar(transcript) {
    if (!activo() || !transcript || !String(transcript).endsWith('.jsonl')) return;
    const f = path.resolve(transcript);
    if (!f.startsWith(path.resolve(raiz))) return;      // solo transcripts de Claude Code
    clearTimeout(pendientes.get(f));
    pendientes.set(f, setTimeout(async () => {
      pendientes.delete(f);
      const subs = archivos(path.join(path.dirname(f), path.basename(f, '.jsonl'), 'subagents'));
      for (const x of [f, ...subs]) try { if (fs.existsSync(x)) await leer(x); } catch (e) { log('[espejo-cc]', x, e.message); }
      guardar();
    }, 1500));
  }

  return { actualizar, tocar, raiz, idsDe };
}

module.exports = { crearEspejoCC, idsDe, textoHumano };
