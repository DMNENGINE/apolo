// Control del ratón/teclado con manos FALSAS (no se mueve nada de verdad): permiso por encargo, coordenadas,
// acciones delicadas, ventanas protegidas, contraseñas, pánico y liberación al terminar el turno.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recientes } = require('../escritorio');
const { porNombre } = require('../herramientas');

function entorno(t, { info = {}, permisos } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, ...(permisos ? { permisos } : {}) }));
  const ordenes = [];
  const estado = { ventana: { titulo: 'Bloc de notas', proceso: 'notepad' }, foco: { tipo: 'Edit', nombre: 'Texto', password: false }, enPunto: { tipo: 'Button', nombre: 'Guardar' }, ...info };
  const manos = async o => { ordenes.push(o); return o.op === 'info' ? { ok: true, ...estado, cursor: [0, 0] } : { ok: true }; };
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, manos });
  const eventos = []; n.bus.on('control', e => eventos.push(e));
  const s = n.sesiones.crear({ cwd: dir });
  recientes.set(s.id, { t: Date.now(), monitor: 1, escala: 2, origen: { x: 100, y: 0 },
    elementos: [{ id: 5, tipo: 'Button', nombre: 'Guardar', x: 200, y: 100, ancho: 20, alto: 10 }, { id: 6, tipo: 'Button', nombre: 'Enviar', x: 400, y: 100, ancho: 40, alto: 20 }] });
  t.after(() => n.control.soltarTodo('fin del test'));
  return { n, s, ordenes, estado, eventos, acciones: () => ordenes.filter(o => !['info', 'armar', 'desarmar'].includes(o.op)) };
}

test('sin tomar_control no hay manos; con control: coordenadas de imagen → pantalla', async t => {
  const { n, s, acciones, eventos, ordenes } = entorno(t);
  await assert.rejects(n.control.accion(s, 'clic', { elemento: 5 }), /tomar_control/);
  await n.control.tomar(s, { motivo: 'guardar el documento', minutos: 2 });
  assert.ok(ordenes.some(o => o.op === 'armar'));
  assert.deepStrictEqual(eventos[0], { activo: true, sesion: s.id, motivo: 'guardar el documento', hasta: eventos[0].hasta });
  assert.strictEqual(s.controlando, true);
  assert.ok(!JSON.stringify(s).includes('controlando'));           // nunca se guarda en el .json de la sesión
  assert.match(await n.control.accion(s, 'clic', { elemento: 5 }), /clic en "Guardar"/);
  await n.control.accion(s, 'clic', { x: 10, y: 20, boton: 'der' });
  const [a, b] = acciones();
  assert.deepStrictEqual([a.x, a.y], [210, 105]);                  // centro del elemento
  assert.deepStrictEqual([b.x, b.y, b.boton], [120, 40, 'der']);   // origen 100,0 + 10*2, 20*2
  assert.ok(acciones().every(o => o.armadoRequerido));
  // ver_pantalla no vuelve a pedir permiso mientras hay control
  assert.strictEqual(porNombre.ver_pantalla.riesgo({}, s), 'lectura');
  n.control.soltar(s.id);
  assert.strictEqual(porNombre.ver_pantalla.riesgo({}, s), 'pantalla');
});

test('acciones delicadas piden permiso aparte; si lo deniegas, no se hace', async t => {
  const { n, s, acciones } = entorno(t);
  await n.control.tomar(s, { motivo: 'x' });
  const pedidos = [];
  n.bus.on('permiso', r => { pedidos.push(r); n.permisos.resolver(r.id, 'deny'); });
  await assert.rejects(n.control.accion(s, 'clic', { elemento: 6 }), /DENEGADO/);
  assert.strictEqual(acciones().length, 0);
  assert.match(pedidos[0].resumen, /clic en "Enviar"/);
  assert.ok(pedidos[0].peligro);
});

test('Enter en una app de mensajería es delicado; en el Bloc de notas no', async t => {
  const { n, s, estado, acciones } = entorno(t);
  await n.control.tomar(s, { motivo: 'x' });
  const pedidos = [];
  n.bus.on('permiso', r => { pedidos.push(r); n.permisos.resolver(r.id, 'allow'); });
  await n.control.accion(s, 'tecla', { combo: 'enter' });
  assert.strictEqual(pedidos.length, 0);
  estado.ventana = { titulo: '#general - Discord', proceso: 'Discord' };
  await n.control.accion(s, 'tecla', { combo: 'enter' });
  assert.strictEqual(pedidos.length, 1);
  assert.strictEqual(acciones().length, 2);                         // aprobado → se pulsa
});

test('ventanas protegidas y campos de contraseña: se niega', async t => {
  const { n, s, estado, acciones } = entorno(t);
  await n.control.tomar(s, { motivo: 'x' });
  estado.ventana = { titulo: 'PayPal: Enviar dinero - Google Chrome', proceso: 'chrome' };
  await assert.rejects(n.control.accion(s, 'escribir', { texto: '100' }), /PROTEGIDA/);
  estado.ventana = { titulo: 'Iniciar sesión - Chrome', proceso: 'chrome' };
  estado.foco = { tipo: 'Edit', nombre: 'Contraseña', password: true };
  await assert.rejects(n.control.accion(s, 'escribir', { texto: 'hunter2' }), /CONTRASEÑA/);
  assert.strictEqual(acciones().length, 0);
});

test('pánico: el usuario mueve el ratón → se suelta el control y se cancela el turno', async t => {
  const { n, s, eventos } = entorno(t);
  let cancelada = null; n.agente.cancelar = id => { cancelada = id; return true; };
  await n.control.tomar(s, { motivo: 'x' });
  n.control._panico('raton');
  assert.strictEqual(n.control.activo(s), false);
  assert.strictEqual(cancelada, s.id);
  assert.match(eventos.at(-1).razon, /moviste el ratón/);
  await assert.rejects(n.control.accion(s, 'clic', { elemento: 5 }), /tomar_control/);
});

test('al terminar el turno el control se suelta solo; solo una conversación controla a la vez', async t => {
  const { n, s, eventos } = entorno(t);
  await n.control.tomar(s, { motivo: 'x' });
  const otra = n.sesiones.crear({ cwd: os.tmpdir() });
  await assert.rejects(n.control.tomar(otra, { motivo: 'y' }), /otra conversación/);
  n.bus.emit('evento', { tipo: 'fin', sesion: s.id, texto: '', uso: { entrada: 0, salida: 0 } });
  assert.strictEqual(n.control.activo(s), false);
  assert.strictEqual(eventos.at(-1).razon, 'terminó el encargo');
});

test('tomar_control pregunta SIEMPRE: aunque el modo sea auto y aunque contestes "siempre"', async t => {
  const { n, s } = entorno(t, { permisos: { modo: 'auto' } });
  let preguntas = 0;
  n.bus.on('permiso', r => { preguntas++; n.permisos.resolver(r.id, 'always'); });
  for (let i = 0; i < 2; i++) assert.strictEqual((await n.permisos.pedir({ h: porNombre.tomar_control, args: { motivo: 'm' }, sesion: s })).ok, true);
  assert.strictEqual(preguntas, 2);
  assert.strictEqual(n.permisos.reglas?.().length ?? 0, 0);
});
