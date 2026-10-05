// El casco de APOLO en la terminal: ojos que parpadean, miran, escanean mientras trabaja, dudan con un permiso, sonríen al acabar y se duermen.
// Todo depende solo de (estado, tiempo): el mismo instante da siempre el mismo dibujo, así la TUI solo redibuja cuando cambia.
'use strict';
const { c } = require('./texto');

const rgb = (r, g, b) => t => `\x1b[38;2;${r};${g};${b}m${t}\x1b[39m`;
const verde = k => rgb(Math.round(40 + 40 * k), Math.round(150 + 100 * k), Math.round(100 + 60 * k));   // brillo 0..1
const ambar = rgb(240, 200, 80), rojo = rgb(255, 95, 95), rosa = rgb(255, 140, 190), azul = rgb(120, 200, 255);

// gesto "de vez en cuando": cada 7 s uno distinto (pseudoaleatorio pero fijo para ese tramo)
const GESTOS = ['izq', 'der', 'nada', 'guino', 'feliz', 'izqder', 'nada', 'arriba'];
function gestoEn(t) {
  const tramo = Math.floor(t / 7000), dentro = t % 7000;
  const g = GESTOS[(tramo * 2654435761 >>> 0) % GESTOS.length];
  return dentro > 4200 && dentro < 5600 ? { g, k: (dentro - 4200) / 1400 } : null;
}
const parpadeo = t => { const x = t % 4300; return x < 130 || (Math.floor(t / 4300) % 3 === 1 && x > 260 && x < 380); };

// ojos: 5 columnas dentro del visor
function ojos(estado, t, mirar = 0) {
  const brillo = 0.75 + 0.25 * Math.sin(t / 600);
  const v = verde(brillo);
  if (estado === 'dormido') return v(' ─ ─ ');
  if (estado === 'permiso') return Math.floor(t / 500) % 2 ? ambar(' ? ? ') : ambar(' ● ? ');
  if (estado === 'error') return rojo(' × × ');
  if (estado === 'feliz') return v(' ^ ^ ');
  if (estado === 'trabajando') {                    // escaneo de lado a lado
    const f = ['●●   ', ' ●●  ', '  ●● ', '   ●●', '  ●● ', ' ●●  '];
    return v(f[Math.floor(t / 110) % f.length]);
  }
  if (parpadeo(t)) return v(' ─ ─ ');
  if (estado === 'escribiendo') return v(mirar < -0.33 ? '● ●  ' : mirar > 0.33 ? '  ● ●' : ' ● ● ');
  const g = gestoEn(t);
  if (g) {
    if (g.g === 'izq') return v('● ●  ');
    if (g.g === 'der') return v('  ● ●');
    if (g.g === 'izqder') return v(g.k < 0.5 ? '● ●  ' : '  ● ●');
    if (g.g === 'guino') return v(g.k < 0.6 ? ' ● ─ ' : ' ● ● ');
    if (g.g === 'feliz') return v(' ^ ^ ');
    if (g.g === 'arriba') return v(' ˙ ˙ ');
  }
  return v(' ● ● ');
}

// casco grande (4 líneas de 14 columnas): antena con luz, visor y "cuello"
function casco(estado, t, mirar = 0) {
  const d = c.tenue;
  const pulso = (Math.sin(t / 350) + 1) / 2;
  const luz = estado === 'permiso' ? ambar('✦') : estado === 'error' ? rojo('✦') : estado === 'dormido' ? d('·') : verde(pulso)(pulso > 0.5 ? '✦' : '✧');
  const zz = estado === 'dormido' ? ['  ', azul(Math.floor(t / 700) % 2 ? 'z ' : ' z'), azul(Math.floor(t / 700) % 2 ? ' Z' : 'Z ')] : ['  ', '  ', '  '];
  const mej = estado === 'feliz' || gestoEn(t)?.g === 'feliz' ? rosa('·') : ' ';
  return [                                          // todas de 14 columnas
    `      ${luz}     ${zz[2]}`,
    d(' ╭────┴────╮') + zz[1],
    d(' │') + mej + d('▐') + ojos(estado, t, mirar) + d('▌') + mej + d('│') + '  ',
    d(' ╰─┬─────┬─╯') + zz[0],
  ];
}

// carita pequeña para la línea del spinner: ▐ + 3 columnas + ▌
function mini(estado, t) {
  const v = verde(0.75 + 0.25 * Math.sin(t / 600));
  let o;
  if (estado === 'permiso') o = ambar(Math.floor(t / 500) % 2 ? '? ?' : '●?●');
  else if (estado === 'error') o = rojo('×_×');
  else if (estado === 'dormido') o = v('─ ─');
  else if (estado === 'feliz') o = v('^‿^');
  else if (estado === 'trabajando') o = v(['●● ', '● ●', ' ●●', '● ●'][Math.floor(t / 160) % 4]);
  else o = v(parpadeo(t) ? '─ ─' : '● ●');
  return c.tenue('▐') + o + c.tenue('▌');
}

module.exports = { casco, mini, ojos, gestoEn };
