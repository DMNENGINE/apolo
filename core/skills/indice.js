// Índice de skills para el prompt del sistema (divulgación progresiva):
//   - solo name + description de las skills ACTIVAS, con presupuesto de caracteres por modelo (los locales, menos)
//   - selección para el mensaje actual: disparadores (palabras / /regex/) → búsqueda híbrida (embeddings como la memoria
//     + léxica) → top-3 "sugeridas". Si el modelo es pequeño y la confianza es muy alta, se inyecta el SKILL.md entero.
// Vectores de las skills en <dir>/skills/_vec.json (por slug + hash de name+description).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { coseno, aBase64, deBase64 } = require('../vectores');
const { tokens } = require('../memoria');

const UMBRAL_SEM = 0.3;                    // como la memoria: por debajo es ruido
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const raiz = t => (t.length > 5 ? t.slice(0, 5) : t);

// ¿coincide algún disparador? "/regex/flags" o palabra/frase (sin acentos, con límites de palabra)
function disparado(disparadores, mensaje) {
  const m = normal(mensaje);
  for (const d of disparadores || []) {
    const re = String(d).match(/^\/(.+)\/([a-z]*)$/i);
    try {
      if (re) { if (new RegExp(re[1], re[2].replace(/[gy]/g, '') || 'i').test(mensaje)) return d; }
      else { const w = normal(d).trim(); if (w && new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(m)) return d; }
    } catch { }
  }
  return null;
}

function crearIndice({ cfg, almacen, embedder = null }) {
  const sk = () => cfg.skills || {};
  const fv = path.join(almacen.dir, '_vec.json');
  let vecs = { modelo: embedder?.id, v: {} };
  try { const g = JSON.parse(fs.readFileSync(fv, 'utf8')); if (g.modelo === embedder?.id) vecs = g; } catch { }
  const texto = s => `${s.nombre}: ${s.descripcion}`;
  let ultima = { q: null, v: null };

  async function indexar(skills) {
    if (!embedder) return;
    const faltan = skills.filter(s => vecs.v[s.slug]?.h !== hash(texto(s)));
    if (!faltan.length) return;
    const es = await embedder.embeber(faltan.map(texto), { tipo: 'documento', timeout: 20_000 });
    faltan.forEach((s, i) => { vecs.v[s.slug] = { h: hash(texto(s)), e: aBase64(es[i]) }; });
    try { fs.writeFileSync(fv, JSON.stringify(vecs)); } catch { }
  }

  // modelo local/pequeño (menos contexto, no siempre llama herramientas bien). Los "-cloud" de Ollama no cuentan
  function pequeno(modelo = '') {
    if (Array.isArray(sk().pequenos)) return sk().pequenos.some(p => new RegExp(p, 'i').test(modelo));
    const [prov, ...r] = String(modelo).split('/'); const mod = r.join('/');
    return !!cfg.proveedores?.[prov]?.local && !/cloud/i.test(mod);
  }
  const presupuesto = modelo => sk().presupuesto?.[modelo] ?? (pequeno(modelo) ? sk().presupuestoLocal ?? 1500 : sk().presupuestoNube ?? 5000);

  const visibles = ({ modelo, canal } = {}) => almacen.lista().filter(s => s.activa &&
    (!s.canales?.length || !canal || s.canales.includes(canal)) &&
    (!s.modelos?.length || !modelo || !sk().respetarModelos || s.modelos.some(m => modelo.includes(m))));

  // texto del índice dentro del presupuesto
  function indice({ modelo, canal } = {}) {
    const lista = visibles({ modelo, canal }).sort((a, b) => (b.usos || 0) - (a.usos || 0));
    const max = presupuesto(modelo), lineas = []; let n = 0;
    const corte = pequeno(modelo) ? 140 : 300;
    for (const s of lista) {
      const l = `- ${s.slug}: ${s.descripcion.length > corte ? s.descripcion.slice(0, corte - 1) + '…' : s.descripcion}`;
      if (n + l.length > max) { lineas.push(`- …y ${lista.length - lineas.length} más (usa ver_skills)`); break; }
      lineas.push(l); n += l.length + 1;
    }
    return lineas.join('\n');
  }

  // top-N para el mensaje: [{ slug, nombre, confianza 0..1, motivo }]
  async function seleccionar(mensaje, { modelo, canal, limite = 3, timeout = 3000 } = {}) {
    const lista = visibles({ modelo, canal });
    if (!lista.length || !String(mensaje || '').trim()) return [];
    const res = new Map();
    for (const s of lista) { const d = disparado(s.disparadores, mensaje); if (d) res.set(s.slug, { slug: s.slug, nombre: s.nombre, confianza: 1, motivo: `disparador "${d}"` }); }
    // léxica: parte de las palabras del mensaje que aparecen en name+description (con raíces)
    const q = [...new Set(tokens(mensaje).map(raiz))];
    const lex = lista.map(s => { if (!q.length) return 0; const t = new Set(tokens(texto(s).replace(/[-_]/g, ' ')).map(raiz)); return q.filter(w => t.has(w)).length / q.length; });
    let qv = null;
    if (embedder) {
      try {
        if (ultima.q === mensaje) qv = ultima.v;
        else { [qv] = await embedder.embeber([mensaje], { tipo: 'consulta', timeout }); ultima = { q: mensaje, v: qv }; }
        await indexar(lista);
      } catch { qv = null; }
    }
    lista.forEach((s, i) => {
      if (res.has(s.slug)) return;
      const v = qv && vecs.v[s.slug] ? deBase64(vecs.v[s.slug].e) : null;
      const sem = v ? coseno(qv, v) : 0;
      let conf;
      if (v) { if (sem < UMBRAL_SEM && lex[i] < 0.34) return; conf = Math.min(0.99, sem + 0.3 * lex[i]); }
      else { if (lex[i] < 0.34) return; conf = Math.min(0.8, lex[i]); }   // sin embeddings: solo léxica y nunca "muy alta"
      res.set(s.slug, { slug: s.slug, nombre: s.nombre, confianza: +conf.toFixed(3), motivo: v ? 'significado' : 'palabras' });
    });
    return [...res.values()].sort((a, b) => b.confianza - a.confianza).slice(0, limite);
  }

  // sección completa para el prompt. inyectada = slug cuyo SKILL.md va dentro (modelos pequeños, confianza alta)
  async function seccion({ sesion, mensaje }) {
    const modelo = sesion?.modelo || '', canal = sesion?.canal;
    const idx = indice({ modelo, canal });
    if (!idx) return { texto: '', sugeridas: [], inyectada: null };
    const sug = await seleccionar(mensaje, { modelo, canal }).catch(() => []);
    let inyectada = null, cuerpo = '';
    const umbral = sk().umbralInyectar ?? 0.85;
    if (sug[0] && sk().autoInyectar !== false && pequeno(modelo) && sug[0].confianza >= umbral) {
      const c = almacen.contenido(sug[0].slug);
      if (c) { inyectada = sug[0].slug; cuerpo = c.cuerpo.trim().slice(0, Math.max(2000, presupuesto(modelo) * 3)); almacen.contarUso(inyectada); }
    }
    const texto = [
      'SKILLS DISPONIBLES (instrucciones especializadas instaladas por el usuario). Si una encaja con la petición, cárgala con usar_skill {nombre} ANTES de hacer la tarea y sigue sus pasos; ' +
      'sus archivos se leen con leer_recurso_skill y sus scripts se ejecutan con ejecutar_script_skill.',
      idx,
      sug.length ? `Sugeridas para este mensaje: ${sug.map(s => `${s.slug} (${Math.round(s.confianza * 100)}%)`).join(', ')}` : '',
      inyectada ? `\nSKILL "${inyectada}" YA CARGADA (no hace falta usar_skill; síguela):\n${cuerpo}` : '',
    ].filter(Boolean).join('\n');
    return { texto, sugeridas: sug, inyectada };
  }

  return { indice, seleccionar, seccion, pequeno, presupuesto, indexar: () => indexar(visibles()) };
}

module.exports = { crearIndice, disparado };
