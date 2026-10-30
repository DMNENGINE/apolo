// Conversaciones de los otros agentes de programación (Claude Code lo lee aprender-cc.js directamente):
//   Codex       ~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl     (response_item message user/assistant; cwd en session_meta)
//   Gemini CLI  ~/.gemini/tmp/<proyecto>/chats/session-*.jsonl   (type user/gemini; $set.messages = foto inicial; cwd en ../.project_root)
//   Qwen Code   ~/.qwen/projects/<proyecto>/chats/<uuid>.jsonl   (type user/assistant con message.parts; cwd en cada línea)
//   opencode    `opencode session list --format json` + `opencode export <id>` (su base es SQLite y Electron 33 no trae node:sqlite)
// Antigravity guarda las suyas en protobuf/SQLite propios: no se leen.
// Cada lector: { id, nombre, sesiones({ desde }) → [{ clave, mtime, leer() → { msgs: [{ rol, texto, t }], cwd } }] }.
// rol es 'USUARIO' o 'ASISTENTE'; los textos que empiezan por una etiqueta (<environment_context>…) son contexto, no del usuario.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const tiempo = x => Date.parse(x) || 0;
const esContexto = t => /^\s*(<[a-z_-]+[\s>]|# AGENTS\.md|# Context from my IDE)/i.test(t);
const lineas = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
function archivos(dir, re, desde, prof = 4, out = []) {
  let ls = []; try { ls = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ls) {
    const r = path.join(dir, e.name);
    if (e.isDirectory() && prof > 0) archivos(r, re, desde, prof - 1, out);
    else if (e.isFile() && re.test(e.name)) { const st = fs.statSync(r); if (st.mtimeMs >= desde) out.push({ clave: r, mtime: st.mtimeMs }); }
  }
  return out;
}

function codex(home) {
  return { id: 'codex', nombre: 'Codex', sesiones: async ({ desde }) => archivos(path.join(home, '.codex', 'sessions'), /^rollout-.*\.jsonl$/, desde).map(s => ({ ...s, leer: async () => {
    const msgs = []; let cwd = '';
    for (const o of lineas(s.clave)) {
      if (o.type === 'session_meta') cwd = o.payload?.cwd || cwd;
      const p = o.payload; if (o.type !== 'response_item' || p?.type !== 'message' || !['user', 'assistant'].includes(p.role)) continue;
      const texto = (p.content || []).filter(c => c.type === 'input_text' || c.type === 'output_text').map(c => c.text).join('\n').trim();
      if (!texto || (p.role === 'user' && esContexto(texto))) continue;
      msgs.push({ rol: p.role === 'user' ? 'USUARIO' : 'ASISTENTE', texto, t: tiempo(o.timestamp) });
    }
    return { msgs, cwd };
  } })) };
}

function gemini(home) {
  const tmp = path.join(home, '.gemini', 'tmp');
  return { id: 'gemini', nombre: 'Gemini CLI', sesiones: async ({ desde }) => archivos(tmp, /^session-.*\.jsonl$/, desde, 2).map(s => ({ ...s, leer: async () => {
    let cwd = ''; try { cwd = fs.readFileSync(path.join(path.dirname(path.dirname(s.clave)), '.project_root'), 'utf8').trim(); } catch { }
    const vistos = new Set(), msgs = [];
    const poner = m => {
      if (!m || !['user', 'gemini'].includes(m.type) || vistos.has(m.id)) return; vistos.add(m.id);
      const texto = (typeof m.content === 'string' ? m.content : (m.content || []).map(c => c.text || '').join('\n')).trim();
      if (!texto || (m.type === 'user' && esContexto(texto))) return;
      msgs.push({ rol: m.type === 'user' ? 'USUARIO' : 'ASISTENTE', texto, t: tiempo(m.timestamp) });
    };
    for (const o of lineas(s.clave)) { if (Array.isArray(o.$set?.messages)) o.$set.messages.forEach(poner); else poner(o); }
    return { msgs: msgs.sort((a, b) => a.t - b.t), cwd };
  } })) };
}

function qwen(home) {
  return { id: 'qwen', nombre: 'Qwen Code', sesiones: async ({ desde }) => archivos(path.join(home, '.qwen', 'projects'), /^[^.]+\.jsonl$/, desde, 2).map(s => ({ ...s, leer: async () => {
    const msgs = []; let cwd = '';
    for (const o of lineas(s.clave)) {
      if (o.cwd) cwd = o.cwd;
      if (!['user', 'assistant'].includes(o.type) || (o.type === 'user' && o.provenance && o.provenance !== 'real_user')) continue;
      const texto = (o.message?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('\n').trim();
      if (!texto || (o.type === 'user' && esContexto(texto))) continue;
      msgs.push({ rol: o.type === 'user' ? 'USUARIO' : 'ASISTENTE', texto, t: tiempo(o.timestamp) });
    }
    return { msgs, cwd };
  } })) };
}

// opencode: consultas de solo lectura con `opencode db "<sql>" --format json` (su base SQLite de todos los proyectos, WAL incluido;
// `opencode session list` solo ve el proyecto de la carpeta actual). Sin opencode instalado → sin sesiones.
function opencode({ comando = 'opencode', correr } = {}) {
  const win = process.platform === 'win32';                 // en Windows opencode es un .cmd (hace falta shell); fuera, sin shell ($ no se expande)
  const ejecutar = correr || (sql => new Promise((ok, mal) => execFile(comando, ['db', win ? `"${sql}"` : sql, '--format', 'json'],
    { windowsHide: true, shell: win, timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }, (e, out) => (e ? mal(e) : ok(String(out))))));
  const consulta = async sql => { const s = await ejecutar(sql), i = s.indexOf('['); return i < 0 ? [] : JSON.parse(s.slice(i)); };
  return { id: 'opencode', nombre: 'opencode', sesiones: async ({ desde }) => {
    let l; try { l = await consulta(`select id, directory, time_updated from session where time_updated >= ${Math.floor(+desde) || 0} order by time_updated desc limit 300`); } catch { return []; }
    return l.filter(x => /^[\w-]+$/.test(x.id || '')).map(x => ({ clave: `opencode:${x.id}`, mtime: +x.time_updated || 0, leer: async () => {
      const filas = await consulta(`select json_extract(m.data, '$.role') as rol, json_extract(p.data, '$.text') as texto, p.time_created as t from part p join message m on m.id = p.message_id ` +
        `where p.session_id = '${x.id}' and json_extract(p.data, '$.type') = 'text' and coalesce(json_extract(p.data, '$.synthetic'), 0) = 0 order by p.time_created`);
      const msgs = [];
      for (const f of filas) {
        const texto = String(f.texto || '').trim();
        if (!['user', 'assistant'].includes(f.rol) || !texto || (f.rol === 'user' && esContexto(texto))) continue;
        const ult = msgs.at(-1);
        if (ult && ult.rol === (f.rol === 'user' ? 'USUARIO' : 'ASISTENTE') && f.t - ult.t < 1000) { ult.texto += '\n' + texto; continue; }   // partes del mismo mensaje
        msgs.push({ rol: f.rol === 'user' ? 'USUARIO' : 'ASISTENTE', texto, t: +f.t || 0 });
      }
      return { msgs, cwd: x.directory || '' };
    } }));
  } };
}

function crearLectores({ home = os.homedir(), opencode: oc } = {}) {
  return [codex(home), gemini(home), qwen(home), opencode(oc)];
}

module.exports = { crearLectores, esContexto };
