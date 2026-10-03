// Tests sin red ni API keys: un servidor falso compatible con OpenAI responde con guiones.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function modeloFalso(guion) {
  const recibidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      recibidos.push(JSON.parse(b));
      const msg = guion.shift() || { role: 'assistant', content: 'fin' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, recibidos, url: `http://127.0.0.1:${srv.address().port}/v1` })));
}
const llamada = (id, name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

function entorno(url, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: url, local: true } }, ...extra }));
  return dir;
}

test('bucle: herramienta de lectura + respuesta final', async () => {
  const f = await modeloFalso([llamada('c1', 'listar', { ruta: '.' }), { role: 'assistant', content: 'Hay un archivo hola.txt' }]);
  const dir = entorno(f.url);
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'trabajo-')); fs.writeFileSync(path.join(trabajo, 'hola.txt'), 'x');
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir });
  const s = n.sesiones.crear({ cwd: trabajo });
  const ev = [];
  const r = await n.enviar(s, 'qué hay aquí', e => ev.push(e.tipo));
  assert.strictEqual(r, 'Hay un archivo hola.txt');
  assert.deepStrictEqual(ev, ['inicio', 'herramienta', 'resultado', 'texto', 'fin']);
  const seg = f.recibidos[1].messages;                       // el 2º request lleva el resultado de la herramienta
  assert.strictEqual(seg.at(-1).role, 'tool');
  assert.match(seg.at(-1).content, /hola\.txt/);
  assert.strictEqual(s.uso.entrada, 20);
  assert.strictEqual(n.sesiones.obtener(s.id).mensajes.length, 4);
  f.srv.close();
});

test('permisos: escritura se pregunta; deny bloquea, always recuerda', async () => {
  const f = await modeloFalso([
    llamada('c1', 'escribir_archivo', { ruta: 'a.txt', contenido: '1' }), { role: 'assistant', content: 'no pude' },
    llamada('c2', 'escribir_archivo', { ruta: 'a.txt', contenido: '2' }), { role: 'assistant', content: 'hecho' },
    llamada('c3', 'escribir_archivo', { ruta: 'b.txt', contenido: '3' }), { role: 'assistant', content: 'hecho sin preguntar' },
  ]);
  const dir = entorno(f.url);
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'trabajo-'));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir });
  const s = n.sesiones.crear({ cwd: trabajo });
  const decisiones = ['deny', 'always'];
  let preguntas = 0;
  n.bus.on('permiso', req => { preguntas++; n.permisos.resolver(req.id, decisiones.shift()); });
  await n.enviar(s, 'escribe');
  assert.ok(!fs.existsSync(path.join(trabajo, 'a.txt')));
  assert.match(s.mensajes.find(m => m.role === 'tool').content, /DENEGADO/);
  await n.enviar(s, 'otra vez');
  assert.strictEqual(fs.readFileSync(path.join(trabajo, 'a.txt'), 'utf8'), '2');
  await n.enviar(s, 'y otro');                               // misma carpeta → regla "siempre"
  assert.strictEqual(fs.readFileSync(path.join(trabajo, 'b.txt'), 'utf8'), '3');
  assert.strictEqual(preguntas, 2);
  f.srv.close();
});

test('permisos: comando peligroso siempre pregunta aunque haya regla', async () => {
  const f = await modeloFalso([llamada('c1', 'shell', { comando: 'git push --force' }), { role: 'assistant', content: 'ok' }]);
  const dir = entorno(f.url, { permisos: { modo: 'auto' } });
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir });
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  let req;
  n.bus.on('permiso', r => { req = r; n.permisos.resolver(r.id, 'deny'); });
  await n.enviar(s, 'push');
  assert.strictEqual(req.peligro, 'push forzado');
  f.srv.close();
});

test('daemon: token, crear sesión y turno por SSE', async () => {
  const f = await modeloFalso([{ role: 'assistant', content: 'hola desde el daemon' }]);
  const dir = entorno(f.url);
  const { iniciar } = require('../daemon');
  const d = await iniciar({ dir, puerto: 0 });
  const base = `http://127.0.0.1:${d.puerto}/v1`, h = { 'x-robot-token': d.token, 'content-type': 'application/json' };
  assert.strictEqual((await fetch(`${base}/estado`)).status, 401);
  const s = await (await fetch(`${base}/sesiones`, { method: 'POST', headers: h, body: JSON.stringify({ cwd: os.tmpdir() }) })).json();
  const txt = await (await fetch(`${base}/sesiones/${s.id}/mensajes`, { method: 'POST', headers: h, body: JSON.stringify({ texto: 'hola' }) })).text();
  const eventos = txt.split('\n\n').filter(Boolean).map(l => JSON.parse(l.slice(6)));
  assert.deepStrictEqual(eventos.map(e => e.tipo), ['inicio', 'texto', 'fin']);
  assert.strictEqual(eventos[1].texto, 'hola desde el daemon');
  d.servidor.close(); f.srv.close();
});

test('adaptadores: conversión de mensajes a Anthropic y Gemini', async () => {
  const cuerpos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      cuerpos.push(JSON.parse(b));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.url.includes('generateContent')
        ? { candidates: [{ content: { parts: [{ functionCall: { name: 'listar', args: {} }, thoughtSignature: 'sig' }] } }] }
        : { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'listar', input: {} }], usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const mensajes = [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'listar', args: {} }, { id: 'b', name: 'web', args: { url: 'x' } }] },
    { role: 'tool', toolCallId: 'a', name: 'listar', content: 'r1' },
    { role: 'tool', toolCallId: 'b', name: 'web', content: 'r2' },
  ];
  const an = await require('../proveedores/anthropic')({ baseUrl: url, apiKey: 'k' }).chat({ model: 'm', system: 's', mensajes, herramientas: [] });
  assert.strictEqual(an.toolCalls[0].id, 't1');
  assert.strictEqual(cuerpos[0].messages.length, 3);                          // los 2 tool_result van juntos
  assert.strictEqual(cuerpos[0].messages[2].content.length, 2);
  const ge = await require('../proveedores/gemini')({ baseUrl: url, apiKey: 'k' }).chat({ model: 'm', system: 's', mensajes, herramientas: [{ nombre: 'x', descripcion: 'd', parametros: { type: 'object', additionalProperties: false, properties: {} } }] });
  assert.strictEqual(ge.toolCalls[0].extra.thoughtSignature, 'sig');
  assert.strictEqual(cuerpos[1].contents[2].parts[1].functionResponse.name, 'web');
  assert.ok(!('additionalProperties' in cuerpos[1].tools[0].functionDeclarations[0].parameters));
  srv.close();
});

test('respuesta vacía: el agente pide la respuesta final una vez', async () => {
  const f = await modeloFalso([{ role: 'assistant', content: '' }, { role: 'assistant', content: 'aquí está' }]);
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir: entorno(f.url) });
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  assert.strictEqual(await n.enviar(s, 'hola'), 'aquí está');
  assert.strictEqual(f.recibidos[1].tools, undefined);
  assert.match(f.recibidos[1].messages.at(-1).content, /respuesta final/);
  f.srv.close();
});

test('panel: estáticos sin token, config sin claves, PATCH de config', async (t) => {
  const dir = entorno('http://127.0.0.1:9/v1');
  const { iniciar } = require('../daemon');
  const d = await iniciar({ dir, puerto: 0, sinTareas: true });
  t.after(() => d.servidor.close());
  const base = `http://127.0.0.1:${d.puerto}`, h = { 'x-robot-token': d.token, 'content-type': 'application/json' };
  const html = await fetch(base + '/');
  assert.strictEqual(html.status, 200);
  assert.match(await html.text(), /Robot Companion/);
  assert.strictEqual((await fetch(base + '/..%2f..%2fconfig.js')).status, 404);
  assert.strictEqual((await fetch(base + '/v1/config')).status, 401);
  await fetch(base + '/v1/config', { method: 'PATCH', headers: h, body: JSON.stringify({ proveedores: { openai: { apiKey: 'sk-secreta-123' } }, alias: { rapido: 'falso/m1' } }) });
  const c = await (await fetch(base + '/v1/config', { headers: h })).json();
  assert.strictEqual(c.proveedores.openai.tieneKey, true);
  assert.ok(!JSON.stringify(c).includes('sk-secreta-123'));
  assert.strictEqual(c.alias.rapido, 'falso/m1');
  const disco = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.ok(!JSON.stringify(disco).includes('sk-secreta-123'), 'FASE 9: la clave va a la bóveda, no a config.json');
  assert.strictEqual(disco.proveedores.openai.apiKeyRef, 'boveda:proveedor:openai');
  assert.strictEqual(d.nucleo.cfg.boveda.leer('proveedor:openai'), 'sk-secreta-123');
  assert.strictEqual(disco.proveedores.falso.baseUrl, 'http://127.0.0.1:9/v1');   // conserva lo que no se tocó
  const uso = await (await fetch(base + '/v1/uso', { headers: h })).json();
  assert.strictEqual(uso.dias, 30);
  d.servidor.close();
});
