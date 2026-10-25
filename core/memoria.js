// Memoria persistente compartida por todos los modelos y canales.
// <dir>/memoria.json: [{ id, texto, tipo, creada, actualizada, usos, origen }]
//   historico: true = ya no es actual pero es parte de su historia (texto en pasado; textoOriginal y fecha del dato)
//   tipo: perfil (quién es el usuario: va SIEMPRE en el contexto) | preferencia | proyecto | persona | hecho | patron (lo deduce el sueño REM)
// Búsqueda híbrida: léxica propia (tokens sin acentos, sin palabras vacías, con prefijos y peso por rareza)
// + semántica con embeddings (vectores.js) si hay modelo; los vectores van en <dir>/memoria_vec.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { coseno, aBase64, deBase64 } = require('./vectores');

const UMBRAL_SEM = 0.3;       // coseno mínimo para que un recuerdo cuente solo por significado (embeddinggemma: ruido ≤0.23, relevante 0.3–0.55)
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

const TIPOS = ['perfil', 'preferencia', 'proyecto', 'persona', 'hecho', 'patron'];
const VACIAS = new Set(('a al algo como con de del el ella ellos en es esa ese eso esta este esto fue ha hay la las le les lo los me mi mis muy no nos o para pero por que se si sin son su sus te tu tus un una uno unos y ya yo ' +
  'the a an and are as at be by for from has have i in is it of on or that the this to was were with you your').split(' '));
const SECRETO = /(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|AQ.[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|\b(contrase[nñ]a|password|passwd|api[ _-]?key|token)\b\s*[:=]\s*\S{6,})/i;

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = s => normal(s).split(/[^a-z0-9ñ]+/).filter(t => t.length > 1 && !VACIAS.has(t));
const raiz = t => (t.length > 5 ? t.slice(0, 5) : t);                // "proyectos" ~ "proyecto", "camiones" ~ "camion"

function parecido(a, b) {                                           // Jaccard de raíces
  const A = new Set(tokens(a).map(raiz)), B = new Set(tokens(b).map(raiz));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / (A.size + B.size - i);
}

function crearMemoria({ cfg, embedder = null }) {
  const f = path.join(cfg.dir, 'memoria.json');
  const fv = path.join(cfg.dir, 'memoria_vec.json');
  let lista = [], mtime = 0;
  const sync = () => { try { const m = fs.statSync(f).mtimeMs; if (m !== mtime) { lista = JSON.parse(fs.readFileSync(f, 'utf8')); mtime = m; } } catch { } };
  const guardar = () => { require('./persistencia').escribirAtomico(f, JSON.stringify(lista, null, 2)); try { mtime = fs.statSync(f).mtimeMs; } catch { } };
  sync();

  // vectores: { modelo, v: { id: { h: hash del texto, e: base64 Float32 } } }; si cambia el modelo se rehacen
  let vecs = { modelo: embedder?.id, v: {} };
  try { const g = JSON.parse(fs.readFileSync(fv, 'utf8')); if (g.modelo === embedder?.id) vecs = g; } catch { }
  const cache = new Map();                              // id -> Float32Array decodificado
  const vector = id => { const x = vecs.v[id]; if (!x) return null; let c = cache.get(id); if (!c || c.h !== x.h) { c = { h: x.h, e: deBase64(x.e) }; cache.set(id, c); } return c.e; };
  let indexando = null;
  // embebe los recuerdos nuevos o cambiados y borra los vectores huérfanos; una sola pasada a la vez
  function indexar() {
    if (!embedder) return Promise.resolve(0);
    if (indexando) return indexando;
    indexando = (async () => {
      sync();
      const vivos = new Set(lista.map(m => m.id));
      let cambio = false;
      for (const id of Object.keys(vecs.v)) if (!vivos.has(id)) { delete vecs.v[id]; cambio = true; }
      const faltan = lista.filter(m => vecs.v[m.id]?.h !== hash(m.texto));
      for (let i = 0; i < faltan.length; i += 32) {
        const lote = faltan.slice(i, i + 32);
        const es = await embedder.embeber(lote.map(m => m.texto), { tipo: 'documento', timeout: 60_000 });
        lote.forEach((m, j) => { vecs.v[m.id] = { h: hash(m.texto), e: aBase64(es[j]) }; });
        cambio = true;
      }
      if (cambio) require('./persistencia').escribirAtomico(fv, JSON.stringify(vecs));
      return faltan.length;
    })().finally(() => { indexando = null; });
    return indexando;
  }
  const indexarLuego = () => { indexar().catch(() => { }); };
  indexarLuego();

  // guarda o actualiza; si ya hay uno casi igual, lo reemplaza en vez de duplicar
  function recordar({ texto, tipo = 'hecho', reemplaza, origen, nuevo = false }, procedencia) {
    sync();
    texto = String(texto || '').trim();
    if (!texto) throw new Error('texto vacío');
    if (texto.length > 600) throw new Error('demasiado largo: guarda un dato concreto (máx. 600 caracteres)');
    if (SECRETO.test(texto)) throw new Error('parece una contraseña o clave: no se guardan secretos en la memoria');
    if (!TIPOS.includes(tipo)) tipo = 'hecho';
    const p = procedencia ? { clase: ['usuario', 'agente', 'externa', 'sistema'].includes(procedencia.clase) ? procedencia.clase : 'externa', proyecto: procedencia.proyecto && path.resolve(procedencia.proyecto), usuario: procedencia.usuario, sesion: procedencia.sesion, observada: Date.now(), confianza: procedencia.clase === 'usuario' ? 1 : procedencia.clase === 'agente' ? 0.5 : 0, vigenteHasta: Number.isFinite(procedencia.vigenteHasta) ? procedencia.vigenteHasta : undefined } : undefined;
    const compatible = x => (!p && !x.procedencia) || (p && x.procedencia?.clase === p.clase && x.procedencia?.proyecto === p.proyecto && x.procedencia?.usuario === p.usuario);
    let m = reemplaza && lista.find(x => x.id === reemplaza && (compatible(x) || (!x.procedencia && p && !p.usuario && ['usuario', 'agente'].includes(p.clase))));
    if (reemplaza && !m) throw new Error('recuerdo fuera del alcance o de otra procedencia');
    if (!m && !nuevo) m = lista.find(x => compatible(x) && x.tipo === tipo && !x.historico && parecido(x.texto, texto) >= 0.6);
    if (m) { if (m.texto !== texto) m.versiones = [...(m.versiones || []), { texto: m.texto, actualizada: m.actualizada, procedencia: m.procedencia }]; Object.assign(m, { texto, tipo, actualizada: Date.now(), origen: origen || m.origen, ...(p ? { procedencia: p } : {}) }); guardar(); indexarLuego(); usar('escribir', [m.id]); return { ...m, accion: 'actualizada' }; }
    m = { id: crypto.randomUUID().slice(0, 6), texto, tipo, creada: Date.now(), actualizada: Date.now(), usos: 0, origen, ...(p ? { procedencia: p } : {}) };
    lista.push(m); guardar(); indexarLuego(); usar('escribir', [m.id]);
    return { ...m, accion: 'creada' };
  }

  function olvidar(id) { sync(); const n = lista.length; lista = lista.filter(m => m.id !== id); if (lista.length < n) { guardar(); indexarLuego(); } return lista.length < n; }

  // puntuación léxica de cada recuerdo (0 = no comparte palabras)
  function lexico(consulta, docs) {
    const q = [...new Set(tokens(consulta))];
    if (!q.length) return docs.map(() => 0);
    const ts = docs.map(m => tokens(m.texto));
    const N = docs.length || 1;
    const df = t => ts.filter(d => d.some(x => x === t || raiz(x) === raiz(t))).length;
    const pesos = Object.fromEntries(q.map(t => [t, Math.log(1 + N / (1 + df(t)))]));
    return ts.map(t => {
      let s = 0;
      for (const w of q) {
        if (t.includes(w)) s += pesos[w];
        else if (t.some(x => raiz(x) === raiz(w))) s += pesos[w] * 0.7;
      }
      return s;
    });
  }
  const bonus = m => ((Date.now() - m.actualizada) / 86400_000 < 30 ? 1.1 : 1);
  // la memoria es de APOLO entero (cualquier canal o carpeta); solo los recuerdos de tipo 'proyecto' se quedan en su carpeta.
  // 'externa' (guardado tras leer contenido de fuera) no se inyecta: evita que una web siembre recuerdos.
  const visible = (m, o = {}) => !m.procedencia || ((!m.procedencia.vigenteHasta || m.procedencia.vigenteHasta > Date.now()) && m.procedencia.clase !== 'externa' && (m.tipo !== 'proyecto' || !m.procedencia.proyecto || !o.proyecto || path.resolve(o.proyecto) === m.procedencia.proyecto) && (!m.procedencia.usuario || o.usuario === m.procedencia.usuario));
  const candidatos = (excluirPerfil, o) => lista.filter(m => !(excluirPerfil && m.tipo === 'perfil') && visible(m, o));

  // solo léxica, síncrona
  function buscar(consulta, { limite = 6, excluirPerfil = false, ...alcance } = {}) {
    sync();
    const docs = candidatos(excluirPerfil, alcance), lex = lexico(consulta, docs);
    return docs.map((m, i) => ({ m, s: lex[i] * bonus(m) }))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limite).map(x => x.m);
  }

  // híbrida: significado (coseno) + palabras; si no hay embeddings o fallan, cae a la léxica
  async function buscarH(consulta, { limite = 6, excluirPerfil = false, timeout = 4000, ...alcance } = {}) {
    if (!embedder || !String(consulta || '').trim()) return buscar(consulta, { limite, excluirPerfil, ...alcance });
    let qv;
    try { [qv] = await embedder.embeber([consulta], { tipo: 'consulta', timeout }); }
    catch { return buscar(consulta, { limite, excluirPerfil, ...alcance }); }
    sync();
    if (lista.some(m => vecs.v[m.id]?.h !== hash(m.texto))) await indexar().catch(() => { });
    const docs = candidatos(excluirPerfil, alcance), lex = lexico(consulta, docs);
    const maxLex = Math.max(0, ...lex) || 1;
    return docs.map((m, i) => {
      const v = vector(m.id), sem = v ? coseno(qv, v) : 0;
      if (sem < UMBRAL_SEM && lex[i] === 0) return null;
      return { m, s: (sem + 0.3 * lex[i] / maxLex) * bonus(m) };
    }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, limite).map(x => x.m);
  }

  // uso en vivo (para ver en el grafo cómo el modelo toca la memoria): alUsar(fn(accion, ids)); usar('leer'|'escribir', ids)
  let oyenteUso = null;
  const usar = (accion, ids) => { if (oyenteUso && ids?.length) try { oyenteUso(accion, ids); } catch { } };
  const alUsar = f => { oyenteUso = f; };

  // bloque para el system prompt: perfil siempre + lo relevante para el mensaje actual
  async function contexto(mensaje, { maxChars = 2500, ...alcance } = {}) {
    sync();
    const perfil = lista.filter(m => m.tipo === 'perfil' && visible(m, alcance));
    const relevantes = await buscarH(mensaje, { limite: 8, excluirPerfil: true, ...alcance });
    if (relevantes.length) { for (const m of relevantes) m.usos = (m.usos || 0) + 1; guardar(); }
    const lineas = [], leidos = [];
    let n = 0;
    for (const m of [...perfil, ...relevantes]) {                  // el perfil usa como mucho el 60 %: lo relevante siempre cabe
      const l = `- [${m.id}·${m.tipo}${m.historico ? '·antes' : ''}] ${m.texto}`;
      if (n + l.length > (m.tipo === 'perfil' ? maxChars * 0.6 : maxChars)) { if (m.tipo === 'perfil') continue; break; }
      lineas.push(l); n += l.length; leidos.push(m.id);
    }
    usar('leer', leidos);                                          // todo lo que entra al contexto (perfil incluido) → grafo en vivo
    return lineas.join('\n');
  }

  // cambios directos (los usa el sueño: fusionar usos, condensar el perfil) sin pasar por la deduplicación
  function editar(id, campos = {}) {
    sync(); const m = lista.find(x => x.id === id); if (!m) return null;
    if (campos.texto !== undefined) { const t = String(campos.texto).trim(); if (!t || SECRETO.test(t)) throw new Error('texto no válido'); m.texto = t.slice(0, 600); }
    for (const k of ['tipo', 'usos', 'origen', 'fusionados', 'historico', 'textoOriginal', 'fecha']) if (campos[k] !== undefined) m[k] = k === 'tipo' && !TIPOS.includes(campos[k]) ? m.tipo : campos[k];
    m.actualizada = campos.actualizada || Date.now(); guardar(); indexarLuego(); return { ...m };
  }
  // borra todo (privacidad): memoria y vectores
  function borrarTodo() { sync(); const n = lista.length; lista = []; guardar(); vecs = { modelo: embedder?.id, v: {} }; cache.clear(); try { fs.unlinkSync(fv); } catch { } return n; }

  return { recordar, olvidar, editar, borrarTodo, usar, alUsar, vector: id => { sync(); const m = lista.find(x => x.id === id); return m && vecs.v[id]?.h === hash(m.texto) ? vector(id) : null; },
    buscar, buscarH, contexto, indexar, semantica: () => (embedder ? { modelo: embedder.id, indexados: Object.keys(vecs.v).length } : null), lista: () => { sync(); return lista; }, TIPOS };
}

// búsqueda en conversaciones pasadas (sesiones jsonl)
function buscarHistorial({ cfg, consulta, dias = 30, limite = 8, proyecto, usuario }) {
  return require('./indice-historial').buscar({ cfg, consulta, dias, limite, proyecto, usuario });
}

module.exports = { crearMemoria, buscarHistorial, parecido, tokens, normal, raiz, TIPOS, SECRETO };
