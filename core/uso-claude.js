// Uso de Claude Code en la página de Uso: lee los transcripts de ~/.claude/projects/**/*.jsonl (cada respuesta del modelo
// guarda su "usage": entrada, salida, caché creada y caché leída) y lo suma por día y por modelo. Incremental: de cada
// archivo se guarda hasta dónde se leyó (bytes) y solo se lee lo nuevo; el resumen va en <datos>/uso-claude.json.
// Una respuesta llega en varias líneas con el mismo message.id (una por bloque): cuenta una vez.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = 1;
const dia = t => new Date(t).toISOString().slice(0, 10);

// una línea del transcript → { id, dia, modelo, entrada, salida, cacheLeida, cacheCreada } | null (puro)
function leerLinea(l) {
  if (!l.includes('"usage"') || !l.includes('"assistant"')) return null;
  let j; try { j = JSON.parse(l); } catch { return null; }
  const m = j.message, u = m?.usage;
  if (j.type !== 'assistant' || !u || !m.model || m.model === '<synthetic>') return null;
  const t = Date.parse(j.timestamp); if (!Number.isFinite(t)) return null;
  const cc = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
  return { id: m.id || j.requestId || j.uuid, dia: dia(t), modelo: m.model, entrada: (u.input_tokens || 0) + cc + cr, salida: u.output_tokens || 0, cacheLeida: cr, cacheCreada: cc };
}

function crearUsoClaude({ cfg, dirClaude, log = () => { } } = {}) {
  const raiz = dirClaude || cfg?.uso?.claudeDir || path.join(os.homedir(), '.claude', 'projects');
  const fCache = path.join(cfg?.dir || path.join(os.homedir(), '.apolo'), 'uso-claude.json');
  let datos = { version: VERSION, archivos: {} };
  try { const d = JSON.parse(fs.readFileSync(fCache, 'utf8')); if (d.version === VERSION) datos = d; } catch { }
  let escaneando = null, ultimo = 0;
  const activo = () => cfg?.uso?.claudeCode !== false;

  function archivos(dir, out = []) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) archivos(f, out); else if (e.name.endsWith('.jsonl')) out.push(f);
    }
    return out;
  }

  // lee de un archivo lo que no se había leído (desde el byte guardado) y lo suma a su resumen por día y modelo
  async function leerArchivo(f) {
    const st = fs.statSync(f);
    let a = datos.archivos[f];
    if (!a || st.size < a.bytes) a = datos.archivos[f] = { bytes: 0, ultimoId: null, dias: {} };   // nuevo (o lo reescribieron): desde el principio
    if (st.size === a.bytes) return false;
    const fd = await fs.promises.open(f, 'r');
    try {
      let pos = a.bytes, resto = '';
      const buf = Buffer.alloc(4 << 20);
      for (;;) {
        const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        const trozo = resto + buf.toString('utf8', 0, bytesRead);
        const lineas = trozo.split('\n');
        resto = lineas.pop();                           // la última puede estar a medias: se lee en la siguiente vuelta
        for (const l of lineas) {
          const r = leerLinea(l); if (!r) continue;
          if (r.id && r.id === a.ultimoId) continue;      // otra línea de la misma respuesta
          a.ultimoId = r.id;
          const d = a.dias[r.dia] || (a.dias[r.dia] = {}), m = d[r.modelo] || (d[r.modelo] = { entrada: 0, salida: 0, cacheLeida: 0, cacheCreada: 0, respuestas: 0 });
          m.entrada += r.entrada; m.salida += r.salida; m.cacheLeida += r.cacheLeida; m.cacheCreada += r.cacheCreada; m.respuestas++;
        }
      }
      a.bytes = pos - Buffer.byteLength(resto, 'utf8');
    } finally { await fd.close(); }
    return true;
  }

  // escanea en segundo plano (la primera vez son gigas: no bloquea la página; se ve lo que haya y "leyendo…")
  function actualizar({ forzar = false } = {}) {
    if (!activo()) return Promise.resolve(false);
    if (escaneando) return escaneando;
    if (!forzar && Date.now() - ultimo < 60_000) return Promise.resolve(false);
    escaneando = (async () => {
      let cambios = false;
      // los archivos que ya no existen se quedan en el resumen: su uso pasado cuenta igual
      for (const f of archivos(raiz)) { try { cambios = (await leerArchivo(f)) || cambios; } catch (e) { log('[uso-claude]', f, e.message); } }
      if (cambios) { try { fs.mkdirSync(path.dirname(fCache), { recursive: true }); fs.writeFileSync(fCache, JSON.stringify(datos)); } catch (e) { log('[uso-claude] guardar', e.message); } }
      ultimo = Date.now();
      return cambios;
    })().finally(() => { escaneando = null; });
    return escaneando;
  }

  // resumen de los últimos `dias`: porModelo { 'claude-code/<modelo>': { entrada, salida, sesiones, cacheLeida } } + porDia
  function resumen(dias = 30) {
    const desde = dia(Date.now() - (dias - 1) * 864e5);
    const porModelo = {}, porDia = {};
    let sesiones = 0;
    for (const a of Object.values(datos.archivos)) {
      const vistos = new Set();
      for (const [d, mods] of Object.entries(a.dias)) {
        if (d < desde) continue;
        for (const [mod, x] of Object.entries(mods)) {
          const k = `claude-code/${mod}`;
          const m = porModelo[k] || (porModelo[k] = { entrada: 0, salida: 0, sesiones: 0, cacheLeida: 0 });
          m.entrada += x.entrada; m.salida += x.salida; m.cacheLeida += x.cacheLeida;
          if (!vistos.has(k)) { vistos.add(k); m.sesiones++; }
          const pd = porDia[d] || (porDia[d] = { entrada: 0, salida: 0 });
          pd.entrada += x.entrada; pd.salida += x.salida;
        }
      }
      if (vistos.size) sesiones++;
    }
    return { porModelo, porDia, sesiones, leyendo: !!escaneando, activo: activo() };
  }

  return { actualizar, resumen, raiz };
}

module.exports = { crearUsoClaude, leerLinea };
