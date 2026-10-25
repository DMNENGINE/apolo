// Paquete dmn-trader: destino del motor local y piloto con DINERO REAL (solo se autoriza, se limita y se pausa desde el núcleo).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const puente = require('../trading');
const { crearTrading } = require('../trading-autopiloto');
const seg = require('../seguridad');

const json = x => new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json' } });
const TOKEN = 'token-ficticio-del-paquete-1234567890';
function motor(t, { aplicaOtro = false, permiso = true, panico = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-real-'));
  fs.mkdirSync(path.join(dir, 'plugins-datos', 'dmn-trader'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins-datos', 'dmn-trader', 'destino.json'), JSON.stringify({ url: 'http://127.0.0.1:61000', pid: 1 }));
  let cfg = { activo: false, por_op_sol: 0.01, perdida_max_sol: 0.008, max_ops_dia: 6, reserva_sol: 0.005 };
  const llamadas = [], permisos = [], auditoria = [];
  const n = { cfg: { dir, boveda: { leer: k => (k === 'plugin:dmn-trader:token' ? TOKEN : null) } }, bus: new EventEmitter(), panico: { activo: () => panico },
    auditoria: { registrar: x => auditoria.push(x) }, permisos: { pedirExterno: async x => { permisos.push(x); return { ok: permiso }; } } };
  const fetch = async (url, op) => {
    const u = new URL(url); llamadas.push({ ruta: u.pathname, metodo: op.method, token: op.headers['x-token'] });
    if (u.pathname === '/api/piloto/config') { const b = JSON.parse(op.body); cfg = { ...cfg, ...b, ...(aplicaOtro && b.activo ? { por_op_sol: 0.1 } : {}) }; return json(cfg); }
    if (u.pathname === '/api/piloto') return json({ cfg, saldo: 0.02, saldo_inicio: 0.02, error: 'GMGN: límite de peticiones', ops: [], log: [] });
    return json({ modo: 'simulado', capacidades: ['dmn-guardia/1'], total: {}, nodos: [] });
  };
  const a = crearTrading({ nucleo: n, fetch, intervaloMs: 1e9 }); t.after(() => { a.cerrar(); seg.olvidarSecreto(TOKEN); });
  return { a, n, llamadas, permisos, auditoria, cfg: () => cfg };
}
const limites = { por_op_sol: 0.02, perdida_max_sol: 0.01, max_ops_dia: 3, reserva_sol: 0.005 };

test('destino: el motor del paquete (destino.json + token en la bóveda) tiene prioridad', t => {
  const m = motor(t);
  assert.deepEqual(puente.destino(m.n.cfg.dir, { boveda: m.n.cfg.boveda }), { url: 'http://127.0.0.1:61000', token: TOKEN, paquete: true });
  fs.writeFileSync(path.join(m.n.cfg.dir, 'plugins-datos', 'dmn-trader', 'destino.json'), JSON.stringify({ url: 'http://evil.invalid:1' }));
  assert.notEqual(puente.destino(m.n.cfg.dir, { boveda: m.n.cfg.boveda }).paquete, true, 'solo 127.0.0.1');
});

test('real: el estado acepta el aviso "error" del bucle y va a /api/piloto con el token', async t => {
  const m = motor(t); const r = await m.a.realEstado();
  assert.equal(r.activo, false); assert.equal(r.aviso, 'GMGN: límite de peticiones'); assert.deepEqual(m.llamadas.map(x => x.ruta), ['/api/piloto']);
  assert.equal(m.llamadas[0].token, TOKEN);
  await assert.rejects(m.a.http('GET', ['', 'trading', 'piloto'], null), /\/v1\/trading\/real/);
});

test('real: activar exige frase exacta, límites válidos, sin pánico y aprobación explícita; luego verifica lo aplicado', async t => {
  const m = motor(t);
  await assert.rejects(m.a.realConfig({ activo: true, limites, confirmacion: 'activo dinero real' }), /ACTIVO DINERO REAL/);
  await assert.rejects(m.a.realConfig({ activo: true, limites: { ...limites, por_op_sol: 5 }, confirmacion: 'ACTIVO DINERO REAL' }), /por_op_sol/);
  await assert.rejects(m.a.realConfig({ activo: true, limites: { ...limites, max_ops_dia: 2.5 }, confirmacion: 'ACTIVO DINERO REAL' }), /max_ops_dia/);
  assert.equal(m.permisos.length, 0); assert.equal(m.llamadas.length, 0, 'nada llega al motor sin pasar las validaciones');
  const r = await m.a.realConfig({ activo: true, limites, confirmacion: 'ACTIVO DINERO REAL' });
  assert.equal(r.activo, true); assert.deepEqual(r.limites, limites);
  assert.equal(m.permisos.length, 1); assert.equal(m.permisos[0].peligro, 'DINERO REAL'); assert.match(m.permisos[0].resumen, /0\.02 SOL por operación/);
  assert.ok(m.auditoria.some(x => x.decision === 'real-activar' && x.resultado === 'ok'));
});

test('real: sin aprobación o con pánico no se activa; si el motor aplica otros límites, se pausa', async t => {
  const sin = motor(t, { permiso: false });
  await assert.rejects(sin.a.realConfig({ activo: true, limites, confirmacion: 'ACTIVO DINERO REAL' }), /no autorizada/);
  assert.equal(sin.cfg().activo, false);
  const pan = motor(t, { panico: true });
  await assert.rejects(pan.a.realConfig({ activo: true, limites, confirmacion: 'ACTIVO DINERO REAL' }), /Panico/); assert.equal(pan.permisos.length, 0);
  const otro = motor(t, { aplicaOtro: true });
  await assert.rejects(otro.a.realConfig({ activo: true, limites, confirmacion: 'ACTIVO DINERO REAL' }), /no aplicó exactamente/);
  assert.equal(otro.cfg().activo, false, 'queda en pausa');
});

test('real: pausar no pide permiso; el pánico pausa el real si el motor del paquete corre aquí', async t => {
  const m = motor(t); await m.a.realConfig({ activo: true, limites, confirmacion: 'ACTIVO DINERO REAL' });
  const permisosAntes = m.permisos.length; await m.a.realConfig({ activo: false });
  assert.equal(m.cfg().activo, false); assert.equal(m.permisos.length, permisosAntes);
  await m.a.realConfig({ activo: true, limites, confirmacion: 'ACTIVO DINERO REAL' }); assert.equal(m.cfg().activo, true);
  m.n.bus.emit('panico'); await new Promise(ok => setTimeout(ok, 20));
  assert.equal(m.cfg().activo, false); assert.ok(m.auditoria.some(x => x.decision === 'real-pausar' && /panico/.test(x.resumen)));
});
