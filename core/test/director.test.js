// Director de edición (core/craft/director.js) y diseños (core/craft/disenos.js): partes puras, sin FilmCraft ni modelo.
const test = require('node:test');
const assert = require('node:assert');
const director = require('../craft/director');
const disenos = require('../craft/disenos');

const ZONAS = { cara: [0, 97, 1080, 705], cabina: [0, 705, 1080, 1313], pedales: [0, 1313, 1080, 1920] };
const palabras = 'hola chat miren eso que viene ahí jajaja no manches hermano'.split(' ').map((w, i) => ({ w, s: 5 + i * 0.5, e: 5.4 + i * 0.5 }));

test('director: validar recorta tiempos, quita solapes y sobrantes, añade sonidos a diseños y escenas', () => {
  const p = director.validar({
    disenos: [{ tipo: 'pantalla', desde: 1, hasta: 12 }, { tipo: 'podcast', desde: 13, hasta: 30 }, { tipo: 'nada', desde: 40, hasta: 50 }, { tipo: 'podcast', desde: 40, hasta: 52, esquina: 'izquierda' }],
    escenas: [{ tipo: 'acercar', desde: 10, hasta: 12 }, { tipo: 'corte', desde: 60, hasta: 62, zona: 'cabina' }, { tipo: 'giro', desde: 63, hasta: 64 }, { tipo: 'xx', desde: 70, hasta: 72 }],
    sonidos: [{ t: 60, sonido: 'impacto' }, { t: 60.5, sonido: 'ding' }, { t: 5, sonido: 'inventado' }],
    emojis: [{ t: 20, emoji: '🔥' }, { t: 21, emoji: '😂' }, { t: 30, emoji: '🔥' }, { t: 40, emoji: 'hola' }, { t: 50, emoji: '👨‍👩‍👧' }, { t: 55, emoji: '🚚' }],
  }, { dur: 90 });
  assert.deepStrictEqual(p.disenos.map(d => [d.tipo, d.desde, d.hasta]), [['pantalla', 3.6, 12], ['podcast', 40, 52]]);   // el 2.º pisa los 4 s de hueco
  assert.strictEqual(p.disenos[1].esquina, 'izquierda');
  assert.deepStrictEqual(p.escenas.map(e => [e.tipo, e.desde, e.zona]), [['corte', 60, 'cabina']]);   // 10–12 cae en un diseño; giro a <4 s
  assert.deepStrictEqual(p.emojis.map(e => e.emoji), ['🔥', '🚚']);   // 1 cada 2,5 s, sin repetir en 15 s, solo de un carácter
  const sons = p.sonidos.map(s => `${s.sonido}@${s.t}`);
  assert.ok(sons.includes('impacto@60') && !sons.some(s => s.startsWith('ding')) && !sons.some(s => s.startsWith('inventado')));
  assert.ok(sons.includes('whoosh@3.45') && sons.includes('swoosh@39.85'), sons.join(' '));   // entrada de cada diseño con su sonido
});

test('director: señales, seguimiento suavizado y plan por reglas ("miren" → pantalla)', () => {
  const an = { duracion: 20, pasoMov: 0.2, pasoAudio: 0.2, audio: Array(100).fill(-30).map((v, i) => (i === 16 ? -5 : v)),
    movimiento: { cara: Array(100).fill(10), cabina: Array(100).fill(40), pedales: Array(100).fill(2) },
    caras: { cara: Array.from({ length: 40 }, (_, i) => [i * 0.5, [[300 + (i > 20 ? 400 : 0) + (i % 2) * 10, 400, 120, 0.9]]]), cabina: [], pedales: [] } };
  const f = director.senales(an, palabras);
  assert.strictEqual(f.length, 10);
  assert.strictEqual(f[1].db, -5); assert.strictEqual(f[0].mov.cabina, 40); assert.ok(f[3].voz > 50);
  const seg = director.seguimiento(an, 'cara', 2, 18);
  assert.ok(seg[0][1] < 400); assert.ok(seg.at(-1)[1] > 600);   // sigue a la cara cuando se mueve…
  assert.ok(seg.length <= 5);                                     // …sin temblar por 10 px
  const plan = director.porReglas(an, palabras, { dur: 20 });
  assert.strictEqual(plan.disenos[0].tipo, 'pantalla');
  assert.ok(director.informe(an, palabras).includes('miren'));
});

test('diseños: ventanita (zoom a cabina+pedales, cara arriba a la derecha) y podcast (dos mitades siguiendo caras)', () => {
  const p = disenos.planPantalla({ desde: 10, hasta: 18, zonas: ZONAS, W: 1080, H: 1920 });
  assert.strictEqual(p.juego[1][2], 158.02);                         // 1215 px de alto llenan los 1920
  assert.deepStrictEqual(p.juego.at(-1), [8, [540, 960], 100]);      // vuelve al vídeo normal al final del tramo
  assert.deepStrictEqual(p.ventana.tam, [475, 268]);
  assert.ok(p.ventana.centro[0] > 540 && p.ventana.centro[1] < 400);
  assert.strictEqual(p.ventana.kf[0][1], 0); assert.strictEqual(p.ventana.kf.at(-1)[1], 0);
  const iz = disenos.planPantalla({ desde: 10, hasta: 18, esquina: 'izquierda', zonas: ZONAS, W: 1080, H: 1920 });
  assert.ok(iz.ventana.centro[0] < 540);
  const an = { caras: { cara: [[40, [[200, 400, 100, 0.9]]], [41, [[200, 400, 100, 0.9]]]], cabina: [[42, [[900, 1000, 100, 0.9]]]] } };
  const q = disenos.planPodcast({ desde: 40, hasta: 52, zonas: ZONAS, W: 1080, H: 1920, an, seguimiento: director.seguimiento });
  assert.strictEqual(q.arriba.esc, 157.89);
  assert.strictEqual(q.arriba.kf[1][1][1], 480); assert.strictEqual(q.abajo.kf[1][1][1], 1440);
  assert.ok(q.arriba.kf[1][1][0] > 540);                             // cara a la izquierda → el vídeo se corre a la derecha…
  assert.ok(q.arriba.kf[1][1][0] <= 540 + 313);                      // …sin enseñar el borde
  assert.strictEqual(q.arriba.kf[0][1][1], -480);                    // entra desde arriba
});
