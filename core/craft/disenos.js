// Diseños por tramos (los decide el director): se montan ENCIMA del vídeo normal, en 3 pistas nuevas justo sobre V1,
// con el mismo vídeo colocado otra vez en el tramo. Fuera del tramo se ve V1 tal cual.
//  - pantalla: V2 = zoom a la cabina y los pedales · V3 = marco con brillo · V4 = la cámara de la cara en ventanita flotante
//  - podcast:  V2 = cabina en la mitad de abajo · V3 = raya del medio · V4 = cara en la mitad de arriba; cada mitad sigue a quien sale
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const efectos = require('./efectos');

// ventanita: tamaño (fracción del ancho), margen y altura bajo el letrero
const PIP = { ancho: 0.44, margen: 26, arriba: 178, radio: 34 };

// plan puro de la ventanita para un tramo → keyframes de motion de las dos piezas
function planPantalla({ desde, hasta, esquina = 'derecha', zonas, W, H, k = W / 1080, trans = 0.35 }) {
  const cara = zonas.cara, cab = zonas.cabina || [0, H / 3, W, H];
  const juego = [0, cab[1], W, (zonas.pedales || cab)[3]];             // la cabina y los pedales
  const z = efectos.encuadre({ zona: juego, W, H });
  const zoomPos = efectos.posicion(z.punto, z.escala, 0, W, H);
  const cw = cara[2] - cara[0], ch = cara[3] - cara[1];
  const s = PIP.ancho * W / cw, pw = Math.round(cw * s), ph = Math.round(ch * s);
  const m = Math.round(PIP.margen * k), arriba = Math.round(PIP.arriba * k);
  const centro = [esquina === 'izquierda' ? m + pw / 2 : W - m - pw / 2, arriba + ph / 2].map(Math.round);
  const ancla = [(cara[0] + cara[2]) / 2, (cara[1] + cara[3]) / 2];
  const esc = +(s * 100).toFixed(2), d = Math.max(hasta - desde, 2 * trans + 0.2);
  return {
    juego: [[0, [W / 2, H / 2], 100], [trans, zoomPos, z.escala], [d - trans, zoomPos, z.escala], [d, [W / 2, H / 2], 100]],
    // la ventanita entra con rebote y sale encogiéndose
    ventana: { ancla, centro, tam: [pw, ph], kf: [[0, 0], [0.18, +(esc * 1.12).toFixed(2)], [0.3, esc], [d - 0.22, esc], [d, 0]] },
    mascara: { center: ancla, size: [cw, ch] },
    radio: Math.round(PIP.radio / s),                      // en px del vídeo original (la máscara va antes de la escala)
  };
}

// plan puro del podcast: cada mitad = una zona escalada a media pantalla, siguiendo la x de la cara
function planPodcast({ desde, hasta, zonas, W, H, an, seguimiento, trans = 0.25 }) {
  const mitad = (nombre, arriba) => {
    const z = zonas[nombre], zw = z[2] - z[0], zh = z[3] - z[1];
    const S = (H / 2) / zh, esc = +(S * 100).toFixed(2);
    const ancla = [(z[0] + z[2]) / 2, (z[1] + z[3]) / 2], cy = arriba ? H / 4 : 3 * H / 4;
    const medio = W / (2 * S), lim = x => Math.min(Math.max(x, z[0] + medio), z[2] - medio);
    const pista = an ? seguimiento(an, nombre, desde, hasta, { xDefecto: ancla[0] }) : [[desde, ancla[0]]];
    const posX = x => Math.round(W / 2 - (lim(x ?? ancla[0]) - ancla[0]) * S);
    const fuera = arriba ? -H / 2 : H / 2, d = hasta - desde;
    const kf = [[0, [posX(pista[0][1]), Math.round(cy + fuera)]], [trans, [posX(pista[0][1]), Math.round(cy)]]];
    for (const [tt, x] of pista) { const r = tt - desde; if (r > trans + 0.3 && r < d - trans - 0.3) kf.push([+r.toFixed(2), [posX(x), Math.round(cy)]]); }
    const ultimo = kf.at(-1)[1][0];
    kf.push([d - trans, [ultimo, Math.round(cy)]], [d, [ultimo, Math.round(cy + fuera)]]);
    return { ancla, esc, kf, mascara: { center: ancla, size: [zw, zh] } };
  };
  return { arriba: mitad('cara', true), abajo: mitad(zonas.cabina ? 'cabina' : 'cara', false) };
}

function crearPiezas({ carpeta, python = 'python' }) {
  fs.mkdirSync(carpeta, { recursive: true });
  const hacer = (nombre, args) => {
    const ruta = path.join(carpeta, nombre);
    if (!fs.existsSync(ruta)) execFileSync(python, ['-I', path.join(__dirname, 'disenos.py'), args[0], ruta, ...args.slice(1).map(String)], { windowsHide: true });
    return ruta;
  };
  return {
    marco: (w, h, r) => hacer(`marco-${w}x${h}-r${r}.png`, ['marco', w, h, r]),
    raya: (w, h) => hacer(`raya-${w}x${h}.png`, ['raya', w, h]),
  };
}

// monta los diseños en FilmCraft. fc = command_run; item = el vídeo importado; t(seg) = ticks a fotograma
async function montar({ fc, item, t, W, H, fps, disenos, zonas, an, piezas, seguimiento, k = W / 1080 }) {
  if (!disenos?.length || !zonas?.cara) return 0;
  await fc('sequence.addTracks', { video: 3, videoAfter: 'V1' });
  const TPS = 254016000000;
  const poner = async (track, d) => (await fc('timeline.place', { item, track, seconds: Math.round(d.desde * fps) / fps, sourceIn: t(d.desde),
    duration: t(d.hasta) - t(d.desde), video: true, audio: false }))?.clips?.[0];
  const kfMotion = async (clip, ini, lista, { ancla } = {}) => {
    if (ancla) await fc('effects.setParam', { clip, effect: 'motion', param: 'anchor', value: ancla.map(Math.round) });
    for (const [dt, pos, esc] of lista) {
      const time = t(ini) + Math.round(dt * TPS);
      if (pos) await fc('effects.setParam', { clip, effect: 'motion', param: 'position', value: pos, time, keyframe: true });
      if (esc != null) await fc('effects.setParam', { clip, effect: 'motion', param: 'scale', value: esc, time, keyframe: true });
    }
  };
  const imagen = async (ruta, d, track) => {           // png en la pista `track` (índice) recortado al tramo
    const r = await fc('graphics.newFromFile', { path: ruta, time: t(d.desde), track });
    const clip = r?.clip; if (clip == null) return null;
    const sobra = Math.round((d.desde + 5) * fps) - Math.round(d.desde * fps) - (Math.round(d.hasta * fps) - Math.round(d.desde * fps));
    if (sobra) await fc('timeline.trim', { clip, edge: 'out', mode: 'regular', deltaFrames: -sobra });   // entra con 5 s: al tramo
    return clip;
  };
  let n = 0;
  for (const d of disenos) {
    if (d.tipo === 'pantalla') {
      const p = planPantalla({ ...d, zonas, W, H, k });
      const juego = await poner('V2', d);
      if (juego != null) await kfMotion(juego, d.desde, p.juego);
      const v = await poner('V4', d);
      if (v != null) {
        await fc('masks.add', { clip: v, effect: 'opacity', shape: 'rectangle', center: p.mascara.center, size: p.mascara.size, cornerRadius: p.radio });
        await fc('effects.setParam', { clip: v, effect: 'motion', param: 'position', value: p.ventana.centro });
        await kfMotion(v, d.desde, p.ventana.kf.map(([dt, esc]) => [dt, null, esc]), { ancla: p.ventana.ancla });
      }
      const marco = await imagen(piezas.marco(...p.ventana.tam, PIP.radio), d, 2);
      if (marco != null) {
        await fc('effects.setParam', { clip: marco, effect: 'motion', param: 'position', value: p.ventana.centro });
        const e = p.ventana.kf.at(1)[1] / (p.ventana.kf.at(2)[1] || 1);
        await kfMotion(marco, d.desde, [[0, null, 0], [0.18, null, +(100 * e).toFixed(2)], [0.3, null, 100], [p.ventana.kf.at(-2)[0], null, 100], [p.ventana.kf.at(-1)[0], null, 0]]);
      }
      n++;
    } else if (d.tipo === 'podcast') {
      const p = planPodcast({ ...d, zonas, W, H, an, seguimiento });
      for (const [track, mitad] of [['V2', p.abajo], ['V4', p.arriba]]) {
        const c = await poner(track, d);
        if (c == null) continue;
        await fc('masks.add', { clip: c, effect: 'opacity', shape: 'rectangle', center: mitad.mascara.center, size: mitad.mascara.size });
        await fc('effects.setParam', { clip: c, effect: 'motion', param: 'scale', value: mitad.esc });
        await kfMotion(c, d.desde, mitad.kf, { ancla: mitad.ancla });
      }
      const raya = await imagen(piezas.raya(W, Math.max(6, Math.round(12 * k))), d, 2);
      if (raya != null) {
        await fc('effects.setParam', { clip: raya, effect: 'motion', param: 'position', value: [W / 2, H / 2] });
        await kfMotion(raya, d.desde, [[0, null, 0], [0.3, null, 100], [d.hasta - d.desde - 0.25, null, 100], [d.hasta - d.desde, null, 0]]);
      }
      n++;
    }
  }
  return n;
}

module.exports = { PIP, planPantalla, planPodcast, crearPiezas, montar };
