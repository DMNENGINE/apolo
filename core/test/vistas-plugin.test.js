// Pestañas del panel aportadas por plugins (aporta.vistas): registro, acciones, servir solo lo declarado y
// nativa solo con firma de un autor oficial (o plugin de la app). Sin red.
const test = require('./requiere-plugins');   // se salta sin modelo de permisos de Node (plugins de terceros)
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const escanerFalso = { async escanear() { return { nivel: 'verde', hallazgos: [], resumen: 'limpio' }; } };
function nucleo() {
  const dir = tmp('nucleo-vistas-');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, skills: { rutas: [] }, gestorPlugins: { backoffMs: 20, timeoutMs: 8000 } }));
  fs.writeFileSync(path.join(dir, 'token'), 'TOKEN-SECRETO-DEL-NUCLEO');
  const { crearNucleo } = require('../index');
  return crearNucleo({ dir, escaner: escanerFalso, embedder: null });
}
function plugin(nombre, vistas, archivos) {
  const d = path.join(tmp('pl-vistas-'), nombre); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'apolo-plugin.json'), JSON.stringify({ nombre, version: '1.0.0', descripcion: 'prueba', entrada: 'index.js', apoloSdk: '^1.0.0', permisos: [], aporta: { vistas } }));
  fs.writeFileSync(path.join(d, 'index.js'), `const { definirPlugin } = require('@apolo/sdk');
module.exports = definirPlugin({ async activar(apolo) {
  for (const v of ${JSON.stringify(vistas.map(v => v.nombre))}) await apolo.registrarVista({ nombre: v, titulo: 'T ' + v, acciones: { hola: async d => ({ eco: d.x, vista: v }) } });
} });`);
  for (const [f, t] of Object.entries(archivos)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  return d;
}

test('manifest: una vista necesita archivo .js o .html relativo', () => {
  const M = require('../plugins/manifest');
  const base = { nombre: 'x', version: '1.0.0', apoloSdk: '^1.0.0' };
  assert.throws(() => M.validar({ ...base, aporta: { vistas: [{ nombre: 'v', archivo: 'ui/v.css' }] } }), /\.js .*\.html/);
  assert.throws(() => M.validar({ ...base, aporta: { vistas: [{ nombre: 'v', archivo: '../v.js' }] } }), /relativo/);
  assert.ok(M.validar({ ...base, aporta: { vistas: [{ nombre: 'v', archivo: 'ui/v.html', titulo: 'Mi pestaña', icono: 'grafica' }] } }));
});

test('vistas de plugin: lista, acciones declaradas, archivo servido y nativa solo con firma oficial', async () => {
  const n = nucleo();
  const d = plugin('panelito', [{ nombre: 'aislada', archivo: 'ui/a.html', titulo: 'Aislada' }, { nombre: 'nativa', archivo: 'ui/n.js', titulo: 'Nativa', icono: 'grafica' }],
    { 'ui/a.html': '<p>hola</p>', 'ui/n.js': 'registrarVistaPlugin("panelito","nativa",{pintar(){}})' });
  await n.plugins.instalar(d); await n.plugins.activar('panelito', true);
  const l = n.plugins.vistas();
  assert.deepStrictEqual(l.map(v => [v.nombre, v.tipo, v.nativa]), [['aislada', 'html', false], ['nativa', 'js', false]]);
  assert.strictEqual(l[1].titulo, 'Nativa'); assert.strictEqual(l[1].icono, 'grafica');
  assert.deepStrictEqual(await n.plugins.accionVista('panelito', 'aislada', 'hola', { x: 7 }), { eco: 7, vista: 'aislada' });
  await assert.rejects(n.plugins.accionVista('panelito', 'aislada', 'adios', {}), /no tiene la acción/);

  const { iniciar } = require('../daemon');
  const { servidor, puerto, token } = await iniciar({ nucleo: n, puerto: 0, sinTareas: true });
  try {
    const url = r => `http://127.0.0.1:${puerto}${r}`;
    const r1 = await fetch(url('/plugin-ui/panelito/aislada'));
    assert.strictEqual(r1.status, 200); assert.match(r1.headers.get('content-security-policy'), /sandbox allow-scripts/);
    assert.strictEqual((await fetch(url('/plugin-ui/panelito/nativa'))).status, 404, 'un .js sin firma oficial no se sirve al panel');
    assert.strictEqual((await fetch(url('/plugin-ui/panelito/otra'))).status, 404);
    const api = await fetch(url('/v1/plugins/panelito/vistas/aislada/hola'), { method: 'POST', headers: { 'x-robot-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ datos: { x: 1 } }) }).then(r => r.json());
    assert.deepStrictEqual(api.resultado, { eco: 1, vista: 'aislada' });
    const lista = await fetch(url('/v1/plugins/vistas'), { headers: { 'x-robot-token': token } }).then(r => r.json());
    assert.strictEqual(lista.vistas.length, 2);

    // firmada con una clave que NO es la oficial → sigue sin ser nativa
    const firmar = require('../skills/firmar'), dirPl = path.join(n.cfg.dir, 'plugins', 'panelito');
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    firmar.firmar(dirPl, privateKey, { autor: 'DMNENGINE' });
    await new Promise(ok => setTimeout(ok, 30)); n.plugins.vistas();
    assert.strictEqual((await fetch(url('/plugin-ui/panelito/nativa'))).status, 404, 'el nombre del autor no basta: cuenta la clave');
  } finally { servidor.close(); await n.plugins.activar('panelito', false); }
  const vacias = n.plugins.vistas();
  assert.strictEqual(vacias.length, 0, 'plugin parado: su pestaña desaparece');
});
