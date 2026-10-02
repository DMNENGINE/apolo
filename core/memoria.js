// Memoria persistente compartida por todos los modelos y canales.
// <dir>/memoria.json: [{ id, texto, tipo, creada, actualizada, usos, origen }]
//   tipo: perfil (quién es el usuario: va SIEMPRE en el contexto) | preferencia | proyecto | persona | hecho
// Búsqueda híbrida: léxica propia (tokens sin acentos, sin palabras vacías, con prefijos y peso por rareza)
// + semántica con embeddings (vectores.js) si hay modelo; los vectores van en <dir>/memoria_vec.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { coseno, aBase64, deBase64 } = require('./vectores');

const UMBRAL_SEM = 0.3;       // coseno mínimo para que un recuerdo cuente solo por significado (embeddinggemma: ruido ≤0.23, relevante 0.3–0.55)
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

const TIPOS = ['perfil', 'preferencia', 'proyecto', 'persona', 'hecho'];
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
  const guardar = () => { fs.writeFileSync(f, JSON.stringify(lista, null, 2)); try { mtime = fs.statSync(f).mtimeMs; } catch { } };
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
      if (cambio) fs.writeFileSync(fv, JSON.stringify(vecs));
      return faltan.length;
    })().finally(() => { indexando = null; });
    return indexando;
  }
  const indexarLuego = () => { indexar().catch(() => { }); };
  indexarLuego();

  // guarda o actualiza; si ya hay uno casi igual, lo reemplaza en vez de duplicar
  function recordar({ texto, tipo = 'hecho', reemplaza, origen }) {
    sync();
    texto = String(texto || '').trim();
    if (!texto) throw new Error('texto vacío');
    if (texto.length > 600) throw new Error('demasiado largo: guarda un dato concreto (máx. 600 caracteres)');
    if (SECRETO.test(texto)) throw new Error('parece una contraseña o clave: no se guardan secretos en la memoria');
    if (!TIPOS.includes(tipo)) tipo = 'hecho';
    let m = reemplaza && lista.find(x => x.id === reemplaza);
    if (!m) m = lista.find(x => x.tipo === tipo && parecido(x.texto, texto) >= 0.6);
    if (m) { Object.assign(m, { texto, tipo, actualizada: Date.now(), origen: origen || m.origen }); guardar(); indexarLuego(); return { ...m, accion: 'actualizada' }; }
    m = { id: crypto.randomUUID().slice(0, 6), texto, tipo, creada: Date.now(), actualizada: Date.now(), usos: 0, origen };
    lista.push(m); guardar(); indexarLuego();
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
  const bonus = m => (1 + 0.1 * Math.min(m.usos || 0, 10)) * ((Date.now() - m.actualizada) / 86400_000 < 30 ? 1.1 : 1);
  const candidatos = excluirPerfil => lista.filter(m => !(excluirPerfil && m.tipo === 'perfil'));

  // solo léxica, síncrona
  function buscar(consulta, { limite = 6, excluirPerfil = false } = {}) {
    sync();
    const docs = candidatos(excluirPerfil), lex = lexico(consulta, docs);
    return docs.map((m, i) => ({ m, s: lex[i] * bonus(m) }))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limite).map(x => x.m);
  }

  // híbrida: significado (coseno) + palabras; si no hay embeddings o fallan, cae a la léxica
  async function buscarH(consulta, { limite = 6, excluirPerfil = false, timeout = 4000 } = {}) {
    if (!embedder || !String(consulta || '').trim()) return buscar(consulta, { limite, excluirPerfil });
    let qv;
    try { [qv] = await embedder.embeber([consulta], { tipo: 'consulta', timeout }); }
    catch { return buscar(consulta, { limite, excluirPerfil }); }
    sync();
    if (lista.some(m => vecs.v[m.id]?.h !== hash(m.texto))) await indexar().catch(() => { });
    const docs = candidatos(excluirPerfil), lex = lexico(consulta, docs);
    const maxLex = Math.max(0, ...lex) || 1;
    return docs.map((m, i) => {
      const v = vector(m.id), sem = v ? coseno(qv, v) : 0;
      if (sem < UMBRAL_SEM && lex[i] === 0) return null;
      return { m, s: (sem + 0.3 * lex[i] / maxLex) * bonus(m) };
    }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, limite).map(x => x.m);
  }

  // bloque para el system prompt: perfil siempre + lo relevante para el mensaje actual
  async function contexto(mensaje, { maxChars = 2500 } = {}) {
    sync();
    const perfil = lista.filter(m => m.tipo === 'perfil');
    const relevantes = await buscarH(mensaje, { limite: 8, excluirPerfil: true });
    if (relevantes.length) { for (const m of relevantes) m.usos = (m.usos || 0) + 1; guardar(); }
    const lineas = [];
    let n = 0;
    for (const m of [...perfil, ...relevantes]) {
      const l = `- [${m.id}·${m.tipo}] ${m.texto}`;
      if (n + l.length > maxChars) break;
      lineas.push(l); n += l.length;
    }
    return lineas.join('\n');
  }

  return { recordar, olvidar, buscar, buscarH, contexto, indexar, semantica: () => (embedder ? { modelo: embedder.id, indexados: Object.keys(vecs.v).length } : null), lista: () => { sync(); return lista; }, TIPOS };
}

// búsqueda en conversaciones pasadas (sesiones jsonl)
function buscarHistorial({ cfg, consulta, dias = 30, limite = 8 }) {
  const dir = path.join(cfg.dir, 'sesiones');
  const q = [...new Set(tokens(consulta))].map(raiz);
  if (!q.length) return [];
  const desde = Date.now() - dias * 86400_000, res = [];
  let archivos = []; try { archivos = fs.readdirSync(dir).filter(x => x.endsWith('.jsonl')); } catch { }
  for (const a of archivos) {
    const fp = path.join(dir, a);
    try { if (fs.statSync(fp).mtimeMs < desde) continue; } catch { continue; }
    for (const l of fs.readFileSync(fp, 'utf8').split('\n')) {
      if (!l) continue;
      let m; try { m = JSON.parse(l); } catch { continue; }
      if ((m.role !== 'user' && m.role !== 'assistant') || !m.content || (m.t && m.t < desde)) continue;
      const t = new Set(tokens(m.content).map(raiz));
      const s = q.filter(w => t.has(w)).length;
      if (s) res.push({ s, t: m.t || 0, rol: m.role, sesion: a.replace('.jsonl', ''), texto: m.content.slice(0, 300) });
    }
  }
  return res.sort((a, b) => b.s - a.s || b.t - a.t).slice(0, limite);
}

module.exports = { crearMemoria, buscarHistorial, parecido, tokens };
