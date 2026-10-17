// Control de calidad de lo que exporta la suite, antes de enseñarlo (y antes de publicar el 4K):
//  - medir(): una pasada de ffmpeg sobre el archivo final → sonoridad real (LUFS integrados, pico real dBTP), tramos negros,
//    congelados y silencios largos; ffprobe → resolución, fps, duración, si hay audio. "ligero" = solo ffprobe (para el 4K).
//  - evaluar(): medidas → errores (hay que arreglarlo) y avisos (que lo mire una persona), con lo que se puede corregir solo.
//  - revisarDiseno(): las cajas de todo lo que se puso encima del vídeo (subtítulos, título, emojis, llamada a seguir…) →
//    fuera de la zona segura de TikTok/Shorts/Reels, columna de botones, solapes, subtítulos que no da tiempo a leer.
//  - contraste(): para estilos sin contorno ni caja, luminancia real del fondo detrás de unos subtítulos (ratio WCAG).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { rectSeguro } = require('./kit');

const correr = (cmd, args, { timeout = 1_800_000, binario = false } = {}) => new Promise((ok, mal) =>
  execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 256 << 20, encoding: binario ? 'buffer' : 'utf8' }, (e, out, err) =>
    (e && !binario && !String(err).includes('Integrated loudness') ? mal(new Error(`${path.basename(cmd)}: ${String(err || e.message).trim().slice(-300)}`)) : ok({ out, err: String(err || '') }))));

function ffprobeDe(ffmpeg = 'ffmpeg') {
  if (!/ffmpeg(\.exe)?$/i.test(ffmpeg) || !path.isAbsolute(ffmpeg)) return 'ffprobe';
  const p = ffmpeg.replace(/ffmpeg(\.exe)?$/i, m => m.replace(/ffmpeg/i, 'ffprobe'));
  return fs.existsSync(p) ? p : 'ffprobe';
}

// ── lectura de la salida de ffmpeg (puro, con tests) ──
function leerInforme(err) {
  // el resumen de ebur128 va al final: "Integrated loudness: I: -14.1 LUFS" … "True peak: Peak: -1.3 dBFS"
  const resumen = err.slice(Math.max(0, err.lastIndexOf('Summary:')));
  const tramos = (re, ini, fin) => [...err.matchAll(re)].map(m => [+m[ini], +m[fin]]);
  const negros = tramos(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g, 1, 2);
  const silencios = [], abiertos = [];
  for (const m of err.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    if (m[1] === 'start') abiertos.push(+m[2]); else if (abiertos.length) silencios.push([abiertos.shift(), +m[2]]);
  }
  const congelados = [], ini = [];
  for (const m of err.matchAll(/freezedetect\.freeze_(start|end):\s*([\d.]+)/g)) {
    if (m[1] === 'start') ini.push(+m[2]); else if (ini.length) congelados.push([ini.shift(), +m[2]]);
  }
  const iMatch = resumen.match(/I:\s+(-?[\d.]+)\s+LUFS/), tpMatch = resumen.match(/True peak:\s*\n?\s*Peak:\s+(-?[\d.]+|-inf)\s+dBFS/);
  return { lufs: iMatch ? +iMatch[1] : null, picoReal: tpMatch && tpMatch[1] !== '-inf' ? +tpMatch[1] : null,
    negros, silencios: silencios.concat(abiertos.map(s => [s, null])), congelados: congelados.concat(ini.map(s => [s, null])) };
}
function leerSondeo(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const v = (j.streams || []).find(s => s.codec_type === 'video'), a = (j.streams || []).find(s => s.codec_type === 'audio');
  const fr = String(v?.avg_frame_rate || v?.r_frame_rate || '0/1').split('/');
  return { ancho: v ? +v.width : null, alto: v ? +v.height : null, fps: v && +fr[1] ? +(fr[0] / fr[1]).toFixed(3) : null,
    duracion: +(+j.format?.duration || +v?.duration || 0).toFixed(3), audio: !!a, video: !!v, codec: v?.codec_name || null, bytes: +j.format?.size || null };
}

async function medir(archivo, { ffmpeg = 'ffmpeg', ligero = false } = {}) {
  if (!fs.existsSync(archivo)) throw new Error(`no existe ${archivo}`);
  const { out } = await correr(ffprobeDe(ffmpeg), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', archivo], { timeout: 60_000 });
  const m = leerSondeo(out);
  if (ligero) return m;
  const args = ['-hide_banner', '-nostats', '-i', archivo];
  if (m.video) args.push('-vf', 'blackdetect=d=0.3:pix_th=0.10,freezedetect=n=-60dB:d=2.5');
  if (m.audio) args.push('-af', 'ebur128=peak=true:framelog=quiet,silencedetect=n=-45dB:d=4');
  args.push('-f', 'null', '-');
  const { err } = await correr(ffmpeg, args);
  return { ...m, ...leerInforme(err) };
}

// ── medidas → errores / avisos (puro) ──
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function evaluar(m, { lufs = -14, picoMax = -1, esperado = {} } = {}) {
  const errores = [], avisos = [], arreglos = {};
  if (!m.video) errores.push({ tipo: 'video', texto: 'el archivo no tiene vídeo' });
  if (!m.audio) errores.push({ tipo: 'audio', texto: 'el archivo no tiene audio' });
  if (esperado.ancho && esperado.alto && (m.ancho !== esperado.ancho || m.alto !== esperado.alto)) errores.push({ tipo: 'resolucion', texto: `resolución ${m.ancho}×${m.alto}, se esperaba ${esperado.ancho}×${esperado.alto}` });
  if (esperado.duracion && Math.abs(m.duracion - esperado.duracion) > Math.max(0.5, esperado.duracion * 0.01)) errores.push({ tipo: 'duracion', texto: `dura ${m.duracion.toFixed(1)} s y debería durar ${esperado.duracion.toFixed(1)} s (¿exportación cortada?)` });
  if (m.lufs != null) {
    const dif = m.lufs - lufs;
    if (Math.abs(dif) > 1) { errores.push({ tipo: 'sonoridad', texto: `suena a ${m.lufs.toFixed(1)} LUFS (objetivo ${lufs})` }); arreglos.lufs = +(lufs - dif).toFixed(1); }
    else if (Math.abs(dif) > 0.5) avisos.push({ tipo: 'sonoridad', texto: `suena a ${m.lufs.toFixed(1)} LUFS (objetivo ${lufs} ±0,5)` });
  }
  if (m.picoReal != null && m.picoReal > picoMax + 0.1) {
    errores.push({ tipo: 'pico', texto: `pico real ${m.picoReal.toFixed(1)} dBTP (máximo ${picoMax}): puede saturar al recomprimirlo la red social` });
    arreglos.lufs = +Math.min(arreglos.lufs ?? lufs, lufs - Math.min(1.5, m.picoReal - picoMax + 0.3)).toFixed(1);
  }
  for (const [a, b] of m.negros || []) {
    const d = b - a;
    if (a < 0.1 && d >= 0.2) errores.push({ tipo: 'negro', texto: `empieza con ${d.toFixed(1)} s en negro`, s: a });
    else if (d >= 0.5) errores.push({ tipo: 'negro', texto: `${d.toFixed(1)} s en negro en ${mmss(a)}`, s: a });
  }
  for (const [a, b] of m.congelados || []) if ((b ?? m.duracion) - a >= 3) avisos.push({ tipo: 'congelado', texto: `imagen congelada ${((b ?? m.duracion) - a).toFixed(1)} s desde ${mmss(a)} (¿se cortó el stream?)`, s: a });
  for (const [a, b] of m.silencios || []) if ((b ?? m.duracion) - a >= 4) avisos.push({ tipo: 'silencio', texto: `${((b ?? m.duracion) - a).toFixed(1)} s sin sonido desde ${mmss(a)}`, s: a });
  return { ok: !errores.length, errores, avisos, arreglos };
}

// ── diseño: cajas [{tipo, texto?, s, e, caja:[x0,y0,x1,y1]}] (puro) ──
const TEXTOS = new Set(['subtitulo', 'gancho', 'titulo', 'cta', 'rotulo']);
const area = r => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const cruce = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
function revisarDiseno(cajas, { W = 1080, H = 1920, kit, lectura = 21 } = {}) {
  const errores = [], avisos = [];
  const seg = rectSeguro(kit, W, H), b = (kit?.zonaSegura || {}).botones;
  const vistos = new Set(), avisar = (lista, clave, x) => { if (!vistos.has(clave)) { vistos.add(clave); lista.push(x); } };
  for (const c of cajas) {
    if (!TEXTOS.has(c.tipo) || !c.caja) continue;
    const [x0, y0, x1, y1] = c.caja, fuera = [];
    if (x0 < seg[0] - 2) fuera.push('izquierda'); if (x1 > seg[2] + 2) fuera.push('derecha');
    if (y0 < seg[1] - 2) fuera.push('arriba'); if (y1 > seg[3] + 2) fuera.push('abajo');
    if (fuera.length) avisar(errores, `zona:${c.tipo}:${fuera}`, { tipo: 'zona', texto: `${c.tipo} fuera de la zona segura (${fuera.join(', ')}): lo tapa la interfaz de la app`, s: c.s });
    if (b && x1 > W * b.x + 2 && y1 > H * b.desde && y0 < H * b.hasta) avisar(errores, `botones:${c.tipo}`, { tipo: 'botones', texto: `${c.tipo} debajo de la columna de botones (me gusta, comentar…)`, s: c.s });
  }
  // solapes: dos elementos a la vez que se pisan más de un 15 % del menor (el letrero/marca va aparte, arriba)
  const visibles = cajas.filter(c => c.caja && c.tipo !== 'marca');
  for (let i = 0; i < visibles.length; i++) for (let j = i + 1; j < visibles.length; j++) {
    const p = visibles[i], q = visibles[j];
    if (p.tipo === q.tipo && p.tipo === 'subtitulo') continue;
    if (Math.min(p.e, q.e) - Math.max(p.s, q.s) <= 0.05) continue;
    const r = cruce(p.caja, q.caja);
    if (area(r) > 0.15 * Math.min(area(p.caja), area(q.caja))) avisar(errores, `solape:${[p.tipo, q.tipo].sort()}:${Math.floor(Math.max(p.s, q.s))}`,
      { tipo: 'solape', texto: `${p.tipo} y ${q.tipo} se pisan en ${mmss(Math.max(p.s, q.s))}`, s: Math.max(p.s, q.s) });
  }
  const subs = cajas.filter(c => c.tipo === 'subtitulo' && c.texto);
  const rapidos = subs.filter(c => c.texto.replace(/\s/g, '').length / Math.max(0.05, c.e - c.s) > lectura && c.texto.length > 8);
  if (subs.length && rapidos.length / subs.length > 0.25) avisos.push({ tipo: 'lectura', texto: `${rapidos.length} de ${subs.length} subtítulos van demasiado rápido para leerlos (> ${lectura} letras/s)`, s: rapidos[0].s });
  const cortos = subs.filter(c => c.e - c.s < 0.25);
  if (cortos.length > 2) avisos.push({ tipo: 'lectura', texto: `${cortos.length} subtítulos duran menos de 0,25 s (parpadean)`, s: cortos[0].s });
  return { ok: !errores.length, errores, avisos };
}

// ── contraste: luminancia media del fondo en la caja de un subtítulo (fotograma real del vídeo final) ──
const lumHex = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
async function contraste(archivo, cajas, color, { ffmpeg = 'ffmpeg', muestras = 6 } = {}) {
  const subs = cajas.filter(c => c.tipo === 'subtitulo' && c.caja);
  if (!subs.length || !/^#[0-9a-f]{6}$/i.test(color || '')) return [];
  const paso = Math.max(1, Math.floor(subs.length / muestras)), out = [];
  for (let i = 0; i < subs.length && out.length < muestras; i += paso) {
    const c = subs[i], [x0, y0, x1, y1] = c.caja.map(v => Math.max(0, Math.round(v)));
    const w = Math.max(16, x1 - x0) & ~1, h = Math.max(16, y1 - y0) & ~1;
    try {
      // fondo = el fotograma un instante ANTES del subtítulo (sin el texto encima)
      const { out: buf } = await correr(ffmpeg, ['-v', 'error', '-ss', String(Math.max(0, c.s - 0.04)), '-i', archivo, '-frames:v', '1',
        '-vf', `crop=${w}:${h}:${x0}:${y0},scale=32:-2,format=gray`, '-f', 'rawvideo', '-'], { timeout: 60_000, binario: true });
      if (!buf?.length) continue;
      const lin = [...buf].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      out.push({ s: c.s, ratio: +ratio(lin.reduce((a, b) => a + b, 0) / lin.length, lumHex(color)).toFixed(2) });
    } catch { }
  }
  return out;
}

function resumen(q) {
  if (!q) return '';
  const e = [...(q.errores || [])], a = [...(q.avisos || [])];
  const med = q.medidas ? ` (${q.medidas.lufs != null ? `${q.medidas.lufs.toFixed(1)} LUFS` : 'sin medida de audio'}${q.medidas.picoReal != null ? `, pico ${q.medidas.picoReal.toFixed(1)} dBTP` : ''})` : '';
  if (!e.length && !a.length) return `Calidad: todo bien${med}${q.arreglado?.length ? ` · corregido solo: ${q.arreglado.join(', ')}` : ''}`;
  return `Calidad${med}: ${e.length ? `${e.length} error(es): ${e.map(x => x.texto).join('; ')}` : 'sin errores'}${a.length ? ` · ${a.length} aviso(s): ${a.map(x => x.texto).join('; ')}` : ''}${q.arreglado?.length ? ` · corregido solo: ${q.arreglado.join(', ')}` : ''}`;
}

function crearHerramienta({ cfg, kits }) {
  return {
    nombre: 'revisar_calidad', riesgo: 'lectura',
    descripcion: 'Control de calidad de un vídeo o audio terminado, como en una productora: sonoridad real (LUFS integrados y pico real, objetivo −14 LUFS / −1 dBTP para redes), '
      + 'resolución, duración, tramos en negro, imagen congelada y silencios largos. Úsalo SIEMPRE antes de dar por terminado un vídeo hecho con la suite (FilmCraft, EffectCraft, SoundCraft).',
    parametros: { type: 'object', properties: {
      archivo: { type: 'string', description: 'ruta del vídeo o audio' },
      kit: { type: 'string', description: 'kit de marca del que salen los objetivos de audio (opcional)' },
      lufs: { type: 'number' }, picoMax: { type: 'number' },
      ancho: { type: 'number', description: 'resolución esperada' }, alto: { type: 'number' }, duracion: { type: 'number', description: 'duración esperada en s' },
    }, required: ['archivo'] },
    resumen: a => path.basename(String(a.archivo || '')),
    ejecutar: async (a, ctx = {}) => {
      const f = path.resolve(ctx.cwd || require('os').homedir(), String(a.archivo || ''));
      const k = a.kit ? kits?.obtener(a.kit) : null;
      const m = await medir(f, { ffmpeg: cfg?.craft?.ffmpeg });
      const q = evaluar(m, { lufs: a.lufs ?? k?.audio?.lufs ?? -14, picoMax: a.picoMax ?? k?.audio?.picoMax ?? -1, esperado: { ancho: a.ancho, alto: a.alto, duracion: a.duracion } });
      return `${resumen({ ...q, medidas: m })}\n${JSON.stringify({ medidas: { ancho: m.ancho, alto: m.alto, fps: m.fps, duracion: m.duracion, audio: m.audio, lufs: m.lufs, picoReal: m.picoReal }, arreglos: q.arreglos })}`;
    },
  };
}

module.exports = { medir, evaluar, revisarDiseno, contraste, leerInforme, leerSondeo, resumen, ratio, lumHex, crearHerramienta, ffprobeDe };
