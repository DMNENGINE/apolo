const test = require('node:test');
const assert = require('node:assert');
const { elegir } = require('../enrutamiento');

const cfg = { modeloPorDefecto: 'chatgpt/default', proveedores: { proxmox: { ligero: true, local: true }, ollama: { local: true } } };
const s = { modelo: 'proxmox/apolo-v4' };

test('modelo ligero: la charla se queda en él', () => {
  for (const t of ['¿quién eres?', '¿qué impresoras tengo?', 'cuéntame un chiste', 'cómo estás hoy']) assert.strictEqual(elegir(cfg, s, t), 'proxmox/apolo-v4', t);
});

test('modelo ligero: lo que necesita manos va al modelo con herramientas', () => {
  for (const t of ['abre el bloc de notas', 'mira D:\\RobotCompanion', 'recuérdame mañana llamar', 'suelta la araña en https://x.com', '¿cuántos archivos hay en esa carpeta?'])
    assert.strictEqual(elegir(cfg, s, t), 'chatgpt/default', t);
  assert.strictEqual(elegir({ ...cfg, proveedores: { proxmox: { ligero: true, manos: 'ollama/qwen3.6' } } }, s, 'abre la carpeta'), 'ollama/qwen3.6');
});

test('enrutamiento desactivado en la sesión o modelo normal: no cambia', () => {
  assert.strictEqual(elegir(cfg, { ...s, enrutamiento: false }, 'abre la carpeta'), 'proxmox/apolo-v4');
  assert.strictEqual(elegir(cfg, { modelo: 'ollama/qwen3.6' }, 'abre la carpeta'), 'ollama/qwen3.6');
});
