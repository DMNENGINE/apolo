const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearTaller } = require('../skills/taller');
function entorno(correr) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-seguro-')), src = path.join(dir, 'skill'), salida = path.join(dir, 'salida');
  fs.mkdirSync(src); fs.mkdirSync(salida);
  fs.writeFileSync(path.join(src, 'SKILL.md'), '# prueba');
  fs.writeFileSync(path.join(src, 'aprendizaje.jsonl'), 'dato privado');
  const destino = path.join(salida, 'exportable.zip'); fs.writeFileSync(destino, 'archivo anterior');
  const taller = crearTaller({ cfg: {}, almacen: { obtener: () => ({ slug: 'exportable', dir: src }) }, correr });
  return { dir, salida, destino, taller };
}
test('exportar: si fallan los archivadores conserva el ZIP previo y limpia el temporal', async () => {
  let intentos = 0;
  const e = entorno(async () => { intentos++; throw new Error('archivador no disponible'); });
  await assert.rejects(e.taller.exportar('exportable', { destino: e.destino }), /archivador no disponible/);
  assert.equal(intentos, 2); assert.equal(fs.readFileSync(e.destino, 'utf8'), 'archivo anterior');
  assert.deepEqual(fs.readdirSync(e.salida), ['exportable.zip']);
});
test('exportar: valida la salida temporal antes de reemplazar el archivo previo', async () => {
  const e = entorno(async (_cmd, args) => {
    const salida = args.includes('-f') ? args[args.indexOf('-f') + 1] : args[2];
    assert.notEqual(salida, e.destino); fs.writeFileSync(salida, 'archivo incompleto');
  });
  await assert.rejects(e.taller.exportar('exportable', { destino: e.destino }), /zip/);
  assert.equal(fs.readFileSync(e.destino, 'utf8'), 'archivo anterior'); assert.deepEqual(fs.readdirSync(e.salida), ['exportable.zip']);
});
test('exportar: reemplazo y filtrado de datos privados con archivador simulado', async () => {
  const e = entorno(async (_cmd, args, opciones) => {
    const salida = args.includes('-f') ? args[args.indexOf('-f') + 1] : args[2];
    const tmp = args.includes('-C') ? args[args.indexOf('-C') + 1] : opciones.cwd;
    assert.ok(fs.existsSync(path.join(tmp, 'exportable', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(tmp, 'exportable', 'aprendizaje.jsonl')));
    assert.equal(fs.readFileSync(e.destino, 'utf8'), 'archivo anterior');
    fs.writeFileSync(salida, 'PK-contenido-del-simulador');
  });
  const r = await e.taller.exportar('exportable', { destino: e.destino });
  assert.equal(r.ruta, e.destino); assert.equal(fs.readFileSync(e.destino, 'utf8'), 'PK-contenido-del-simulador');
  assert.deepEqual(fs.readdirSync(e.salida), ['exportable.zip']);
});
