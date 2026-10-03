// Almacén de skills.
//   Propias:   <cfg.dir>/skills/<slug>/SKILL.md (+ scripts/ references/ assets/) + instalado.json
//              instalado.json = { origen, sha, hash, version, fecha, activa, escaneo, usos, ultimoUso }
//   Externas:  solo lectura, de ~/.claude/skills, ~/.codex/skills, <cwd>/.claude/skills y cfg.skills.rutasExtra
//              (cfg.skills.rutas sustituye la lista por defecto). También <cwd>/.cursor/rules/*.mdc y <cwd>/AGENTS.md
//              (cfg.skills.reglasProyecto=false lo apaga; cfg.skills.cwdReglas cambia la carpeta), espejadas en <dir>/skills/_reglas/. Su estado (activa, usos, escaneo) va en <dir>/skills/_externas.json.
// Migra los .md sueltos de la importación antigua (<dir>/skills/*.md) a carpetas <slug>/SKILL.md (desactivadas).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerSkill, componerSkillMd, parsearSkillMd, slugDe } = require('./formato');

const leerJSON = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };

function rutasExternas(cfg) {
  const sk = cfg.skills || {};
  const base = Array.isArray(sk.rutas) ? sk.rutas : [
    { ruta: path.join(os.homedir(), '.claude', 'skills'), etiqueta: 'claude' },
    { ruta: path.join(os.homedir(), '.codex', 'skills'), etiqueta: 'codex' },
    { ruta: path.join(process.cwd(), '.claude', 'skills'), etiqueta: 'proyecto' },
  ];
  return [...base, ...(sk.rutasExtra || [])].map(r => (typeof r === 'string' ? { ruta: r, etiqueta: path.basename(path.dirname(r)).replace(/^\./, '') || 'extra' } : r))
    .filter((r, i, a) => r.ruta && a.findIndex(x => path.resolve(x.ruta) === path.resolve(r.ruta)) === i);
}

function crearAlmacen({ cfg, bus }) {
  const dir = path.join(cfg.dir, 'skills');
  const fExt = path.join(dir, '_externas.json');
  fs.mkdirSync(dir, { recursive: true });
  const avisar = (accion, slug) => bus?.emit('evento', { tipo: 'skills', accion, slug });

  // ---- migración de los .md sueltos (importador antiguo) ----
  function migrar() {
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!/\.md$/i.test(f) || !fs.statSync(fp).isFile()) continue;
      const txt = fs.readFileSync(fp, 'utf8');
      let cuerpo = txt, nombre = f.replace(/\.md$/i, ''), descripcion = '';
      if (!/^---\s*\n/.test(txt)) {                       // formato viejo: "# nombre\n\ndescripcion\n\ncontenido"
        const m = txt.match(/^#\s*(.+)\r?\n\r?\n([^\n]*)\r?\n?\r?\n?([\s\S]*)$/);
        if (m) { nombre = m[1].trim(); descripcion = m[2].trim(); cuerpo = m[3]; }
      }
      const slug = libre(slugDe(nombre) || 'skill');
      const sd = path.join(dir, slug); fs.mkdirSync(sd, { recursive: true });
      fs.writeFileSync(path.join(sd, 'SKILL.md'), /^---\s*\n/.test(txt) ? txt : componerSkillMd({ name: slug, description: descripcion || `Skill importada (${nombre})` }, cuerpo));
      escribirInstalado(slug, { origen: { tipo: 'importado', fuente: f }, fecha: Date.now(), activa: false, escaneo: null, usos: 0, ultimoUso: null });
      fs.mkdirSync(path.join(dir, '_antiguas'), { recursive: true });
      fs.renameSync(fp, path.join(dir, '_antiguas', f));
      n++;
    }
    if (n) avisar('migradas');
    return n;
  }
  const libre = base => { let s = base, i = 2; while (fs.existsSync(path.join(dir, s))) s = `${base}-${i++}`; return s; };

  // ---- lectura (con caché corta: el índice lo pide en cada mensaje) ----
  let cache = null, cacheT = 0;
  const invalidar = () => { cache = null; };
  function escanearTodo() {
    const out = [], usados = new Set();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const d = path.join(dir, e.name), s = leerSkill(d); if (!s) continue;
      const inst = leerJSON(path.join(d, 'instalado.json'), {});
      out.push(armar(s, e.name, d, inst, false)); usados.add(e.name);
    }
    const est = leerJSON(fExt, {});
    for (const { ruta, etiqueta } of rutasExternas(cfg)) {
      let es = []; try { es = fs.readdirSync(ruta, { withFileTypes: true }); } catch { continue; }
      for (const e of es) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue;
        const d = path.join(ruta, e.name), s = leerSkill(d); if (!s) continue;
        let slug = slugDe(e.name) || s.slug; if (usados.has(slug)) slug = `${slug}-${slugDe(etiqueta)}`; if (usados.has(slug)) continue;
        usados.add(slug);
        const clave = `${etiqueta}:${e.name}`;
        out.push(armar(s, slug, d, { origen: { tipo: 'externa', fuente: d, etiqueta }, activa: cfg.skills?.externasActivas === true, ...est[clave], clave }, true));
      }
    }
    // reglas de proyecto del cwd: .cursor/rules/*.mdc y AGENTS.md (solo lectura; espejo como SKILL.md en _reglas/ para índice y escáner)
    for (const r of reglasProyecto()) {
      let slug = r.slug; if (usados.has(slug)) slug = `${slug}-${r.etiqueta}`; if (usados.has(slug)) continue;
      const d = espejo(r, slug), s = d && leerSkill(d); if (!s) continue;
      usados.add(slug);
      const clave = `${r.etiqueta}:${r.archivo}`;
      out.push(armar(s, slug, d, { origen: { tipo: 'externa', fuente: r.archivo, etiqueta: r.etiqueta }, activa: cfg.skills?.externasActivas === true, ...est[clave], clave }, true));
    }
    return out;
  }
  function reglasProyecto() {
    if (cfg.skills?.reglasProyecto === false) return [];
    const cwd = cfg.skills?.cwdReglas || process.cwd(), out = [];
    const dr = path.join(cwd, '.cursor', 'rules');
    let es = []; try { es = fs.readdirSync(dr).filter(f => /\.mdc$/i.test(f)).sort(); } catch { }
    for (const f of es.slice(0, 100)) out.push({ archivo: path.join(dr, f), etiqueta: 'cursor', slug: slugDe(f.replace(/\.mdc$/i, '')) || 'regla', nombre: f.replace(/\.mdc$/i, '') });
    const ag = path.join(cwd, 'AGENTS.md');
    if (fs.existsSync(ag)) out.push({ archivo: ag, etiqueta: 'agents', slug: `agents-md-${slugDe(path.basename(cwd)) || 'proyecto'}`.slice(0, 64), nombre: `AGENTS.md (${path.basename(cwd)})`, proyecto: path.basename(cwd) });
    return out;
  }
  // escribe <dir>/skills/_reglas/<slug>/SKILL.md solo si el original cambió
  function espejo(r, slug) {
    try {
      const st = fs.statSync(r.archivo); if (!st.isFile() || st.size > 512 * 1024) return null;
      const d = path.join(dir, '_reglas', slug), f = path.join(d, 'SKILL.md');
      try { if (fs.statSync(f).mtimeMs >= st.mtimeMs) return d; } catch { }
      const { datos, cuerpo } = parsearSkillMd(fs.readFileSync(r.archivo, 'utf8'));
      const primera = cuerpo.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
      const desc = r.etiqueta === 'agents' ? `Instrucciones del proyecto ${r.proyecto} para agentes (AGENTS.md): úsalas al trabajar en ese proyecto. ${primera}`
        : `${datos.description || primera || `Regla de Cursor ${r.nombre}`}${datos.globs ? ` (archivos: ${Array.isArray(datos.globs) ? datos.globs.join(', ') : datos.globs})` : ''}${datos.alwaysApply === true ? ' (aplicar siempre)' : ''}`;
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(f, componerSkillMd({ name: r.nombre, description: String(desc).replace(/\s+/g, ' ').trim().slice(0, 1000) }, cuerpo));
      return d;
    } catch { return null; }
  }
  function armar(s, slug, d, inst, externa) {
    return { slug, nombre: s.nombre, descripcion: s.descripcion, activa: !!inst.activa, origen: inst.origen || { tipo: 'local' }, externa,
      version: inst.version || s.apolo.version || '', escaneo: inst.escaneo || null, firma: inst.firma || null, usos: inst.usos || 0, ultimoUso: inst.ultimoUso || null,
      permisos: s.apolo.permisos, archivos: s.archivos, dir: d, sha: inst.sha || null, fecha: inst.fecha || null, clave: inst.clave,
      disparadores: s.apolo.disparadores, modelos: s.apolo.modelos, canales: s.apolo.canales, allowedTools: s.allowedTools, licencia: s.licencia, autor: s.apolo.autor,
      borrador: !!inst.borrador, evals: inst.evals || null, mejorada: inst.mejorada || null };
  }
  function lista() {
    if (!cache || Date.now() - cacheT > 3000) { cache = escanearTodo(); cacheT = Date.now(); }
    return cache;
  }
  const obtener = slug => lista().find(s => s.slug === slug) || lista().find(s => s.nombre.toLowerCase() === String(slug || '').toLowerCase()) || null;
  function contenido(slug) { const s = obtener(slug); return s ? leerSkill(s.dir) : null; }

  // ---- escritura del estado ----
  function escribirInstalado(slug, datos) {
    const f = path.join(dir, slug, 'instalado.json');
    fs.writeFileSync(f, JSON.stringify({ ...leerJSON(f, {}), ...datos }, null, 2)); invalidar();
  }
  function actualizarEstado(slug, cambios, { silencioso = false } = {}) {
    const s = obtener(slug); if (!s) throw new Error(`no existe la skill "${slug}"`);
    if (s.externa) { const est = leerJSON(fExt, {}); est[s.clave] = { ...est[s.clave], ...cambios }; fs.writeFileSync(fExt, JSON.stringify(est, null, 2)); invalidar(); }
    else escribirInstalado(s.slug, cambios);
    if (!silencioso) avisar('cambio', s.slug);
    return obtener(s.slug);
  }
  const contarUso = slug => { const s = obtener(slug); if (s) actualizarEstado(s.slug, { usos: (s.usos || 0) + 1, ultimoUso: Date.now() }, { silencioso: true }); };
  function borrar(slug) {
    const s = obtener(slug); if (!s) return false;
    if (s.externa) throw new Error('es una skill externa (de otra app): no se borra desde aquí, desactívala');
    fs.rmSync(s.dir, { recursive: true, force: true }); invalidar(); avisar('borrada', s.slug);
    return true;
  }

  try { migrar(); } catch { }
  return { dir, lista, obtener, contenido, escribirInstalado, actualizarEstado, contarUso, borrar, migrar, invalidar, libre, avisar };
}

module.exports = { crearAlmacen, rutasExternas };
