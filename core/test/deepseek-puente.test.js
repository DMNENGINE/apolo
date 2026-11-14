const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const PLUGIN = path.join(__dirname, '..', '..', 'deepseek', 'apolo-puente', 'lib', 'index.js');

test('puente DeepSeek: eventos de sesión → hooks de APOLO', async () => {
  const { traducir } = await import(pathToFileURL(PLUGIN).href);
  const ses = { id: 'session-1', cwd: 'E:/Proyectos/x' }, est = new Map();
  const u = traducir(ses, { type: 'user/message', data: { content: [{ type: 'text', text: 'hazme el firmware' }], source: { kind: 'user' } } }, est);
  assert.deepStrictEqual([u.hook_event_name, u.prompt, u.session_id, u._motor, u.cwd], ['UserPromptSubmit', 'hazme el firmware', 'deepseek:session-1', 'deepseek', 'E:/Proyectos/x']);
  assert.strictEqual(traducir(ses, { type: 'user/message', data: { content: [{ type: 'text', text: 'x' }], source: { kind: 'tool' } } }, est), null);
  const h = traducir(ses, { type: 'tool/call', data: { name: 'pwsh', arguments: '{"command":"dir","description":"listar"}' } }, est);
  assert.deepStrictEqual([h.hook_event_name, h.tool_name, h.tool_input.command], ['PreToolUse', 'Bash', 'dir']);
  assert.strictEqual(traducir(ses, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Listo, compilado.' }] } } }, est), null);
  const s = traducir(ses, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }, est);
  assert.deepStrictEqual([s.hook_event_name, s.last_assistant_message], ['Stop', 'Listo, compilado.']);
  assert.strictEqual(traducir(ses, { type: 'turn/end', data: { reason: { kind: 'aborted' } } }, est).hook_event_name, 'StopFailure');
  assert.strictEqual(traducir({ id: 'sub', delegationDepth: 1 }, { type: 'turn/end', data: {} }, est), null);
});

test('puente DeepSeek: instalar y quitar en un perfil falso deja la config del usuario intacta', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-')), perfil = path.join(home, '.dsh', 'profiles', 'desktop');
  fs.mkdirSync(perfil, { recursive: true });
  const pkg0 = { name: 'dsh-profile-desktop', dependencies: { 'rea-clone-studio': 'link:node_modules/rea-clone-studio' } };
  const patch0 = '- id: ui-theme\n  name: "@deepseek-ai/dsh-client-ui-theme"\n  config:\n    preference: dark\n';
  fs.writeFileSync(path.join(perfil, 'package.json'), JSON.stringify(pkg0)); fs.writeFileSync(path.join(perfil, 'cordis.patch.yml'), patch0);
  const correr = accion => execFileSync(process.execPath, ['-e', `
    const h = require(${JSON.stringify(path.join(__dirname, '..', '..', 'main', 'hooks-config.js'))}).crearHooksConfig({ empaquetado: () => false, mensaje() {}, tr: x => x, dirDatos: () => ${JSON.stringify(home)} });
    ${accion}`], { env: { ...process.env, USERPROFILE: home, HOME: home }, encoding: 'utf8' });
  assert.strictEqual(correr('console.log(h.deepseekInstalado())').trim(), 'false');
  correr('h.deepseek(true, { callado: true }); h.deepseek(true, { callado: true })');     // dos veces: un solo bloque
  const patch = fs.readFileSync(path.join(perfil, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.startsWith(patch0.trim()));
  assert.strictEqual(patch.match(/# >>> APOLO/g).length, 1);
  assert.match(patch, /id: apolo-puente/); assert.match(patch, /serverName: apolo/); assert.match(patch, /core\/mcp\.js/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(perfil, 'package.json'), 'utf8')).dependencies['apolo-puente'], 'link:node_modules/apolo-puente');
  assert.ok(fs.existsSync(path.join(perfil, 'node_modules', 'apolo-puente', 'lib', 'index.js')));
  assert.strictEqual(correr('console.log(h.deepseekInstalado())').trim(), 'true');
  correr('h.deepseek(false, { callado: true })');
  assert.strictEqual(fs.readFileSync(path.join(perfil, 'cordis.patch.yml'), 'utf8').trim(), patch0.trim());
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(perfil, 'package.json'), 'utf8')).dependencies, pkg0.dependencies);
  fs.rmSync(home, { recursive: true, force: true });
});
