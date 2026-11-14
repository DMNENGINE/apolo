const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validar, BASE, crearMundo } = require('../mundo');

test('galería: sala "galeria" y vitrinas con su modelo; ids raros fuera', () => {
  const m = JSON.parse(JSON.stringify(BASE));
  m.salas.push({ id: 'galeria', nombre: 'Galería de los Orígenes', rol: 'galeria', x: 2, y: 2, w: 6, h: 6, suelo: 'madera' });
  m.objetos.push({ tipo: 'vitrina', modelo: 'scout', x: 3, y: 3 }, { tipo: 'altar-holo', modelo: 'apolo', x: 5, y: 5 },
    { tipo: 'vitrina', modelo: '../../token', x: 3, y: 6 }, { tipo: 'rack', modelo: 'scout', x: 1, y: 1 });
  const v = validar(m);
  assert.ok(v.salas.some(s => s.rol === 'galeria'));
  const o = v.objetos.slice(-4);
  assert.deepStrictEqual(o.map(x => x.modelo), ['scout', 'apolo', undefined, undefined]);
});

test('galería: /v1/mundo/hologramas sirve la lista y la tira PNG, nada fuera de la carpeta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-')), h = path.join(dir, 'mundo', 'hologramas'); fs.mkdirSync(h, { recursive: true });
  fs.writeFileSync(path.join(h, 'hologramas.json'), JSON.stringify({ scout: { nombre: 'Scout', frames: 16, tam: 176 } }));
  fs.writeFileSync(path.join(h, 'scout.png'), 'png');
  const m = crearMundo({ cfg: { dir } });
  assert.strictEqual((await m.http('GET', ['v1', 'mundo', 'hologramas'])).scout.nombre, 'Scout');
  assert.strictEqual((await m.http('GET', ['v1', 'mundo', 'hologramas', 'scout'])).__archivo, path.join(h, 'scout.png'));
  await assert.rejects(m.http('GET', ['v1', 'mundo', 'hologramas', '..%2Ftoken']), /no encontrado/);
  fs.rmSync(dir, { recursive: true, force: true });
});
