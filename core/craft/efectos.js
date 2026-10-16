// Efectos propios para subtitular_video: golpes de vídeo en los momentos fuertes + looks de color.
//  - Golpes (sobre el clip de vídeo V1, con keyframes: el efecto está a 0 y se enciende un instante):
//      zoom (acercamiento de golpe) · temblor (cámara) · destello (fogonazo de brillo) · rgb (separación de color)
//      glitch (bloques digitales) · barrido (desenfoque de movimiento)
//  - Momentos: lo deciden las palabras (las mismas raíces que los emojis) y los gritos (¡…!); uno cada `hueco` s como mucho.
//  - Looks: combinaciones nuestras de los parámetros de color de FilmCraft (lumetri), no presets de nadie.
'use strict';
const emojis = require('./emojis');

// emoji del momento → golpes que lo acompañan
const POR_EMOJI = {
  rayo: ['barrido', 'zoom'], fuego: ['destello', 'zoom'], sorpresa: ['zoom'], fantasma: ['glitch', 'rgb'], calavera: ['rgb', 'temblor'],
  risa: ['temblor'], corona: ['destello'], cien: ['destello', 'zoom'], dinero: ['destello'], pesa: ['temblor', 'zoom'], ojos: ['zoom'],
};
const GOLPES = ['zoom', 'temblor', 'destello', 'rgb', 'glitch', 'barrido'];

// keyframes de cada golpe: efecto de FilmCraft, parámetro, valores fijos y la curva [segundos desde el momento, valor] (0 = apagado)
const CURVAS = {
  temblor: { efecto: 'camera_shake', param: 'amount', fijos: { zoom: 7, rotation: 2.5, frequency: 14, complexity: 3, motion_blur: 0 }, curva: dur => [[0, 0], [0.04, 32], [Math.max(0.1, dur), 32], [Math.max(0.1, dur) + 0.08, 0]] },
  destello: { efecto: 'brightness_contrast', param: 'brightness', curva: () => [[0, 0], [0.04, 85], [0.22, 0]] },
  rgb: { efecto: 'rgb_split', param: 'amount', fijos: { angle: 0 }, curva: () => [[0, 0], [0.03, 28], [0.14, 12], [0.3, 0]] },
  glitch: { efecto: 'vr_digital_glitch', param: 'amplitude', fijos: { rate: 24, distortion: 35 }, curva: () => [[0, 0], [0.03, 75], [0.18, 40], [0.28, 0]] },
  barrido: { efecto: 'directional_blur', param: 'length', fijos: { direction: 90 }, curva: () => [[0, 0], [0.06, 90], [0.2, 0]] },
};
const LOOKS = {
  vivo: { saturation: 150, contrast: 22, vibrance: 35 },
  calido: { temperature: 55, tint: 8, saturation: 112, contrast: 10 },
  frio: { temperature: -45, saturation: 88, contrast: 15 },
  cine: { contrast: 28, saturation: 78, temperature: -10, vignette_on: true, vignette_amount: -2.2 },
  terror: { saturation: 35, contrast: 38, exposure: -0.4, temperature: -25, vignette_on: true, vignette_amount: -3 },
  retro: { faded_film: 70, temperature: 40, saturation: 68, contrast: -8 },
  bn: { saturation: 0, contrast: 25 },
};

// trozos [{s, e, texto}] → momentos [{s, e, golpes[]}] (puro, para tests)
// fijos = los golpes propios del estilo: salen en CUALQUIER momento fuerte (si no, cada emoji trae los suyos)
function momentos(trozos, { permitidos = GOLPES, fijos = null, hueco = 3.5, intro = true } = {}) {
  const ok = g => permitidos.includes(g);
  const out = [];
  let ultimo = -Infinity;
  if (intro && trozos.length && ok('destello')) { out.push({ s: 0, e: 0.25, golpes: ['destello'] }); ultimo = 0; }
  for (const t of trozos) {
    if (t.s < ultimo + hueco) continue;
    const em = emojis.emojiDe(t.texto);
    const fuerte = !!POR_EMOJI[em] || /[¡!]/.test(t.texto);
    let golpes = fijos ? (fuerte ? fijos.filter(ok) : []) : (POR_EMOJI[em] || []).filter(ok);
    if (!fijos && !golpes.length && /[¡!]/.test(t.texto) && ok('zoom')) golpes = ['zoom'];
    if (!golpes.length) continue;
    out.push({ s: t.s, e: Math.max(t.e, t.s + 0.3), golpes });
    ultimo = t.s;
  }
  return out;
}

// efectos de FilmCraft sobre el clip de vídeo, compartidos entre golpes, looks y escenas (cada efecto se aplica una sola vez)
function crearGolpes({ fc, clip, t }) {
  const aplicados = new Set();
  let base = null;                                     // valores del look (lumetri), para que el "drama" vuelva a ellos
  const asegurar = async nombre => {
    const c = CURVAS[nombre];
    if (aplicados.has(nombre)) return c;
    await fc('effects.apply', { clips: [clip], effect: c.efecto });
    for (const [k, v] of Object.entries(c.fijos || {})) await fc('effects.setParam', { clip, effect: c.efecto, param: k, value: v });
    await fc('effects.setParam', { clip, effect: c.efecto, param: c.param, value: 0, time: 0, keyframe: true });   // apagado de base
    aplicados.add(nombre); return c;
  };
  async function golpe(nombre, s, dur = 0.3) {
    const c = await asegurar(nombre);
    for (const [dt, v] of c.curva(dur)) await fc('effects.setParam', { clip, effect: c.efecto, param: c.param, value: v, time: t(s + dt), keyframe: true });
  }
  async function lumetri(valores = {}) {
    if (!base) { await fc('effects.apply', { clips: [clip], effect: 'lumetri' }); base = { saturation: 100, vignette_amount: 0 }; }
    for (const [k, v] of Object.entries(valores)) { await fc('effects.setParam', { clip, effect: 'lumetri', param: k, value: v }); if (k in base) base[k] = v; }
    return base;
  }
  return { asegurar, golpe, lumetri };
}

// aplica golpes y look al clip de vídeo. fc(id, params) = command_run; t(seg) = ticks cuadrados a fotograma
async function aplicar({ fc, clip, t, lista, look, golpes: gx = crearGolpes({ fc, clip, t }) }) {
  let zooms = 0;
  for (const m of lista) {
    for (const g of m.golpes) {
      if (g === 'zoom') {                                // acercamiento de golpe con el motion del propio vídeo
        if (!zooms++) await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: 100, time: 0, keyframe: true });
        for (const [dt, v] of [[0, 100], [0.08, 113], [Math.max(0.2, m.e - m.s), 113], [Math.max(0.2, m.e - m.s) + 0.15, 100]])
          await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: v, time: t(m.s + dt), keyframe: true });
        continue;
      }
      await gx.golpe(g, m.s, m.e - m.s);
    }
  }
  if (look && LOOKS[look]) await gx.lumetri({ basic_on: true, ...LOOKS[look] });
  return { golpes: lista.reduce((n, m) => n + m.golpes.length, 0), look: look && LOOKS[look] ? look : null };
}

// ── CAMBIOS DE ESCENA ──
// El vídeo se mete en una zona (la cámara del streamer…) hasta llenar la pantalla durante una frase y vuelve.
// Ancla de motion en el centro del cuadro c: para dejar el punto P en el centro a escala S y giro θ, posición = c − R(θ)·S·(P − c).
const TIPOS_ESCENA = {
  acercar: 'zoom suave a la zona, se queda la frase y vuelve',
  escalones: 'zoom en 3 golpes secos (dun, dun, DUN) con fogonazo; para lo cómico',
  corte: 'salto instantáneo al plano cerrado con fogonazo, y salto de vuelta',
  lento: 'entra y se sigue acercando despacio durante la frase; para lo serio',
  giro: 'plano cerrado inclinado (holandés); para lo loco',
  recorrido: 'entra en una zona y viaja a otra (cara → cabina) durante la frase',
  drama: 'acercamiento lento que se vuelve blanco y negro con viñeta; para lo triste',
  temblor: 'plano cerrado con la cámara temblando; para gritos y sustos',
};

function encuadre({ zona, x, y, W, H, extra = 1 }) {
  const [x0, y0, x1, y1] = zona;
  const S = Math.max(W / (x1 - x0), H / (y1 - y0)) * extra;        // "cubrir": la zona llena el cuadro sin dejar bordes
  const mx = W / (2 * S), my = H / (2 * S);
  const lim = (v, a, b) => (a > b ? (a + b) / 2 : Math.min(Math.max(v, a), b));
  return { escala: +(S * 100).toFixed(2), punto: [Math.round(lim(x ?? (x0 + x1) / 2, x0 + mx, x1 - mx)), Math.round(lim(y ?? (y0 + y1) / 2, y0 + my, y1 - my))] };
}

// posición para centrar `punto` a escala `esc` (%) y giro `rot` (°)
function posicion(punto, esc, rot, W, H) {
  const c = [W / 2, H / 2], S = esc / 100, a = rot * Math.PI / 180;
  const vx = (punto[0] - c[0]) * S, vy = (punto[1] - c[1]) * S;
  return [Math.round(c[0] - (vx * Math.cos(a) - vy * Math.sin(a))), Math.round(c[1] - (vx * Math.sin(a) + vy * Math.cos(a)))];
}

// plan de una escena (puro): keyframes de motion [seg, pos, esc, rot, curva] + golpes + tramo de drama
function planEscena({ tipo = 'acercar', desde, hasta, zona, x, y, hacia, xHacia, yHacia, W, H, trans = 0.35, fps = 60 }) {
  const c = [W / 2, H / 2], ROT = -10;
  const giro = tipo === 'giro';
  const extra = giro ? Math.cos(Math.abs(ROT) * Math.PI / 180) + Math.sin(Math.abs(ROT) * Math.PI / 180) * Math.max(W / H, H / W) : 1;
  const { escala, punto } = encuadre({ zona, x, y, W, H, extra });
  const rot = giro ? ROT : 0;
  const dentro = posicion(punto, escala, rot, W, H);
  const ini = Math.max(0, desde - trans * 0.4), lleno = ini + trans, sale = Math.max(lleno + 0.1, hasta), fuera = sale + trans;
  const kf = [], golpes = [];
  let drama = null;
  const suave = () => kf.push([ini, c, 100, 0, 'easeOut'], [lleno, dentro, escala, rot, 'easeIn']);
  const vuelta = (pos = dentro, esc = escala) => kf.push([sale, pos, esc, rot, 'easeOut'], [fuera, c, 100, 0, 'easeIn']);
  if (tipo === 'corte') {
    const f = 1 / fps;
    kf.push([Math.max(0, desde - f), c, 100, 0, 'hold'], [desde, dentro, escala, 0, 'hold'], [hasta, c, 100, 0, 'hold']);
    golpes.push(['destello', desde, 0.2], ['destello', hasta, 0.2]);
  } else if (tipo === 'escalones') {
    kf.push([Math.max(0, desde - 1 / fps), c, 100, 0, 'hold']);
    for (const [dt, u] of [[0, 0.35], [0.28, 0.68], [0.56, 1]]) {
      const esc = 100 + (escala - 100) * u;
      kf.push([desde + dt, posicion(punto, esc, 0, W, H), +esc.toFixed(2), 0, 'hold']);
    }
    golpes.push(['destello', desde + 0.56, 0.2]);
    const fin = Math.max(desde + 0.7, hasta);
    kf.push([fin, dentro, escala, 0, 'easeOut'], [fin + trans, c, 100, 0, 'easeIn']);
  } else if (tipo === 'lento' || tipo === 'drama') {
    suave();
    kf[kf.length - 1][4] = 'linear';
    const esc2 = +(escala * 1.12).toFixed(2);
    vuelta(posicion(punto, esc2, 0, W, H), esc2);
    if (tipo === 'drama') drama = { s: lleno, e: sale, fuera };
  } else if (tipo === 'recorrido' && hacia) {
    const b = encuadre({ zona: hacia, x: xHacia, y: yHacia, W, H });
    suave();
    kf.push([lleno + Math.max(0.2, (sale - lleno) * 0.35), dentro, escala, 0, 'easeOut']);
    kf.push([sale, posicion(b.punto, b.escala, 0, W, H), b.escala, 0, 'easeOut'], [fuera, c, 100, 0, 'easeIn']);
  } else {                                             // acercar, giro, temblor
    suave(); vuelta();
    if (tipo === 'temblor') golpes.push(['temblor', lleno, Math.max(0.2, sale - lleno)]);
  }
  return { kf, golpes, drama, escala, punto };
}

async function enfocar({ fc, clip, t, W, H, enfoques, fps = 60, golpes: gx = crearGolpes({ fc, clip, t }) }) {
  if (!enfoques?.length) return 0;
  const c = [W / 2, H / 2];
  const planes = [...enfoques].sort((a, b) => a.desde - b.desde).map(en => planEscena({ ...en, W, H, fps }));
  const girado = planes.some(p => p.kf.some(k => k[3]));
  await fc('effects.setParam', { clip, effect: 'motion', param: 'position', value: c, time: 0, keyframe: true });
  await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: 100, time: 0, keyframe: true });
  if (girado) await fc('effects.setParam', { clip, effect: 'motion', param: 'rotation', value: 0, time: 0, keyframe: true });
  const params = girado ? ['position', 'scale', 'rotation'] : ['position', 'scale'];
  for (const plan of planes) {
    for (const [seg, pos, esc, rot] of plan.kf) {
      const tk = t(seg);
      await fc('effects.setParam', { clip, effect: 'motion', param: 'position', value: pos, time: tk, keyframe: true });
      await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: esc, time: tk, keyframe: true });
      if (girado) await fc('effects.setParam', { clip, effect: 'motion', param: 'rotation', value: rot, time: tk, keyframe: true });
    }
    for (const [seg, , , , curva] of plan.kf)
      for (const param of params)
        try { await fc('effects.setInterpolation', { clip, effect: 'motion', param, mediaTime: t(seg), interpolation: curva }); } catch { }
    for (const [nombre, s, dur] of plan.golpes) await gx.golpe(nombre, s, dur);
    if (plan.drama) {                                  // se va a blanco y negro con viñeta y vuelve al color del look
      const base = await gx.lumetri({ basic_on: true, vignette_on: true });
      for (const [seg, sat, vig] of [[plan.drama.s - 0.3, base.saturation, base.vignette_amount], [plan.drama.s + 0.4, 0, -3], [plan.drama.e, 0, -3], [plan.drama.fuera, base.saturation, base.vignette_amount]]) {
        await fc('effects.setParam', { clip, effect: 'lumetri', param: 'saturation', value: sat, time: t(seg), keyframe: true });
        await fc('effects.setParam', { clip, effect: 'lumetri', param: 'vignette_amount', value: vig, time: t(seg), keyframe: true });
      }
    }
  }
  return planes.length;
}

// frases candidatas para escenas automáticas: [{desde, hasta, texto, tipo}] (puro)
// puntúa gritos y palabras fuertes, separa las escenas `hueco` s, evita el gancho (3,5 s) y la llamada final (5 s), y varía el tipo
function elegirEscenas(palabras, { duracion, cuantas, hueco = 15 } = {}) {
  const frases = [];
  let f = [];
  for (const p of palabras) { f.push(p); if (/[.!?…]$/.test(p.w)) { frases.push(f); f = []; } }
  if (f.length) frases.push(f);
  const dur = duracion || (palabras.at(-1)?.e || 0);
  const n = cuantas ?? (dur > 90 ? 3 : 2);
  const triste = /\b(acab|trist|extra[ñn]|perd|dif[ií]cil|muri|adi[oó]s|nunca)/i;
  const candidatas = frases.map(ws => {
    const texto = ws.map(w => w.w).join(' '), desde = ws[0].s, hasta = ws.at(-1).e;
    const em = emojis.emojiDe(texto);
    let p = 0, tipo = 'acercar';
    if (/[¡!]/.test(texto)) { p += 2; tipo = 'temblor'; }
    if (em) p += 1;
    if (em === 'risa' || em === 'calavera') { p += 1; tipo = 'escalones'; }
    if (em === 'fantasma' || em === 'sorpresa') { p += 1; tipo = 'corte'; }
    if (triste.test(texto)) { p += 1.5; tipo = 'drama'; }
    if (/\?/.test(texto)) p += 0.5;
    return { desde, hasta, texto, tipo, p };
  }).filter(x => x.hasta - x.desde >= 1.2 && x.hasta - x.desde <= 5 && x.desde > 3.5 && x.hasta < dur - 5);
  const elegidas = [];
  for (const c of candidatas.sort((a, b) => b.p - a.p)) {
    if (elegidas.length >= n) break;
    if (elegidas.some(e => Math.abs(e.desde - c.desde) < hueco)) continue;
    elegidas.push(c);
  }
  // variedad: si un tipo se repite, el repetido pasa a otro
  const otros = ['acercar', 'lento', 'giro', 'escalones'];
  const vistos = new Set();
  for (const e of elegidas.sort((a, b) => a.desde - b.desde)) { if (vistos.has(e.tipo)) e.tipo = otros.find(o => !vistos.has(o)) || e.tipo; vistos.add(e.tipo); }
  return elegidas.map(({ p, ...e }) => e);
}

module.exports = { momentos, aplicar, crearGolpes, encuadre, posicion, planEscena, enfocar, elegirEscenas, TIPOS_ESCENA, GOLPES, LOOKS, POR_EMOJI };
