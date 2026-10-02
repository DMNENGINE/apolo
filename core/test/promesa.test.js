// "Voy a hacerlo" sin herramientas: el agente le obliga a hacerlo de verdad (máx. 2 empujones por turno).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function montar(t, responder) {
  const recibidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      const j = JSON.parse(b); recibidos.push(j);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: responder(j, recibidos.length) }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => { srv.closeAllConnections?.(); srv.close(); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, local: true } },
    memoria: { embeddings: null },
  }));
  const { crearNucleo } = require('../index');
  return { n: crearNucleo({ dir }), recibidos };
}

test('promete sin herramientas → se le empuja y acaba haciéndolo', async t => {
  const { n, recibidos } = await montar(t, (j, i) => {
    if (i === 1) return { role: 'assistant', content: 'Voy a comprobar ahora mismo la carpeta.' };
    if (!j.messages.some(m => m.role === 'tool'))
      return { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'listar', arguments: JSON.stringify({ ruta: '.' }) } }] };
    return { role: 'assistant', content: 'Listo: la carpeta tiene archivos.' };
  });
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  const final = await n.enviar(s, 'mira la carpeta');
  assert.equal(final, 'Listo: la carpeta tiene archivos.');
  assert.match(JSON.stringify(recibidos[1].messages), /NO has llamado a ninguna herramienta/);
  assert.ok(!s.mensajes.some(m => /SISTEMA: Acabas de decir/.test(m.content || '')));   // el empujón no se guarda
});

test('si sigue prometiendo, como mucho 2 empujones', async t => {
  const { n, recibidos } = await montar(t, () => ({ role: 'assistant', content: 'Me encargo enseguida.' }));
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  await n.enviar(s, 'hazlo');
  assert.equal(recibidos.length, 3);
});

test('respuesta normal (sin promesa) no se empuja', async t => {
  const { n, recibidos } = await montar(t, () => ({ role: 'assistant', content: 'Son las 5 de la tarde.' }));
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  await n.enviar(s, 'qué hora es');
  assert.equal(recibidos.length, 1);
});
