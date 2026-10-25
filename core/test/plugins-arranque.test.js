const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');
const { crearRegistro } = require('../herramientas');
async function montar(t, codigo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-arranque-test-'));
  const fuente = require('../sdk/crear').crear('fallido', path.join(dir, 'fuentes'));
  let llamadas = 0, intentosMatar = 0;
  t.mock.method(cp, 'fork', () => {
    llamadas++; const p = new EventEmitter(); p.connected = true; p.exitCode = null;
    p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.unref = () => {};
    p.send = () => {}; p.kill = () => { intentosMatar++; return false; };
    setImmediate(() => p.emit('error', Object.assign(new Error('no se pudo iniciar: ' + codigo), { code: codigo })));
    return p;
  });
  const modulo = require.resolve('../plugins'), anterior = require.cache[modulo];
  t.after(() => { if (anterior) require.cache[modulo] = anterior; else delete require.cache[modulo]; });
  delete require.cache[modulo]; const { crearPlugins } = require('../plugins');
  const h = crearRegistro(), bus = new EventEmitter();
  const gestor = crearPlugins({ cfg: { dir, permisos: { modo: 'preguntar' }, gestorPlugins: { activarMs: 60_000 } }, bus, herramientas: h,
    tareas: { lista: () => [], registrarInterna() {} }, permisos: {}, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [] }) } });
  t.after(() => gestor.cerrar());
  await gestor.instalar(fuente);
  return { gestor, h, contadores: () => ({ llamadas, intentosMatar }) };
}
for (const codigo of ['EPERM', 'ENOENT']) test(`plugins: ${codigo} asincrono conserva la causa y rechaza el arranque sin esperar 60 segundos`, { timeout: 2000 }, async t => {
  const e = await montar(t, codigo);
  await assert.rejects(e.gestor.activar('fallido', true), err => err.code === codigo && err.message.includes(codigo));
  assert.equal(e.gestor.activo('fallido'), false);
  assert.equal(e.gestor.estadoDe('fallido'), 'parado');
  assert.deepEqual(e.contadores(), { llamadas: 1, intentosMatar: 0 });
  assert.ok(!e.h.HERRAMIENTAS.some(h => h.plugin === 'fallido'));
});
