const fs = require('fs');
const path = require('path');
const indices = new Map();
function buscar({ cfg, consulta, dias = 30, limite = 8, proyecto, usuario }) {
  const { tokens, raiz } = require('./memoria');
  const q = [...new Set(tokens(consulta))].map(raiz); if (!q.length) return [];
  const dir = path.join(cfg.dir, 'sesiones');
  let cache = indices.get(dir); if (!cache) { cache = new Map(); indices.set(dir, cache); if (indices.size > 32) indices.delete(indices.keys().next().value); }
  let nombres; try { nombres = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { return []; }
  const vivos = new Set(nombres); for (const f of cache.keys()) if (!vivos.has(f)) cache.delete(f);
  const res = [], desde = Date.now() - dias * 86400000;
  for (const nombre of nombres) {
    const f = path.join(dir, nombre); let st; try { st = fs.statSync(f); } catch { continue; }
    if (st.mtimeMs < desde) continue;
    const mf = f.slice(0, -1); let meta = {}; try { meta = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { }
    if (proyecto && meta.cwd && path.resolve(meta.cwd) !== path.resolve(proyecto)) continue;
    if (usuario && meta.usuario !== usuario) continue;
    if (!usuario && meta.usuario) continue;
    const version = `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
    let entrada = cache.get(nombre);
    if (!entrada || entrada.version !== version) {
      const filas = [];
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) try { const m = JSON.parse(l); if (['user', 'assistant'].includes(m.role) && m.content) filas.push({ m, palabras: new Set(tokens(m.content).map(raiz)) }); } catch { }
      entrada = { version, filas }; cache.set(nombre, entrada);
    }
    for (const { m, palabras } of entrada.filas) {
      if (m.t && m.t < desde) continue;
      const score = q.filter(p => palabras.has(p)).length;
      if (score) res.push({ s: score, t: m.t || 0, rol: m.role, sesion: nombre.slice(0, -6), texto: m.content.slice(0, 300) });
    }
  }
  return res.sort((a, b) => b.s - a.s || b.t - a.t).slice(0, Math.min(100, limite));
}
module.exports = { buscar };
