const test = require('node:test');
const assert = require('node:assert');
const { extraerJSON, validar, crearEstructurado } = require('../estructurado');

test('extraerJSON: con texto alrededor, ```json y llaves dentro de cadenas', () => {
  assert.deepStrictEqual(extraerJSON('Claro: ```json\n{"a":1,"b":"x}y"}\n``` listo'), { a: 1, b: 'x}y' });
  assert.deepStrictEqual(extraerJSON('{"o":{"p":[1,2]}} y {"otro":2}'), { o: { p: [1, 2] } });
  assert.strictEqual(extraerJSON('sin json'), null);
});

test('validar: tipos, requeridos, enums y arrays', () => {
  const s = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, p: { type: 'string', enum: ['urgente', 'normal'] } }, required: ['i', 'p'] } } }, required: ['items'] };
  assert.strictEqual(validar({ items: [{ i: 1, p: 'normal' }] }, s), '');
  assert.match(validar({ items: [{ i: 1, p: 'meh' }] }, s), /fuera de/);
  assert.match(validar({ items: [{ i: 1.5, p: 'normal' }] }, s), /integer/);
  assert.match(validar({}, s), /items: falta/);
});

test('generarJSON: reintenta una vez si la primera respuesta no vale', async () => {
  const respuestas = ['lo siento, aquí va: {"voz": 1}', '{"voz":"hola","texto":"todo bien"}'];
  const pedidos = [];
  const proveedores = { resolver: () => ({ model: 'm', api: { chat: async a => { pedidos.push(a); return { texto: respuestas.shift(), toolCalls: [], uso: { entrada: 1, salida: 1 } }; } } }) };
  const g = crearEstructurado(proveedores);
  const r = await g({ modelo: 'x/m', prompt: 'resume', schema: { type: 'object', properties: { voz: { type: 'string' }, texto: { type: 'string' } }, required: ['voz', 'texto'] } });
  assert.deepStrictEqual(r.datos, { voz: 'hola', texto: 'todo bien' });
  assert.strictEqual(pedidos.length, 2);
  assert.ok(pedidos[0].formatoJSON);
  assert.match(pedidos[1].mensajes[0].content, /no sirvió/);
});
