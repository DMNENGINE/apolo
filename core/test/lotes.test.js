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
    return { texto: 'ok', imagenes: [], datos: { mp4: b + '.mp4', srt: b + '.srt', previa: b + '.png', proyecto: b + '.fcproj', gancho: 'LA LLORONA', dudas: [{ texto: 'MIGUEL', s: 3 }], escenas: [{ tipo: 'corte', desde: 4, hasta: 6 }], emojis: 2 } };
  } };
  const generarJSON = async ({ prompt }) => (/Lo que pide/.test(prompt)
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

test('lotes: aprobar mueve a aprobados y borra el original; rehacer con otro estilo; descartar borra', async () => {
  const { l, salida } = montar();
  await l.revisar(); let e = await esperar(l);
  const [a, b] = e.clips;
  const ap = l.decidir(a.id, 'aprobar');
  assert.strictEqual(ap.estado, 'aprobado');
  assert.ok(ap.mp4.includes(path.join('LAGCTRUCKS', 'aprobados', '2026-10-14')) && fs.existsSync(ap.mp4));
  assert.ok(!fs.existsSync(path.join(salida, 'LAGCTRUCKS', '2026-10-14_AAA', 'originales', '01.mp4')), 'original borrado');
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
