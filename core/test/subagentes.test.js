// Subagentes: delegar en paralelo, sin recursión, registro para el Mission Control y cancelación en cascada.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const delegar = (id, nombre, tarea) => ({ id, type: 'function', function: { name: 'delegar', arguments: JSON.stringify({ nombre, tarea }) } });

// el padre pide dos subagentes a la vez; cada hijo tarda `espera` ms y contesta con un informe
async function servidor(t, { espera = 300, hijoTrabajaPara = null } = {}) {
  const recibidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', async () => {
      const j = JSON.parse(b); recibidos.push(j);
      const primero = j.messages.find(m => m.role === 'user')?.content || '';
      let msg;
      if (/Eres un SUBAGENTE/.test(primero)) {
        await new Promise(ok => setTimeout(ok, hijoTrabajaPara || espera));
        msg = { role: 'assistant', content: `informe: ${primero.split('TAREA:\n')[1]}` };
      } else if (!j.messages.some(m => m.role === 'tool')) {
        msg = { role: 'assistant', content: null, tool_calls: [delegar('d1', 'logs', 'revisa los logs'), delegar('d2', 'discos', 'mira el disco')] };
      } else msg = { role: 'assistant', content: 'todo revisado' };
      if (res.destroyed) return;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
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

test('delegar: dos subagentes en paralelo, informes en orden y el padre responde', async t => {
  const { n, recibidos } = await servidor(t, { espera: 600 });   // en serie serían ≥ 1200 ms: margen amplio aunque la máquina vaya cargada
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  const t0 = Date.now();
  const final = await n.enviar(s, 'revisa el sistema');
  const ms = Date.now() - t0;
  assert.strictEqual(final, 'todo revisado');
  assert.ok(ms < 1000, `tardó ${ms} ms: no fueron en paralelo`);
  const tools = s.mensajes.filter(m => m.role === 'tool');
  assert.deepStrictEqual(tools.map(m => m.toolCallId), ['d1', 'd2']);
  assert.match(tools[0].content, /subagente "logs" terminó[\s\S]*informe: revisa los logs/);
  assert.match(tools[1].content, /informe: mira el disco/);
  // los hijos son sesiones con padre y NO reciben la herramienta delegar
  const hijos = n.sesiones.lista().filter(x => x.padre === s.id);
  assert.strictEqual(hijos.length, 2);
  const pedidosHijos = recibidos.filter(j => /Eres un SUBAGENTE/.test(j.messages.find(m => m.role === 'user')?.content || ''));
  assert.ok(pedidosHijos.every(j => !(j.tools || []).some(x => x.function.name === 'delegar')));
  assert.ok(recibidos[0].tools.some(x => x.function.name === 'delegar'));
  // Mission Control: el padre y los dos hijos, todos terminados
  await new Promise(ok => setTimeout(ok, 300));
  const l = n.subagentes.lista();
  assert.strictEqual(l.length, 3);
  assert.ok(l.every(r => r.estado === 'listo'));
  assert.deepStrictEqual(l.filter(r => r.padre === s.id).map(r => r.nombre).sort(), ['discos', 'logs']);
});

test('un subagente no puede delegar y el máximo simultáneo se respeta', async t => {
  const { n } = await servidor(t);
  const padre = n.sesiones.crear({ cwd: os.tmpdir() });
  const hijo = n.sesiones.crear({ cwd: os.tmpdir(), padre: padre.id });
  await assert.rejects(n.subagentes.lanzar({ padre: hijo, tarea: 'x' }), /no puede delegar/);
  n.cfg.subagentes = { max: 1 };
  const uno = n.subagentes.lanzar({ padre, tarea: 'primero', nombre: 'a' });
  await new Promise(ok => setTimeout(ok, 50));
  await assert.rejects(n.subagentes.lanzar({ padre, tarea: 'segundo', nombre: 'b' }), /máximo 1/);
  assert.strictEqual((await uno).ok, true);
});

test('cancelar al padre cancela a sus subagentes', async t => {
  const { n } = await servidor(t, { hijoTrabajaPara: 5000 });
  const s = n.sesiones.crear({ cwd: os.tmpdir() });
  const p = n.enviar(s, 'revisa el sistema').catch(e => e);
  await new Promise(ok => setTimeout(ok, 300));
  assert.strictEqual(n.subagentes.lista().filter(r => r.padre === s.id && r.estado === 'trabajando').length, 2);
  n.agente.cancelar(s.id);
  const r = await p;
  assert.match(String(r.message || r), /cancelad/);
  await new Promise(ok => setTimeout(ok, 300));
  assert.ok(n.subagentes.lista().filter(x => x.padre === s.id).every(x => x.estado !== 'trabajando'));
});
