// Marketplace de skills: catálogo agregado de fuentes públicas SIN clave, con caché en disco (6 h).
//   · anthropics/skills (GitHub): lista de carpetas con la API contents + SKILL.md de cada una por raw.githubusercontent.com
//     (raw no gasta cuota de la API). cfg.skills.marketplaceAnthropic=false la quita.
//   · índices propios (cfg.skills.catalogos = [url, …]): JSON "apolo-marketplace/1" (ver docs/marketplace.md)
// Instalar NO pasa por aquí: el panel llama a la instalación de siempre con entrada.fuente (cuarentena + escáner + firma).
const fs = require('fs');
const path = require('path');
const { parsearSkillMd, slugDe } = require('./formato');
const { parsearGithub } = require('./instalar');

const CACHE_MS = 6 * 3600_000, MAX_TXT = 400 * 1024, MAX_ENTRADAS = 2000;
const INDICE_APOLO = 'https://raw.githubusercontent.com/DMNENGINE/apolo/main/marketplace/indice.json';
const ETIQUETAS = [
  ['documentos', /\b(pdf|docx?|xlsx|pptx|word|excel|powerpoint|spreadsheets?|documents?|presentations?|hojas? de cálculo|documentos?)\b/i],
  ['diseño', /\b(design|diseño|art|canvas|themes?|brand(ing)?|gifs?|posters?|colou?rs?|fonts?|tipografía)\b/i],
  ['web', /\b(web|webapps?|frontend|html|react|browser|navegador|playwright)\b/i],
  ['desarrollo', /\b(mcp|api|sdk|code|código|servers?|developers?|programación)\b/i],
  ['pruebas', /\b(test|testing|pruebas?)\b/i],
  ['comunicación', /\b(slack|comms|communications?|email|correo|newsletters?|announcements?)\b/i],
  ['escritura', /\b(writing|write|co-?author\w*|redacta\w*|escrib\w*)\b/i],
];
const adivinarEtiquetas = t => ETIQUETAS.filter(([, re]) => re.test(t)).map(([e]) => e);
const txt = (v, n = 1000) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// valida y normaliza una entrada de un índice propio (devuelve null si no sirve)
function normalizarEntrada(e, origen) {
  if (!e || typeof e !== 'object' || typeof e.nombre !== 'string' || typeof e.fuente !== 'string' || !e.nombre.trim() || !e.fuente.trim()) return null;
  const tipo = e.tipo === 'plugin' ? 'plugin' : 'skill';
  const firma = e.firma && typeof e.firma === 'object' && typeof e.firma.clavePublica === 'string' ? { autor: txt(e.firma.autor, 80), clavePublica: e.firma.clavePublica.trim() } : null;
  return {
    id: `${origen}:${tipo}:${slugDe(e.nombre) || slugDe(e.fuente)}`, origen, tipo,
    nombre: txt(e.nombre, 80), descripcion: txt(e.descripcion, 1000), fuente: e.fuente.trim().slice(0, 500), autor: txt(e.autor, 80),
    etiquetas: (Array.isArray(e.etiquetas) ? e.etiquetas : []).map(x => txt(x, 30).toLowerCase()).filter(Boolean).slice(0, 12),
    ...(firma ? { firma } : {}), ...(e.version ? { version: txt(e.version, 30) } : {}), ...(e.licencia ? { licencia: txt(e.licencia, 40) } : {}),
    ...(typeof e.readme === 'string' && /^https:\/\//i.test(e.readme) ? { readme: e.readme.trim() } : {}),
    ...(typeof e.web === 'string' && /^https:\/\//i.test(e.web) ? { web: e.web.trim() } : {}),
  };
}
// índice propio: array de entradas o {formato, nombre, entradas}
function leerIndice(j, origen) {
  const lista = Array.isArray(j) ? j : Array.isArray(j?.entradas) ? j.entradas : null;
  if (!lista) throw new Error('el índice no tiene "entradas"');
  if (!Array.isArray(j) && j.formato && !/^apolo-marketplace\/1/.test(j.formato)) throw new Error(`formato de índice desconocido (${String(j.formato).slice(0, 40)})`);
  const vistos = new Set(), out = [];
  for (const e of lista.slice(0, MAX_ENTRADAS)) { const n = normalizarEntrada(e, origen); if (n && !vistos.has(n.id)) { vistos.add(n.id); out.push(n); } }
  return { nombre: !Array.isArray(j) && j.nombre ? txt(j.nombre, 60) : '', entradas: out };
}

// URL raw del README/SKILL.md de una fuente de GitHub (owner/repo/ruta[@ref])
function rawDe(fuente, archivo) {
  const g = parsearGithub(String(fuente || '').trim());
  if (!g) return '';
  return `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${g.ref || 'HEAD'}/${g.ruta ? g.ruta + '/' : ''}${archivo}`;
}

function crearMarketplace({ cfg, fetch: traer = globalThis.fetch, tokenGithub } = {}) {
  const sk = () => cfg.skills || {};
  const fCache = path.join(cfg.dir, 'skills', '_catalogo.json');
  const fichas = new Map();                                      // id → texto (SKILL.md / README) ya descargado
  const leerCache = () => { try { return JSON.parse(fs.readFileSync(fCache, 'utf8')); } catch { return { fuentes: {} }; } };
  const guardarCache = c => { try { fs.mkdirSync(path.dirname(fCache), { recursive: true }); fs.writeFileSync(fCache, JSON.stringify(c)); } catch { } };
  const ghHeaders = () => {
    let t = sk().githubToken || '';
    if (!t && sk().usarTokenGithub !== false) { try { t = tokenGithub?.() || ''; } catch { } }
    return { accept: 'application/vnd.github+json', 'user-agent': 'APOLO-marketplace', ...(t ? { authorization: 'Bearer ' + t } : {}) };
  };
  async function bajar(url, { json = false, headers = {} } = {}) {
    const r = await traer(url, { headers: { 'user-agent': 'APOLO-marketplace', ...headers }, signal: AbortSignal.timeout(20_000), redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 || r.status === 429 ? ' (límite de GitHub: conecta tu token o espera)' : ''}`);
    const t = await r.text();
    if (t.length > (json ? 4 * 1024 * 1024 : MAX_TXT)) throw new Error('respuesta demasiado grande');
    return json ? JSON.parse(t) : t;
  }

  function fuentes() {
    const out = [];
    if (sk().marketplaceAnthropic !== false) out.push({ id: 'anthropics', nombre: 'anthropics/skills', tipo: 'github', repo: 'anthropics/skills', ruta: 'skills', autor: 'Anthropic' });
    const cats = Array.isArray(sk().catalogos) ? sk().catalogos : [INDICE_APOLO];
    for (const c of cats) {
      const url = typeof c === 'string' ? c : c?.url;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) out.push({ id: 'idx-' + slugDe(url.replace(/^https?:\/\//, '')).slice(0, 50), nombre: (typeof c === 'object' && c.nombre) || url.replace(/^https?:\/\//, '').replace(/\/[^/]*$/, ''), tipo: 'indice', url });
    }
    return out;
  }

  // anthropics/skills: carpetas de skills/ + SKILL.md de cada una (6 a la vez)
  async function cargarGithub(f) {
    const lista = await bajar(`https://api.github.com/repos/${f.repo}/contents/${f.ruta}`, { json: true, headers: ghHeaders() });
    if (!Array.isArray(lista)) throw new Error('respuesta inesperada de GitHub');
    const dirs = lista.filter(x => x && x.type === 'dir' && /^[\w.-]+$/.test(x.name)).slice(0, 300);
    const out = [];
    let i = 0;
    const trabajador = async () => {
      while (i < dirs.length) {
        const d = dirs[i++], fuente = `${f.repo}/${f.ruta}/${d.name}`;
        let datos = {}, cuerpo = '', texto = '';
        try { texto = await bajar(rawDe(fuente, 'SKILL.md')); ({ datos, cuerpo } = parsearSkillMd(texto)); } catch { }
        const nombre = txt(datos.name || d.name, 80), descripcion = txt(datos.description || cuerpo.split('\n').find(l => l.trim() && !l.startsWith('#')) || '', 1000);
        const e = { id: `${f.id}:skill:${slugDe(d.name)}`, origen: f.id, tipo: 'skill', nombre, descripcion, fuente, autor: f.autor,
          etiquetas: ['anthropic', ...adivinarEtiquetas(`${d.name} ${descripcion}`)], ...(datos.license ? { licencia: txt(datos.license, 60) } : {}),
          web: `https://github.com/${f.repo}/tree/HEAD/${f.ruta}/${d.name}` };
        if (texto) e._texto = texto;
        out.push(e);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, dirs.length) }, trabajador));
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  async function cargarIndice(f) {
    const r = leerIndice(await bajar(f.url, { json: true }), f.id);
    if (r.nombre) f.nombre = r.nombre;
    return r.entradas;
  }

  // catálogo agregado. refrescar=true ignora la caché. Una fuente que falla conserva sus entradas viejas y avisa.
  let enCurso = null;
  async function catalogo({ refrescar = false } = {}) {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const cache = leerCache(), ahora = Date.now(), fs_ = fuentes(), estado = [];
      let cambio = false;
      await Promise.all(fs_.map(async f => {
        const c = cache.fuentes[f.id];
        if (!refrescar && c && ahora - c.t < CACHE_MS && !c.error) { estado.push({ ...f, n: c.entradas.length, t: c.t, nombre: c.nombre || f.nombre }); return; }
        try {
          const entradas = f.tipo === 'github' ? await cargarGithub(f) : await cargarIndice(f);
          for (const e of entradas) if (e._texto) { fichas.set(e.id, e._texto); delete e._texto; }
          cache.fuentes[f.id] = { t: ahora, entradas, nombre: f.nombre }; cambio = true;
          estado.push({ ...f, n: entradas.length, t: ahora });
        } catch (e) {
          const viejas = c?.entradas || [];
          cache.fuentes[f.id] = { t: c?.t || 0, entradas: viejas, nombre: c?.nombre || f.nombre, error: e.message }; cambio = true;
          estado.push({ ...f, n: viejas.length, t: c?.t || 0, error: e.message });
        }
      }));
      for (const k of Object.keys(cache.fuentes)) if (!fs_.some(f => f.id === k)) { delete cache.fuentes[k]; cambio = true; }   // fuente quitada de la config
      if (cambio) guardarCache(cache);
      // la misma fuente en dos catálogos (p. ej. el índice de APOLO recomienda una de anthropics) → una entrada con las etiquetas unidas
      const porFuente = new Map(), entradas = [];
      for (const e0 of fs_.flatMap(f => cache.fuentes[f.id]?.entradas || [])) {
        const k = `${e0.tipo}|${e0.fuente.toLowerCase().replace(/\/+$/, '')}`, ya = porFuente.get(k);
        if (!ya) { const e = { ...e0, etiquetas: [...e0.etiquetas], catalogos: [e0.origen] }; porFuente.set(k, e); entradas.push(e); continue; }
        for (const t of e0.etiquetas) if (!ya.etiquetas.includes(t)) ya.etiquetas.push(t);
        if (!ya.catalogos.includes(e0.origen)) ya.catalogos.push(e0.origen);
        if (!ya.firma && e0.firma) ya.firma = e0.firma;
      }
      const cuenta = {}; for (const e of entradas) for (const t of e.etiquetas) cuenta[t] = (cuenta[t] || 0) + 1;
      return {
        entradas, fuentes: fs_.map(f => estado.find(x => x.id === f.id)).filter(Boolean).map(({ id, nombre, tipo, url, repo, n, t, error }) => ({ id, nombre, tipo, url: url || `https://github.com/${repo}`, n, t, ...(error ? { error } : {}) })),
        etiquetas: Object.entries(cuenta).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([etiqueta, n]) => ({ etiqueta, n })),
        actualizado: Math.max(0, ...fs_.map(f => cache.fuentes[f.id]?.t || 0)), cacheHoras: CACHE_MS / 3600_000,
      };
    })();
    try { return await enCurso; } finally { enCurso = null; }
  }

  // ficha: entrada + SKILL.md (o README.md) de la fuente
  async function ficha(id) {
    const cat = await catalogo();
    const e = cat.entradas.find(x => x.id === id);
    if (!e) { const er = new Error(`no está en el catálogo: ${id}`); er.status = 404; throw er; }
    if (fichas.has(id)) return { entrada: e, texto: fichas.get(id) };
    const candidatos = e.readme ? [e.readme] : e.tipo === 'plugin' ? [rawDe(e.fuente, 'README.md'), rawDe(e.fuente, 'apolo-plugin.json')] : [rawDe(e.fuente, 'SKILL.md'), rawDe(e.fuente, 'README.md')];
    let texto = '', error = '';
    for (const u of candidatos.filter(Boolean)) {
      try { texto = await bajar(u); if (/apolo-plugin\.json$/.test(u)) texto = '```json\n' + texto + '\n```'; break; } catch (x) { error = x.message; }
    }
    if (texto) fichas.set(id, texto);
    return { entrada: e, texto, ...(texto ? {} : { error: error || 'la fuente no es de GitHub: no hay ficha que mostrar' }) };
  }

  return { catalogo, ficha, fuentes };
}

module.exports = { crearMarketplace, leerIndice, normalizarEntrada, rawDe, INDICE_APOLO, CACHE_MS };
