// "Lo que has hecho con el usuario estos días": APOLO es el orquestador, así que cada chat suyo debe saber lo que el
// usuario ha estado haciendo con TODOS sus agentes (Claude Code, Codex, DeepSeek Harness, Gemini, opencode…) y en los
// otros canales de APOLO (isla, panel, Telegram…). Sin esto el modelo actúa como si llevaran días sin hablar.
// Fuentes: resúmenes por sesión de aprender-cc (<datos>/aprender-cc/AAAA-MM-DD.jsonl, agente + proyecto + resumen)
// y las sesiones recientes de APOLO (solo se leen las que cambiaron en los últimos días, por mtime).
// cfg.actividadReciente = { activo (true), dias (4), maxItems (14), maxChars (3200) }.
const fs = require('fs');
const path = require('path');

const CANALES_FUERA = new Set(['eval', 'conciencia', 'subagente', 'consejo']);

function crearActividad({ cfg, sesionesDir, aprenderCC }) {
  let cache = null;
  const conf = () => ({ activo: true, dias: 4, maxItems: 14, maxChars: 3200, ...(cfg.actividadReciente || {}) });

  function cuando(t, ahora = Date.now()) {
    const d = new Date(t), hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
    const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const dias = Math.round((hoy - new Date(d).setHours(0, 0, 0, 0)) / 86400_000);
    return dias <= 0 ? `hoy ${hh}` : dias === 1 ? `ayer ${hh}` : `hace ${dias} días`;
  }
  const proyecto = p => { const b = path.basename(String(p || '')); return !b || /^(system32|yosoy|Users)$/i.test(b) ? '' : b; };
  const corta = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  // sesiones de APOLO tocadas en los últimos días (stat primero: hay más de mil archivos)
  function sesionesRecientes(desde) {
    const out = []; let fs_ = []; try { fs_ = fs.readdirSync(sesionesDir).filter(f => f.endsWith('.json')); } catch { return out; }
    for (const f of fs_) {
      const r = path.join(sesionesDir, f); let st; try { st = fs.statSync(r); } catch { continue; }
      if (st.mtimeMs < desde) continue;
      try { const s = JSON.parse(fs.readFileSync(r, 'utf8')); if (s.actualizada >= desde && !s.padre && !s.tarea && !CANALES_FUERA.has(s.canal)) out.push(s); } catch { }
    }
    return out;
  }

  function construir(excluirId) {
    const c = conf(), ahora = Date.now(), desde = ahora - c.dias * 86400_000;
    const items = [];
    const resumidas = new Set();
    let res = []; try { res = aprenderCC?.resumenes({ desde }) || []; } catch { }
    for (const r of res) {
      resumidas.add(`cc-${r.sesion}`); resumidas.add(r.sesion);
      const quien = r.agente || 'Claude Code', p = proyecto(r.proyecto);
      items.push({ t: r.t, linea: `- [${cuando(r.t, ahora)} · ${quien}${p ? ` · ${p}` : ''}] ${corta(r.resumen, 320)}` });
    }
    for (const s of sesionesRecientes(desde)) {
      if (s.id === excluirId || resumidas.has(s.id)) continue;
      const titulo = corta(s.titulo, 90); if (!titulo || titulo === 'Nueva sesión') continue;
      const quien = s.externo === 'claude-code' ? 'Claude Code (en curso, sin resumir aún)' : `APOLO · ${s.canal}`;
      items.push({ t: s.actualizada, linea: `- [${cuando(s.actualizada, ahora)} · ${quien}${proyecto(s.cwd) ? ` · ${proyecto(s.cwd)}` : ''}] ${titulo}` });
    }
    items.sort((a, b) => b.t - a.t);
    const lineas = []; let n = 0;
    for (const it of items.slice(0, c.maxItems)) { if (n + it.linea.length > c.maxChars) break; lineas.push(it.linea); n += it.linea.length + 1; }
    return { lineas, ultima: items[0]?.t || 0 };
  }

  // texto para el system prompt (caché de 2 min por sesión excluida)
  function texto({ excluir } = {}) {
    if (!conf().activo) return '';
    if (!cache || cache.excluir !== excluir || Date.now() - cache.t > 120_000) cache = { t: Date.now(), excluir, ...construir(excluir) };
    if (!cache.lineas.length) return '';
    return 'LO QUE EL USUARIO HA ESTADO HACIENDO ESTOS DÍAS (con sus agentes —Claude Code, Codex, DeepSeek…— y contigo en otros canales). ' +
      'Tú eres el orquestador de todo esto: no actúes como si llevarais tiempo sin hablar. Úsalo con naturalidad; para detalles usa "buscar_historial":\n' +
      cache.lineas.join('\n');
  }

  return { texto, construir, invalidar: () => { cache = null; } };
}

module.exports = { crearActividad };
