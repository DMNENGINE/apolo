// Plugin de APOLO para opencode (opencode/apolo.js): traducción a eventos de Claude Code, permisos de ida y vuelta y retirada
// de la tarjeta cuando se contesta en la terminal de opencode. Con una APOLO falsa (HTTP) y un cliente de opencode falso.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const espera = ms => new Promise(ok => setTimeout(ok, ms));

async function montar(responder) {
  const recibidos = [], cerrados = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d);
    req.on('end', () => {
      const e = JSON.parse(b); recibidos.push(e);
      res.on('close', () => { if (!res.writableEnded) cerrados.push(e.hook_event_name); });
      if (e.hook_event_name !== 'PermissionRequest') return res.end();
      const d = responder(e); if (d) setTimeout(() => res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: d } } })), 20);
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  process.env.APOLO_HOOK_PUERTO = String(srv.address().port);
  process.env.APOLO_HOOK_TOKEN = 'tok';
  // el puerto se lee al importar: una copia nueva del módulo por prueba
  const mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'opencode', 'apolo.js')).href + '?t=' + Math.random());
  const respuestas = [];
  const client = { postSessionIdPermissionsPermissionId: async o => { respuestas.push([o.path.permissionID, o.body.response]); return {}; } };
  const hooks = await mod.default.server({ client, directory: 'D:/proyecto' });
  return { mod, hooks, recibidos, cerrados, respuestas, cerrar: () => srv.close() };
}

test('opencode: formato v1 y traducción de herramientas/permisos', async () => {
  const m = await montar(() => null);
  try {
    assert.strictEqual(m.mod.default.id, 'apolo');
    assert.deepStrictEqual(m.mod.herramienta('bash', { command: 'ls' }), ['Bash', { command: 'ls', description: undefined }]);
    assert.deepStrictEqual(m.mod.permiso({ permission: 'edit', patterns: ['a.js'], metadata: { filepath: 'D:/p/a.js', diff: '+x' } }), ['Edit', { file_path: 'D:/p/a.js', diff: '+x' }]);
    assert.deepStrictEqual(m.mod.permiso({ permission: 'webfetch', patterns: ['https://x.com'], metadata: {} }), ['WebFetch', { url: 'https://x.com' }]);
    assert.strictEqual(m.mod.decision(JSON.stringify({ hookSpecificOutput: { decision: { behavior: 'deny' } } })), 'reject');
    assert.strictEqual(m.mod.decision(''), null);
  } finally { m.cerrar(); }
});

test('opencode: el permiso va a APOLO y la decisión vuelve a opencode', async () => {
  const m = await montar(e => e.tool_input.command.includes('rm') ? 'deny' : 'allow');
  try {
    await m.hooks['tool.execute.before']({ tool: 'bash', sessionID: 's1', callID: 'c1' }, { args: { command: 'echo hola' } });
    await m.hooks.event({ event: { type: 'permission.asked', properties: { id: 'p1', sessionID: 's1', permission: 'bash', patterns: ['echo hola'], metadata: { command: 'echo hola' } } } });
    await m.hooks.event({ event: { type: 'permission.asked', properties: { id: 'p2', sessionID: 's1', permission: 'bash', patterns: ['rm -rf x'], metadata: { command: 'rm -rf x' } } } });
    for (let i = 0; i < 50 && m.respuestas.length < 2; i++) await espera(20);
    assert.deepStrictEqual(m.respuestas.sort(), [['p1', 'once'], ['p2', 'reject']]);
    const pre = m.recibidos.find(e => e.hook_event_name === 'PreToolUse');
    assert.deepStrictEqual([pre.session_id, pre.tool_name, pre._motor, pre.cwd], ['opencode:s1', 'Bash', 'opencode', 'D:/proyecto']);
    // los dos avisos de "terminado" de opencode (session.idle + session.status idle) dan un solo Stop
    await m.hooks.event({ event: { type: 'session.status', properties: { sessionID: 's1', status: { type: 'idle' } } } });
    await m.hooks.event({ event: { type: 'session.idle', properties: { sessionID: 's1' } } });
    await espera(80);
    assert.strictEqual(m.recibidos.filter(e => e.hook_event_name === 'Stop').length, 1);
  } finally { m.cerrar(); }
});

test('opencode: si contestas en la terminal de opencode, la tarjeta de APOLO se retira y no se responde dos veces', async () => {
  const m = await montar(() => null);                    // APOLO no contesta (nadie pulsa)
  try {
    await m.hooks.event({ event: { type: 'permission.asked', properties: { id: 'p9', sessionID: 's2', permission: 'bash', patterns: ['ls'], metadata: { command: 'ls' } } } });
    for (let i = 0; i < 50 && !m.recibidos.length; i++) await espera(10);
    await m.hooks.event({ event: { type: 'permission.replied', properties: { sessionID: 's2', requestID: 'p9', reply: 'once' } } });
    for (let i = 0; i < 50 && !m.cerrados.length; i++) await espera(10);
    assert.deepStrictEqual(m.cerrados, ['PermissionRequest']);
    await espera(50);
    assert.deepStrictEqual(m.respuestas, []);
  } finally { m.cerrar(); }
});
