// Director de edición: mira el clip (análisis de vídeo propio + transcripción) y decide la edición:
//  - diseños por tramos: "pantalla" (zoom a la cabina y los pedales con la cara del streamer en una ventanita flotante)
//    y "podcast" (pantalla partida: arriba la cara, abajo la cabina, cada mitad siguiendo a quien sale)
//  - cambios de escena (los de efectos.TIPOS_ESCENA), efectos de sonido propios y emojis (cualquiera del catálogo)
// El plan lo propone el modelo del cerebro y aquí se valida (tiempos, solapes, cuántos); sin modelo, reglas propias.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const efectos = require('./efectos');

const DISENOS = {
  pantalla: 'zoom a la cabina y los pedales (lo que pasa en el camión/juego) con la cara del streamer en una ventanita flotante en una esquina. Para cuando enseña algo, pasa algo en la carretera/cabina o dice "miren", "fíjense", "checa"',
  podcast: 'pantalla partida estilo podcast: arriba la cara del streamer, abajo la cabina, cada mitad siguiendo la cara de quien sale. Para conversaciones largas con alguien que está en la cabina o tramos de charla tranquila',
};
// sonido → [descripción, volumen en dB para la mezcla] (core/craft/sonidos/sonidos.py)
const SONIDOS = {
  whoosh: ['paso de aire largo: entra un cambio de plano o una ventana', -10], swoosh: ['paso de aire corto: transición rápida', -10],
  impacto: ['golpe grave de cine: choque, accidente, revelación', -7], golpe: ['puñetazo seco: remate de una frase, zoom de golpe', -9],
  ding: ['campanita: dato, acierto, idea', -9], pop: ['burbuja corta: aparece algo', -11], riser: ['subida de tensión de 1,6 s que ACABA en el momento', -10],
  glitch: ['fallo digital: algo raro, susto', -16], claxon: ['bocina de aire de tráiler: saludo, momento camionero', -15],
  tambor: ['dun dun DUN: lo cómico o dramático', -8], chaching: ['caja registradora: dinero', -9], rasgueo: ['rayón de disco: giro inesperado, "¿qué?"', -10],
  camara: ['disparo de cámara: foto, "miren esto"', -8], error: ['zumbido de fallo: sale mal', -17], boing: ['muelle cómico: tropiezo, tontería', -11],
  suspenso: ['nota grave que crece 2 s: miedo, tensión', -10],
};
// sonido que acompaña solo a cada cosa si el plan no trae uno cerca
const SONIDO_DE = { pantalla: 'whoosh', podcast: 'swoosh', escalones: 'tambor', corte: 'golpe', temblor: 'impacto', drama: 'suspenso', giro: 'rasgueo', acercar: 'whoosh', lento: 'riser', recorrido: 'whoosh' };
const ES_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})️?$/u;

// ── análisis (core/craft/analisis.py), guardado junto a la salida ──
function analizar(video, zonas, { python = 'python', cache, signal } = {}) {
  const st = fs.statSync(video), huella = `${st.size}:${st.mtimeMs}:${JSON.stringify(zonas)}`;
  if (cache) try { const j = JSON.parse(fs.readFileSync(cache, 'utf8')); if (j.huella === huella) return Promise.resolve(j); } catch { }
  const salida = cache || path.join(require('os').tmpdir(), `apolo-analisis-${Date.now()}.json`);
  return new Promise((ok, mal) => {
    const p = spawn(python, ['-I', path.join(__dirname, 'analisis.py'), video, salida, JSON.stringify(zonas)], { windowsHide: true });
    let err = ''; p.stderr.on('data', d => { err += d; });
    signal?.addEventListener('abort', () => p.kill(), { once: true });
    p.on('error', e => mal(new Error(`no se pudo lanzar ${python}: ${e.message}`)));
    p.on('close', c => {
      if (c !== 0) return mal(new Error(`el análisis del vídeo falló (${c}): ${err.trim().split('\n').slice(-2).join(' ').slice(0, 300)}`));
      try { const j = JSON.parse(fs.readFileSync(salida, 'utf8')); j.huella = huella; fs.writeFileSync(salida, JSON.stringify(j)); ok(j); } catch (e) { mal(e); }
    });
  });
}

// frases [{desde, hasta, texto}] a partir de las palabras (por puntuación, pausas o si se alargan)
function frases(palabras) {
  const out = []; let f = [];
  palabras.forEach((p, i) => {
    f.push(p);
    const sig = palabras[i + 1], largo = p.e - f[0].s;
    if (/[.!?…]$/.test(p.w) || !sig || sig.s - p.e > 0.6 || largo >= 5) { out.push({ desde: f[0].s, hasta: p.e, texto: f.map(w => w.w).join(' ').trim() }); f = []; }
  });
  return out;
}

// señales por bloques de `paso` s (puro): voz, volumen, movimiento y caras por zona
function senales(an, palabras, { paso = 2 } = {}) {
  const dur = an.duracion || palabras.at(-1)?.e || 0, filas = [];
  const media = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  for (let t0 = 0; t0 < dur; t0 += paso) {
    const t1 = Math.min(dur, t0 + paso);
    const fila = { t: +t0.toFixed(1) };
    const habla = palabras.filter(p => p.e > t0 && p.s < t1).reduce((s, p) => s + Math.min(t1, p.e) - Math.max(t0, p.s), 0);
    fila.voz = Math.round(100 * habla / (t1 - t0));
    const au = (an.audio || []).slice(Math.floor(t0 / (an.pasoAudio || 0.2)), Math.ceil(t1 / (an.pasoAudio || 0.2)));
    fila.db = au.length ? Math.max(...au) : null;
    fila.mov = {}; fila.caras = {};
    for (const z of Object.keys(an.movimiento || {})) {
      const pm = an.pasoMov || 0.2;
      fila.mov[z] = Math.round(media(an.movimiento[z].slice(Math.floor(t0 / pm), Math.ceil(t1 / pm))));
      const cs = (an.caras?.[z] || []).filter(([t]) => t >= t0 && t < t1);
      fila.caras[z] = cs.length ? Math.round(10 * media(cs.map(([, l]) => l.length))) / 10 : 0;
    }
    filas.push(fila);
  }
  return filas;
}

// cara (centro x) de una zona en el tiempo, suavizada: [[t, x]] cada ~1 s (para que el encuadre siga a quien sale)
function seguimiento(an, zona, desde, hasta, { cada = 1, xDefecto } = {}) {
  const cs = (an.caras?.[zona] || []).filter(([t, l]) => t >= desde - 0.5 && t <= hasta + 0.5 && l.length);
  const puntos = [];
  for (let t = desde; t <= hasta + 1e-6; t += cada) {
    const cerca = cs.filter(([tt]) => Math.abs(tt - t) <= cada).map(([, l]) => l[0][0]);
    if (cerca.length) puntos.push([+t.toFixed(2), cerca.sort((a, b) => a - b)[cerca.length >> 1]]);
  }
  if (!puntos.length) return [[desde, xDefecto]];
  // suavizado: media móvil de 3 y no se mueve por menos de 40 px (sin temblores del encuadre)
  const sua = puntos.map((p, i) => [p[0], Math.round((puntos[Math.max(0, i - 1)][1] + p[1] + puntos[Math.min(puntos.length - 1, i + 1)][1]) / 3)]);
  const out = [sua[0]];
  for (const p of sua.slice(1)) if (Math.abs(p[1] - out.at(-1)[1]) >= 40) out.push(p);
  return out;
}

const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// el texto que ve el modelo
function informe(an, palabras, { titulo, contexto } = {}) {
  const fs_ = frases(palabras);
  const filas = senales(an, palabras);
  const zonas = Object.keys(an.movimiento || {});
  return [
    titulo ? `Título: ${titulo}` : '', contexto ? `Contexto: ${contexto}` : '',
    `Duración: ${an.duracion} s. Vídeo vertical con ${zonas.length} cámaras apiladas: ${zonas.join(', ')} (de arriba abajo).`,
    'TRANSCRIPCIÓN (segundos):', ...fs_.map(f => `[${f.desde.toFixed(1)}–${f.hasta.toFixed(1)}] ${f.texto}`),
    '', `SEÑALES cada 2 s — voz % del bloque · volumen dB (pico) · movimiento por cámara (0–100) · caras por cámara:`,
    ...filas.map(f => `${f.t.toFixed(0).padStart(3)}s voz${String(f.voz).padStart(3)} ${f.db == null ? '' : f.db.toFixed(0) + 'dB'} mov ${zonas.map(z => `${z}=${f.mov[z]}`).join(' ')} caras ${zonas.map(z => `${z}=${f.caras[z]}`).join(' ')}`),
  ].filter(x => x !== '').join('\n');
}

const ESQUEMA = {
  type: 'object',
  properties: {
    disenos: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: Object.keys(DISENOS) }, desde: { type: 'number' }, hasta: { type: 'number' }, esquina: { type: 'string', enum: ['derecha', 'izquierda'] }, motivo: { type: 'string' } }, required: ['tipo', 'desde', 'hasta'] } },
    escenas: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: Object.keys(efectos.TIPOS_ESCENA) }, desde: { type: 'number' }, hasta: { type: 'number' }, zona: { type: 'string' } }, required: ['tipo', 'desde', 'hasta'] } },
    sonidos: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, sonido: { type: 'string', enum: Object.keys(SONIDOS) } }, required: ['t', 'sonido'] } },
    emojis: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, emoji: { type: 'string' } }, required: ['t', 'emoji'] } },
    resumen: { type: 'string' },
  },
  required: ['disenos', 'escenas', 'sonidos', 'emojis'],
};

function instrucciones(dur) {
  return [
    'Eres el director de edición de clips verticales (TikTok/Shorts/Reels) de un streamer. Decides la edición mirando la transcripción y las señales del vídeo. Todo en segundos del clip.',
    'DISEÑOS (tramos donde cambia la composición de las cámaras): ' + Object.entries(DISENOS).map(([k, v]) => `${k} = ${v}`).join('; ') + '.',
    `  · 0–3 diseños, de 4 a 20 s cada uno, nunca en los primeros 3,6 s ni en los últimos 5 s (hasta ${(dur - 5).toFixed(1)}), separados al menos 6 s. Empiezan y acaban al principio/final de una frase.`,
    '  · podcast solo si hay charla seguida (voz alta varios bloques) y caras en la cabina (caras cabina ≥ 1). pantalla cuando la acción está en la cabina/carretera (movimiento cabina alto, gritos, "miren").',
    'ESCENAS (acercamientos dentro del vídeo normal, fuera de los diseños): ' + Object.entries(efectos.TIPOS_ESCENA).map(([k, v]) => `${k} = ${v}`).join('; ') + '. zona = cara | cabina | pedales.',
    '  · 2–4 escenas de 1,2 a 5 s sobre las frases más fuertes, separadas ≥ 8 s, tipos variados según el tono.',
    'SONIDOS (efectos propios, el momento exacto t en s): ' + Object.entries(SONIDOS).map(([k, [d]]) => `${k} = ${d}`).join('; ') + '.',
    '  · uno cada 5–8 s como mucho, donde refuerce algo (entrada de un diseño o escena, un golpe, un grito, un remate). riser y suspenso empiezan ANTES del momento. No tapes frases tranquilas.',
    'EMOJIS: cualquier emoji Unicode de UN solo carácter (sin tonos de piel ni combinados) que encaje con lo que se dice en ese momento; t = cuando se dice. Uno cada 6–10 s, nunca dos en 3 s; variados, no repitas el mismo.',
    'Mira el volumen: picos fuertes (más de −12 dB) suelen ser gritos, risas o golpes. Movimiento alto en cabina = algo pasa. resumen = una línea con la idea de la edición.',
  ].join('\n');
}

// plan del modelo → plan válido (puro)
function validar(plan, { dur, gancho = 3.6, cta = 5, zonas = ['cara', 'cabina', 'pedales'] } = {}) {
  const num = v => (Number.isFinite(+v) ? +v : NaN);
  const out = { disenos: [], escenas: [], sonidos: [], emojis: [], resumen: String(plan?.resumen || '').slice(0, 300) };
  for (const d of [...(plan?.disenos || [])].sort((a, b) => num(a.desde) - num(b.desde))) {
    if (!DISENOS[d.tipo]) continue;
    const desde = Math.max(gancho, num(d.desde)), hasta = Math.min(dur - cta, num(d.hasta));
    if (!(hasta - desde >= 3) || out.disenos.length >= 3) continue;
    if (out.disenos.some(o => desde < o.hasta + 4)) continue;
    out.disenos.push({ tipo: d.tipo, desde: +desde.toFixed(2), hasta: +Math.min(hasta, desde + 25).toFixed(2), esquina: d.esquina === 'izquierda' ? 'izquierda' : 'derecha' });
  }
  const enDiseno = (a, b) => out.disenos.some(o => a < o.hasta + 0.6 && b > o.desde - 0.6);
  for (const e of [...(plan?.escenas || [])].sort((a, b) => num(a.desde) - num(b.desde))) {
    const desde = num(e.desde), hasta = num(e.hasta);
    if (!efectos.TIPOS_ESCENA[e.tipo] || !(hasta - desde >= 0.8) || hasta - desde > 8 || desde < gancho || hasta > dur - cta) continue;
    if (enDiseno(desde, hasta) || out.escenas.some(o => desde < o.hasta + 4) || out.escenas.length >= 5) continue;
    out.escenas.push({ tipo: e.tipo, desde: +desde.toFixed(2), hasta: +hasta.toFixed(2), zona: zonas.includes(e.zona) ? e.zona : 'cara' });
  }
  for (const s of [...(plan?.sonidos || [])].sort((a, b) => num(a.t) - num(b.t))) {
    const t = num(s.t);
    if (!SONIDOS[s.sonido] || !(t >= 0 && t < dur - 0.3) || out.sonidos.some(o => Math.abs(o.t - t) < 1.5)) continue;
    out.sonidos.push({ t: +t.toFixed(2), sonido: s.sonido });
  }
  // cada diseño y escena con su sonido si no trae uno cerca
  for (const x of [...out.disenos, ...out.escenas]) {
    const t = Math.max(0, x.desde - (x.tipo === 'lento' ? 1.2 : x.tipo === 'drama' ? 1.6 : 0.15));
    if (!out.sonidos.some(o => Math.abs(o.t - t) < 1.2)) out.sonidos.push({ t: +t.toFixed(2), sonido: SONIDO_DE[x.tipo] || 'whoosh' });
  }
  out.sonidos.sort((a, b) => a.t - b.t);
  if (out.sonidos.length > Math.ceil(dur / 4)) out.sonidos = out.sonidos.slice(0, Math.ceil(dur / 4));
  const vistos = new Map();
  for (const e of [...(plan?.emojis || [])].sort((a, b) => num(a.t) - num(b.t))) {
    const t = num(e.t), em = String(e.emoji || '').trim();
    if (!ES_EMOJI.test(em) || !(t >= gancho && t < dur - cta)) continue;
    if (out.emojis.some(o => t - o.t < 2.5) || (vistos.get(em) ?? -99) > t - 15) continue;
    out.emojis.push({ t: +t.toFixed(2), emoji: em }); vistos.set(em, t);
  }
  return out;
}

// sin modelo: reglas propias con las mismas señales
function porReglas(an, palabras, { dur }) {
  const plan = { disenos: [], escenas: efectos.elegirEscenas(palabras, { duracion: dur }), sonidos: [], emojis: [], resumen: 'plan por reglas (sin modelo)' };
  const fs_ = frases(palabras);
  const miren = fs_.find(f => /\b(miren|mira|f[ií]jen?se|checa|chequen|vean|ve esto|ah[ií] est[aá])\b/i.test(f.texto) && f.desde > 4);
  if (miren) plan.disenos.push({ tipo: 'pantalla', desde: miren.desde, hasta: miren.hasta + 6 });
  const filas = senales(an, palabras);
  let mejor = null;                                // podcast: el tramo más largo con charla y caras en la cabina
  for (let i = 0; i < filas.length; i++) {
    let j = i;
    while (j < filas.length && filas[j].voz >= 45 && (filas[j].caras.cabina || 0) >= 0.5) j++;
    if (j - i >= 4 && (!mejor || j - i > mejor[1] - mejor[0])) mejor = [i, j];
  }
  if (mejor) plan.disenos.push({ tipo: 'podcast', desde: filas[mejor[0]].t, hasta: Math.min(filas[mejor[0]].t + 16, filas[mejor[1] - 1].t + 2) });
  return plan;
}

// todo junto: plan validado para un clip
async function dirigir({ an, palabras, generarJSON, modelo, titulo, contexto, log = () => { } }) {
  const dur = an.duracion || palabras.at(-1)?.e || 0;
  let crudo = null;
  if (generarJSON) {
    try {
      const r = await generarJSON({ modelo: modelo?.(), system: instrucciones(dur), prompt: informe(an, palabras, { titulo, contexto }), schema: ESQUEMA });
      crudo = r?.datos || r;
    } catch (e) { log(`director: el modelo falló (${e.message}); van las reglas`); }
  }
  const plan = validar(crudo || porReglas(an, palabras, { dur }), { dur, zonas: Object.keys(an.movimiento || {}) });
  plan.origen = crudo ? 'modelo' : 'reglas';
  return plan;
}

module.exports = { DISENOS, SONIDOS, analizar, frases, senales, seguimiento, informe, validar, porReglas, dirigir, ESQUEMA };
