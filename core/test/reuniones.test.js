// Reuniones: dedupe de subtítulos parciales, cola de audio (orden y serie) con transcriptor falso, resumen con generarJSON falso,
// creación de tareas y API. Sin red, sin audio real, sin whisper.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const R = require('../reuniones');

function nucleo(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-reun-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m', proveedores: { falso: { tipo: 'openai', baseUrl: 'http://127.0.0.1:9/v1', local: true } }, memoria: { embeddings: null }, permisos: { modo: 'preguntar' } }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, sinPlugins: true, ...extra });
  t.after(() => { try { n.tareas.detener?.(); } catch { } try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  return n;
}
const RESUMEN = { resumen: 'Se acordó lanzar la beta el lunes.', decisiones: ['Lanzar la beta el lunes'], tareas: [{ quien: 'Ana', que: 'Preparar el anuncio', cuando: '2099-01-05' }, { quien: 'yo', que: 'Revisar el instalador' }], preguntasAbiertas: ['¿Precio?'], temas: ['beta', 'lanzamiento'] };
const generarFalso = llamadas => async o => { llamadas.push(o); return { datos: JSON.parse(JSON.stringify(RESUMEN)), uso: {} }; };

// grabadora falsa: protocolo de grabar.ps1 por líneas; el test decide cuándo emitir trozos
function grabadoraFalsa() {
  const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stdout.setEncoding = () => { };
  p.ordenes = [];
  p.emitir = o => p.stdout.emit('data', JSON.stringify(o) + '\n');
  p.stdin = { write: l => { const o = JSON.parse(l); p.ordenes.push(o);
    if (o.op === 'empezar') setImmediate(() => { p.emitir({ evento: 'grabando', fuente: 'mic', hz: 48000, canales: 1 }); p.emitir({ evento: 'grabando', fuente: 'sistema', hz: 48000, canales: 2 }); });
    if (o.op === 'parar') setImmediate(() => p.emitir({ evento: 'parado' })); }, end: () => { } };
  p.kill = () => { };
  setImmediate(() => p.emitir({ evento: 'listo' }));
  return p;
}

test('subtítulos: las actualizaciones parciales se funden en un segmento por bloque', () => {
  const segs = [];
  for (const [t, x] of [[0, 'Hola'], [300, 'Hola a'], [600, 'Hola a todo'], [900, 'Hola a todos, qué tal.']]) R.fusionar(segs, { bloque: 'b1', hablante: 'Ana', texto: x, t });
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].texto, 'Hola a todos, qué tal.');
  assert.strictEqual(segs[0].tFin, 900);
  R.fusionar(segs, { bloque: 'b2', hablante: 'Luis', texto: 'Bien', t: 1000 });
  R.fusionar(segs, { bloque: 'b1', hablante: 'Ana', texto: 'Hola a todos, qué tal.', t: 1100 });   // repetido: nada nuevo
  R.fusionar(segs, { bloque: 'b2', hablante: 'Luis', texto: 'Bien, gracias', t: 1200 });
  assert.deepStrictEqual(segs.map(s => [s.hablante, s.texto]), [['Ana', 'Hola a todos, qué tal.'], ['Luis', 'Bien, gracias']]);
  // bloque largo al que la página le recorta el principio
  const largo = [];
  R.fusionar(largo, { bloque: 'x', hablante: 'Eva', texto: 'uno dos tres cuatro cinco seis siete ocho', t: 0 });
  R.fusionar(largo, { bloque: 'x', hablante: 'Eva', texto: 'cinco seis siete ocho nueve diez', t: 50 });
  assert.strictEqual(largo[0].texto, 'uno dos tres cuatro cinco seis siete ocho nueve diez');
  // corrección del final (mismo arranque)
  assert.strictEqual(R.combinar('voy mañana', 'voy a mañana'), 'voy a mañana');
  // sin id de bloque (Zoom/Teams): mismo hablante y continuación → mismo segmento; otro hablante → nuevo
  const sin = [];
  R.fusionar(sin, { hablante: 'Ana', texto: 'Buenos', t: 0 });
  R.fusionar(sin, { hablante: 'Ana', texto: 'Buenos días', t: 400 });
  R.fusionar(sin, { hablante: 'Luis', texto: 'Hola', t: 800 });
  assert.deepStrictEqual(sin.map(s => s.texto), ['Buenos días', 'Hola']);
  assert.strictEqual(R.fusionar(sin, { hablante: 'Luis', texto: '   ', t: 900 }), null);
});

test('audio: los trozos se transcriben de uno en uno, por orden de tiempo, yo/ellos y sin silencios', async t => {
  let enVuelo = 0, maxVuelo = 0; const orden = [];
  const transcribir = async ruta => {
    enVuelo++; maxVuelo = Math.max(maxVuelo, enVuelo);
    await new Promise(r => setTimeout(r, 5 + Math.random() * 20));
    enVuelo--; const b = path.basename(ruta); orden.push(b);
    if (b.includes('alucina')) return 'Gracias por ver.';
    return `texto de ${b.replace('.wav', '')}`;
  };
  let g;
  const n = nucleo(t, { lanzarGrabadora: () => (g = grabadoraFalsa()), transcribirReunion: transcribir });
  n.reuniones.configurar({ trozoSeg: 30 });
  const llamadas = []; n.generarJSON = generarFalso(llamadas);
  const r = await n.reuniones.empezar({ fuente: 'audio', titulo: 'Llamada de Discord' });
  assert.strictEqual(r.estado, 'grabando');
  assert.strictEqual(g.ordenes[0].op, 'empezar'); assert.strictEqual(g.ordenes[0].trozoSeg, 30);
  assert.ok(g.ordenes[0].dir.includes(r.id));
  const trozo = (fuente, n_, rms = 0.05) => g.emitir({ evento: 'trozo', fuente, ruta: path.join(os.tmpdir(), `t-${fuente}-${n_}.wav`), n: n_, inicioMs: (n_ - 1) * 30_000, durMs: 30_000, rms, pico: rms * 4 });
  // llegan desordenados (el loopback va por delante) y uno es silencio
  trozo('sistema', 1); trozo('sistema', 2); trozo('mic', 1); trozo('mic', 2, 0.0001); trozo('mic', 3);
  g.emitir({ evento: 'trozo', fuente: 'sistema', ruta: path.join(os.tmpdir(), 't-sistema-alucina.wav'), n: 3, inicioMs: 60_000, durMs: 30_000, rms: 0.05, pico: 0.2 });
  const fin = await n.reuniones.parar({ motivo: 'test' });
  assert.strictEqual(maxVuelo, 1, 'whisper de uno en uno');
  assert.ok(!orden.includes('t-mic-2.wav'), 'el trozo en silencio no va a whisper');
  assert.strictEqual(fin.segmentos.length, 4, 'la alucinación de whisper se descarta');
  const ts = fin.segmentos.map(s => s.t); assert.deepStrictEqual(ts, [...ts].sort((a, b) => a - b));
  assert.deepStrictEqual(fin.segmentos.map(s => s.hablante), ['yo', 'ellos', 'ellos', 'yo']);   // a la par, "yo" antes que "ellos"
  assert.ok(g.ordenes.some(o => o.op === 'parar'));
  assert.strictEqual(fin.estado, 'lista');
  assert.strictEqual(fin.resumen.tareas.length, 2);
  assert.match(llamadas[0].prompt, /\[00:30\] ellos: texto de t-sistema-2/);
  // el resumen entra en la memoria con origen 'reunión' y en la línea de tiempo
  assert.ok(n.memoria.lista().some(m => m.origen === 'reunión' && /beta el lunes/.test(m.texto)));
  const ev = n.linea.consultar({ tipos: ['reunion'] }).eventos;
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].ruta, `#/reuniones/${fin.id}`);
});

test('navegador: empezar por la extensión, subtítulos por POST, parar → resumen; tareas y exportar', async t => {
  const n = nucleo(t);
  const llamadas = []; n.generarJSON = generarFalso(llamadas);
  const ordenes = [];
  n.navegador.conectado = () => true;
  n.navegador.orden = async (op, args) => { ordenes.push([op, args.accion]); return args.accion === 'empezar' ? { pestana: 7, url: 'https://meet.google.com/abc-defg-hij', titulo: 'Sprint semanal - Google Meet', subtitulos: false } : { ok: true }; };
  const avisos = []; n.bus.on('reunion', e => avisos.push(e.accion));
  const r = await n.reuniones.http('POST', ['v1', 'reuniones'], { fuente: 'navegador' });
  assert.strictEqual(r.titulo, 'Sprint semanal'); assert.strictEqual(r.plataforma, 'meet');
  assert.match(r.avisos[0], /subtítulos.*apagados/i);
  await assert.rejects(n.reuniones.empezar({ fuente: 'audio' }), /ya hay una reunión/);
  const t0 = r.inicio;
  await n.reuniones.desdeExtension({ id: r.id, eventos: [{ bloque: 'b1', hablante: 'Ana', texto: 'Lanzamos la', t: t0 + 1000 }, { bloque: 'b1', hablante: 'Ana', texto: 'Lanzamos la beta el lunes', t: t0 + 1500 }] });
  await n.reuniones.desdeExtension({ id: r.id, eventos: [{ bloque: 'b2', hablante: 'Tú', texto: 'Yo reviso el instalador', t: t0 + 4000 }] });
  await n.reuniones.desdeExtension({ id: 'otra', eventos: [{ bloque: 'z', hablante: 'X', texto: 'no es de esta', t: t0 }] });
  assert.strictEqual(n.reuniones.estado().segmentos, 2);
  const fin = await n.reuniones.http('POST', ['v1', 'reuniones', 'parar'], {});
  assert.deepStrictEqual(ordenes, [['reunion', 'empezar'], ['reunion', 'parar']]);
  assert.ok(avisos.includes('empezada') && avisos.includes('resumida'));
  assert.strictEqual(fin.segmentos[0].texto, 'Lanzamos la beta el lunes');
  // tareas: la de fecha va a esa fecha; la que no tiene, mañana a las 9:00
  const { creadas } = await n.reuniones.http('POST', ['v1', 'reuniones', fin.id, 'tareas'], {});
  assert.strictEqual(creadas.length, 2);
  const ts = n.tareas.lista();
  assert.ok(ts.some(x => x.nombre === 'Ana: Preparar el anuncio' && new Date(x.cuando.en).getFullYear() === 2099 && x.accion.tipo === 'aviso'));
  const sinFecha = ts.find(x => x.nombre === 'Revisar el instalador'); assert.ok(sinFecha);
  assert.strictEqual(new Date(sinFecha.cuando.en).getHours(), 9);
  assert.strictEqual((await n.reuniones.http('POST', ['v1', 'reuniones', fin.id, 'tareas'], {})).creadas.length, 0, 'no duplica');
  const ex = await n.reuniones.http('GET', ['v1', 'reuniones', fin.id, 'exportar']);
  assert.match(ex.md, /## Decisiones\n- Lanzar la beta el lunes/); assert.match(ex.md, /\*\*\[00:01\] Ana:\*\* Lanzamos la beta el lunes/);
  // enviar al móvil: solo si main.js escucha
  await assert.rejects(async () => n.reuniones.http('POST', ['v1', 'reuniones', fin.id, 'enviar']), /canal móvil/);
  let enviado = null; n.bus.on('reunion-enviar', e => { enviado = e; });
  await n.reuniones.http('POST', ['v1', 'reuniones', fin.id, 'enviar']);
  assert.match(enviado.texto, /Sprint semanal[\s\S]*Preparar el anuncio/);
  // búsqueda en transcripciones
  assert.strictEqual(n.reuniones.lista({ q: 'instalador' }).length, 1);
  assert.strictEqual(n.reuniones.lista({ q: 'zzz' }).length, 0);
});

test('regla "siempre en Meet" y herramientas del agente', async t => {
  const n = nucleo(t);
  n.generarJSON = generarFalso([]);
  n.navegador.conectado = () => true;
  n.navegador.orden = async (op, a) => (a.accion === 'empezar' ? { pestana: a.pestana, url: 'https://meet.google.com/abc-defg-hij', subtitulos: true } : {});
  assert.strictEqual((await n.reuniones.desdeExtension({ evento: 'detectada', url: 'https://meet.google.com/abc-defg-hij', pestana: 3 })).empezada, false, 'sin regla no empieza sola');
  n.reuniones.configurar({ siempreMeet: true });
  assert.strictEqual((await n.reuniones.desdeExtension({ evento: 'detectada', url: 'https://zoom.us/wc/123', pestana: 3 })).empezada, false);
  const x = await n.reuniones.desdeExtension({ evento: 'detectada', url: 'https://meet.google.com/abc-defg-hij', pestana: 3 });
  assert.ok(x.empezada);
  const H = Object.fromEntries(R.HERRAMIENTAS.map(h => [h.nombre, h]));
  const ctx = { cfg: n.cfg };
  assert.match(await H.reuniones_ver.ejecutar({}, ctx), /EN CURSO/);
  await n.reuniones.desdeExtension({ id: x.id, eventos: [{ bloque: 'a', hablante: 'Ana', texto: 'Hola', t: Date.now() }] });
  assert.match(await H.reunion_parar.ejecutar({}, ctx), /terminada y resumida[\s\S]*Decisiones/);
  assert.match(await H.reunion_resumen.ejecutar({ id: x.id }, ctx), /Preparar el anuncio/);
  assert.strictEqual(R.plataformaDe('https://teams.microsoft.com/v2/'), 'teams');
  assert.ok(R.fechaTarea('mañana por la tarde', new Date(2026, 9, 3, 12).getTime()) === new Date(2026, 9, 4, 9).getTime());
});
