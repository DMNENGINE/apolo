const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const puente = require('../trading');
const { crearTrading, validarInicio } = require('../trading-autopiloto');
const seg = require('../seguridad');
const parametros = () => ({ modo: 'simulado', agentes: 2, capital: 1, meta: 100, mercados: ['cripto'], duracionMin: 60, perdidaMaxPct: 10 });
function carpeta(c = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-trading-'));
  const f = path.join(dir, 'skills/trader/_datos/trader.json'); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ url: 'https://central.invalid', ...c })); return { dir, f };
}
const json = x => new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json' } });
function mesa(t, opciones = {}) {
  const { dir, f } = carpeta(); let activo = false, equity = 1, tiempo = 1000, perderConexion = false, pararFalla = false, plan = {};
  const llamadas = [], auditoria = [], permisos = [];
  const n = { cfg: { dir }, bus: new EventEmitter(), panico: { activo: () => false }, auditoria: { registrar: x => auditoria.push(x) }, permisos: { pedirExterno: async x => { permisos.push(x); return { ok: true }; } } };
  const fetch = async (url, op) => {
    const ruta = new URL(url).pathname.split('/').pop(); llamadas.push({ ruta, ...op });
    assert.equal(op.redirect, 'error');
    if (perderConexion || (ruta === 'parar' && pararFalla)) throw new Error('sin red');
    if (ruta === 'iniciar') { activo = true; plan = JSON.parse(op.body); return json({ ok: true }); }
    if (ruta === 'parar') { activo = false; return json({ ok: true }); }
    return json({ modo: 'simulado', capacidades: ['dmn-guardia/1'], guardia: { estado: activo ? 'activo' : 'detenido', sesion: 'fixture', vence: (1000 + (plan.duracionMin || 60) * 60000) / 1000, perdidaMaxPct: plan.perdidaMaxPct, capitalInicial: plan.agentes * plan.capital }, total: { agentes: 2 }, nodos: [{ nodo: 'pi', local: true, kpis: { ...plan, activo, parada_confirmada: !activo }, agentes: [{ id: 1, equity }, { id: 2, equity }] }] });
  };
  const crear = () => crearTrading({ nucleo: n, fetch, ahora: () => tiempo, intervaloMs: 1000000, ...opciones });
  const a = crear(); t.after(() => a.cerrar());
  return { a, n, dir, f, crear, llamadas, auditoria, permisos, equity: x => { equity = x; }, tiempo: x => { tiempo = x; }, desconectar: () => { perderConexion = true; }, falloParada: () => { pararFalla = true; } };
}
test('trading: solo simulacion y limites completos y validos', () => {
  assert.equal(validarInicio(parametros()).modo, 'simulado');
  for (const cambio of [{ modo: 'real' }, { agentes: -1 }, { agentes: 1.2 }, { capital: -1 }, { mercados: ['otro'] }, { hasta: '25:00' }, { duracionMin: 0 }, { perdidaMaxPct: 0 }, { desconocido: true }]) assert.throws(() => validarInicio({ ...parametros(), ...cambio }));
});
test('trading: URL sin credenciales, consultas ni protocolos inseguros', () => {
  for (const url of ['file:///c:/x', 'https://u:clave@central.invalid', 'https://central.invalid?token=SECRETO', 'https://central.invalid/#x', 'http://publica.invalid']) {
    const { dir } = carpeta({ url }); assert.throws(() => puente.destino(dir), e => !e.message.includes('SECRETO'));
  }
  assert.equal(puente.destino(carpeta({ url: 'http://127.0.0.1:8777/' }).dir).url, 'http://127.0.0.1:8777');
});
test('trading: token registrado para redaccion y original protegido sin borrarlo', () => {
  const token = 'TOKEN_TRADING_FICTICIO_123456', { dir, f } = carpeta({ token }); const secretos = new Map();
  const boveda = { leer: k => secretos.get(k), guardar: (k, v) => secretos.set(k, v) };
  puente.destino(dir, { boveda }); assert.equal(secretos.get('trading:central'), token); assert.equal(JSON.parse(fs.readFileSync(f)).token, token);
  assert.equal(seg.redactar('clave ' + token), 'clave [REDACTADO]'); assert.ok(seg.rutaSensible(f, { dirNucleo: dir })); seg.olvidarSecreto(token);
});
test('trading: rechaza config corrupta y referencia de boveda ausente', () => {
  const { dir, f } = carpeta(); fs.writeFileSync(f, '{'); assert.throws(() => puente.destino(dir), /ilegible/);
  fs.writeFileSync(f, JSON.stringify({ tokenRef: 'boveda:trading:central' })); assert.throws(() => puente.destino(dir), /credencial/);
});
test('trading: las escrituras directas no eluden el controlador', async () => {
  await assert.rejects(puente.pedir(carpeta().dir, 'POST', ['iniciar'], parametros()), e => e.status === 403);
});
test('trading: JSON, esquema, tipos y tamano se verifican', async () => {
  const dir = carpeta().dir;
  for (const respuesta of [() => new Response('no JSON'), () => json({ ok: true }), () => json({ total: {}, nodos: [{ nodo: 'x', agentes: [], kpis: { activo: 'si' } }] }), () => new Response('x'.repeat(4 * 1024 * 1024 + 1))]) await assert.rejects(puente.pedir(dir, 'GET', ['mapa'], null, {}, { fetch: async () => respuesta() }));
  assert.throws(() => puente.validarRespuesta('mapa', { total: { agentes: '<b>' }, nodos: [] }), /numerico/);
  assert.doesNotThrow(() => puente.validarRespuesta('agente/1', { genoma: {}, intentos_lista: [], lecciones: [], trades: [{ id: 1 }] }));
});
test('trading: impacto de eventos macro es etiqueta; el de noticias sigue siendo numerico', () => {
  const mapa = analista => ({ total: {}, nodos: [], analista });
  assert.doesNotThrow(() => puente.validarRespuesta('mapa', mapa({ noticias: [{ impacto: -0.5 }], eventos: [{ impacto: 'High' }, { impacto: 'Medium' }] })));
  assert.throws(() => puente.validarRespuesta('mapa', mapa({ noticias: [{ impacto: 'High' }] })), /numerico/);
  assert.throws(() => puente.validarRespuesta('mapa', mapa({ eventos: [{ impacto: 'x'.repeat(41) }] })), /numerico/);
});
test('trading: no transmite secretos de errores remotos y rechaza consultas arbitrarias', async () => {
  const dir = carpeta().dir;
  await assert.rejects(puente.pedir(dir, 'GET', ['mapa'], null, {}, { fetch: async () => new Response('{"error":"CLAVE_SECRETA"}', { status: 500 }) }), e => !e.message.includes('CLAVE_SECRETA'));
  await assert.rejects(puente.pedir(dir, 'GET', ['noticias'], null, { url: 'x' }), /Consulta/);
});
test('trading: cierres pendientes conservan su causa sin confiar en texto remoto', async () => {
  await assert.rejects(puente.pedir(carpeta().dir, 'GET', ['mapa'], null, {}, { fetch: async () => new Response('{"codigo":"CIERRES_PENDIENTES","error":"SECRETO_REMOTO"}', { status: 409 }) }), e => e.code === 'CIERRES_PENDIENTES' && !e.message.includes('SECRETO_REMOTO'));
});
test('autopiloto: cierre pendiente no desencadena una segunda parada', async t => {
  const rutas = [];
  const m = mesa(t, { fetch: async (url) => {
    const ruta = new URL(url).pathname.split('/').pop(); rutas.push(ruta);
    if (ruta === 'iniciar') return new Response('{"codigo":"CIERRES_PENDIENTES"}', { status: 409 });
    return json({ modo: 'simulado', capacidades: ['dmn-guardia/1'], total: {}, nodos: [{ nodo: 'pi', local: true, kpis: { activo: false }, agentes: [] }] });
  } });
  await assert.rejects(m.a.iniciar(parametros()), e => e.code === 'CIERRES_PENDIENTES');
  assert.equal(m.a.estado().estado, 'esperando_cierres'); assert.ok(!rutas.includes('parar'));
});
test('autopiloto: denegacion y panico bloquean sin arrancar', async t => {
  const m = mesa(t); m.n.permisos.pedirExterno = async () => ({ ok: false });
  await assert.rejects(m.a.iniciar(parametros()), /autorizado/); assert.equal(m.llamadas.length, 0);
  m.n.panico.activo = () => true; await assert.rejects(m.a.iniciar(parametros()), /Panico/); assert.equal(m.llamadas.length, 0);
});
test('autopiloto: permiso vinculado a parametros y cambio de central revoca el arranque', async t => {
  const m = mesa(t);
  m.n.permisos.pedirExterno = async x => { assert.match(x.resumen, /perdidaMaxPct/); fs.writeFileSync(m.f, JSON.stringify({ url: 'https://otra.invalid' })); return { ok: true }; };
  await assert.rejects(m.a.iniciar(parametros()), /cambio/); assert.equal(m.llamadas.length, 0);
});
test('autopiloto: parametros aprobados no cambian por referencia ni se duplican', async t => {
  const m = mesa(t); let aprobar; const p = parametros();
  m.n.permisos.pedirExterno = () => new Promise(ok => { aprobar = ok; });
  const trabajo = m.a.iniciar(p); p.capital = 999;
  await assert.rejects(m.a.iniciar(parametros()), e => e.status === 409);
  aprobar({ ok: true }); await trabajo;
  assert.equal(JSON.parse(m.llamadas.find(x => x.ruta === 'iniciar').body).capital, 1);
  assert.equal(m.a.estado().estado, 'activo'); assert.ok(m.auditoria.some(x => x.decision === 'iniciar'));
});
test('autopiloto: duracion maxima para y verifica la central', async t => {
  const m = mesa(t); await m.a.iniciar(parametros()); m.tiempo(4000000); await m.a.vigilar();
  assert.equal(m.a.estado().estado, 'parado'); assert.equal(m.a.estado().confirmada, true); assert.equal(m.a.estado().motivo, 'duracion maxima');
});
test('autopiloto: perdida acumulada detiene el enjambre', async t => {
  const m = mesa(t); await m.a.iniciar(parametros()); m.equity(0.8); await m.a.vigilar(); assert.equal(m.a.estado().estado, 'parado'); assert.match(m.a.estado().motivo, /perdida/);
});
test('autopiloto: fallo de parada no se certifica ni permite otro arranque', async t => {
  const m = mesa(t); await m.a.iniciar(parametros()); m.falloParada(); await assert.rejects(m.a.parar());
  assert.equal(m.a.estado().estado, 'parada_no_confirmada'); assert.equal(m.a.estado().confirmada, false);
  await assert.rejects(m.a.iniciar(parametros()), e => e.status === 409);
});
test('autopiloto: reinicio recupera supervision sin reenviar iniciar', async t => {
  const m = mesa(t); await m.a.iniciar(parametros()); m.a.cerrar(); const nuevo = m.crear(); t.after(() => nuevo.cerrar());
  m.tiempo(4000000); await nuevo.vigilar(); assert.equal(nuevo.estado().estado, 'parado'); assert.equal(m.llamadas.filter(x => x.ruta === 'iniciar').length, 1);
});
test('autopiloto: panico detiene y una conexion perdida queda sin confirmar', async t => {
  const m = mesa(t); await m.a.iniciar(parametros()); m.desconectar(); m.n.bus.emit('panico');
  await new Promise(ok => setImmediate(ok)); assert.equal(m.a.estado().estado, 'parada_no_confirmada');
});
test('autopiloto: panico durante el permiso invalida la autorizacion', async t => {
  const m = mesa(t); m.n.permisos.pedirExterno = async () => { m.n.bus.emit('panico'); return { ok: true }; };
  await assert.rejects(m.a.iniciar(parametros()), /cambio/); assert.equal(m.llamadas.length, 0);
});
test('autopiloto: no certifica un plan remoto diferente ni repite el arranque', async t => {
  let activo = false; const rutas = [];
  const m = mesa(t, { fetch: async (url, op) => {
    const ruta = new URL(url).pathname.split('/').pop(); rutas.push(ruta);
    if (ruta === 'iniciar') activo = true; if (ruta === 'parar') activo = false;
    return json(ruta === 'mapa' ? { modo: 'simulado', capacidades: ['dmn-guardia/1'], total: {}, nodos: [{ nodo: 'pi', local: true, kpis: { activo, parada_confirmada: !activo, capital: 999, meta: 100, mercados: ['cripto'] }, agentes: [{ id: 1, equity: 1 }, { id: 2, equity: 1 }] }] } : { ok: true });
  } });
  await assert.rejects(m.a.iniciar(parametros()), /plan/); assert.equal(rutas.filter(x => x === 'iniciar').length, 1);
  assert.equal(m.a.estado().estado, 'parado');
});
test('autopiloto: panico sin ejecuciones ni observaciones no contacta servicios externos', async t => {
  const m = mesa(t); m.n.bus.emit('panico'); await new Promise(ok => setImmediate(ok)); assert.equal(m.llamadas.length, 0);
});
test('autopiloto: cambiar la URL nunca envia un token nuevo a la central anterior', async t => {
  const m = mesa(t); await m.a.iniciar(parametros()); const previas = m.llamadas.length;
  fs.writeFileSync(m.f, JSON.stringify({ url: 'https://nueva.invalid', token: 'TOKEN_FICTICIO_NUEVO_1234' }));
  await assert.rejects(m.a.parar(), /central/); assert.equal(m.llamadas.length, previas); assert.equal(m.a.estado().estado, 'parada_no_confirmada');
  seg.olvidarSecreto('TOKEN_FICTICIO_NUEVO_1234');
});
