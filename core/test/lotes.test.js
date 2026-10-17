// Editor automático por lotes (core/craft/lotes.js): fuente ssh falsa + subtitulador falso → cola, estilo elegido, revisión,
// aviso al acabar el stream, aprobar/rehacer/descartar y limpieza de disco.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearLotes } = require('../craft/lotes');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lotes-'));
  const salida = path.join(dir, 'videos');
  const bus = new EventEmitter(), avisos = [];
  bus.on('aviso-externo', a => avisos.push(a));
  const manif = {
    '2026-10-14_AAA': { video: 'AAA', titulo: 'Camioneros (Portrait)', fecha: '2026-10-14', duracion: 14000,
      clips: [{ rank: 1, archivo: '01.mp4', inicio: 100, fin: 280, chat: ['jajaja', { texto: 'la llorona' }] }, { rank: 2, archivo: '02.mp4', inicio: 500, fin: 520, chat: [] }, { rank: 3, archivo: '03.mp4', inicio: 900, fin: 1050, chat: [] }] },
    '2026-10-14_CORTO': { video: 'CORTO', fecha: '2026-10-14', duracion: 5, clips: [{ rank: 1, archivo: '01.mp4', inicio: 0, fin: 5 }] },
  };
  const llamadas = [];
  const ejecutar = (cmd, args, o, cb) => {
    llamadas.push([cmd, ...args].join(' '));
    if (cmd === 'ssh') {
      const c = args.at(-1);
      if (c.startsWith('ls')) return cb(null, Object.keys(manif).join('\n') + '\nbasura\n', '');
      const m = c.match(/'([^']+)'\/manifiesto/); return cb(null, JSON.stringify(manif[m[1]]), '');
    }
    if (args.includes('yt_dlp')) { const o = args[args.indexOf('-o') + 1]; fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, 'video'); return cb(null, '', ''); }
    if (cmd === 'scp') { fs.mkdirSync(path.dirname(args.at(-1)), { recursive: true }); fs.writeFileSync(args.at(-1), 'video'); return cb(null, '', ''); }
    cb(new Error('?'));
  };
  const subtitulos = [];
  const subtitulador = { reexportados: [], async reexportar(o) { this.reexportados.push(o); return o; }, async subtitular(a) {
    subtitulos.push(a);
    if (a.soloTranscribir) return JSON.stringify({ subtitulos: [{ s: 0, e: 1, texto: 'AHÍ ESTÁ LA LLORONA' }] });
    fs.mkdirSync(a.carpeta, { recursive: true });
    const b = path.join(a.carpeta, a.nombre);
    for (const ext of ['.mp4', '.srt', '.png', '.fcproj']) fs.writeFileSync(b + ext, 'x');
    return { texto: 'ok', imagenes: [], datos: { mp4: b + '.mp4', srt: b + '.srt', previa: b + '.png', proyecto: b + '.fcproj', gancho: 'LA LLORONA', dudas: [{ texto: 'MIGUEL', s: 3 }], escenas: [{ tipo: 'corte', desde: 4, hasta: 6 }], emojis: 2,
      plan: a.plan || { origen: 'modelo', n: subtitulos.length, disenos: [{ tipo: 'pantalla', desde: 10, hasta: 20 }], escenas: [], sonidos: [{ t: 10, sonido: 'whoosh' }], emojis: [] }, sonidos: 1 } };
  } };
  const generarJSON = async ({ prompt }) => (/Lo que pide: "quita la ventanita/.test(prompt)
    ? { datos: { temblor: { modo: 'igual' }, disenos: { modo: 'quitar' }, sonidos: 'no', respuesta: 'Sin ventanita ni sonidos.' } }
    : /Lo que pide: "dame otras ideas/.test(prompt)
    ? { datos: { temblor: { modo: 'igual' }, nuevoPlan: true, respuesta: 'Otra edición.' } }
    : /Lo que pide: "que termine en 1:37/.test(prompt)
    ? { datos: { temblor: { modo: 'tramos', tramos: [{ desde: 12, hasta: 20 }] }, recorte: { hasta: 97 }, respuesta: 'Termina en 1:37.' } }
    : /Lo que pide/.test(prompt)
    ? { datos: { estilo: 'igual', temblor: { modo: 'tramos', tramos: [{ desde: 40, hasta: 55 }], intensidad: 30 }, efectos: 'igual', escenas: 'igual', emojis: 'no', look: 'igual', gancho: '-', respuesta: 'Vibración solo de 0:40 a 0:55 al 30 %, sin emojis ni título.' } }
    : { datos: { estilo: /llorona/i.test(prompt) ? 'terror' : 'pop' } });
  fs.mkdirSync(path.join(dir, 'craft'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'craft', 'lotes.json'), JSON.stringify({ salida, fuentes: [{ id: 'lagc', nombre: 'LAGCTRUCKS', tipo: 'ssh', host: 'pi', ruta: '~/s', perfil: 'lagctrucks', minClipSeg: 30, minStreamSeg: 600 }] }));
  const l = crearLotes({ cfg: { dir }, bus, subtitulador, generarJSON, ejecutar });
  return { l, dir, salida, avisos, llamadas, subtitulos, subtitulador, manif };
}
const esperar = async (l, fin = 5000) => { const t = Date.now(); while (Date.now() - t < fin) { const e = l.estado(); if (!e.enCurso && !e.cola.length) return e; await new Promise(r => setTimeout(r, 10)); } throw new Error('la cola no terminó'); };

test('lotes: trae lo nuevo, ignora streams cortos y clips cortos, elige estilo por el tono y avisa una vez', async () => {
  const { l, avisos, subtitulos } = montar();
  assert.strictEqual((await l.revisar()).nuevos, 2, 'clip 2 (20 s) y el stream de 5 s fuera');
  const e = await esperar(l);
  assert.deepStrictEqual(e.clips.map(c => [c.rank, c.estado, c.estilo]), [[1, 'revisar', 'terror'], [3, 'revisar', 'terror']]);
  assert.strictEqual(e.clips[0].gancho, 'LA LLORONA');
  assert.deepStrictEqual(e.clips[0].chat, ['jajaja', 'la llorona']);
  const edicion = subtitulos.find(a => !a.soloTranscribir);
  assert.strictEqual(edicion.perfil, 'lagctrucks'); assert.strictEqual(edicion.escenas, 'auto');
  assert.strictEqual(avisos.length, 1); assert.match(avisos[0].texto, /2 clips de LAGCTRUCKS/);
  assert.strictEqual((await l.revisar()).nuevos, 0, 'lo visto no se repite');
});

test('lotes: aprobar mueve a aprobados, exporta el 4K y luego borra el original; rehacer con otro estilo; descartar borra', async () => {
  const { l, salida, subtitulador } = montar();
  await l.revisar(); let e = await esperar(l);
  const [a, b] = e.clips;
  const original = path.join(salida, 'LAGCTRUCKS', '2026-10-14_AAA', 'originales', '01.mp4');
  const ap = l.decidir(a.id, 'aprobar');
  assert.strictEqual(ap.estado, 'aprobado');
  assert.ok(ap.mp4.includes(path.join('LAGCTRUCKS', 'aprobados', '2026-10-14')) && fs.existsSync(ap.mp4));
  e = await esperar(l);
  const k4 = subtitulador.reexportados.at(-1);
  assert.deepStrictEqual([k4.ancho, k4.alto, k4.srt], [2160, 3840, false]);
  assert.ok(k4.mp4.endsWith(' 4K.mp4') && k4.mp4.includes('aprobados'));
  const ya = e.clips.find(c => c.id === a.id);
  assert.strictEqual(ya.k4.estado, 'listo');
  assert.ok(!fs.existsSync(original), 'original borrado cuando acaba el 4K');
  l.decidir(b.id, 'rehacer', { estilo: 'oro' }); e = await esperar(l);
  const rb = e.clips.find(c => c.id === b.id);
  assert.strictEqual(rb.estilo, 'oro'); assert.strictEqual(rb.estado, 'revisar'); assert.ok(rb.mp4.includes('oro'));
  assert.throws(() => l.decidir(b.id, 'rehacer', { estilo: 'nada' }), /estilo desconocido/);
  const mp4 = rb.mp4; l.decidir(b.id, 'descartar');
  assert.ok(!fs.existsSync(mp4));
  assert.strictEqual(l.estado().clips.find(c => c.id === b.id).estado, 'descartado');
});

test('lotes: API /v1/revision (estado, vídeo y vista previa como archivo, config)', async () => {
  const { l } = montar();
  await l.revisar(); const e = await esperar(l);
  const id = e.clips[0].id;
  assert.ok((await l.http('GET', ['v1', 'revision'])).estilos.length >= 9);
  assert.ok((await l.http('GET', ['v1', 'revision', id, 'video'])).__archivo.endsWith('.mp4'));
  assert.ok((await l.http('GET', ['v1', 'revision', id, 'previa'])).__archivo.endsWith('.png'));
  await assert.rejects(l.http('GET', ['v1', 'revision', 'nope', 'video']), /no existe/);
  assert.strictEqual((await l.http('PATCH', ['v1', 'revision', 'config'], { retencionDias: 3 })).config.retencionDias, 3);
});

test('lotes: cambios pedidos (en palabras o concretos) se acumulan y rehacen con el mismo estilo; reexportar lo retocado', async () => {
  const { l, subtitulos, subtitulador } = montar();
  await l.revisar(); let e = await esperar(l);
  const c = e.clips[0];
  // en palabras → el modelo lo traduce
  const r = await l.modificar(c.id, { pedido: 'que solo vibre de 0:40 a 0:55 y más suave, quita los emojis y el título' });
  assert.match(r.respuesta, /0:40/);
  assert.deepStrictEqual(r.ajustes, { temblor: { tramos: [[40, 55]], intensidad: 30 }, emojis: false, gancho: false });
  e = await esperar(l);
  let ult = subtitulos.at(-1);
  assert.strictEqual(ult.estilo, c.estilo, 'mismo estilo');
  assert.deepStrictEqual(ult.temblor, { tramos: [[40, 55]], intensidad: 30 }); assert.strictEqual(ult.emojis, false); assert.strictEqual(ult.gancho, false);
  // concreto (controles): "más fuerte" conserva los tramos
  await l.modificar(c.id, { ajustes: { temblor: { intensidad: 80 } } }); await esperar(l);
  assert.deepStrictEqual(subtitulos.at(-1).temblor, { tramos: [[40, 55]], intensidad: 80 });
  assert.strictEqual(subtitulos.at(-1).emojis, false, 'lo anterior sigue');
  await assert.rejects(l.modificar(c.id, {}), /no entendí/);
  // retocado a mano en FilmCraft → solo se exporta su proyecto
  const antes = subtitulos.length;
  l.reexportar(c.id); e = await esperar(l);
  assert.strictEqual(subtitulos.length, antes, 'no se vuelve a montar');
  assert.strictEqual(subtitulador.reexportados.at(-1).proyecto, e.clips.find(x => x.id === c.id).proyecto);
  assert.ok(e.clips.find(x => x.id === c.id).retocado);
});

test('lotes: con varios streams nuevos solo entra el último válido (los cortos no cuentan)', async () => {
  const { l, manif } = montar();
  manif['2026-10-15_BBB'] = { video: 'BBB', fecha: '2026-10-15', duracion: 9000, clips: [{ rank: 1, archivo: '01.mp4', inicio: 0, fin: 60 }] };
  manif['2026-10-16_PRUEBA'] = { video: 'PRUEBA', fecha: '2026-10-16', duracion: 30, clips: [{ rank: 1, archivo: '01.mp4', inicio: 0, fin: 30 }] };
  assert.strictEqual((await l.revisar()).nuevos, 1);
  const e = await esperar(l);
  assert.deepStrictEqual(e.clips.map(c => c.stream), ['BBB']);
  assert.strictEqual((await l.revisar()).nuevos, 0, 'el viejo (AAA) queda visto');
});

test('lotes: recorte y tiempos pedidos sobre el vídeo que se ve (con avance delante) se pasan al original', async () => {
  const { l, subtitulos } = montar();
  await l.revisar(); await esperar(l);
  const c = l.estado().clips[0];                       // clip de 180 s
  await l.modificar(c.id, { ajustes: { avance: [45, 47] } }); await esperar(l);
  // "termina en 1:37" del vídeo con 2 s de avance = 95 s del original; la vibración de 0:12–0:20 = 10–18 s del original
  const r = await l.modificar(c.id, { pedido: 'que termine en 1:37 y que vibre de 0:12 a 0:20' }); await esperar(l);
  assert.deepStrictEqual(r.ajustes.recorte, [0, 95]);
  assert.deepStrictEqual(r.ajustes.temblor.tramos, [[10, 18]]);
  const ult = subtitulos.at(-1);
  assert.deepStrictEqual(ult.avance, [45, 47]); assert.deepStrictEqual(ult.recorte, [0, 95]);
  await l.modificar(c.id, { ajustes: { recorte: null } }); await esperar(l);
  assert.strictEqual(subtitulos.at(-1).recorte, undefined, 'clip entero otra vez');
  assert.deepStrictEqual(subtitulos.at(-1).avance, [45, 47], 'el avance se queda');
});

test('lotes: el plan del director se guarda y se reutiliza al pedir cambios; "otras ideas" o cambiar el montaje lo rehacen', async () => {
  const { l, subtitulos } = montar();
  await l.revisar(); await esperar(l);
  let c = l.estado().clips[0];
  const ultima = () => subtitulos.filter(x => !x.soloTranscribir && x.video.endsWith(c.archivo)).at(-1);
  assert.deepStrictEqual(c.disenos, [{ tipo: 'pantalla', desde: 10, hasta: 20 }]);
  assert.strictEqual(c.sonidos, 1);
  const primero = c.plan;
  const r = await l.modificar(c.id, { pedido: 'quita la ventanita y los sonidos' }); await esperar(l);
  assert.strictEqual(r.ajustes.disenos, false); assert.strictEqual(r.ajustes.sonidos, false);
  assert.deepStrictEqual(ultima().plan, primero);          // el mismo plan: no cambia toda la edición
  assert.strictEqual(ultima().disenos, false); assert.strictEqual(ultima().sonidos, false);
  await l.modificar(c.id, { pedido: 'dame otras ideas' }); await esperar(l);
  assert.strictEqual(ultima().plan, undefined);            // el director vuelve a decidir
  await l.modificar(c.id, { ajustes: { emojis: false } }); await esperar(l);
  assert.ok(ultima().plan);
  await l.modificar(c.id, { ajustes: { recorte: [0, 100] } }); await esperar(l);
  assert.strictEqual(ultima().plan, undefined);            // cambió el montaje: los tiempos del plan ya no valen
});

test('lotes: clip pedido a mano (un tramo del stream): se descarga solo ese tramo, entra en la cola con sus ajustes y sale en Revisión', async () => {
  const { l, subtitulos, llamadas } = montar();
  await l.revisar(); await esperar(l);
  await assert.rejects(l.nuevo({ stream: 'NOEXISTE', desde: 0, hasta: 60 }), /no conozco/);
  await assert.rejects(l.nuevo({ stream: 'AAA', desde: 100, hasta: 105 }), /entre 10 s/);
  const c = await l.nuevo({ stream: 'AAA', desde: 5400, hasta: 5700, ajustes: { disenos: [{ tipo: 'enfoque', desde: 0, hasta: 300 }], efectos: 'no' } });
  assert.strictEqual(c.rank, 4); assert.strictEqual(c.archivo, '04_05400_300s.mp4'); assert.strictEqual(c.manual, true);
  await new Promise(r => setTimeout(r, 30)); await esperar(l);
  const yt = llamadas.find(x => x.includes('yt_dlp'));
  assert.ok(yt.includes('*1:30:00-1:35:00') && yt.includes('watch?v=AAA'), yt);
  const a = subtitulos.filter(x => !x.soloTranscribir && x.video.endsWith('04_05400_300s.mp4')).at(-1);
  assert.deepStrictEqual(a.disenos, [{ tipo: 'enfoque', desde: 0, hasta: 300 }]); assert.strictEqual(a.efectos, 'no');
  assert.strictEqual(l.estado().clips.find(x => x.id === c.id).estado, 'revisar');
});
