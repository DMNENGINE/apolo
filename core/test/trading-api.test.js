const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearNucleo } = require('../index');
const { iniciar } = require('../daemon');
async function montar(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-trading-api-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ nacimiento: false, memoria: { embeddings: null }, skills: { rutas: [], reglasProyecto: false } }));
  let activo = false, plan = {}; const llamadas = [];
  const n = crearNucleo({ dir, sinPlugins: true, embedder: null, fetchTrading: async (u, o) => {
    const ruta = new URL(u).pathname.split('/').pop(); llamadas.push(ruta);
    if (ruta === 'iniciar') { activo = true; plan = JSON.parse(o.body); }
    if (ruta === 'parar') activo = false;
    return new Response(JSON.stringify(ruta === 'mapa' ? { modo: 'simulado', capacidades: ['dmn-guardia/1'], guardia: { estado: 'activo', sesion: 'fixture', vence: Date.now() / 1000 + 3600, perdidaMaxPct: plan.perdidaMaxPct, capitalInicial: 1 }, total: { agentes: 1 }, nodos: [{ nodo: 'fixture', local: true, agentes: [{ id: 1, equity: 1 }], kpis: { ...plan, activo, parada_confirmada: !activo } }] } : { ok: true }));
  } });
  const d = await iniciar({ nucleo: n, puerto: 0, sinTareas: true, sinPlugins: true });
  t.after(() => { n.trading.cerrar(); d.servidor.closeAllConnections(); d.servidor.close(); });
  const base = `http://127.0.0.1:${d.puerto}/v1/trading`, headers = { 'x-robot-token': d.token, 'content-type': 'application/json' };
  return { n, llamadas, base, headers, post: (ruta, b) => fetch(base + '/' + ruta, { method: 'POST', headers, body: JSON.stringify(b) }) };
}
const params = { modo: 'simulado', agentes: 1, capital: 1, meta: 100, mercados: ['cripto'], duracionMin: 60, perdidaMaxPct: 10 };
test('trading API: autenticacion, contrato, permiso y parada confirmada', async t => {
  const m = await montar(t);
  assert.equal((await fetch(m.base + '/mapa')).status, 401);
  const mapa = await (await fetch(m.base + '/mapa', { headers: m.headers })).json(); assert.equal(mapa._autopiloto.contrato, 'apolo-trading/1');
  const permiso = new Promise(ok => m.n.bus.once('permiso', ok));
  const trabajo = m.post('iniciar', params); const p = await permiso;
  assert.equal(p.origen, 'trading'); assert.equal(m.llamadas.filter(x => x === 'iniciar').length, 0);
  m.n.permisos.resolver(p.id, 'allow', 'prueba', 'fixture');
  const r = await trabajo; assert.equal(r.status, 200); assert.equal((await r.json()).estado, 'activo');
  const parada = await m.post('parar', {}); assert.equal((await parada.json()).confirmada, true);
  assert.equal(m.n.auditoria.verificar().ok, true);
});
test('trading API: modo real y panico no alcanzan el arranque remoto', async t => {
  const m = await montar(t);
  assert.equal((await m.post('iniciar', { ...params, modo: 'real' })).status, 400);
  m.n.panico.activar('fixture'); assert.equal((await m.post('iniciar', params)).status, 403);
  assert.equal(m.llamadas.filter(x => x === 'iniciar').length, 0);
  assert.equal((await m.post('parar', {})).status, 200, 'parar sigue disponible durante el panico');
});
