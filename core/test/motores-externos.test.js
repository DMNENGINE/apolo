// Sesiones de Claude Code / Gemini CLI / opencode (hooks → 'motor-hook') aparecen en Mission Control como agentes.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { crearSubagentes } = require('../subagentes');

test('los hooks de un motor externo crean y mueven su agente', async () => {
  const bus = new EventEmitter(), vistos = [];
  bus.on('agente', a => vistos.push(a));
  const sub = crearSubagentes({ cfg: {}, bus, sesiones: { obtener: () => null }, proveedores: {}, enviar: async () => '', cancelar: () => {} });
  const ev = (h, x = {}) => bus.emit('motor-hook', { session_id: 'abc', cwd: ['D:', 'proyectos', 'apolo'].join(String.fromCharCode(92)), hook_event_name: h, ...x });
  ev('UserPromptSubmit');
  ev('PreToolUse', { tool_name: 'WebFetch', tool_input: { url: 'https://example.com' }, _usage: { ctx: 1200, out: 30, model: 'claude-opus-5-5' } });
  let a = sub.lista()[0];
  assert.strictEqual(a.nombre, 'Claude Code · apolo'); assert.strictEqual(a.externo, 'claude'); assert.strictEqual(a.estado, 'trabajando');
  assert.deepStrictEqual([a.herramienta.nombre, a.herramienta.resumen], ['WebFetch', 'https://example.com']); assert.strictEqual(a.modelo, 'claudecode/claude-opus-5-5');
  ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm x' } }); assert.strictEqual(sub.lista()[0].esperando, 'ext');
  ev('PostToolUse'); ev('Stop', { last_assistant_message: 'hecho' });
  a = sub.lista()[0]; assert.strictEqual(a.estado, 'listo'); assert.strictEqual(a.esperando, undefined); assert.strictEqual(a.ultimo, 'hecho');
  bus.emit('motor-hook', { session_id: 'gemini:1', _motor: 'gemini', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} });
  assert.ok(sub.lista().some(x => x.nombre === 'Gemini CLI' && x.modelo === 'gemini/cli'));
  await new Promise(r => setTimeout(r, 300)); assert.ok(vistos.length >= 2);
});
