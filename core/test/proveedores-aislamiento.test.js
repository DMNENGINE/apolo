const test = require('node:test');
const assert = require('node:assert/strict');
const { crearProveedores } = require('../proveedores');
const proveedores = { falso: { tipo: 'openai', local: true, baseUrl: 'http://servidor-falso.test/v1' } };
test('proveedores: node --test no consulta servicios reales aunque no haya NODE_TEST_CONTEXT', async t => {
  const anterior = process.env.NODE_TEST_CONTEXT, argvAnterior = process.execArgv;
  process.execArgv = [...argvAnterior, '--test']; delete process.env.NODE_TEST_CONTEXT;
  t.after(() => { process.execArgv = argvAnterior; if (anterior === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = anterior; });
  let llamadas = 0;
  t.mock.method(globalThis, 'fetch', async () => { llamadas++; return { ok: true, json: async () => ({ data: [] }) }; });
  const p = crearProveedores({ proveedores }); await p.listo();
  assert.equal(llamadas, 0); assert.deepEqual(p.listos(), {});
});
test('proveedores: una comprobacion explicita sigue funcionando con respaldo automatico apagado', async t => {
  let llamadas = 0;
  t.mock.method(globalThis, 'fetch', async () => { llamadas++; return { ok: true, json: async () => ({ data: [{ id: 'modelo' }] }) }; });
  const p = crearProveedores({ proveedores, respaldoAuto: false }); await p.comprobar();
  assert.equal(llamadas, 1); assert.equal(p.listos().falso, true); assert.deepEqual(p.instalados().falso, ['modelo:latest']);
});
