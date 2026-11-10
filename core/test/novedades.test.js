// Lo nuevo tras actualizar: cuándo se enseña (main/novedades.js) y el espectáculo del casco (app/novedades-show.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');
const { crearNovedades, comparar } = require('../../main/novedades');

test('novedades: una vez por versión, también al venir de una versión anterior, y forzable', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-nov-'));
  const archivo = path.join(d, 'novedades.json');
  fs.writeFileSync(archivo, JSON.stringify({ '0.3.0': { es: { titulo: 'Hola', puntos: ['a'] } } }));
  const n = crearNovedades({ userData: d, version: '0.3.0', archivo });
  const p = n.pendiente();
  assert.equal(p.version, '0.3.0'); assert.equal(p.es.titulo, 'Hola'); assert.equal(p.en.titulo, 'Hola', 'sin inglés usa el español');
  n.marcar();
  assert.equal(n.pendiente(), null);
  assert.ok(n.pendiente({ forzar: true }));
  fs.writeFileSync(path.join(d, 'novedades-vistas.json'), JSON.stringify({ version: '0.2.14' }));
  assert.ok(n.pendiente(), 'de 0.2.14 a 0.3.0 se enseña');
  assert.equal(crearNovedades({ userData: d, version: '0.3.1', archivo }).pendiente(), null, 'sin entrada no hay nada');
  assert.ok(comparar('0.10.0', '0.9.9') > 0 && comparar('0.3.0', '0.3.0') === 0);
  fs.rmSync(d, { recursive: true, force: true });
});

test('novedades.json del repo: la versión actual tiene textos en español e inglés', () => {
  const nov = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'novedades.json'), 'utf8'));
  const v = require('../../package.json').version;
  assert.ok(nov[v], 'falta la entrada de ' + v);
  for (const l of ['es', 'en']) { assert.ok(nov[v][l].titulo); assert.ok(nov[v][l].puntos.length >= 3); assert.ok(nov[v][l].puntos.every(p => p.length < 200)); }
});

test('espectáculo: todas en orden, pausa si no se puede y repite la cortada; saltar avisa', async () => {
  const { crearEspectaculo } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'novedades-show.js')).href);
  const anims = [{ id: 'a', segundos: 1 }, { id: 'b', segundos: 1 }, { id: 'c', segundos: 1 }];
  let t = 0, puede = true; const hechas = [], canceladas = [], fines = [];
  const e = crearEspectaculo({ animaciones: anims, ahora: () => t, puede: () => puede, reproducir: a => hechas.push(a.id), cancelar: () => canceladas.push(t), alFin: r => fines.push(r) });
  e.empezar();
  e.tick(); assert.deepEqual(hechas, ['a']);
  t = 500; e.tick(); assert.deepEqual(hechas, ['a'], 'no pisa la animación en curso');
  t = 1800; e.tick(); assert.deepEqual(hechas, ['a', 'b']);
  puede = false; t = 2000; e.tick(); assert.equal(canceladas.length, 1, 'un permiso corta la animación');
  puede = true; t = 3600; e.tick(); assert.deepEqual(hechas, ['a', 'b', 'b'], 'repite la que se cortó');
  t = 5400; e.tick(); t = 7200; e.tick();
  assert.deepEqual(hechas, ['a', 'b', 'b', 'c']); assert.equal(fines.length, 1); assert.equal(fines[0].completo, true); assert.equal(e.activo, false);
  const e2 = crearEspectaculo({ animaciones: anims, ahora: () => t, puede: () => true, reproducir: () => {}, cancelar: () => canceladas.push('x'), alFin: r => fines.push(r) });
  e2.empezar(); e2.tick(); assert.equal(e2.parar('saltar'), true);
  assert.equal(fines.at(-1).completo, false); assert.equal(fines.at(-1).motivo, 'saltar'); assert.equal(canceladas.at(-1), 'x');
  assert.equal(e2.parar(), false, 'parar dos veces no avisa dos veces');
});
