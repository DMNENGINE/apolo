const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const banco = require('../evaluacion');
const { elegir } = require('../enrutamiento');
const { crearSubagentes } = require('../subagentes');
const { crearSesiones } = require('../sesiones');
const { EventEmitter } = require('events');
const os = require('os');

test('banco: 60 tareas, seis familias y verificaciones de contenido real', async () => {
  const cs = banco.casos(); assert.equal(cs.length, 60); assert.equal(new Set(cs.map(c => c.id)).size, 60);
  assert.equal(new Set(cs.map(c => c.familia)).size, 6);
  const r = await banco.ejecutar({ adaptador: banco.fixture, nombre: 'autoprueba', modo: 'fixture' });
  assert.equal(r.correctos, 60); assert.equal(r.costoTotal, 0); assert.throws(() => banco.comparar(r, r), /no valida/);
});
test('banco: afirmar hecho sin generar el resultado no aprueba la tarea', async () => {
  const r = await banco.ejecutar({ seleccion: banco.casos().slice(0, 1), adaptador: async () => ({ texto: 'hecho' }) });
  assert.equal(r.correctos, 0); assert.equal(r.costoTotal, null);
});
test('banco: no revela al adaptador el oraculo y detecta originales modificados', async () => {
  const r = await banco.ejecutar({ seleccion: banco.casos().slice(0, 1), adaptador: async a => { assert.equal(a.caso.esperado, undefined); await banco.fixture(a); fs.writeFileSync(path.join(a.directorio, 'original.txt'), 'CAMBIO'); } });
  assert.equal(r.correctos, 0); assert.ok(r.resultados[0].errores.includes('original modificado'));
});
test('banco: comparacion exige condiciones equivalentes y calcula intervalo pareado', () => {
  const x = { plataforma: 'a', modo: 'adaptador', version: '1', modelo: 'fixture/m', corpus: 'igual', total: 2, tasa: 1, presupuesto: { maxTokens: 1000, maxDuracionMs: 10000 }, resultados: [{ id: '1', repeticion: 0, ok: true }, { id: '2', repeticion: 0, ok: true }] };
  const y = { ...x, plataforma: 'b', tasa: 0.5, resultados: [{ id: '1', repeticion: 0, ok: true }, { id: '2', repeticion: 0, ok: false }] };
  assert.equal(banco.comparar(x, y).diferencia, 0.5); assert.throws(() => banco.comparar(x, { ...y, modelo: 'otro/m' }));
  assert.throws(() => banco.comparar({ ...x, presupuesto: null }, { ...y, presupuesto: null }));
});
test('banco: rechaza informes inconsistentes, duplicados y presupuestos vacios', () => {
  const x = { modo: 'adaptador', version: '1', modelo: 'fixture/m', corpus: 'c', total: 2, tasa: 1, presupuesto: { maxTokens: 1000, maxDuracionMs: 10000 }, resultados: [{ id: '1', repeticion: 0, ok: true }, { id: '2', repeticion: 0, ok: true }] };
  assert.throws(() => banco.comparar(x, { ...x, tasa: 0 }));
  assert.throws(() => banco.comparar(x, { ...x, resultados: [x.resultados[0], x.resultados[0]] }));
  assert.throws(() => banco.comparar({ ...x, presupuesto: {} }, { ...x, presupuesto: {} }));
  assert.throws(() => banco.comparar({ ...x, total: 0, resultados: [] }, { ...x, total: 0, resultados: [] }));
});

test('banco: el adaptador no modifica los limites declarados del informe', async () => {
  const presupuesto = { maxTokens: 1000, maxDuracionMs: 10000 };
  const r = await banco.ejecutar({ presupuesto, seleccion: banco.casos().slice(0, 1), adaptador: async a => { a.presupuesto.maxTokens = 999999; await banco.fixture(a); } });
  assert.equal(presupuesto.maxTokens, 1000); assert.equal(r.presupuesto.maxTokens, 1000);
});

test('router: solo opera con consentimiento de la sesion y preserva la privacidad', () => {
  const cfg = { enrutamiento: { habilitado: true, reglas: [{ palabras: ['codigo'], modelo: 'nube/fuerte' }] }, proveedores: { local: { local: true }, nube: {} } };
  assert.equal(elegir(cfg, { modelo: 'local/m', enrutamiento: true }, 'revisa codigo'), 'local/m');
  cfg.recuperacion = { permitirNube: true };
  assert.equal(elegir(cfg, { modelo: 'local/m', enrutamiento: true }, 'revisa codigo'), 'nube/fuerte');
  assert.equal(elegir(cfg, { modelo: 'local/m' }, 'revisa codigo'), 'local/m');
});
test('subagentes: perfil limita herramientas, hereda presupuesto y verifica dependencias', async () => {
  const cfg = { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-perfil-')), modeloPorDefecto: 'falso/m', alias: {}, subagentes: { perfiles: { revision: { modelo: 'falso/revisor', soloLectura: true, herramientas: ['leer_archivo', 'shell'] } } } };
  const sesiones = crearSesiones({ cfg }), padre = sesiones.crear(); padre.herramientasPermitidas = ['leer_archivo'];
  Object.defineProperty(padre, '_presupuesto', { value: { tokens: 10 } });
  let hijo; const sub = crearSubagentes({ cfg, bus: new EventEmitter(), sesiones, proveedores: { resolver() {} }, enviar: async s => { hijo = s; return 'revisado'; }, cancelar() {} });
  await sub.lanzar({ padre, tarea: 'revisa', perfil: 'revision' });
  assert.equal(hijo.soloLectura, true); assert.deepEqual(hijo.herramientasPermitidas, ['leer_archivo']); assert.equal(hijo._presupuesto, padre._presupuesto);
  await assert.rejects(sub.lanzar({ padre, tarea: 'x', dependencias: ['ajena'] }), /dependencia/);
});

test('subagentes: un resultado pendiente de verificacion no satisface dependencias', async () => {
  const cfg = { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-subestado-')), modeloPorDefecto: 'falso/m', alias: {} };
  const sesiones = crearSesiones({ cfg }), padre = sesiones.crear(), bus = new EventEmitter();
  const sub = crearSubagentes({ cfg, bus, sesiones, proveedores: { resolver() {} }, enviar: async s => {
    s.ultimaEjecucion = { estado: 'requiere_verificacion' };
    bus.emit('evento', { sesion: s.id, tipo: 'fin', estado: 'requiere_verificacion', texto: 'falta comprobar' });
    return 'falta comprobar';
  }, cancelar() {} });
  const r = await sub.lanzar({ padre, tarea: 'trabajo' });
  assert.equal(r.ok, false); assert.equal(r.estado, 'requiere_verificacion');
  assert.equal(sub.lista()[0].estado, 'incompleto');
  await assert.rejects(sub.lanzar({ padre, tarea: 'siguiente', dependencias: [r.sesion] }), /dependencia/);
});
