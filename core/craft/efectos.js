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

// aplica golpes y look al clip de vídeo. fc(id, params) = command_run; t(seg) = ticks cuadrados a fotograma
async function aplicar({ fc, clip, t, lista, look }) {
  const aplicados = new Set();
  const asegurar = async nombre => {
    const c = CURVAS[nombre];
    if (aplicados.has(nombre)) return c;
    await fc('effects.apply', { clips: [clip], effect: c.efecto });
    for (const [k, v] of Object.entries(c.fijos || {})) await fc('effects.setParam', { clip, effect: c.efecto, param: k, value: v });
    await fc('effects.setParam', { clip, effect: c.efecto, param: c.param, value: 0, time: 0, keyframe: true });   // apagado de base
    aplicados.add(nombre); return c;
  };
  let zooms = 0;
  for (const m of lista) {
    for (const g of m.golpes) {
      if (g === 'zoom') {                                // acercamiento de golpe con el motion del propio vídeo
        if (!zooms++) await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: 100, time: 0, keyframe: true });
        for (const [dt, v] of [[0, 100], [0.08, 113], [Math.max(0.2, m.e - m.s), 113], [Math.max(0.2, m.e - m.s) + 0.15, 100]])
          await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: v, time: t(m.s + dt), keyframe: true });
        continue;
      }
      const c = await asegurar(g);
      for (const [dt, v] of c.curva(m.e - m.s)) await fc('effects.setParam', { clip, effect: c.efecto, param: c.param, value: v, time: t(m.s + dt), keyframe: true });
    }
  }
  if (look && LOOKS[look]) {
    await fc('effects.apply', { clips: [clip], effect: 'lumetri' });
    for (const [k, v] of Object.entries(LOOKS[look])) await fc('effects.setParam', { clip, effect: 'lumetri', param: k, value: v });
  }
  return { golpes: lista.reduce((n, m) => n + m.golpes.length, 0), look: look && LOOKS[look] ? look : null };
}

module.exports = { momentos, aplicar, GOLPES, LOOKS, POR_EMOJI };
