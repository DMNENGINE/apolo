// Clips de Medal (medal.tv) del usuario: el modelo los busca (por juego, título, fecha, duración), los ve y los trae al PC
// para editarlos con la suite (subtitular_video, FilmCraft…). Fuentes:
//   · las bases de Medal (%APPDATA%/Medal/medal-*.db y <carpeta de clips>/Databases): clips y capturas de la cuenta, con
//     título, juego, duración, fecha, vistas, enlace para compartir y el enlace firmado del vídeo (caduca; Medal lo renueva
//     mientras está abierto). Se leen con medal.py (solo lectura) porque el núcleo corre en un Node sin SQLite
//   · la carpeta de clips (ajuste ClipFolder de Medal): lo grabado y guardado en el PC, esté o no en la base
// El metadata va en el formato binario de Medal: cada valor empieza por un byte tipo|largo (nibble bajo = tipo, alto = largo;
// 0xC/0xD/0xE = el largo viene en 1/2/4 bytes): 0 null · 1 true · 2 false · 3 entero · 5 decimal · 7 texto · 8 JSON ·
// 11 lista · 12 objeto (claves y valores seguidos). Lo que no se conoce se salta por su largo.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function decodificar(buf, i = 0) {
  const x = buf[i], t = x & 15, h = x >> 4;
  let n, p = i + 1;
  if (h === 12) { n = buf[p]; p += 1; } else if (h === 13) { n = buf.readUInt16BE(p); p += 2; } else if (h === 14) { n = buf.readUInt32BE(p); p += 4; } else n = h;
  const texto = () => buf.toString('utf8', p, p + n);
  switch (t) {
    case 0: return [null, p];
    case 1: return [true, p];
    case 2: return [false, p];
    case 3: case 5: return [Number(texto()), p + n];
    case 7: return [texto(), p + n];
    case 8: {                                            // JSON, o un texto con sus "\" escapados (rutas: C:\\Users\\…)
      const s = texto(); if (!s) return [null, p + n];
      try { return [JSON.parse(s), p + n]; } catch { }
      try { return [JSON.parse(`"${s}"`), p + n]; } catch { return [s, p + n]; }
    }
    case 11: { const a = [], fin = p + n; let q = p; while (q < fin) { const [v, r] = decodificar(buf, q); a.push(v); q = r; } return [a, fin]; }
    case 12: { const o = {}, fin = p + n; let q = p; while (q < fin) { const [k, r] = decodificar(buf, q); const [v, r2] = decodificar(buf, r); o[k] = v; q = r2; } return [o, fin]; }
    default: return [undefined, p + n];
  }
}
const deB64 = s => { try { return s ? decodificar(Buffer.from(s, 'base64'))[0] : null; } catch { return null; } };

const TIPOS = { 15: 'clip', 29: 'captura', 30: 'clip', 31: 'clip' };
const VIDEO = /\.(mp4|mkv|mov|webm)$/i, FOTO = /\.(png|jpe?g|webp)$/i;
const norm = s => String(s || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

// una fila de la base → clip normalizado (puro)
function normalizar(f) {
  const m = deB64(f.meta) || {};
  if (m.isPlaceholder) return null;
  const rc = m.remoteContent || {};
  const local = [f.video, f.imagen, typeof rc.localContentUrl === 'string' ? rc.localContentUrl.replace(/^file:\/\/\/?/, '') : null].find(x => x && typeof x === 'string') || null;
  const tipo = TIPOS[rc.contentType] || (f.imagen && !f.video ? 'captura' : 'clip');
  return {
    id: f.remoto || f.local || rc.contentId, tipo,
    titulo: m.title || rc.contentTitle || '', juego: rc.category?.categoryName || '', juegoId: f.categoria || rc.categoryId || null,
    fecha: rc.created || (f.creado ? f.creado * 1000 : null), duracion: m.clipDuration || rc.videoLengthSeconds || null,
    local, miniatura: f.miniatura || null, compartir: rc.contentShareUrl || null,
    video: rc.contentUrl || null, caduca: rc.urlsExpireAt || null, foto: tipo === 'captura' ? rc.contentUrl || rc.thumbnailUrl || null : null,
    vistas: rc.views ?? null, likes: rc.likes ?? null, favorito: !!m.isFavorited, etiquetas: [...(m.userTags || []), ...(m.tags || [])].map(x => (typeof x === 'string' ? x : x?.name)).filter(Boolean),
    ancho: rc.sourceWidth || null, alto: rc.sourceHeight || null, descripcion: rc.contentDescription || '',
  };
}

// buscar (puro): texto en título/juego/etiquetas, juego, tipo, fechas, duración, solo los que están en el PC
function filtrar(clips, { texto, juego, tipo, desde, hasta, minSeg, maxSeg, soloLocales, orden = 'reciente', limite = 20 } = {}) {
  const ts = norm(texto).split(/\s+/).filter(Boolean), j = norm(juego);
  const d = desde ? Date.parse(desde) : null, h = hasta ? Date.parse(hasta) + (/^\d{4}-\d\d-\d\d$/.test(hasta) ? 864e5 - 1 : 0) : null;
  let out = clips.filter(c => (!tipo || c.tipo === tipo) && (!j || norm(c.juego).includes(j))
    && (!ts.length || ts.every(t => norm(`${c.titulo} ${c.juego} ${c.etiquetas.join(' ')} ${c.descripcion}`).includes(t)))
    && (!d || (c.fecha || 0) >= d) && (!h || (c.fecha || 0) <= h)
    && (minSeg == null || (c.duracion || 0) >= minSeg) && (maxSeg == null || (c.duracion || Infinity) <= maxSeg) && (!soloLocales || c.local));
  const por = { reciente: (a, b) => (b.fecha || 0) - (a.fecha || 0), antiguo: (a, b) => (a.fecha || 0) - (b.fecha || 0), largo: (a, b) => (b.duracion || 0) - (a.duracion || 0), vistas: (a, b) => (b.vistas || 0) - (a.vistas || 0) }[orden];
  if (por) out = [...out].sort(por);
  return { total: out.length, clips: out.slice(0, Math.max(1, Math.min(100, limite))) };
}

function crearMedal({ cfg, ejecutar = execFile, pedir = globalThis.fetch, raices = null, log = () => { } } = {}) {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const python = () => cfg?.craft?.python || 'python';
  let cache = null;

  const bases = carpeta => [path.join(appdata, 'Medal'), carpeta && path.join(carpeta, 'Databases')].filter(Boolean)
    .flatMap(d => { try { return fs.readdirSync(d).filter(n => /^medal-.+\.db$/.test(n)).map(n => path.join(d, n)); } catch { return []; } });
  const huella = dbs => dbs.map(f => { try { return `${f}:${fs.statSync(f).mtimeMs}:${fs.existsSync(f + '-wal') ? fs.statSync(f + '-wal').mtimeMs : 0}`; } catch { return f; } }).join('|');
  const volcar = dbs => new Promise((ok, mal) => ejecutar(python(), [path.join(__dirname, 'medal.py'), ...dbs], { windowsHide: true, timeout: 60_000, maxBuffer: 256 << 20, encoding: 'utf8' },
    (e, out, err) => (e ? mal(new Error(`medal.py: ${String(err || e.message).trim().slice(-300)}`)) : ok(JSON.parse(out)))));

  // carpeta de clips: la de los ajustes de Medal (se ve en la propia base) o la de siempre
  const carpetaPorDefecto = () => path.join(os.homedir(), 'Videos', 'Medal');
  function escanear(carpeta, conocidos) {
    const out = [];
    const andar = (d, nivel) => {
      let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (nivel < 3 && !/^(Databases|Thumbnails|\.)/.test(e.name)) andar(f, nivel + 1); continue; }
        if (!(VIDEO.test(e.name) || FOTO.test(e.name)) || conocidos.has(path.resolve(f).toLowerCase())) continue;
        const st = fs.statSync(f);
        out.push({ id: 'archivo:' + path.relative(carpeta, f), tipo: VIDEO.test(e.name) ? 'clip' : 'captura', titulo: path.basename(e.name, path.extname(e.name)),
          juego: nivel > 0 ? path.basename(path.dirname(f)) : '', juegoId: null, fecha: st.mtimeMs, duracion: null, local: f, miniatura: null, compartir: null,
          video: null, caduca: null, foto: null, vistas: null, likes: null, favorito: false, etiquetas: [], ancho: null, alto: null, descripcion: '', bytes: st.size });
      }
    };
    andar(carpeta, 0);
    return out;
  }

  async function cargar({ forzar = false } = {}) {
    const dbs0 = bases(null);
    let carpeta = cache?.carpeta || carpetaPorDefecto();
    const dbs = [...new Set([...dbs0, ...bases(carpeta)])];
    const firma = huella(dbs);
    if (!forzar && cache && cache.firma === firma && Date.now() - cache.leido < 60_000) return cache;
    let filas = [], borrados = new Set(), errores = [];
    if (dbs.length) {
      try {
        const d = await volcar(dbs);
        filas = d.filas; borrados = new Set(d.borrados); errores = d.errores || [];
        const cf = deB64(d.ajustes?.ClipFolder);
        if (typeof cf === 'string' && cf) carpeta = cf;
      } catch (e) { errores.push(e.message); log('[medal]', e.message); }
    }
    const vistos = new Set(), clips = [];
    for (const f of filas) {
      if (borrados.has(f.local)) continue;
      const c = normalizar(f); if (!c || !c.id || vistos.has(c.id)) continue;
      if (c.local && !fs.existsSync(c.local)) c.local = null;
      vistos.add(c.id); clips.push(c);
    }
    const conocidos = new Set(clips.filter(c => c.local).map(c => path.resolve(c.local).toLowerCase()));
    clips.push(...escanear(carpeta, conocidos));
    cache = { clips, carpeta, firma, leido: Date.now(), errores, instalado: dbs.length > 0 || fs.existsSync(path.join(appdata, 'Medal')) };
    return cache;
  }

  async function juegos() {
    const { clips } = await cargar();
    const g = {};
    for (const c of clips) { const k = c.juego || '(sin juego)'; g[k] = g[k] || { juego: k, clips: 0, capturas: 0, enPC: 0, ultimo: 0 }; g[k][c.tipo === 'captura' ? 'capturas' : 'clips']++; if (c.local) g[k].enPC++; g[k].ultimo = Math.max(g[k].ultimo, c.fecha || 0); }
    return Object.values(g).sort((a, b) => b.clips + b.capturas - a.clips - a.capturas);
  }

  // traer al PC un clip que solo está en la nube de Medal (a <carpeta de clips>/APOLO/<juego>/…)
  async function traer(id) {
    const { clips, carpeta } = await cargar();
    const c = clips.find(x => x.id === id); if (!c) throw new Error(`no encuentro el clip ${id}`);
    if (c.local) return c.local;
    const url = c.tipo === 'captura' ? c.foto : c.video;
    if (!url) throw new Error('ese clip no tiene vídeo descargable');
    if (c.caduca && c.caduca < Date.now()) {
      const nuevo = (await cargar({ forzar: true })).clips.find(x => x.id === id);   // por si Medal ya lo renovó
      if (!nuevo?.caduca || nuevo.caduca < Date.now()) throw new Error('el enlace de Medal caducó: abre Medal un momento (renueva los enlaces) y vuelve a pedirlo');
      return traer(id);
    }
    const seguro = s => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const ext = c.tipo === 'captura' ? (path.extname(new URL(url).pathname) || '.jpg') : '.mp4';
    const dir = path.join(carpeta, 'APOLO', seguro(c.juego) || 'Medal');
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, `${new Date(c.fecha || Date.now()).toISOString().slice(0, 10)} ${seguro(c.titulo) || c.id}${ext}`);
    if (fs.existsSync(destino)) return destino;
    const r = await pedir(url);
    if (!r.ok) throw new Error(`Medal ${r.status} al descargar`);
    const parcial = destino + '.parcial';
    fs.writeFileSync(parcial, Buffer.from(await r.arrayBuffer()));
    fs.renameSync(parcial, destino);
    c.local = destino;
    return destino;
  }

  const fecha = t => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '?');
  const mmss = s => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
  const linea = c => `- [${c.id}] ${c.tipo === 'captura' ? '📷' : '🎬'} ${c.titulo || '(sin título)'} · ${c.juego || '—'} · ${fecha(c.fecha)}${c.duracion ? ` · ${mmss(c.duracion)}` : ''}`
    + `${c.vistas ? ` · ${c.vistas} vistas` : ''}${c.local ? ` · EN EL PC: ${c.local}` : ' · solo en la nube'}${c.compartir ? ` · ${c.compartir}` : ''}`;

  const HERRAMIENTA = {
    nombre: 'clips_medal', riesgo: a => (a?.accion === 'traer' ? 'escritura' : 'lectura'),
    descripcion: 'Clips y capturas del usuario en Medal (medal.tv, el que graba clips de sus partidas): buscar por juego, texto del título, fechas o duración; '
      + 'ver los juegos con cuántos clips hay; traer al PC uno que solo está en la nube (para editarlo con subtitular_video/FilmCraft o mandarlo). '
      + 'accion: buscar (texto, juego, tipo clip|captura, desde/hasta YYYY-MM-DD, minSeg, maxSeg, soloLocales, orden reciente|antiguo|largo|vistas, limite) · juegos · traer (id) → ruta local.',
    parametros: { type: 'object', properties: {
      accion: { type: 'string', enum: ['buscar', 'juegos', 'traer'] }, texto: { type: 'string' }, juego: { type: 'string' }, tipo: { type: 'string', enum: ['clip', 'captura'] },
      desde: { type: 'string' }, hasta: { type: 'string' }, minSeg: { type: 'number' }, maxSeg: { type: 'number' }, soloLocales: { type: 'boolean' },
      orden: { type: 'string', enum: ['reciente', 'antiguo', 'largo', 'vistas'] }, limite: { type: 'number' }, id: { type: 'string' },
    }, required: ['accion'] },
    resumen: a => [a.accion, a.juego, a.texto, a.id].filter(Boolean).join(' · '),
    ejecutar: async a => {
      const ca = await cargar();
      if (!ca.instalado && !ca.clips.length) return 'Medal no está instalado en este PC (no hay %APPDATA%/Medal ni clips en la carpeta).';
      if (a.accion === 'juegos') {
        const g = await juegos();
        return `Medal: ${ca.clips.length} elementos · carpeta de clips: ${ca.carpeta}\n` + g.map(x => `- ${x.juego}: ${x.clips} clips, ${x.capturas} capturas${x.enPC ? ` (${x.enPC} en el PC)` : ''} · último ${fecha(x.ultimo)}`).join('\n');
      }
      if (a.accion === 'traer') {
        if (!a.id) return 'Falta id (sale entre corchetes al buscar).';
        return `En el PC: ${await traer(String(a.id))}`;
      }
      const r = filtrar(ca.clips, a);
      if (!r.total) return `Nada en Medal con eso (hay ${ca.clips.length} elementos; prueba accion "juegos" para ver los nombres).`;
      return `${r.total} resultado(s)${r.total > r.clips.length ? `, los ${r.clips.length} primeros` : ''} (orden: ${a.orden || 'reciente'}):\n${r.clips.map(linea).join('\n')}`
        + (r.clips.some(c => !c.local) ? '\nLos que están "solo en la nube" se bajan con accion "traer" + id.' : '');
    },
  };

  return { cargar, juegos, traer, buscar: async o => filtrar((await cargar()).clips, o), HERRAMIENTA };
}

module.exports = { crearMedal, decodificar, normalizar, filtrar };
