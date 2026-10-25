const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileMatcher } = require('../../node_modules/app-builder-lib/out/fileMatcher');
const { cargarBot } = require('../../pi/cargar-bot');
const raiz = path.resolve(__dirname, '../..');

test('empaquetado excluye copias, fixtures, registros, credenciales y configuracion local', () => {
  const config = require('../../package.json');
  const filtrar = new FileMatcher(raiz, path.join(os.tmpdir(), 'apolo-destino-prueba'), s => s, config.build.files).createFilter();
  for (const rel of ['repair-backups/REVISION-26.md', 'repair-backups/fixture/datos/config.json', 'instalado.json', '.env', '.env.local', 'plugins/ejemplo/.env', '.aws/credentials', '.codex/config.toml', 'privado.token', 'datos/error.log', 'privado.key', 'privado.pem', 'core/test/seguridad.test.js']) {
    assert.equal(filtrar(path.join(raiz, rel), { isDirectory: () => false }), false, rel);
  }
  for (const rel of ['main.js', 'preload.js', 'app/index.html', 'core/daemon.js', 'core/rutas-seguras.js', 'core/sdk/ejecutor.js', 'core/ui/vendor/three.module.min.js', 'plugins/discord/plugin.json']) {
    assert.equal(filtrar(path.join(raiz, rel), { isDirectory: () => false }), true, rel);
  }
});

test('bot Pi carga el modulo compartido real sin credenciales ni conexion', () => {
  const bot = cargarBot(); assert.equal(typeof bot.createDiscord, 'function');
  const desactivado = bot.createDiscord(path.join(os.tmpdir(), 'apolo-config-inexistente-' + Date.now()), {});
  assert.equal(desactivado.enabled, false); assert.equal(typeof desactivado.stop, 'function');
});

test('bot Pi mantiene prioridad del modulo local en un despliegue independiente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-pi-local-'));
  fs.writeFileSync(path.join(dir, 'bot-discord.js'), 'module.exports = { fixture: true };');
  assert.equal(cargarBot(dir).fixture, true);
});

test('bot Pi no oculta un error del modulo local con la alternativa del repositorio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-pi-error-'));
  fs.writeFileSync(path.join(dir, 'bot-discord.js'), 'throw new Error("FALLO_LOCAL_FICTICIO");');
  assert.throws(() => cargarBot(dir), /FALLO_LOCAL_FICTICIO/);
});
