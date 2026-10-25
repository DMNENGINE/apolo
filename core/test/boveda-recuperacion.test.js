const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearBoveda } = require('../boveda');
function entorno(cifrador = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-vault-retry-'));
  const f = path.join(dir, 'boveda.json');
  fs.writeFileSync(f, JSON.stringify({ formato: 'apolo-boveda/1', metodo: 'fixture', entradas: { primera: Buffer.from('VALOR_FICTICIO').toString('base64') } }));
  const cif = { nombre: 'fixture', descifrar: bufs => bufs, cifrar: bufs => bufs, ...cifrador };
  return { dir, f, cif, vault: crearBoveda({ dir, cifrador: cif }) };
}

test('boveda reintenta despues de un fallo temporal y limpia el error', () => {
  let n = 0;
  const { vault } = entorno({ descifrar: bufs => { if (++n === 1) throw new Error('temporal'); return bufs; } });
  assert.equal(vault.leer('primera'), null); assert.match(vault.error(), /temporal/);
  assert.equal(vault.leer('primera'), 'VALOR_FICTICIO'); assert.equal(n, 2); assert.equal(vault.error(), '');
});

test('boveda no publica una cache parcialmente descifrada', () => {
  let n = 0;
  const { f } = entorno();
  const datos = JSON.parse(fs.readFileSync(f)); datos.entradas.segunda = Buffer.from('OTRO_FICTICIO').toString('base64'); fs.writeFileSync(f, JSON.stringify(datos));
  const v = crearBoveda({ dir: path.dirname(f), cifrador: { nombre: 'fixture', cifrar: bufs => bufs, descifrar: bufs => ++n === 1 ? [bufs[0]] : bufs } });
  assert.equal(v.leer('primera'), null); assert.match(v.error(), /incompleto/);
  assert.equal(v.leer('segunda'), 'OTRO_FICTICIO'); assert.equal(v.leer('primera'), 'VALOR_FICTICIO');
  assert.equal(n, 2);
});

test('metodo incompatible sigue rechazando lecturas y escrituras sin cambiar el archivo', () => {
  const { vault, f } = entorno({ nombre: 'incompatible' }), antes = fs.readFileSync(f);
  assert.equal(vault.leer('primera'), null); assert.equal(vault.leer('primera'), null);
  assert.throws(() => vault.guardar('segunda', 'NO'), /se cifro|se cifró/);
  assert.throws(() => vault.borrar('primera'), /se cifro|se cifró/);
  assert.deepEqual(fs.readFileSync(f), antes); assert.equal(vault.tiene('segunda'), false);
});

test('fallo al guardar no publica cambios ni los filtra en un guardado posterior', t => {
  const { vault, f, dir, cif } = entorno(), antes = fs.readFileSync(f);
  assert.equal(vault.leer('primera'), 'VALOR_FICTICIO');
  const mock = t.mock.method(fs, 'renameSync', () => { throw new Error('disco bloqueado'); });
  assert.throws(() => vault.guardar('fallida', 'NO_PERSISTIR'), /disco bloqueado/);
  assert.equal(vault.tiene('fallida'), false); assert.equal(vault.leer('fallida'), null);
  assert.deepEqual(fs.readFileSync(f), antes); assert.deepEqual(fs.readdirSync(dir), ['boveda.json']);
  mock.mock.restore(); vault.guardar('correcta', 'SI_PERSISTIR');
  const recargada = crearBoveda({ dir, cifrador: cif });
  assert.equal(recargada.leer('primera'), 'VALOR_FICTICIO'); assert.equal(recargada.leer('correcta'), 'SI_PERSISTIR'); assert.equal(recargada.tiene('fallida'), false);
});

test('fallo al borrar conserva cache y disco', t => {
  const { vault, f } = entorno(), antes = fs.readFileSync(f);
  assert.equal(vault.leer('primera'), 'VALOR_FICTICIO');
  t.mock.method(fs, 'renameSync', () => { throw new Error('disco bloqueado'); });
  assert.throws(() => vault.borrar('primera'), /disco bloqueado/);
  assert.equal(vault.leer('primera'), 'VALOR_FICTICIO'); assert.equal(vault.tiene('primera'), true); assert.deepEqual(fs.readFileSync(f), antes);
});

test('cifrado incompleto conserva el secreto anterior', () => {
  const { vault, f } = entorno({ cifrar: () => [] }), antes = fs.readFileSync(f);
  assert.throws(() => vault.guardar('primera', 'NO'), /cifrado incompleto/);
  assert.equal(vault.leer('primera'), 'VALOR_FICTICIO'); assert.deepEqual(fs.readFileSync(f), antes);
});
