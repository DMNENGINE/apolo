const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearNucleo } = require('../index');
const { iniciar } = require('../daemon');
async function montar(t, chat) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-upgrade-api-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ nacimiento: false, respaldoAuto: false, memoria: { embeddings: null }, skills: { rutas: [], reglasProyecto: false } }));
  const n = crearNucleo({ dir, embedder: null, sinPlugins: true });
  n.proveedores.registrarExterno('fixture', { chat });
  const d = await iniciar({ nucleo: n, puerto: 0, sinTareas: true, sinPlugins: true });
  t.after(() => { d.servidor.closeAllConnections(); d.servidor.close(); });
  const s = n.sesiones.crear({ modelo: 'fixture/m', cwd: dir });
  const base = `http://127.0.0.1:${d.puerto}/v1`, headers = { 'x-robot-token': d.token, 'content-type': 'application/json' };
  return { n, s, base, headers, post: (ruta, body) => fetch(base + ruta, { method: 'POST', headers, body: JSON.stringify(body) }) };
}
const r = texto => ({ texto, toolCalls: [], uso: { entrada: 1, salida: 1 } });
test('API upgrade: acepta mensajes en cola y expone ejecuciones por sesion', async t => {
  let entrar, liberar, n = 0; const entrada = new Promise(ok => { entrar = ok; }); const espera = new Promise(ok => { liberar = ok; });
  const m = await montar(t, async () => { if (!n++) { entrar(); await espera; } return r('respuesta'); });
  const a = m.post(`/sesiones/${m.s.id}/mensajes`, { texto: 'uno' }).then(x => x.text()); await entrada;
  const bRes = await m.post(`/sesiones/${m.s.id}/mensajes`, { texto: 'dos' }); assert.equal(bRes.status, 200); const b = bRes.text();
  liberar(); const [ta, tb] = await Promise.all([a, b]); assert.match(ta, /"estado":"completada"/); assert.match(tb, /encolado/);
  const runs = await (await fetch(`${m.base}/sesiones/${m.s.id}/ejecuciones`, { headers: m.headers })).json(); assert.equal(runs.length, 2);
});
test('API upgrade: correcciones autentificadas y cambios de limites se aplican', async t => {
  let entrar, liberar, n = 0; const entrada = new Promise(ok => { entrar = ok; }); const espera = new Promise(ok => { liberar = ok; });
  const m = await montar(t, async () => { if (!n++) { entrar(); await espera; } return r('respuesta'); });
  assert.equal((await fetch(`${m.base}/sesiones/${m.s.id}/corregir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"texto":"no"}' })).status, 401);
  const p = m.post(`/sesiones/${m.s.id}/mensajes`, { texto: 'inicia' }).then(x => x.text()); await entrada;
  const c = await (await m.post(`/sesiones/${m.s.id}/corregir`, { texto: 'conserva originales' })).json(); assert.ok(c.entrada);
  liberar(); await p; assert.ok(m.s.mensajes.some(x => x.content === 'conserva originales'));
  const res = await fetch(`${m.base}/config`, { method: 'PATCH', headers: m.headers, body: JSON.stringify({ cola: { max: 7 }, recuperacion: { reintentos: 1 } }) });
  assert.equal(res.status, 200); assert.equal(m.n.cfg.cola.max, 7); assert.equal(m.n.cfg.recuperacion.reintentos, 1);
});
