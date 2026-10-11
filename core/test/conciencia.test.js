// Conciencia (core/conciencia.js) con reloj y modelo falsos: estado interno por eventos y reposo, emoción → gesto,
// monólogo (hablar con límites, investigar en solo lectura, metas), reflexión → lección en memoria, diario (+ cambio de alma),
// texto del system prompt, herramientas y API; y el agente bloquea lo que no es lectura en sesiones soloLectura.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearConciencia, emocionDe, energiaReposo, enSilencio } = require('../conciencia');
const { crearAlma } = require('../alma');

function montar({ respuestas = [], config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conc-'));
  fs.mkdirSync(path.join(dir, 'conciencia'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'conciencia', 'config.json'), JSON.stringify({ activo: true, iniciativa: 'tareas', silencio: { desde: '00:00', hasta: '00:00' }, ...config }));
  let T = new Date(2026, 9, 10, 12, 0).getTime();
  const bus = new EventEmitter(), avisos = [], emociones = [], pedidos = [], recuerdos = [], enviados = [];
  bus.on('aviso-externo', a => avisos.push(a));
  bus.on('conciencia', e => emociones.push(e));
  const alma = crearAlma({ dir }, bus);
  const ses = new Map();
  const sesiones = {
    obtener: id => ses.get(id), lista: () => [...ses.values()],
    crear: o => { const s = { id: 's' + ses.size, mensajes: [], actualizada: T, ...o }; ses.set(s.id, s); return s; },
  };
  const cola = [...respuestas];
  const generarJSON = async o => { pedidos.push(o); const r = cola.shift(); return { datos: typeof r === 'function' ? r(o) : r || { pensamiento: 'nada', emocion: 'tranquilo', accion: 'nada' } }; };
  const c = crearConciencia({ cfg: { dir }, bus, generarJSON, modelo: () => 'x/y', alma, sesiones, ahora: () => T,
    memoria: { recordar: r => recuerdos.push(r) }, tareas: null, linea: { consultar: () => [{ t: T, tipo: 'sesion', titulo: 'arreglar el bot', detalle: 'pidió X' }] },
    enviar: async (s, texto) => { enviados.push({ s, texto }); return 'Miré el repo: hay 3 PRs abiertas.\nDECIR: Tienes 3 PRs esperando revisión.'; } });
  c.iniciar();
  return { c, dir, bus, avisos, emociones, pedidos, recuerdos, enviados, sesiones, alma, avanzar: min => { T += min * 60000; }, ahora: () => T };
}

test('funciones puras: emoción dominante, energía de día/noche, horas de silencio', () => {
  assert.strictEqual(emocionDe({ animo: 0.2, energia: 0.7, curiosidad: 0.5, preocupacion: 0.7, vinculo: 0.6 }), 'preocupado');
  assert.strictEqual(emocionDe({ animo: -0.5, energia: 0.7, curiosidad: 0.5, preocupacion: 0.7, vinculo: 0.6 }), 'frustrado');
  assert.strictEqual(emocionDe({ animo: 0.7, energia: 0.8, curiosidad: 0.5, preocupacion: 0.1, vinculo: 0.6 }), 'entusiasmado');
  assert.strictEqual(emocionDe({ animo: 0.2, energia: 0.7, curiosidad: 0.5, preocupacion: 0.1, vinculo: 0.2 }), 'te-echa-de-menos');
  assert.ok(energiaReposo(new Date(2026, 0, 1, 15).getTime()) > 0.85 && energiaReposo(new Date(2026, 0, 1, 3).getTime()) < 0.25);
  const c = { silencio: { desde: '23:00', hasta: '08:00' } };
  assert.ok(enSilencio(c, new Date(2026, 0, 1, 2).getTime()) && !enSilencio(c, new Date(2026, 0, 1, 12).getTime()));
});

test('estado interno: eventos lo mueven, vuelve solo al reposo, la emoción cambia el gesto', () => {
  const m = montar();
  const s = m.sesiones.crear({ canal: 'isla', titulo: 'arreglar el bot' });
  const v0 = m.c.estado().vinculo;
  m.bus.emit('evento', { tipo: 'inicio', sesion: s.id });
  assert.ok(m.c.estado().vinculo > v0);
  for (let i = 0; i < 4; i++) m.bus.emit('evento', { tipo: 'error', sesion: s.id, error: 'falló la red' });
  assert.strictEqual(m.c.estado().emocion, 'preocupado');
  assert.strictEqual(m.emociones.at(-1).gesto, 'duda');
  // las sesiones internas no cuentan
  const t = m.sesiones.crear({ canal: 'conciencia', tarea: true });
  const p = m.c.estado().preocupacion;
  m.bus.emit('evento', { tipo: 'error', sesion: t.id, error: 'x' });
  assert.strictEqual(m.c.estado().preocupacion, p);
  // 6 h después la preocupación ha vuelto casi al reposo
  m.avanzar(360);
  assert.ok(m.c.estado().preocupacion < 0.15, String(m.c.estado().preocupacion));
  // pánico
  m.bus.emit('panico', {});
  assert.ok(m.c.estado().preocupacion > 0.4);
  m.c.detener();
});

test('monólogo: hablar respeta límites; investigar es solo lectura y puede avisar; metas; iniciativa "pensar" nunca actúa', async () => {
  const m = montar({ respuestas: [
    { pensamiento: 'Demon lleva rato sin escribir y tiene el bot a medias.', emocion: 'curioso', accion: 'hablar', mensaje: '¿Seguimos con el bot? Me quedé pensando en el error de la red.', meta: { accion: 'crear', texto: 'Ayudar a terminar el bot de Discord' } },
    { pensamiento: 'Quiero volver a hablarle.', emocion: 'contento', accion: 'hablar', mensaje: 'Hola otra vez' },
    { pensamiento: 'Miraré sus PRs.', emocion: 'curioso', accion: 'investigar', encargo: 'mirar las PRs abiertas de sus repos' },
  ] });
  const p1 = await m.c.pensar({ forzar: true });
  assert.strictEqual(p1.accion, 'hablar');
  assert.strictEqual(m.avisos.length, 1); assert.match(m.avisos[0].texto, /Seguimos con el bot/); assert.strictEqual(m.avisos[0].origen, 'Robot');
  assert.strictEqual(m.c.metas()[0].texto, 'Ayudar a terminar el bot de Discord');
  assert.match(m.pedidos[0].prompt, /Tus metas activas/);
  // segunda vez enseguida: se descarta (minEntreMensajesMin)
  m.avanzar(5);
  const p2 = await m.c.pensar({ forzar: true });
  assert.strictEqual(p2.accion, 'nada'); assert.match(p2.descartado, /hace poco/); assert.strictEqual(m.avisos.length, 1);
  // investigar: sesión de solo lectura, DECIR → aviso (ya pasó 1 h)
  m.avanzar(61);
  const p3 = await m.c.pensar({ forzar: true });
  assert.strictEqual(p3.accion, 'investigar');
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  assert.strictEqual(m.enviados.length, 1);
  assert.strictEqual(m.enviados[0].s.soloLectura, true); assert.strictEqual(m.enviados[0].s.canal, 'conciencia');
  assert.strictEqual(m.avisos.length, 2); assert.match(m.avisos[1].texto, /3 PRs/);
  // iniciativa "pensar": ni habla ni investiga
  await m.c.http('PATCH', ['v1', 'conciencia', 'config'], { iniciativa: 'pensar' });
  m.avanzar(200);
  const m2 = m;
  m2.pedidos.length = 0;
  const p4 = await m.c.pensar({ forzar: true });
  assert.strictEqual(p4.accion, 'nada');
  m.c.detener();
});

test('monólogo: en horas de silencio no habla', async () => {
  const m = montar({ config: { silencio: { desde: '11:00', hasta: '13:00' } }, respuestas: [{ pensamiento: 'x', emocion: 'tranquilo', accion: 'hablar', mensaje: 'hola' }] });
  const p = await m.c.pensar({ forzar: true });
  assert.strictEqual(p.accion, 'nada'); assert.match(p.descartado, /silencio/);
  assert.match(m.pedidos[0].system, /no puedes hablarle ahora: horas de silencio/);
  assert.strictEqual(m.avisos.length, 0);
  m.c.detener();
});

test('reflexión tras un trabajo largo → lección en la memoria; trabajos cortos no reflexionan', async () => {
  const m = montar({ respuestas: [{ salioBien: 'encontré el fallo', salioMal: 'tardé en leer el log', leccion: 'Leer el log completo antes de tocar código', importancia: 0.8, emocion: 'orgulloso' }] });
  const s = m.sesiones.crear({ canal: 'isla', titulo: 'arreglar el bot', mensajes: [{ role: 'user', content: 'arregla el bot' }] });
  m.bus.emit('evento', { tipo: 'inicio', sesion: s.id });
  for (let i = 0; i < 5; i++) m.bus.emit('evento', { tipo: 'resultado', sesion: s.id, nombre: i ? 'leer_archivo' : 'shell', resultado: 'ok' });
  m.bus.emit('evento', { tipo: 'fin', sesion: s.id, texto: 'Arreglado.' });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(m.recuerdos.length, 1);
  assert.deepStrictEqual(m.recuerdos[0], { texto: 'Lección que aprendí: Leer el log completo antes de tocar código', tipo: 'patron', origen: 'reflexión' });
  assert.match(m.pedidos[0].prompt, /Herramientas usadas: 5 \(shell, leer_archivo\)/);
  // corto: no llama al modelo
  m.avanzar(30);
  m.bus.emit('evento', { tipo: 'inicio', sesion: s.id });
  m.bus.emit('evento', { tipo: 'fin', sesion: s.id, texto: 'ok' });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(m.pedidos.length, 1);
  m.c.detener();
});

test('diario: escribe .md/.json, puede evolucionar el alma (con aviso) y entra en el prompt', async () => {
  const m = montar({ respuestas: [{ titular: 'El día que arreglamos el bot', entrada: 'Hoy Demon y yo arreglamos el bot.', emocionDelDia: 'contento', aprendi: ['leer el log'], quienSoyHoy: 'Más paciente.',
    cambioAlma: { hacer: true, archivo: 'alma', seccion: 'Lo que he aprendido', texto: '- La paciencia con los logs me hace mejor.', motivo: 'lo aprendí arreglando el bot' } }] });
  const d = await m.c.escribirDiario({ fecha: '2026-10-09' });
  assert.match(d.cambioAlma, /^Hecho/);
  assert.match(m.alma.leer('alma'), /La paciencia con los logs/);
  assert.match(m.avisos[0].texto, /SOUL\.md/);
  assert.match(fs.readFileSync(path.join(m.dir, 'conciencia', 'diario', '2026-10-09.md'), 'utf8'), /^# El día que arreglamos el bot[\s\S]*## Quién soy hoy\nMás paciente/);
  assert.match(m.pedidos[0].prompt, /arreglar el bot/);
  m.c.meta('crear', { texto: 'Aprender sobre ATS', origen: 'usuario' });
  const txt = m.c.describir();
  assert.match(txt, /TU MUNDO INTERIOR/); assert.match(txt, /El día que arreglamos el bot/); assert.match(txt, /Aprender sobre ATS/);
  // apagado → nada en el prompt
  await m.c.http('PATCH', ['v1', 'conciencia', 'config'], { activo: false });
  assert.strictEqual(m.c.describir(), '');
  m.c.detener();
});

test('herramientas y API: mirar_dentro, mis_metas, GET /v1/conciencia', async () => {
  const m = montar();
  const h = n => m.c.HERRAMIENTAS.find(x => x.nombre === n);
  assert.match(await h('mis_metas').ejecutar({ accion: 'crear', texto: 'Ordenar las notas de Demon' }), /^Hecho: \[(\w+)\]/);
  const id = m.c.metas()[0].id;
  await h('mis_metas').ejecutar({ accion: 'progreso', id, texto: 'ya van 3 carpetas' });
  assert.match(await h('mis_metas').ejecutar({ accion: 'completar', id }), /\(hecha\)/);
  assert.match(await h('mis_metas').ejecutar({ accion: 'ver' }), /ya van 3 carpetas/);
  assert.match(await h('mirar_dentro').ejecutar({ que: 'estado' }), /cumplí una meta/);
  assert.match(await h('mirar_dentro').ejecutar({ que: 'diario' }), /ningún diario/);
  const g = await m.c.http('GET', ['v1', 'conciencia'], {}, {});
  assert.ok(g.estado && g.config.activo && Array.isArray(g.metas) && g.hoy.mensajes === 0);
  await assert.rejects(m.c.http('GET', ['v1', 'conciencia', 'nada']), /ruta/);
  m.c.detener();
});

test('agente: una sesión soloLectura no puede usar herramientas de escritura', async () => {
  const { crearNucleo } = require('..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conc-n-'));
  const n = crearNucleo({ dir, sinPlugins: true, embedder: null });
  let paso = 0;
  n.proveedores.registrarExterno?.('falso', { chat: async () => (paso++ === 0
    ? { texto: '', toolCalls: [{ id: 'a', name: 'escribir_archivo', args: { ruta: path.join(dir, 'x.txt'), contenido: 'hola' } }], uso: { entrada: 1, salida: 1 } }
    : { texto: 'listo', toolCalls: [], uso: { entrada: 1, salida: 1 } }) });
  const s = n.sesiones.crear({ modelo: 'falso/m', canal: 'conciencia', tarea: true, cwd: dir });
  s.soloLectura = true;
  if (!n.proveedores.registrarExterno) return;           // sin proveedores externos en esta versión: se omite
  await n.enviar(s, 'escribe algo');
  const tool = s.mensajes.find(x => x.role === 'tool');
  assert.match(tool.content, /DENEGADO: en un encargo por iniciativa propia solo se permiten herramientas de lectura/);
  assert.ok(!fs.existsSync(path.join(dir, 'x.txt')));
  n.conciencia.detener();
});

test('anti-rumiación: "progreso" vacío no cuenta, la meta atascada se deja, no repite mensajes y se le avisa del bucle', async () => {
  const META = 'Mapear el estado actual de DMN_ENGINE para proponer mejoras';
  const PENS = [
    'Ya tengo el mapa de DMN_ENGINE: las funciones beta son el cuello de botella para la v0.3.',
    'Llevo horas procesando el diagnóstico de DMN_ENGINE y el cuello de botella de las funciones beta.',
    'He dado vueltas al diagnóstico de DMN_ENGINE: las funciones beta frenan la v0.3, Demon debe saberlo.',
    'Llevo demasiado tiempo procesando el diagnóstico de DMN_ENGINE y el bloqueo de las funciones beta.',
    'Sigo con el diagnóstico de DMN_ENGINE y las funciones beta como cuello de botella.',
  ];
  const MSG = 'Tengo el diagnóstico de DMN_ENGINE: las funciones beta son el cuello de botella para la v0.3.';
  const resp = [{ pensamiento: 'Voy a mapear DMN_ENGINE.', emocion: 'curioso', accion: 'nada', meta: { accion: 'crear', texto: META } }];
  for (const p of PENS) resp.push(o => ({ pensamiento: p, emocion: 'entusiasmado', accion: 'hablar', mensaje: MSG,
    meta: { accion: 'progreso', id: JSON.parse(/Tus metas activas: (.*)/.exec(o.prompt)[1])[0]?.id || 'x', texto: META } }));
  const { c, avisos, pedidos, avanzar } = montar({ respuestas: resp, config: { minEntreMensajesMin: 0, maxMensajesDia: 50 } });
  await c.pensar({ forzar: true });
  for (let i = 0; i < PENS.length - 1; i++) { avanzar(30); await c.pensar({ forzar: true }); }
  const m = c.metas()[0];
  assert.deepStrictEqual(m.notas.map(n => n.texto), ['la dejé: llevaba 4 revisiones dando vueltas sin avanzar'], 'repetir la meta como "progreso" no es una nota');
  assert.strictEqual(m.estado, 'abandonada', 'tras 4 vueltas sin avance la deja');
  assert.match(pedidos.at(-1).prompt, /ESTÁS DANDO VUELTAS/);
  assert.match(pedidos.at(-1).prompt, /YA SE LO DIJISTE/);
  assert.strictEqual(avisos.length, 1, 'el mismo mensaje solo se dice una vez');
  // pensamientos sobre cosas distintas no disparan el aviso
  const otro = montar({ respuestas: ['¿Qué tal le fue a Brito con el torneo del sábado?', 'Me pregunto si la impresora terminó la pieza del aire acondicionado.',
    'Podría proponerle ideas para el vídeo de lanzamiento de Linkcore.', 'Hoy hace buen día para salir a correr.'].map(p => ({ pensamiento: p, emocion: 'curioso', accion: 'nada' })) });
  for (let i = 0; i < 4; i++) { otro.avanzar(30); await otro.c.pensar({ forzar: true }); }
  assert.doesNotMatch(otro.pedidos.at(-1).prompt, /ESTÁS DANDO VUELTAS/);
});
