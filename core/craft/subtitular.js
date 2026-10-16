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

const TPS = 254016000000;                              // ticks de FilmCraft por segundo
const AMARILLO = '#ffd400', BLANCO = '#ffffff', NEGRO = '#000000';
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
  while ((m = PALABRA.exec(texto))) if (claves.has(m[0]) && !VACIAS.has(m[0].toLowerCase())) r.push([m.index, m.index + m[0].length]);
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
const srtCaso = (t, nombres) => {
  let s = t.toLocaleLowerCase('es').replace(/[\p{L}\d]+/gu, w => nombres.get(w) || w);
  const i = s.search(/[\p{L}\d]/u); return i < 0 ? s : s.slice(0, i) + s[i].toLocaleUpperCase('es') + s.slice(i + 1);
};

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

// ── edición en FilmCraft ──
function crearSubtitulador({ mcpLocales, generarJSON, modelo, cfg }) {
  async function fc(id, params = {}) {
    const r = await mcpLocales.llamar('filmcraft', 'command_run', { id, params });
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

  async function ideas(palabras, titulo) {               // gancho + palabras clave con el modelo del cerebro (si falla, título del archivo)
    if (!generarJSON || !palabras.length) return { gancho: titulo, resaltar: [] };
    try {
      const texto = palabras.map(p => p.w).join(' ').slice(0, 6000);
      const r = await generarJSON({ modelo: modelo?.(), system: 'Editas clips verticales para TikTok/Shorts en español.', prompt:
        `Título del clip: "${titulo}"\nTranscripción:\n${texto}\n\nDevuelve: gancho = título corto y llamativo para los primeros segundos (máx. 6 palabras, sin emojis, basado en el título y lo que se dice); resaltar = 4–12 palabras CLAVE que aparecen tal cual en la transcripción (nombres, cifras, lo sorprendente; nunca artículos ni muletillas).`,
        schema: { type: 'object', properties: { gancho: { type: 'string' }, resaltar: { type: 'array', items: { type: 'string' } } }, required: ['gancho', 'resaltar'] } });
      const d = r?.datos || r;
      return { gancho: String(d.gancho || titulo).toLocaleUpperCase('es').slice(0, 60), resaltar: (d.resaltar || []).map(String).slice(0, 16) };
    } catch { return { gancho: titulo, resaltar: [] }; }
  }

  async function subtitular(a, ctx = {}) {
    const video = path.resolve(ctx.cwd || os.homedir(), String(a.video || ''));
    if (!fs.existsSync(video)) throw new Error(`no existe el vídeo: ${video}`);
    if (!mcpLocales.obtener('filmcraft')?.activo) throw new Error('FilmCraft no está instalado o está desactivado (Configuración → Apps MCP locales → Detectar)');
    const avisar = t => ctx.progreso?.(t);
    const base = path.basename(video, path.extname(video)).replace(/\s*\([^)]*\)\s*$/, '');
    const dirSalida = a.carpeta ? path.resolve(ctx.cwd || os.homedir(), a.carpeta) : path.join(path.dirname(video), 'editados');
    const nombre = a.nombre || `${base} (subtitulado)`;
    const titulo = tituloDeArchivo(video);

    // 1. palabras / subtítulos
    let palabras = [], trozos;
    if (Array.isArray(a.subtitulos) && a.subtitulos.length) {
      trozos = a.subtitulos.map(t => ({ s: +t.s, e: +t.e, texto: limpiar(t.texto) })).filter(t => t.texto && t.e > t.s);
      palabras = trozos.flatMap(t => t.texto.split(' ').map(w => ({ w, s: t.s, e: t.e })));
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
      trozos = trocear(palabras);
    }
    if (a.soloTranscribir) return JSON.stringify({ subtitulos: trozos.map(({ s, e, texto }) => ({ s, e, texto })), nota: 'Corrige lo que haga falta y vuelve a llamar con "subtitulos".' });
    if (!trozos.length) throw new Error('no se oye nada que subtitular');

    // 2. gancho + resaltados
    const id = await ideas(palabras, titulo);
    const gancho = a.gancho === false ? null : String(a.gancho || id.gancho || titulo).toLocaleUpperCase('es');
    const claves = resaltables(palabras, [...id.resaltar, ...(a.resaltar || [])].flatMap(x => String(x).split(/\s+/)));

    // 3. proyecto
    avisar('montando en FilmCraft…');
    await fc('file.newProject', { name: nombre });
    const imp = await herramienta('media_import', { paths: [video] });
    const item = imp?.items?.[0]; if (item == null) throw new Error(`FilmCraft no pudo importar el vídeo: ${JSON.stringify(imp?.errors || imp).slice(0, 300)}`);
    await fc('file.newSequenceFromClip', { items: [item] });
    await fc('sequence.addTracks', { video: 3 });
    const sec = await herramienta('sequence_inspect');
    const W = sec?.settings?.width || 1080, H = sec?.settings?.height || 1920, DUR = (sec?.duration || 0) / TPS || trozos.at(-1).e + 1;
    const vertical = H > W, k = Math.min(W, H) / 1080;
    const capY = Math.round(H * (a.y ?? (vertical ? 0.72 : 0.86)));
    const tam = Math.round((a.tamano || (vertical ? 112 : 84)) * k), maxW = W * (vertical ? 0.87 : 0.8);
    // todo cuadrado a fotogramas: dos subtítulos seguidos comparten el borde exacto y nunca se pisan en la pista
    const fr = sec?.settings?.frame_rate, fps = fr?.num ? fr.num / (fr.den || 1) : 30;
    const fot = s => Math.round(s * fps);
    const t = s => Math.round(fot(s) / fps * TPS);
    const durF = (ini, secs) => Math.max(1, fot(ini + secs) - fot(ini)) / fps;

    async function texto(txt, x, y, size, ini, secs, track, { fill = BLANCO, stroke = 10, extra } = {}) {
      const r = await fc('graphics.newText', { text: txt, position: [x, y], size, font: a.fuente || 'Impact', seconds: durF(ini, secs), time: t(ini), track, newClip: true });
      await fc('graphics.set', { clip: r.clip, layer: 0, props: { align: 'center', fill_color: fill, stroke: stroke > 0, stroke_width: Math.round(stroke * k), stroke_color: NEGRO, shadow: true, position: [x, y], ...extra } });
      const lb = (await fc('graphics.list', { clip: r.clip }))?.layers?.[0]?.localBounds;
      if (lb && lb[2] - lb[0] > maxW) await fc('graphics.set', { clip: r.clip, layer: 0, props: { size: +(size * maxW / (lb[2] - lb[0])).toFixed(1) } });
      return r.clip;
    }
    const pintar = async (clip, txt, layer = 0) => { for (const [ini, fin] of rangosResaltados(txt, claves)) await fc('graphics.setCharStyle', { clip, layer, start: ini, end: fin, style: { color: AMARILLO } }); };

    // 4. subtítulos quemados (V2) + pista de subtítulos para el .srt (oculta)
    avisar(`subtítulos: ${trozos.length}`);
    const nombres = new Map();                         // nombres propios = mayúscula a mitad de frase
    palabras.forEach((p, i) => {
      const w = String(p.w).replace(/[^\p{L}\d]/gu, '');
      if (i > 0 && !/[.!?…]$/.test(palabras[i - 1].w || '') && /^\p{Lu}\p{Ll}/u.test(w)) nombres.set(w.toLocaleLowerCase('es'), w);
    });
    await fc('captions.newTrack', { format: 'Subtitle', name: 'Subtítulos', language: a.idioma || 'es' });
    let fallosSrt = 0;
    for (const tr of trozos) {
      const clip = await texto(tr.texto, W / 2, capY, tam, tr.s, tr.e - tr.s, 1);
      await pintar(clip, tr.texto);
      try {                                            // pista para el .srt: un fotograma menos para que dos seguidas no se toquen
        await fc('captions.add', { track: 'C1', text: srtCaso(tr.texto, nombres), seconds: fot(tr.s) / fps, durationSeconds: Math.max(1, fot(tr.e) - fot(tr.s) - 1) / fps });
      } catch (e) { fallosSrt++; }
    }
    await fc('captions.hideAll');

    // 5. gancho, marca, llamada a seguir
    const primero = trozos[0].s;
    if (gancho) {
      // con silencio al principio va en el sitio de los subtítulos; si se habla desde el segundo 1, encima de ellos (pista 3)
      const hueco = primero > 1.5;
      const [l1, l2] = dosLineas(gancho);
      const dur = hueco ? Math.min(5.5, primero - 0.1) : 3.5;
      const y1 = hueco ? (l2 ? capY - Math.round(45 * k) : capY) : capY - Math.round((l2 ? 330 : 200) * k);
      const clip = await texto(l1, W / 2, y1, Math.round(tam * 1.05), 0, dur, hueco ? 1 : 3);
      if (l2) {
        await fc('graphics.newText', { text: l2, position: [W / 2, y1 + Math.round(130 * k)], size: Math.round(tam * 1.05), font: a.fuente || 'Impact', clip });
        await fc('graphics.set', { clip, layer: 1, props: { align: 'center', fill_color: AMARILLO, stroke: true, stroke_width: Math.round(10 * k), stroke_color: NEGRO, shadow: true, position: [W / 2, y1 + Math.round(130 * k)] } });
      }
    }
    if (a.marca) await texto(String(a.marca), W / 2, Math.round(H * (a.yMarca ?? 0.0375)), Math.round(56 * k), 0, DUR, 2, { fill: AMARILLO, stroke: 0, extra: { tracking: 120, shadow: false } });
    if (a.cta) await texto(String(a.cta).toLocaleUpperCase('es'), W / 2, capY - Math.round(225 * k), Math.round(76 * k), Math.max(0, DUR - 4.5), 4.5, 3, { stroke: 8 });

    // 6. vista previa, guardar y exportar
    fs.mkdirSync(dirSalida, { recursive: true });
    const previa = path.join(dirSalida, `${nombre} - vista previa.png`);
    try { await mcpLocales.llamar('filmcraft', 'render_frame', { seconds: trozos[Math.floor(trozos.length / 3)].s + 0.1, max_side: 960 }).then(r => { const img = r?.content?.find(c => c.type === 'image'); if (img) fs.writeFileSync(previa, Buffer.from(img.data, 'base64')); }); } catch { }
    const proyecto = path.join(dirSalida, `${nombre}.fcproj`);
    await fc('file.saveAs', { path: proyecto });
    const mp4 = path.join(dirSalida, `${nombre}.mp4`);
    if (a.exportar !== false) {
      avisar('exportando (unos minutos)…');
      await fc('file.exportMedia', { path: mp4, format: 'h264', bitrateMode: 'crf', crf: 18, audioCodec: 'aac', loudnessLufs: a.lufs ?? -14,
        captionSidecar: 'srt', hardwareEncoding: 'auto', wait: true });
    }
    const imagenes = fs.existsSync(previa) ? [{ mime: 'image/png', ruta: previa }] : [];
    const textoFinal = [
      a.exportar === false ? `Proyecto listo (sin exportar): ${proyecto}` : `Vídeo: ${mp4}`,
      a.exportar === false ? '' : `Subtítulos aparte: ${path.join(dirSalida, nombre + '.srt')}`,
      `Proyecto de FilmCraft: ${proyecto}`,
      `${trozos.length} subtítulos${fallosSrt ? ` (${fallosSrt} no entraron en el .srt)` : ''} · gancho: ${gancho || '—'} · resaltadas: ${[...claves].slice(0, 12).join(', ') || '—'}`,
      `Revisa estas líneas (Whisper dudó): ${trozos.filter(x => x.confianza != null && x.confianza < 0.6).map(x => `"${x.texto}" (${Math.floor(x.s / 60)}:${String(Math.floor(x.s % 60)).padStart(2, '0')})`).slice(0, 10).join(', ') || 'ninguna'}`,
    ].filter(Boolean).join('\n');
    return imagenes.length ? { texto: textoFinal, imagenes } : textoFinal;
  }

  const HERRAMIENTA = {
    nombre: 'subtitular_video', riesgo: 'escritura',
    descripcion: 'Edita un clip en FilmCraft para TikTok/Shorts/Reels: subtítulos dinámicos en pantalla sincronizados palabra a palabra (mayúsculas, contorno, palabras clave en amarillo), gancho al principio, marca y llamada a seguir opcionales, audio normalizado, exporta MP4 + .srt + proyecto .fcproj (por defecto en <carpeta del vídeo>/editados). '
      + 'Tarda ~1 min + la exportación. Usa soloTranscribir para revisar el texto y luego pasa "subtitulos" corregidos.',
    parametros: { type: 'object', properties: {
      video: { type: 'string', description: 'ruta del vídeo' },
      marca: { type: 'string', description: 'texto fijo arriba, p. ej. el nombre del canal' },
      cta: { type: 'string', description: 'llamada a seguir en los últimos segundos, p. ej. "Sígueme para más"' },
      gancho: { description: 'título de los primeros segundos (texto) o false para no ponerlo; por defecto lo propone el modelo' },
      resaltar: { type: 'array', items: { type: 'string' }, description: 'palabras extra en amarillo' },
      y: { type: 'number', description: 'altura de los subtítulos, fracción del alto (0.72 vertical por defecto; 0.78 para LAGCTRUCKS: zona de pedales)' },
      idioma: { type: 'string' }, contexto: { type: 'string', description: 'palabras/nombres que ayudan a Whisper' },
      subtitulos: { type: 'array', items: { type: 'object', properties: { s: { type: 'number' }, e: { type: 'number' }, texto: { type: 'string' } } }, description: 'subtítulos ya corregidos (se salta la transcripción)' },
      soloTranscribir: { type: 'boolean' }, exportar: { type: 'boolean' }, carpeta: { type: 'string' }, nombre: { type: 'string' },
    }, required: ['video'] },
    resumen: a => path.basename(String(a.video || '')),
    disponible: () => !!mcpLocales.obtener('filmcraft')?.activo,
    ejecutar: (a, ctx) => subtitular(a, ctx),
  };
  return { subtitular, HERRAMIENTA };
}

module.exports = { crearSubtitulador, trocear, resaltables, rangosResaltados, tituloDeArchivo, dosLineas, srtCaso, limpiar };
