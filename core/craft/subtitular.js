// subtitular_video: clip → vídeo para redes con subtítulos en pantalla, editado en FilmCraft (MCP local, sin ventana).
// Receta (la del clip 08 de LAGCTRUCKS, 2026-10-15):
//   1. palabras con tiempos (faster-whisper large-v3, core/craft/palabras.py) — o los subtítulos que pase el modelo/usuario
//   2. trozos de 1–3 palabras (≤ 22 letras), cortando en pausas y en la puntuación; en MAYÚSCULAS
//   3. cada trozo = un texto gráfico de FilmCraft (Impact, blanco, contorno negro, sombra) con nombres/números/palabras clave en amarillo
//   4. gancho (2 líneas) los primeros segundos, marca arriba y llamada a seguir al final (opcionales)
//   5. pista de subtítulos oculta → .srt aparte; exportar H.264 CRF 18 con el audio a -14 LUFS; guardar el .fcproj
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const estilos = require('./estilos');
const emojis = require('./emojis');
const efectos = require('./efectos');

const TPS = 254016000000;                              // ticks de FilmCraft por segundo
const AMARILLO = '#ffd400';
const PALABRA = /[0-9A-Za-zÀ-ÖØ-öø-ÿ]+/g;
const VACIAS = new Set('el la los las un una unos unas de del al a y o que en con por para es son mi tu su se me te le lo no sí si ya muy más pero como ahí aquí eso esto esa ese este esta ok eh'.split(' '));

// ── parte pura (tests) ──
function trocear(palabras, { maxPalabras = 3, maxLetras = 22, pausa = 0.6, minSeg = 0.55 } = {}) {
  const trozos = [];
  let act = null;
  const cerrar = () => { if (act) { trozos.push(act); act = null; } };
  for (const p of palabras) {
    const w = String(p.w || '').trim(); if (!w) continue;
    const pausaLarga = act && p.s - act.e > pausa;
    if (act && (pausaLarga || act.palabras.length >= maxPalabras || (act.texto + ' ' + w).length > maxLetras)) {
      // no acabar en "para", "de", "el"…: esa palabra se va con la siguiente (si no hay pausa de por medio)
      const ult = act.palabras.at(-1);
      if (!pausaLarga && act.palabras.length >= 2 && VACIAS.has(String(ult.w).toLowerCase().replace(/[^\p{L}]/gu, ''))) {
        act.palabras.pop(); act.texto = act.palabras.map(x => x.w).join(' '); act.e = act.palabras.at(-1).e;
        cerrar(); act = { s: ult.s, e: ult.e, texto: ult.w, palabras: [ult] };
      } else cerrar();
    }
    if (!act) act = { s: p.s, e: p.e, texto: w, palabras: [p] };
    else { act.texto += ' ' + w; act.e = p.e; act.palabras.push(p); }
    if (/[.!?…;:]$/.test(w) || (/,$/.test(w) && act.palabras.length >= 2)) cerrar();
  }
  cerrar();
  return trozos.map((t, i) => {
    const sig = trozos[i + 1]?.s ?? Infinity;
    let e = Math.max(t.e, t.s + minSeg);
    if (sig - t.e < 0.35 || e > sig) e = Math.min(Math.max(e, sig), sig);   // sin huecos mínimos ni solapes
    const probs = t.palabras.map(p => p.p).filter(p => p != null);
    return { s: +t.s.toFixed(3), e: +e.toFixed(3), texto: limpiar(t.texto), original: t.palabras.map(p => p.w).join(' '),
      palabras: t.palabras.map(p => ({ w: p.w, s: p.s, e: p.e })),
      confianza: probs.length ? +(probs.reduce((a, b) => a + b, 0) / probs.length).toFixed(2) : null };
  }).filter(t => t.texto);
}
const limpiar = t => String(t).replace(/[.,;:]+$/, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es');

// nombres propios (mayúscula a mitad de frase), números y las palabras clave que diga el modelo → amarillo
function resaltables(palabras, extra = []) {
  const out = new Set(extra.map(x => String(x).toLocaleUpperCase('es')));
  palabras.forEach((p, i) => {
    const w = String(p.w || '').replace(/^[¿¡"']+|[.,!?;:"']+$/g, '');
    const inicio = i === 0 || /[.!?…]$/.test(palabras[i - 1].w || '');
    if (/\d/.test(w)) out.add(w.toLocaleUpperCase('es'));
    else if (!inicio && /^\p{Lu}/u.test(w) && w.length > 2) out.add(w.toLocaleUpperCase('es'));
  });
  return out;
}
function rangosResaltados(texto, claves) {
  const r = []; let m; PALABRA.lastIndex = 0;
  while ((m = PALABRA.exec(texto))) { const w = m[0].toLocaleUpperCase('es'); if (claves.has(w) && !VACIAS.has(m[0].toLowerCase())) r.push([m.index, m.index + m[0].length]); }
  return r;
}
// "08 - Saludos al chat y el puente gigante (2m05s).mp4" → "SALUDOS AL CHAT Y EL PUENTE GIGANTE"
const tituloDeArchivo = f => path.basename(f, path.extname(f)).replace(/^\s*\d+\s*[-–_.]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/[_]+/g, ' ').trim().toLocaleUpperCase('es');
// gancho en 2 líneas equilibradas
function dosLineas(t) {
  const ps = String(t).split(/\s+/); if (ps.length < 3) return [t];
  let mejor = 1, dif = Infinity;
  for (let i = 1; i < ps.length; i++) { const d = Math.abs(ps.slice(0, i).join(' ').length - ps.slice(i).join(' ').length); if (d < dif) { dif = d; mejor = i; } }
  return [ps.slice(0, mejor).join(' '), ps.slice(mejor).join(' ')];
}
// texto a mostrar de un trozo, palabra a palabra, con el rango [ini, fin) de cada una (para karaoke / acumula)
function montarPalabras(palabras, mayus = true) {
  let texto = '';
  const rangos = palabras.map((p, i) => {
    let w = String(p.w).trim();
    if (i === palabras.length - 1) w = w.replace(/[.,;:]+$/, '');
    if (mayus) w = w.toLocaleUpperCase('es');
    if (texto) texto += ' ';
    // el color va solo a la palabra: sin ¿¡ delante ni , ! ? detrás
    const ini = texto.length + w.match(/^[^\p{L}\d]*/u)[0].length, fin = texto.length + w.replace(/[^\p{L}\d]+$/u, '').length;
    texto += w; return [ini, Math.max(ini, fin)];
  });
  return { texto, rangos };
}
const srtCaso = (t, nombres) => {
  let s = t.toLocaleLowerCase('es').replace(/[\p{L}\d]+/gu, w => nombres.get(w) || w);
  const i = s.search(/[\p{L}\d]/u); return i < 0 ? s : s.slice(0, i) + s[i].toLocaleUpperCase('es') + s.slice(i + 1);
};

// perfiles: los ajustes de un canal de una vez (posición de subtítulos, marca, llamada a seguir, zonas de su vídeo, contexto)
const PERFILES = {
  lagctrucks: {
    y: 0.78, marca: 'LAGCTRUCKS', cta: 'Sígueme para más',
    contexto: 'Stream de LAGCTRUCKS en American Truck Simulator. Saludos al chat, compa, hermano, papi, camión, México.',
    zonas: { cara: [0, 97, 1080, 705], cabina: [0, 705, 1080, 1313], pedales: [0, 1313, 1080, 1920] },
  },
};

// dónde está la cara en una zona durante un tramo (core/craft/cara.py, detector YuNet) → {x, y} | null
function detectarCara(video, desde, hasta, zona, python = 'python') {
  return new Promise(ok => {
    const p = spawn(python, ['-I', path.join(__dirname, 'cara.py'), video, String(desde), String(hasta), ...zona.map(String)], { windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => ok(null));
    p.on('close', () => { try { ok(JSON.parse(out.trim().split(/\r?\n/).pop())); } catch { ok(null); } });
  });
}

// ── transcripción ──
function transcribir(video, { python = 'python', modelo = 'large-v3', idioma = 'es', contexto = '', gpu = false, signal } = {}) {
  const salida = path.join(os.tmpdir(), `apolo-palabras-${Date.now()}.json`);
  return new Promise((ok, mal) => {
    const p = spawn(python, [path.join(__dirname, 'palabras.py'), video, salida, modelo, idioma || 'auto', contexto].filter((x, i) => i < 5 || x),
      { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(gpu ? { APOLO_WHISPER_GPU: '1' } : {}) } });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    signal?.addEventListener('abort', () => p.kill(), { once: true });
    p.on('error', e => mal(new Error(`no se pudo lanzar ${python}: ${e.message}`)));
    p.on('close', c => {
      if (c !== 0) return mal(new Error(`la transcripción falló (${c}): ${err.trim().split('\n').slice(-3).join(' ').slice(0, 400)}` + (/No module named/.test(err) ? ' — instala la voz de APOLO (bandeja → Instalar voz y micrófono) o `pip install faster-whisper`' : '')));
      try { const j = JSON.parse(fs.readFileSync(salida, 'utf8')); fs.rmSync(salida, { force: true }); ok(j); } catch (e) { mal(e); }
    });
  });
}

// vídeo con avance: [desde, hasta] del original + el original entero (vídeo y audio), H.264 casi sin pérdida
function montarAvance(entrada, salida, d, h, ffmpeg = 'ffmpeg') {
  const filtro = `[0:v]split[va][vb];[0:a]asplit[aa][ab];[va]trim=start=${d}:end=${h},setpts=PTS-STARTPTS[v0];[aa]atrim=start=${d}:end=${h},asetpts=PTS-STARTPTS[a0];`
    + '[vb]setpts=PTS-STARTPTS[v1];[ab]asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]';
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const tmp = salida + '.tmp.mp4';
  return new Promise((ok, mal) => {
    const p = spawn(ffmpeg, ['-v', 'error', '-y', '-i', entrada, '-filter_complex', filtro, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', tmp], { windowsHide: true });
    let err = ''; p.stderr.on('data', x => { err += x; });
    p.on('error', e => mal(new Error(`ffmpeg no está disponible: ${e.message}`)));
    p.on('close', c => { if (c !== 0) return mal(new Error(`ffmpeg (avance) salió con ${c}: ${err.trim().slice(-300)}`)); fs.renameSync(tmp, salida); ok(salida); });
  });
}

// ── edición en FilmCraft ──
function crearSubtitulador({ mcpLocales, generarJSON, modelo, cfg }) {
  async function fc(id, params = {}) {
    // exportar un clip de 3 min con muchas animaciones pasa de 10 min en CPU: si se corta, FilmCraft sigue exportando y atasca lo siguiente
    const r = await mcpLocales.llamar('filmcraft', 'command_run', { id, params }, id === 'file.exportMedia' ? { timeoutSeg: 3600 } : {});
    const txt = (r?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (r?.isError) throw new Error(`FilmCraft ${id}: ${txt.slice(0, 400)}`);
    try { return JSON.parse(txt); } catch { return txt; }
  }
  async function herramienta(nombre, args = {}) {
    const r = await mcpLocales.llamar('filmcraft', nombre, args);
    const txt = (r?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (r?.isError) throw new Error(`FilmCraft ${nombre}: ${txt.slice(0, 400)}`);
    try { return JSON.parse(txt); } catch { return txt; }
  }

  // exporta sin bloquear y pregunta a FilmCraft cómo va (jobs.list: done/total/etaSeconds) → progreso(0..1, quedanSeg)
  async function exportar(params, progreso = () => { }, { maxSeg = 3600 } = {}) {
    const r = await fc('file.exportMedia', { ...params, wait: false });
    const job = r?.job;
    if (job == null) throw new Error(`FilmCraft no empezó a exportar: ${JSON.stringify(r).slice(0, 200)}`);
    const t0 = Date.now();
    for (;;) {
      await new Promise(ok => setTimeout(ok, 2000));
      const lista = await fc('jobs.list');
      const j = (Array.isArray(lista) ? lista : lista?.items || []).find(x => x.id === job);
      if (!j) throw new Error('FilmCraft perdió la exportación');
      if (j.finished) {
        if (j.result?.error) throw new Error(`exportar: ${j.result.error}`);
        progreso(1, 0); return j.result;
      }
      progreso(j.total ? j.done / j.total : j.progress || 0, j.etaSeconds);
      if (Date.now() - t0 > maxSeg * 1000) { try { await fc('jobs.cancel', { job }); } catch { } throw new Error(`exportar: más de ${maxSeg / 60} min, cancelada`); }
    }
  }

  async function ideas(palabras, titulo) {               // gancho + palabras clave con el modelo del cerebro (si falla, título del archivo)
    if (!generarJSON || !palabras.length) return { gancho: titulo || null, resaltar: [] };
    try {
      const texto = palabras.map(p => p.w).join(' ').slice(0, 6000);
      const r = await generarJSON({ modelo: modelo?.(), system: 'Editas clips verticales para TikTok/Shorts en español.', prompt:
        `Título del clip: "${titulo}"\nTranscripción:\n${texto}\n\nDevuelve: gancho = título corto y llamativo para los primeros segundos (máx. 6 palabras, sin emojis, basado en el título y lo que se dice); resaltar = 4–12 palabras CLAVE que aparecen tal cual en la transcripción (nombres, cifras, lo sorprendente; nunca artículos ni muletillas).`,
        schema: { type: 'object', properties: { gancho: { type: 'string' }, resaltar: { type: 'array', items: { type: 'string' } } }, required: ['gancho', 'resaltar'] } });
      const d = r?.datos || r;
      return { gancho: String(d.gancho || titulo).toLocaleUpperCase('es').slice(0, 60), resaltar: (d.resaltar || []).map(String).slice(0, 16) };
    } catch { return { gancho: titulo || null, resaltar: [] }; }
  }

  async function subtitular(a, ctx = {}) {
    if (a.perfil && PERFILES[a.perfil]) a = { ...PERFILES[a.perfil], ...a, zonas: { ...PERFILES[a.perfil].zonas, ...(a.zonas || {}) } };
    let video = path.resolve(ctx.cwd || os.homedir(), String(a.video || ''));
    if (!fs.existsSync(video)) throw new Error(`no existe el vídeo: ${video}`);
    if (!mcpLocales.obtener('filmcraft')?.activo) throw new Error('FilmCraft no está instalado o está desactivado (Configuración → Apps MCP locales → Detectar)');
    const avisar = (t, pct, eta) => ctx.progreso?.(t, pct, eta);   // pct 0–100 de la edición entera (si se sabe)
    const base = path.basename(video, path.extname(video)).replace(/\s*\([^)]*\)\s*$/, '');
    const dirSalida = a.carpeta ? path.resolve(ctx.cwd || os.homedir(), a.carpeta) : path.join(path.dirname(video), 'editados');
    const nombre = a.nombre || `${base} (subtitulado)`;
    // título para el gancho: el que pase quien llama (p. ej. el del stream) o el del archivo si dice algo (no "02_33430_145s")
    const delArchivo = tituloDeArchivo(video);
    const titulo = a.tituloClip ? String(a.tituloClip).toLocaleUpperCase('es') : (delArchivo.replace(/[^\p{L}]/gu, '').length >= 4 ? delArchivo : '');
    const E = estilos.obtener(a.estilo);
    try { require('./fuentes/instalar').asegurarFuentes(); } catch (e) { avisar(`no se pudo instalar la fuente Trueno: ${e.message}`); }
    const opTrozos = { maxPalabras: E.modo === 'palabra' ? 1 : E.maxPalabras || 3, maxLetras: E.maxLetras || 22 };

    // 1. palabras / subtítulos
    let palabras = [], trozos;
    if (Array.isArray(a.subtitulos) && a.subtitulos.length) {
      // subtítulos corregidos a mano: las palabras se reparten a partes iguales dentro de cada uno
      trozos = a.subtitulos.filter(t => String(t.texto || '').trim() && +t.e > +t.s).map(t => {
        const ws = String(t.texto).trim().split(/\s+/), paso = (+t.e - +t.s) / ws.length;
        return { s: +t.s, e: +t.e, texto: limpiar(t.texto), palabras: ws.map((w, i) => ({ w, s: +t.s + i * paso, e: +t.s + (i + 1) * paso })) };
      });
      palabras = trozos.flatMap(t => t.palabras);
    } else {
      // la transcripción se guarda junto a la salida: repetir (otro estilo, subtítulos corregidos) no vuelve a pasar Whisper
      const c = cfg?.craft || {};
      const modeloW = a.modeloWhisper || c.whisper || 'large-v3';
      const cache = path.join(dirSalida, `${base}.palabras.json`);
      const huella = `${fs.statSync(video).size}:${fs.statSync(video).mtimeMs}:${modeloW}:${a.contexto || ''}`;
      let tr = null;
      try { const j = JSON.parse(fs.readFileSync(cache, 'utf8')); if (j.huella === huella) tr = j; } catch { }
      if (!tr) {
        avisar('transcribiendo (1–4 min)…');
        tr = await transcribir(video, { python: c.python, modelo: modeloW, idioma: a.idioma || c.idioma || 'es', contexto: a.contexto || '', gpu: !!c.gpu, signal: ctx.signal });
        fs.mkdirSync(dirSalida, { recursive: true }); fs.writeFileSync(cache, JSON.stringify({ ...tr, huella }));
      }
      palabras = tr.palabras;
      trozos = trocear(palabras, opTrozos);
    }
    // avance [desde, hasta]: ese trozo del clip se repite al principio como adelanto (el accidente, el susto…) y luego va el clip
    // entero. Se monta un vídeo nuevo con ffmpeg y las palabras se recolocan (no vuelve a pasar Whisper)
    const avance = Array.isArray(a.avance) && a.avance.length === 2 && +a.avance[1] > +a.avance[0] ? a.avance.map(Number) : null;
    let dAvance = 0;
    if (avance && !a.soloTranscribir) {
      if (Array.isArray(a.subtitulos) && a.subtitulos.length) throw new Error('el avance no se combina con subtítulos corregidos a mano');
      const [d, h] = avance;
      dAvance = h - d;
      const conAvance = path.join(dirSalida, `${base}.avance-${d}-${h}.mp4`);
      if (!fs.existsSync(conAvance)) { avisar('montando el avance', 8); await montarAvance(video, conAvance, d, h, cfg?.craft?.ffmpeg); }
      video = conAvance;
      palabras = [
        ...palabras.filter(p => p.s >= d - 0.05 && p.e <= h + 0.05).map(p => ({ ...p, s: Math.max(0, p.s - d), e: Math.min(dAvance, p.e - d) })),
        ...palabras.map(p => ({ ...p, s: p.s + dAvance, e: p.e + dAvance })),
      ];
      trozos = trocear(palabras, opTrozos);
    }
    // rango [desde, hasta] en segundos: solo ese tramo (muestras rápidas de un estilo)
    const rango = Array.isArray(a.rango) && a.rango.length === 2 ? a.rango.map(Number) : null;
    if (rango) trozos = trozos.filter(x => x.s >= rango[0] && x.e <= rango[1]);
    if (a.soloTranscribir) return JSON.stringify({ subtitulos: trozos.map(({ s, e, texto }) => ({ s, e, texto })), nota: 'Corrige lo que haga falta y vuelve a llamar con "subtitulos".' });
    if (!trozos.length) throw new Error('no se oye nada que subtitular');

    // 2. gancho + resaltados
    const id = await ideas(palabras, titulo);
    const g = a.gancho === false ? null : a.gancho || id.gancho || titulo || null;
    const gancho = g ? String(g).toLocaleUpperCase('es') : null;
    const claves = resaltables(palabras, [...id.resaltar, ...(a.resaltar || [])].flatMap(x => String(x).split(/\s+/)));

    // 3. proyecto
    avisar('montando en FilmCraft', 12);
    await fc('file.newProject', { name: nombre });
    const imp = await herramienta('media_import', { paths: [video] });
    const item = imp?.items?.[0]; if (item == null) throw new Error(`FilmCraft no pudo importar el vídeo: ${JSON.stringify(imp?.errors || imp).slice(0, 300)}`);
    await fc('file.newSequenceFromClip', { items: [item] });
    await fc('sequence.addTracks', { video: 4 });                 // V2 subtítulos · V3 marca · V4 gancho/CTA · V5 emojis
    const sec = await herramienta('sequence_inspect');
    const W = sec?.settings?.width || 1080, H = sec?.settings?.height || 1920, DUR = (sec?.duration || 0) / TPS || trozos.at(-1).e + 1;
    const vertical = H > W, k = Math.min(W, H) / 1080;
    const capY = Math.round(H * (a.y ?? (vertical ? 0.72 : 0.86)));
    const tam = Math.round((a.tamano || (vertical ? E.tam : E.tam * 0.75)) * k), maxW = W * (vertical ? 0.87 : 0.8);
    const mayus = E.mayus !== false;
    // todo cuadrado a fotogramas: dos subtítulos seguidos comparten el borde exacto y nunca se pisan en la pista
    const fr = sec?.settings?.frame_rate, fps = fr?.num ? fr.num / (fr.den || 1) : 30;
    const fot = s => Math.round(s * fps);
    const t = s => Math.round(fot(s) / fps * TPS);
    const durF = (ini, secs) => Math.max(1, fot(ini + secs) - fot(ini)) / fps;

    // cambios de escena: manuales (enfoques) o automáticos (escenas: "auto" | n). Zonas con nombre del perfil (cara, cabina…)
    const v1 = sec?.video?.[0]?.items?.[0]?.clip;
    const zonas = a.zonas || {};
    const zonaDe = z => (Array.isArray(z) ? z : zonas[z] || a.zonaEnfoque || zonas.cara || [0, 0, W, H]);
    let escenas = (Array.isArray(a.enfoques) ? a.enfoques : []).map(en => ({ ...en, desde: +en.desde, hasta: +en.hasta }));
    if (a.escenas && a.escenas !== 'no') {
      const enRango = rango ? palabras.filter(p => p.s >= rango[0] && p.e <= rango[1]) : palabras;
      const auto = efectos.elegirEscenas(enRango, { duracion: rango ? rango[1] : DUR, cuantas: typeof a.escenas === 'number' ? a.escenas : undefined });
      escenas.push(...auto.map(e => ({ ...e, zona: 'cara', ...(e.tipo === 'recorrido' ? { hacia: 'cabina' } : {}) })));
    }
    escenas = escenas.filter(en => en.hasta > en.desde && Object.prototype.hasOwnProperty.call(efectos.TIPOS_ESCENA, en.tipo || 'acercar'));
    // vibración de pantalla: temblor = false (ninguna) | { intensidad: 0–100 % de la máxima, tramos: [[desde, hasta], …] (solo ahí) }
    const vib = a.temblor === false || a.temblor === 'no' ? { quitar: true } : a.temblor && typeof a.temblor === 'object' ? a.temblor : null;
    const tramosVib = (vib?.tramos || []).map(x => (Array.isArray(x) ? x : [x.desde, x.hasta]).map(Number)).filter(([d, h]) => h > d);
    const sinVibAuto = !!vib && (vib.quitar || tramosVib.length > 0);           // la automática fuera: o ninguna, o solo los tramos pedidos
    if (sinVibAuto) for (const en of escenas) if (en.tipo === 'temblor') en.tipo = 'acercar';
    const fuerzas = vib?.intensidad != null ? { temblor: Math.min(100, Math.max(0, +vib.intensidad)) / 100 } : {};
    for (const en of escenas) {                          // la cara de cada escena, detectada si no viene dada
      const nombreZona = typeof en.zona === 'string' ? en.zona : null;
      en.zona = zonaDe(en.zona);
      if (en.hacia) en.hacia = zonaDe(en.hacia);
      if (en.x == null && (nombreZona === 'cara' || !nombreZona)) {
        const c = await detectarCara(video, en.desde, en.hasta, en.zona, cfg?.craft?.python).catch(() => null);
        if (c) Object.assign(en, { x: c.x, y: c.y });
      }
    }

    // golpes de vídeo (zoom, temblor, destello, rgb, glitch, barrido) en los momentos fuertes + look de color
    let resumenFx = null, nEnfoques = 0;
    const gx = v1 != null ? efectos.crearGolpes({ fc, clip: v1, t, fuerzas }) : null;
    const modoFx = a.efectos ?? E.efectos ?? 'no';
    if (v1 != null && (modoFx !== 'no' && modoFx !== false || a.look || E.look)) {
      const permitidos = (Array.isArray(modoFx) ? modoFx.filter(g => efectos.GOLPES.includes(g)) : modoFx === 'no' || modoFx === false ? [] : efectos.GOLPES)
        .filter(g => !(sinVibAuto && g === 'temblor'));
      let lista = permitidos.length ? efectos.momentos(trozos, { permitidos, fijos: Array.isArray(modoFx) ? permitidos : null, intro: !rango || rango[0] < 1 }) : [];
      // durante una escena el zoom lo lleva la escena: fuera los golpes de zoom que caigan dentro
      lista = lista.map(m => ({ ...m, golpes: m.golpes.filter(g => g !== 'zoom' || !escenas.some(en => m.s > en.desde - 1 && m.s < en.hasta + 1)) })).filter(m => m.golpes.length);
      resumenFx = await efectos.aplicar({ fc, clip: v1, t, lista, look: a.look === false ? null : a.look || E.look, golpes: gx });
    }
    if (v1 != null && escenas.length) {
      avisar('cambios de escena', 18);
      nEnfoques = await efectos.enfocar({ fc, clip: v1, t, W, H, fps, enfoques: escenas, golpes: gx });
    }
    if (v1 != null && tramosVib.length) {             // los tramos se dan en tiempos del clip original: con avance, van corridos
      avisar('vibración', 22);
      for (const [d, h] of tramosVib.sort((x, y) => x[0] - y[0])) await gx.golpe('temblor', d + dAvance, h - d);
    }
    if (v1 != null && dAvance) await gx.golpe('destello', dAvance, 0.2);   // fogonazo al volver del avance al principio del clip
    const fuente = a.fuente || E.fuente;
    // un texto con el estilo: lo crea, lo ajusta al ancho y devuelve { clip, centro } (centro = mitad visual, para animar alrededor)
    async function texto(txt, x, y, size, ini, secs, track, extra = {}) {
      const r = await fc('graphics.newText', { text: txt, position: [x, y], size, font: fuente, seconds: durF(ini, secs), time: t(ini), track, newClip: true });
      await fc('graphics.set', { clip: r.clip, layer: 0, props: { ...estilos.props(E, k), position: [x, y], ...extra } });
      let lb = (await fc('graphics.list', { clip: r.clip }))?.layers?.[0]?.localBounds, usado = size;
      if (lb && lb[2] - lb[0] > maxW) {
        usado = +(size * maxW / (lb[2] - lb[0])).toFixed(1);
        await fc('graphics.set', { clip: r.clip, layer: 0, props: { size: usado } });
        lb = lb.map(v => v * usado / size);
      }
      return { clip: r.clip, centro: [x, Math.round(y + (lb ? (lb[1] + lb[3]) / 2 : -size * 0.4))], tam: usado };
    }
    const colorear = async (clip, ini, fin, color) => fc('graphics.setCharStyle', { clip, layer: 0, start: ini, end: fin, style: { color } });
    // entrada animada: escala/opacidad/subida con keyframes de motion y opacity, con el ancla en el centro del texto
    async function animar({ clip, centro }, ini) {
      const kf = estilos.ENTRADAS[a.entrada || E.entrada] || [];
      if (!kf.length) return;
      await fc('effects.setParam', { clip, effect: 'motion', param: 'anchor', value: centro });
      await fc('effects.setParam', { clip, effect: 'motion', param: 'position', value: centro });
      const mueve = kf.some(x => (x[3] || 0) !== 0 || (x[4] || 0) !== 0), gira = kf.some(x => (x[5] || 0) !== 0);
      for (const [dt, esc, op, dy = 0, dx = 0, rot = 0] of kf) {
        const tk = t(ini) + Math.round(dt * TPS);
        if (kf.some(x => x[1] !== 100)) await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: esc, time: tk, keyframe: true });
        if (kf.some(x => x[2] !== 100)) await fc('effects.setParam', { clip, effect: 'opacity', param: 'opacity', value: op, time: tk, keyframe: true });
        if (mueve) await fc('effects.setParam', { clip, effect: 'motion', param: 'position', value: [centro[0] + Math.round(dx * k), centro[1] + Math.round(dy * k)], time: tk, keyframe: true });
        if (gira) await fc('effects.setParam', { clip, effect: 'motion', param: 'rotation', value: rot, time: tk, keyframe: true });
      }
    }
    let contColor = 0;
    // un trozo según el modo del estilo
    async function trozo(tr) {
      const ws = tr.palabras?.length ? tr.palabras : [{ w: tr.texto, s: tr.s, e: tr.e }];
      const { texto: txt, rangos } = montarPalabras(ws, mayus);
      const claveR = E.resaltado ? rangosResaltados(txt, claves) : [];
      if (E.modo === 'karaoke' || E.modo === 'acumula') {
        // en fotogramas enteros con un cursor que no retrocede: dos palabras a menos de un fotograma no se pisan en la pista
        const finTrozo = fot(tr.e);
        let cursor = fot(tr.s), primero = true;
        for (let i = 0; i < ws.length; i++) {
          const fIni = Math.max(cursor, fot(ws[i].s));
          const fFin = Math.min(finTrozo, i + 1 < ws.length ? Math.max(fIni + 1, fot(ws[i + 1].s)) : finTrozo);
          if (fFin <= fIni) continue;                  // palabra sin hueco: la absorbe la siguiente
          cursor = fFin;
          const ini = fIni / fps, fin = fFin / fps;
          const visible = E.modo === 'acumula' ? txt.slice(0, rangos[i][1]) : txt;
          const c = await texto(visible, W / 2, capY, tam, ini, fin - ini, 1);
          for (const [x0, x1] of claveR) if (x1 <= visible.length) await colorear(c.clip, x0, x1, E.resaltado);
          await colorear(c.clip, rangos[i][0], rangos[i][1], E.activo);
          if (primero) { await animar(c, ini); primero = false; }
        }
        return;
      }
      const c = await texto(txt, W / 2, capY, tam, tr.s, tr.e - tr.s, 1);
      for (const [x0, x1] of claveR) await colorear(c.clip, x0, x1, E.resaltado);
      if (E.colores) for (const [x0, x1] of rangos) await colorear(c.clip, x0, x1, E.colores[contColor++ % E.colores.length]);
      await animar(c, tr.s);
    }

    // 4. subtítulos quemados (V2) + pista de subtítulos para el .srt (oculta)
    avisar('subtítulos', 25);
    // Whisper a veces empieza un trozo antes de que acabe el anterior: en la pista no caben dos a la vez ("V2 is not free here")
    // y hay palabras con duración cero. Una pasada en fotogramas: cada trozo empieza donde acaba el anterior como pronto,
    // dura al menos 1 fotograma, y si es cortísimo se alarga hasta 0,4 s sin pisar el siguiente
    for (let i = 0; i + 1 < trozos.length; i++)       // si el siguiente empieza dentro de este, este se recorta
      if (fot(trozos[i + 1].s) > fot(trozos[i].s) && fot(trozos[i + 1].s) < fot(trozos[i].e)) trozos[i].e = trozos[i + 1].s;
    let cursorF = -Infinity;
    trozos.forEach((c, i) => {
      const fs = Math.max(fot(c.s), cursorF);
      let fe = Math.max(fot(c.e), fs + 1);
      if (fe - fs < 3) fe = Math.max(fs + 1, Math.min(fs + Math.round(0.4 * fps), trozos[i + 1] ? fot(trozos[i + 1].s) : Infinity));
      c.s = fs / fps; c.e = fe / fps; cursorF = fe;
    });
    const nombres = new Map();                         // nombres propios = mayúscula a mitad de frase
    palabras.forEach((p, i) => {
      const w = String(p.w).replace(/[^\p{L}\d]/gu, '');
      if (i > 0 && !/[.!?…]$/.test(palabras[i - 1].w || '') && /^\p{Lu}\p{Ll}/u.test(w)) nombres.set(w.toLocaleLowerCase('es'), w);
    });
    await fc('captions.newTrack', { format: 'Subtitle', name: 'Subtítulos', language: a.idioma || 'es' });
    let fallosSrt = 0;
    for (const [i, tr] of trozos.entries()) {
      if (i % 4 === 0) avisar('subtítulos', 25 + 30 * i / trozos.length);
      await trozo(tr);
      try {                                            // pista para el .srt: un fotograma menos para que dos seguidas no se toquen
        await fc('captions.add', { track: 'C1', text: srtCaso(tr.texto, nombres), seconds: fot(tr.s) / fps, durationSeconds: Math.max(1, fot(tr.e) - fot(tr.s) - 1) / fps });
      } catch (e) { fallosSrt++; }
    }
    await fc('captions.hideAll');

    // emojis propios encima del subtítulo cuando se dice una palabra que encaja (core/craft/emojis)
    let nEmojis = 0;
    if (a.emojis ?? E.emojis) {
      const tamE = Math.round((a.tamEmoji || 190) * k), yE = capY - Math.round(tam * 0.4) - Math.round(tamE * 0.75);
      const ganchoArriba = gancho && trozos[0].s <= 1.5 && (!rango || rango[0] < 1);   // el gancho ocupa ese sitio los primeros 3,5 s
      const libres = emojis.elegir(trozos).filter(em => !(ganchoArriba && em.s < 3.6) && !(a.cta && em.e > DUR - 4.6));
      for (const em of libres) {
        const r = await fc('graphics.newFromFile', { path: emojis.ruta(em.emoji), time: t(em.s), track: 4 });
        const clip = r?.clip; if (clip == null) continue;
        const sobra = fot(em.s + 5) - fot(em.s) - Math.max(1, fot(em.e) - fot(em.s));      // entra con 5 s: se recorta a su frase
        if (sobra > 0) await fc('timeline.trim', { clip, edge: 'out', mode: 'regular', deltaFrames: -sobra });
        const base = 100 * tamE / 512, centro = [W / 2, yE];
        await fc('effects.setParam', { clip, effect: 'motion', param: 'position', value: centro });
        for (const [dt, esc, op] of estilos.ENTRADAS.rebote) {
          const tk = t(em.s) + Math.round(dt * TPS);
          await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: +(base * esc / 100).toFixed(2), time: tk, keyframe: true });
          await fc('effects.setParam', { clip, effect: 'opacity', param: 'opacity', value: op, time: tk, keyframe: true });
        }
        nEmojis++;
      }
    }

    avisar('título, marca y emojis', 56);
    // 5. gancho, marca, llamada a seguir
    const primero = trozos[0].s;
    if (gancho && (!rango || rango[0] < 1)) {
      // con silencio al principio va en el sitio de los subtítulos; si se habla desde el segundo 1, encima de ellos (pista 3)
      const hueco = primero > 1.5;
      const [l1, l2] = dosLineas(gancho);
      const dur = hueco ? Math.min(5.5, primero - 0.1) : 3.5;
      const y1 = hueco ? (l2 ? capY - Math.round(45 * k) : capY) : capY - Math.round((l2 ? 330 : 200) * k);
      const tamG = Math.round(Math.max(tam, 100 * k) * 1.05), salto = Math.round(tamG * 1.15);
      const g = await texto(l1, W / 2, y1, tamG, 0, dur, hueco ? 1 : 3);
      if (l2) {
        // la 2.ª línea también tiene que caber: las dos al mismo tamaño, el que quepa la más ancha
        await fc('graphics.newText', { text: l2, position: [W / 2, y1 + salto], size: g.tam, font: fuente, clip: g.clip });
        await fc('graphics.set', { clip: g.clip, layer: 1, props: { ...estilos.props(E, k), size: g.tam, fill_color: E.resaltado || E.activo || AMARILLO, position: [W / 2, y1 + salto] } });
        const lb2 = (await fc('graphics.list', { clip: g.clip }))?.layers?.[1]?.localBounds;
        if (lb2 && lb2[2] - lb2[0] > maxW) {
          const s3 = +(g.tam * maxW / (lb2[2] - lb2[0])).toFixed(1);
          for (const layer of [0, 1]) await fc('graphics.set', { clip: g.clip, layer, props: { size: s3 } });
        }
        g.centro[1] += Math.round(salto / 2);
      }
      await animar(g, 0);
    }
    if (a.marca) await texto(String(a.marca), W / 2, Math.round(H * (a.yMarca ?? 0.0375)), Math.round(56 * k), 0, DUR, 2,
      { fill_color: AMARILLO, stroke: false, stroke2: false, background: false, shadow: false, tracking: 120 });
    if (a.cta && (!rango || rango[1] >= DUR - 4.5)) await animar(await texto(mayus ? String(a.cta).toLocaleUpperCase('es') : String(a.cta), W / 2, capY - Math.round(225 * k), Math.round(76 * k), Math.max(0, DUR - 4.5), 4.5, 3), Math.max(0, DUR - 4.5));

    // 6. vista previa, guardar y exportar
    fs.mkdirSync(dirSalida, { recursive: true });
    const previa = path.join(dirSalida, `${nombre} - vista previa.png`);
    try { await mcpLocales.llamar('filmcraft', 'render_frame', { seconds: trozos[Math.floor(trozos.length / 3)].s + 0.1, max_side: 960 }).then(r => { const img = r?.content?.find(c => c.type === 'image'); if (img) fs.writeFileSync(previa, Buffer.from(img.data, 'base64')); }); } catch { }
    const proyecto = path.join(dirSalida, `${nombre}.fcproj`);
    await fc('file.saveAs', { path: proyecto });
    const mp4 = path.join(dirSalida, `${nombre}.mp4`);
    if (a.exportar !== false) {
      avisar('exportando (unos minutos)…', 60);
      await exportar({ path: mp4, format: 'h264', bitrateMode: 'crf', crf: 18, audioCodec: 'aac', loudnessLufs: a.lufs ?? -14,
        captionSidecar: 'srt', hardwareEncoding: 'auto', ...(rango ? { range: 'custom', startSeconds: rango[0], endSeconds: rango[1] } : {}) },
      (p, eta) => avisar('exportando', 60 + p * 40, eta));
    }
    const imagenes = fs.existsSync(previa) ? [{ mime: 'image/png', ruta: previa }] : [];
    const textoFinal = [
      a.exportar === false ? `Proyecto listo (sin exportar): ${proyecto}` : `Vídeo: ${mp4}`,
      a.exportar === false ? '' : `Subtítulos aparte: ${path.join(dirSalida, nombre + '.srt')}`,
      `Proyecto de FilmCraft: ${proyecto}`,
      `${trozos.length} subtítulos${nEmojis ? ` · ${nEmojis} emojis` : ''}${resumenFx?.golpes ? ` · ${resumenFx.golpes} golpes de efecto` : ''}${resumenFx?.look ? ` · look ${resumenFx.look}` : ''}${nEnfoques ? ` · ${nEnfoques} cambio(s) de escena (${escenas.map(e => `${e.tipo || 'acercar'} ${Math.floor(e.desde / 60)}:${String(Math.floor(e.desde % 60)).padStart(2, '0')}`).join(', ')})` : ''}${fallosSrt ? ` (${fallosSrt} no entraron en el .srt)` : ''} · gancho: ${gancho || '—'} · resaltadas: ${[...claves].slice(0, 12).join(', ') || '—'}`,
      `Revisa estas líneas (Whisper dudó): ${trozos.filter(x => x.confianza != null && x.confianza < 0.6).map(x => `"${x.texto}" (${Math.floor(x.s / 60)}:${String(Math.floor(x.s % 60)).padStart(2, '0')})`).slice(0, 10).join(', ') || 'ninguna'}`,
    ].filter(Boolean).join('\n');
    // `datos` = lo mismo estructurado, para quien llama desde código (editor por lotes); el agente usa texto + imágenes
    const datos = { mp4: a.exportar === false ? null : mp4, srt: a.exportar === false ? null : path.join(dirSalida, nombre + '.srt'), proyecto,
      previa: fs.existsSync(previa) ? previa : null, estilo: a.estilo || 'clasico', gancho, subtitulos: trozos.length, emojis: nEmojis,
      escenas: escenas.map(e => ({ tipo: e.tipo || 'acercar', desde: e.desde, hasta: e.hasta })),
      dudas: trozos.filter(x => x.confianza != null && x.confianza < 0.6).map(x => ({ texto: x.texto, s: x.s })).slice(0, 10) };
    return { texto: textoFinal, imagenes, datos };
  }

  const HERRAMIENTA = {
    nombre: 'subtitular_video', riesgo: 'escritura',
    descripcion: 'Edita un clip en FilmCraft para TikTok/Shorts/Reels: subtítulos dinámicos en pantalla sincronizados palabra a palabra (mayúsculas, contorno, palabras clave en amarillo), gancho al principio, marca y llamada a seguir opcionales, audio normalizado, exporta MP4 + .srt + proyecto .fcproj (por defecto en <carpeta del vídeo>/editados). '
      + 'Tarda ~1 min + la exportación. Hay estilos animados — paquete base: clasico (defecto), pop, karaoke, palabra, caja, neon, fuego, acumula, minimal; paquete 2 de color con emojis: atardecer, hielo, retro, chicle, lima, oro, terror, arcoiris, noche. Usa soloTranscribir para revisar el texto y luego pasa "subtitulos" corregidos.',
    parametros: { type: 'object', properties: {
      video: { type: 'string', description: 'ruta del vídeo' },
      estilo: { type: 'string', enum: Object.keys(estilos.ESTILOS), description: 'estilo de subtítulos: ' + estilos.lista().map(e => `${e.id} (${e.descripcion.split('.')[0]})`).join('; ') },
      efectos: { description: 'golpes de vídeo en los momentos fuertes: "auto", "no" o una lista de ' + efectos.GOLPES.join(', ') + ' (por defecto según el estilo)' },
      perfil: { type: 'string', enum: Object.keys(PERFILES), description: 'ajustes de un canal: lagctrucks = subtítulos en los pedales, marca, "Sígueme", zonas cara/cabina/pedales' },
      escenas: { description: 'cambios de escena automáticos: "auto" (2–3 en las frases más fuertes, con la cara detectada) o un número' },
      enfoques: { type: 'array', items: { type: 'object', properties: { desde: { type: 'number' }, hasta: { type: 'number' }, tipo: { type: 'string', enum: Object.keys(efectos.TIPOS_ESCENA) }, zona: { description: 'nombre del perfil (cara, cabina, pedales) o [x0,y0,x1,y1]' }, hacia: { description: 'zona de llegada (recorrido)' }, x: { type: 'number' }, y: { type: 'number' } } },
        description: 'cambios de escena manuales durante [desde, hasta]: ' + Object.entries(efectos.TIPOS_ESCENA).map(([k, v]) => `${k} (${v})`).join('; ') + '. Sin x,y la cara se detecta sola.' },
      zonaEnfoque: { type: 'array', items: { type: 'number' }, description: 'zona por defecto de los enfoques' },
      avance: { type: 'array', items: { type: 'number' }, description: '[desde, hasta] en segundos: ese trozo del clip se repite al principio como adelanto (recap/gancho de vídeo) y luego va el clip entero' },
      temblor: { description: 'vibración de pantalla: false = ninguna; { intensidad: 0–100 (% de la máxima; por defecto 100), tramos: [[desde, hasta], …] en segundos } = solo en esos tramos (sin tramos: la automática a esa intensidad)' },
      look: { type: 'string', enum: Object.keys(efectos.LOOKS), description: 'look de color del vídeo: ' + Object.keys(efectos.LOOKS).join(', ') },
      emojis: { type: 'boolean', description: 'emojis propios encima del subtítulo cuando se dice una palabra que encaja (por defecto: los del paquete 2 sí)' },
      entrada: { type: 'string', enum: Object.keys(estilos.ENTRADAS), description: 'cambia la animación de entrada del estilo' },
      marca: { type: 'string', description: 'texto fijo arriba, p. ej. el nombre del canal' },
      cta: { type: 'string', description: 'llamada a seguir en los últimos segundos, p. ej. "Sígueme para más"' },
      gancho: { description: 'título de los primeros segundos (texto) o false para no ponerlo; por defecto lo propone el modelo' },
      tituloClip: { type: 'string', description: 'de qué va el clip o el título del stream (ayuda a proponer el gancho)' },
      resaltar: { type: 'array', items: { type: 'string' }, description: 'palabras extra en amarillo' },
      y: { type: 'number', description: 'altura de los subtítulos, fracción del alto (0.72 vertical por defecto; 0.78 para LAGCTRUCKS: zona de pedales)' },
      idioma: { type: 'string' }, contexto: { type: 'string', description: 'palabras/nombres que ayudan a Whisper' },
      subtitulos: { type: 'array', items: { type: 'object', properties: { s: { type: 'number' }, e: { type: 'number' }, texto: { type: 'string' } } }, description: 'subtítulos ya corregidos (se salta la transcripción)' },
      rango: { type: 'array', items: { type: 'number' }, description: '[desde, hasta] en segundos: monta y exporta solo ese tramo (para enseñar una muestra de un estilo antes de hacer el vídeo entero)' },
      soloTranscribir: { type: 'boolean' }, exportar: { type: 'boolean' }, carpeta: { type: 'string' }, nombre: { type: 'string' },
    }, required: ['video'] },
    resumen: a => path.basename(String(a.video || '')),
    disponible: () => !!mcpLocales.obtener('filmcraft')?.activo,
    ejecutar: (a, ctx) => subtitular(a, ctx),
  };
  // vuelve a exportar un .fcproj (p. ej. retocado a mano en FilmCraft) con los mismos ajustes; vista previa en `segPrevia`
  async function reexportar({ proyecto, mp4, previa, segPrevia = 1, lufs = -14 }, ctx = {}) {
    if (!fs.existsSync(proyecto)) throw new Error(`no existe el proyecto: ${proyecto}`);
    ctx.progreso?.('abriendo el proyecto…', 2);
    await fc('file.open', { path: proyecto });
    if (previa) try { const r = await mcpLocales.llamar('filmcraft', 'render_frame', { seconds: segPrevia, max_side: 960 }); const img = r?.content?.find(c => c.type === 'image'); if (img) fs.writeFileSync(previa, Buffer.from(img.data, 'base64')); } catch { }
    await exportar({ path: mp4, format: 'h264', bitrateMode: 'crf', crf: 18, audioCodec: 'aac', loudnessLufs: lufs, captionSidecar: 'srt', hardwareEncoding: 'auto' },
      (p, eta) => ctx.progreso?.('exportando', 5 + p * 95, eta));
    try { await fc('file.closeProject', { force: true }); } catch { }
    return { mp4, previa };
  }

  // abre el proyecto en la app de FilmCraft (con ventana, línea de tiempo) para retocarlo a mano
  async function abrirEnApp(proyecto, { puerto = 7980 } = {}) {
    if (!fs.existsSync(proyecto)) throw new Error(`no existe el proyecto: ${proyecto}`);
    const cli = mcpLocales.obtener('filmcraft')?.comando;
    if (!cli) throw new Error('FilmCraft no está instalado (Configuración → Apps MCP locales → Detectar)');
    const app = path.join(path.dirname(cli), 'filmcraft.exe');
    const { spawn, execFile } = require('child_process');
    const puente = (args, timeout = 15_000) => new Promise((ok, mal) => execFile(cli, ['--bridge', `127.0.0.1:${puerto}`, ...args], { windowsHide: true, timeout, encoding: 'utf8' }, (e, out, err) => (e ? mal(new Error((err || e.message).trim().slice(0, 300))) : ok(out))));
    const vivo = () => puente(['inspect', 'project'], 5000).then(() => true, () => false);
    if (!await vivo()) {
      spawn(app, ['--control', String(puerto)], { detached: true, stdio: 'ignore' }).unref();
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) { await new Promise(r => setTimeout(r, 1000)); ok = await vivo(); }
      if (!ok) throw new Error('FilmCraft no arrancó (¿se cerró la ventana?)');
    }
    await puente(['exec', 'file.open', JSON.stringify({ path: proyecto })], 60_000);
    return { abierto: proyecto };
  }

  return { subtitular, reexportar, abrirEnApp, HERRAMIENTA };
}

module.exports = { crearSubtitulador, montarPalabras, trocear, resaltables, rangosResaltados, tituloDeArchivo, dosLineas, srtCaso, limpiar };
