const test = require('node:test');
const assert = require('node:assert');
const { crearDecidir } = require('../trading-decidir');

const base = (r, extra = {}) => {
  const llamadas = [], reg = [];
  const decidir = crearDecidir({
    generarJSON: async o => { llamadas.push(o); return { datos: r }; },
    memoria: { buscar: () => [{ texto: 'Perdí con DOPE por entrar tras un pump' }] },
    personalidad: { prompt: () => 'Soy APOLO.' }, modelo: () => 'chatgpt/default', registro: { add: (...a) => reg.push(a) }, ...extra });
  return { decidir, llamadas, reg };
};

test('trading decidir: usa el modelo del cerebro, la personalidad y la memoria de trading', async () => {
  const { decidir, llamadas, reg } = base({ decision: 'vetar', confianza: 0.9, motivo: 'pump agotado' });
  const r = await decidir({ tipo: 'entrada', simbolo: 'DOPE', propuesta: 'comprar ya', datos: { rsi: 80 } });
  assert.deepStrictEqual(r, { decision: 'vetar', confianza: 0.9, motivo: 'pump agotado', modelo: 'chatgpt/default' });
  assert.strictEqual(llamadas[0].modelo, 'chatgpt/default');
  assert.match(llamadas[0].system, /Soy APOLO/); assert.match(llamadas[0].system, /DOPE por entrar/);
  assert.deepStrictEqual(llamadas[0].schema.required, ['decision', 'confianza', 'motivo']);
  assert.match(reg[0][2], /vetar \(90 %\)/);
});

test('trading decidir: posición usa su esquema y la confianza se acota a 0-1', async () => {
  const { decidir, llamadas } = base({ accion: 'salir', confianza: 7, motivo: 'x' });
  const r = await decidir({ tipo: 'posicion', simbolo: 'X', propuesta: 'p', datos: 'd' });
  assert.strictEqual(r.confianza, 1); assert.strictEqual(r.accion, 'salir');
  assert.deepStrictEqual(llamadas[0].schema.required, ['accion', 'confianza', 'motivo']);
});

test('trading decidir: tipo desconocido es 400 y no llama al modelo', async () => {
  const { decidir, llamadas } = base({});
  await assert.rejects(decidir({ tipo: 'comprar' }), e => e.status === 400);
  assert.strictEqual(llamadas.length, 0);
});
