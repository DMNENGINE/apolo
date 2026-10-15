// Mundo de Mission Control: validación (recorta, descarta, exige principal y subagentes), guardar/volver al de serie y generar con el modelo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearMundo, validar, BASE } = require('../mundo');

test('el mundo de serie es válido y queda igual', () => {
  assert.deepStrictEqual(validar(BASE), BASE);
});

test('validar recorta medidas, descarta objetos desconocidos y roles repetidos', () => {
  const m = validar({ nombre: '<b>X</b>', tema: 'raro', ancho: 500, alto: 5, salas: [
    { id: 'a', nombre: 'A', rol: 'principal', x: -4, y: 2, w: 900, h: 4, suelo: 'lava' },
    { id: 'b', nombre: 'B', rol: 'subagentes', x: 3, y: 3, w: 4, h: 4 }, { id: 'c', rol: 'principal', x: 1, y: 1, w: 3, h: 3 }],
    objetos: [{ tipo: 'orbe', x: 2, y: 2 }, { tipo: 'bomba', x: 1, y: 1 }] });
  assert.strictEqual(m.ancho, 96); assert.strictEqual(m.alto, 16); assert.strictEqual(m.tema, 'mazmorra'); assert.strictEqual(m.nombre, 'bX/b');
  assert.strictEqual(m.salas.length, 2); assert.strictEqual(m.salas[0].x, 0); assert.strictEqual(m.salas[0].w, 96); assert.strictEqual(m.salas[0].suelo, 'piedra');
  assert.deepStrictEqual(m.objetos, [{ tipo: 'orbe', x: 2, y: 2 }]);
  assert.throws(() => validar({ salas: [{ rol: 'principal', x: 1, y: 1, w: 3, h: 3 }] }), /subagentes/);
});

test('http: de serie, guardar el propio, volver al original y generar con el modelo', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mundo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let pedido;
  const mundo = crearMundo({ cfg: { dir }, modelo: () => 'x/y', generarJSON: async o => { pedido = o; return { datos: { ...BASE, nombre: 'Nave', tema: 'nave' } }; } });
  assert.deepStrictEqual(await mundo.http('GET', ['', 'mundo'], {}), { mundo: BASE, propio: false });
  const g = await mundo.http('POST', ['', 'mundo', 'generar'], { descripcion: 'una nave espacial' });
  assert.strictEqual(g.mundo.tema, 'nave'); assert.match(pedido.prompt, /una nave espacial/); assert.strictEqual(pedido.modelo, 'x/y');
  assert.strictEqual(fs.existsSync(path.join(dir, 'mundo.json')), false);                 // generar no guarda
  await mundo.http('PUT', ['', 'mundo'], { mundo: g.mundo });
  assert.strictEqual((await mundo.http('GET', ['', 'mundo'], {})).mundo.nombre, 'Nave');
  assert.strictEqual((await mundo.http('DELETE', ['', 'mundo'], {})).propio, false);
  assert.strictEqual((await mundo.http('GET', ['', 'mundo'], {})).mundo.nombre, BASE.nombre);
  await assert.rejects(mundo.http('POST', ['', 'mundo', 'generar'], { descripcion: '  ' }), /describe/);
});
