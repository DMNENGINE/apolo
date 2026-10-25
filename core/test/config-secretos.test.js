const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { guardarConfig } = require('../admin');
const { crearBoveda, cifradorArchivo } = require('../boveda');
function entorno(boveda) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-secretos-'));
  const disco = { modeloPorDefecto: 'falso/m', respaldoAuto: false, memoria: { embeddings: null }, permisos: { modo: 'preguntar' }, alias: { anterior: 'falso/m' },
    proveedores: { falso: { tipo: 'openai', local: true, baseUrl: 'http://127.0.0.1:9/v1' }, openai: { tipo: 'openai', apiKey: '' } } };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(disco));
  return { dir, disco, cfg: { ...JSON.parse(JSON.stringify(disco)), dir, boveda } };
}
const clave = 'secreto-simulado-de-prueba-guardado';
for (const caso of ['sin boveda', 'cifrador bloqueado']) test(`configuracion: ${caso} rechaza la clave sin guardarla en claro ni aplicar otros cambios`, () => {
  const bov = caso === 'sin boveda' ? undefined : { guardar() { throw new Error('fallo simulado al cifrar ' + clave); } };
  const { dir, cfg } = entorno(bov), archivo = path.join(dir, 'config.json'), antes = fs.readFileSync(archivo), memoria = JSON.stringify(cfg);
  assert.throws(() => guardarConfig(cfg, { alias: { nueva: 'otro/m' }, permisos: { modo: 'auto' }, proveedores: { openai: { apiKey: clave, baseUrl: 'https://ejemplo.test' } } }), e => e.status === 503 && !e.message.includes(clave));
  assert.deepEqual(fs.readFileSync(archivo), antes); assert.equal(JSON.stringify(cfg), memoria);
  for (const f of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes(clave), f);
});
test('configuracion: si se cifra, persiste solo la referencia y la clave se recupera tras reiniciar la boveda de prueba', () => {
  const { dir, cfg } = entorno(); cfg.boveda = crearBoveda({ dir, cifrador: cifradorArchivo(dir) });
  const publica = guardarConfig(cfg, { proveedores: { openai: { apiKey: clave } } });
  assert.equal(publica.proveedores.openai.tieneKey, true); assert.ok(!JSON.stringify(publica).includes(clave));
  const disco = fs.readFileSync(path.join(dir, 'config.json'), 'utf8'); assert.ok(!disco.includes(clave));
  assert.equal(JSON.parse(disco).proveedores.openai.apiKeyRef, 'boveda:proveedor:openai');
  assert.equal(crearBoveda({ dir, cifrador: cifradorArchivo(dir) }).leer('proveedor:openai'), clave);
});
test('API: un fallo de cifrado devuelve 503 y no publica la clave ni cambios parciales', async t => {
  const { dir } = entorno();
  const boveda = { leer: () => null, guardar() { throw new Error('cifrado bloqueado'); }, error: () => '' };
  const daemon = await require('../daemon').iniciar({ dir, boveda, puerto: 0, sinTareas: true, sinPlugins: true, embedder: null });
  t.after(() => { daemon.servidor.closeAllConnections?.(); daemon.servidor.close(); });
  const antes = fs.readFileSync(path.join(dir, 'config.json'));
  const r = await fetch(`http://127.0.0.1:${daemon.puerto}/v1/config`, { method: 'PATCH', headers: { 'x-robot-token': daemon.token, 'content-type': 'application/json' }, body: JSON.stringify({ permisos: { modo: 'auto' }, proveedores: { openai: { apiKey: clave } } }) });
  assert.equal(r.status, 503); assert.ok(!(await r.text()).includes(clave));
  assert.deepEqual(fs.readFileSync(path.join(dir, 'config.json')), antes);
  assert.equal(daemon.nucleo.cfg.permisos.modo, 'preguntar'); assert.equal(daemon.nucleo.cfg.proveedores.openai.apiKey, '');
});
