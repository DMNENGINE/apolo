const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
function montar(t, resultado) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etiquetas-test-'));
  const cache = path.join(dir, 'cache'), datos = path.join(dir, 'datos'); fs.mkdirSync(cache); fs.mkdirSync(datos);
  fs.writeFileSync(path.join(datos, 'token'), 'secreto-del-fixture');
  const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(__dirname, '..', 'sandbox', 'jaula.cs'))).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(cache, `apolo-jaula-${hash}.exe`), 'fixture: no es ejecutable real');
  const ruta = require.resolve('../sandbox/windows'), anterior = require.cache[ruta];
  t.after(() => { if (anterior) require.cache[ruta] = anterior; else delete require.cache[ruta]; });
  const llamadas = [];
  t.mock.method(cp, 'spawnSync', (exe, args) => { llamadas.push({ exe, args }); return resultado(args, llamadas.length); });
  delete require.cache[ruta]; const win = require('../sandbox/windows');
  return { dir, cache, datos, win, llamadas };
}
test('sandbox: un fallo nolectura bloquea antes de crear la carpeta de trabajo', async t => {
  const e = montar(t, () => ({ status: 3, stderr: 'etiqueta rechazada' }));
  const originales = fs.mkdtempSync; let creadas = 0;
  t.mock.method(fs, 'mkdtempSync', (...args) => { creadas++; return originales(...args); });
  await assert.rejects(e.win.prepararRestringido({ dirCache: e.cache, dirDatos: e.datos }), err => err.code === 'APOLO_SANDBOX_ETIQUETA' && /nolectura.*codigo 3.*rechazada/.test(err.message));
  assert.equal(creadas, 0); assert.equal(e.llamadas.length, 1);
  assert.equal(fs.readFileSync(path.join(e.datos, 'token'), 'utf8'), 'secreto-del-fixture');
});
test('sandbox: EPERM de nolectura se conserva y nunca se intenta relajar la proteccion', async t => {
  const e = montar(t, () => ({ status: null, error: Object.assign(new Error('spawnSync bloqueado'), { code: 'EPERM' }) }));
  await assert.rejects(e.win.prepararRestringido({ dirCache: e.cache, dirDatos: e.datos }), err => err.code === 'EPERM' && /nolectura.*EPERM/.test(err.message));
  assert.equal(e.llamadas.length, 1);
});
test('sandbox: fallo de integridad baja conserva el errno y limpia solo el temporal creado', async t => {
  let root;
  const e = montar(t, args => { if (args[0] === 'etiquetar=nolectura') return { status: 0 }; root = args[1]; return { status: null, error: Object.assign(new Error('bloqueado'), { code: 'EPERM' }) }; });
  await assert.rejects(e.win.prepararRestringido({ dirCache: e.cache, dirDatos: e.datos }), err => err.code === 'EPERM' && /baja.*EPERM/.test(err.message));
  assert.ok(root); assert.equal(fs.existsSync(root), false); assert.equal(fs.existsSync(e.datos), true);
});
test('sandbox: copia fallida limpia el trabajo y conserva el origen', async t => {
  const e = montar(t, () => ({ status: 0 }));
  const origen = path.join(e.dir, 'origen'); fs.mkdirSync(origen); fs.writeFileSync(path.join(origen, 'usuario.txt'), 'conservar');
  t.mock.method(fs, 'cpSync', () => { throw Object.assign(new Error('copia bloqueada'), { code: 'EACCES' }); });
  await assert.rejects(e.win.prepararRestringido({ dirCache: e.cache, dirDatos: e.datos, dirOrigen: origen }), err => err.code === 'EACCES');
  const root = e.llamadas.find(l => l.args[0] === 'etiquetar=baja').args[1];
  assert.equal(fs.existsSync(root), false); assert.equal(fs.readFileSync(path.join(origen, 'usuario.txt'), 'utf8'), 'conservar');
});
test('sandbox: preparacion correcta mantiene la proteccion y excluye .git de la copia', async t => {
  const e = montar(t, () => ({ status: 0 }));
  const origen = path.join(e.dir, 'origen'); fs.mkdirSync(path.join(origen, '.git'), { recursive: true });
  fs.writeFileSync(path.join(origen, 'usuario.txt'), 'conservar'); fs.writeFileSync(path.join(origen, '.git', 'config'), 'privado');
  const p = await e.win.prepararRestringido({ dirCache: e.cache, dirDatos: e.datos, dirOrigen: origen });
  assert.deepEqual(e.llamadas.map(l => l.args[0]), ['etiquetar=nolectura', 'etiquetar=baja']);
  assert.equal(fs.readFileSync(path.join(p.cwd, 'usuario.txt'), 'utf8'), 'conservar'); assert.equal(fs.existsSync(path.join(p.cwd, '.git')), false);
  p.limpiar(); assert.equal(fs.existsSync(p.root), false); assert.equal(fs.existsSync(origen), true);
});
test('sandbox: una terminacion por senal tampoco se considera etiquetado correcto', t => {
  const e = montar(t, () => ({ status: null, signal: 'SIGTERM' }));
  assert.throws(() => e.win.etiquetar('fixture.exe', 'baja', [e.datos]), err => err.signal === 'SIGTERM' && /SIGTERM/.test(err.message));
});
