// Modo Gamer (Etapa J): SIEMPRE con un `so` FALSO. Nada de este archivo toca el PC de verdad.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearGamer, LISTA_NEGRA } = require('../gamer');
const { crearLimpieza } = require('../gamer/limpieza');
const { crearRevision } = require('../gamer/revision');

const GUID = { eq: '381b4222-f694-41f0-9685-ff5bb260df2e', alto: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' };
function soFalso(extra = {}) {
  const llamadas = [];
  const st = { plan: GUID.eq, toast: null, prio: { 500: 'Normal' }, suspendidos: new Set() };
  const so = {
    llamadas, st,
    gamerPlanes: async () => [{ guid: GUID.eq, nombre: 'Equilibrado', activo: st.plan === GUID.eq }, { guid: GUID.alto, nombre: 'Alto rendimiento', activo: st.plan === GUID.alto }],
    gamerPonerPlan: async g => { llamadas.push(['plan', g]); st.plan = g; },
    gamerProcesos: async () => [{ nombre: 'juego.exe', pid: 500 }, { nombre: 'OneDrive.exe', pid: 600 }, { nombre: 'explorer.exe', pid: 4 }, { nombre: 'svchost.exe', pid: 8 }, { nombre: 'electron.exe', pid: 9 }],
    gamerSuspender: async pid => { llamadas.push(['suspender', pid]); st.suspendidos.add(pid); },
    gamerReanudar: async pid => { llamadas.push(['reanudar', pid]); st.suspendidos.delete(pid); },
    gamerCerrar: async pid => { llamadas.push(['cerrar', pid]); },
    gamerPrioridad: async pid => st.prio[pid] || 'Normal',
    gamerPonerPrioridad: async (pid, c) => { llamadas.push(['prioridad', pid, c]); st.prio[pid] = c; },
    gamerNoMolestar: async () => st.toast,
    gamerPonerNoMolestar: async v => { llamadas.push(['toast', v]); st.toast = v; },
    gamerLeerRegistro: async () => null,
    gamerMonitores: async () => [{ nombre: 'Falso', ancho: 2560, alto: 1440, actualHz: 60, maxHz: 144 }],
    gamerInicio: async () => [{ nombre: 'Steam', comando: 'steam.exe', origen: 'HKCU' }],
    ...extra,
  };
  return so;
}
function montar(t, { gamer = { cerrar: ['OneDrive.exe', 'explorer.exe', 'svchost'] }, so = soFalso(), dir } = {}) {
  dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-gamer-'));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
  const bus = new EventEmitter(), eventos = [];
  bus.on('evento', e => eventos.push(e));
  const cfg = { dir, gamer };
  return { G: crearGamer({ cfg, bus, so, propios: [], entorno: { TEMP: path.join(dir, 'temp-falso') } }), so, bus, eventos, dir, cfg };
}

test('activar apunta cada cambio en sesion.json y hace solo lo permitido', async t => {
  const { G, so, eventos, dir } = montar(t);
  const e = await G.activar('juego.exe');
  assert.strictEqual(e.activo, true);
  const ses = JSON.parse(fs.readFileSync(path.join(dir, 'gamer', 'sesion.json'), 'utf8'));
  assert.deepStrictEqual(ses.cambios.map(c => c.tipo), ['plan', 'noMolestar', 'pausar', 'prioridad', 'apolo']);
  assert.ok(ses.cambios.every(c => c.estado === 'hecho'));
  assert.deepStrictEqual(ses.cambios[0].antes, { guid: GUID.eq, nombre: 'Equilibrado' });
  assert.strictEqual(so.st.plan, GUID.alto);
  assert.deepStrictEqual([...so.st.suspendidos], [600]);              // solo OneDrive: explorer/svchost en lista negra
  assert.strictEqual(so.st.prio[500], 'High');
  assert.ok(!so.llamadas.some(l => l[2] === 'RealTime'));
  assert.deepStrictEqual(eventos.at(-1), { tipo: 'gamer', activo: true, juego: 'juego.exe' });
  assert.strictEqual((await G.activar('otro')).juego, 'juego.exe');     // ya activo: no repite
});

test('desactivar restaura en orden inverso y borra la sesión', async t => {
  const { G, so, eventos, dir } = montar(t);
  await G.activar('juego.exe');
  so.llamadas.length = 0;
  const r = await G.desactivar();
  assert.strictEqual(r.deshechos, 5);
  assert.deepStrictEqual(so.llamadas, [['prioridad', 500, 'Normal'], ['reanudar', 600], ['toast', null], ['plan', GUID.eq]]);
  assert.deepStrictEqual(eventos.at(-1), { tipo: 'gamer', activo: false, juego: 'juego.exe' });
  assert.strictEqual(so.st.plan, GUID.eq); assert.strictEqual(so.st.toast, null); assert.strictEqual(so.st.suspendidos.size, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'gamer', 'sesion.json')));
  assert.strictEqual(G.ultima().activo, false);
  assert.strictEqual(G.estado().activo, false);
});

test('restaurarPendiente deshace una sesión que quedó a medias', async t => {
  const so = soFalso();
  let corte = 0;
  so.gamerSuspender = async () => { if (++corte) throw new Error('la app se cerró aquí'); };
  const a = montar(t, { so });
  // simula el cierre: plan hecho, pausa "pendiente" (apuntada pero sin confirmar) y la app muere
  await a.G.activar('juego.exe');
  const f = path.join(a.dir, 'gamer', 'sesion.json');
  const ses = JSON.parse(fs.readFileSync(f, 'utf8'));
  ses.cambios = ses.cambios.slice(0, 3); ses.cambios[2].estado = 'pendiente';
  fs.writeFileSync(f, JSON.stringify(ses));
  // "reinicio": un gamer nuevo sobre la misma carpeta
  so.gamerSuspender = async pid => { so.st.suspendidos.add(pid); };
  so.llamadas.length = 0;
  const b = montar(t, { so, dir: a.dir });
  const r = await b.G.restaurarPendiente();
  assert.strictEqual(r.deshechos, 3);
  assert.deepStrictEqual(so.llamadas, [['reanudar', 600], ['toast', null], ['plan', GUID.eq]]);
  assert.ok(!fs.existsSync(f));
  assert.strictEqual(await b.G.restaurarPendiente(), null);            // ya no queda nada
});

test('lista negra: nunca se pausan ni priorizan procesos del sistema ni APOLO', async t => {
  for (const n of ['explorer', 'csrss', 'winlogon', 'svchost', 'lsass', 'msmpeng', 'dwm', 'electron']) assert.ok(LISTA_NEGRA.has(n), n);
  const { G, so } = montar(t, { gamer: { cerrar: ['explorer.exe', 'svchost.exe', 'electron.exe', 'MsMpEng'] } });
  await G.activar('explorer.exe');
  assert.ok(!so.llamadas.some(l => l[0] === 'suspender' || l[0] === 'cerrar' || l[0] === 'prioridad'));
  // configurar tampoco deja meterlos en la lista
  assert.deepStrictEqual(G.configurar({ cerrar: ['explorer.exe', 'Discord.exe', 'dwm'] }).cerrar, ['Discord.exe']);
});

test('modo cerrar pide confirmación y sin ella no cierra; cerrar no se "deshace"', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-gamer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const so = soFalso(), pedidos = [];
  for (const ok of [false, true]) {
    so.llamadas.length = 0;
    const G = crearGamer({ cfg: { dir, gamer: { cerrar: ['OneDrive.exe'], modo: 'cerrar', acciones: { plan: false, noMolestar: false, prioridad: false, apolo: false } } }, so, propios: [],
      permisos: { pedirExterno: async r => { pedidos.push(r.resumen); return { ok }; } } });
    const e = await G.activar();
    assert.strictEqual(e.cambios[0].estado, ok ? 'hecho' : 'error');
    assert.strictEqual(so.llamadas.some(l => l[0] === 'cerrar'), ok);
    await G.desactivar();
    assert.ok(!so.llamadas.some(l => l[0] === 'reanudar'));
  }
  assert.match(pedidos[0], /cerrar OneDrive/);
});

test('limpieza: analiza tamaños y borra SOLO lo elegido', async t => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'gamer-limp-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const env = { TEMP: path.join(raiz, 'Temp'), LOCALAPPDATA: path.join(raiz, 'Local') };
  const d3d = path.join(env.LOCALAPPDATA, 'D3DSCache'), nv = path.join(env.LOCALAPPDATA, 'NVIDIA', 'DXCache');
  for (const d of [env.TEMP, path.join(d3d, 'sub'), nv]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(env.TEMP, 'a.tmp'), 'x'.repeat(100));
  fs.writeFileSync(path.join(d3d, 'sub', 'b.bin'), 'y'.repeat(300));
  fs.writeFileSync(path.join(nv, 'c.bin'), 'z'.repeat(50));
  const L = crearLimpieza({ entorno: env });
  const z = Object.fromEntries((await L.analizar()).map(x => [x.id, x]));
  assert.strictEqual(z.temp.bytes, 100); assert.strictEqual(z.d3d.bytes, 300); assert.strictEqual(z['nv-dx'].bytes, 50);
  assert.strictEqual(z['amd-dx'].existe, false);
  const r = await L.limpiar(['d3d', 'inventado']);
  assert.strictEqual(r.liberados, 300); assert.strictEqual(r.borrados, 1);
  assert.ok(fs.existsSync(d3d));                                        // la carpeta raíz se queda
  assert.ok(!fs.existsSync(path.join(d3d, 'sub')));
  assert.ok(fs.existsSync(path.join(env.TEMP, 'a.tmp')) && fs.existsSync(path.join(nv, 'c.bin')));   // lo no elegido, intacto
});

test('revisión: detecta 60 Hz en un monitor de 144 Hz, HAGS y modo juego apagados', async t => {
  const reg = { HwSchMode: 1, AutoGameModeEnabled: 0 };
  const so = soFalso({ gamerLeerRegistro: async (c, v) => reg[v] ?? null });
  const r = await crearRevision({ so }).revisar();
  assert.match(r.monitores[0].aviso, /admite 144 Hz y está a 60/);
  assert.strictEqual(r.hags.activo, false); assert.strictEqual(r.modoJuego.activo, false);
  assert.strictEqual(r.avisos.length, 3);
  assert.deepStrictEqual(r.inicio.map(i => i.nombre), ['Steam']);
  // bien puesto → sin avisos; un fallo de lectura no rompe la revisión
  const ok = await crearRevision({ so: soFalso({ gamerMonitores: async () => [{ nombre: 'M', ancho: 1920, alto: 1080, actualHz: 144, maxHz: 144 }], gamerLeerRegistro: async (c, v) => (v === 'HwSchMode' ? 2 : null), gamerInicio: async () => { throw new Error('sin permiso'); } }) }).revisar();
  assert.deepStrictEqual(ok.avisos, []); assert.strictEqual(ok.hags.activo, true); assert.strictEqual(ok.errores.inicio, 'sin permiso');
});

test('API /v1/gamer y herramientas del agente', async t => {
  const { G, cfg } = montar(t);
  const g = await G.http('GET', ['v1', 'gamer'], {}, {});
  assert.strictEqual(g.estado.activo, false); assert.ok(g.revision.avisos.length >= 1);
  assert.strictEqual((await G.http('POST', ['v1', 'gamer', 'activar'], { juego: 'juego.exe' })).activo, true);
  await assert.rejects(G.http('POST', ['v1', 'gamer', 'limpieza'], { ids: ['temp'] }), /nunca durante la partida/);
  assert.strictEqual((await G.http('POST', ['v1', 'gamer', 'desactivar'])).activo, false);
  await assert.rejects(G.http('GET', ['v1', 'gamer', 'nada']), /ruta/);
  const { porNombre } = require('../herramientas');
  assert.strictEqual(porNombre.modo_gamer.riesgo({ activar: true }), 'ejecucion');
  assert.strictEqual(porNombre.modo_gamer.riesgo({ activar: false }), 'lectura');
  assert.strictEqual(porNombre.gamer_revisar.riesgo, 'lectura'); assert.strictEqual(porNombre.gamer_limpiar.riesgo, 'escritura');
  assert.match(await porNombre.modo_gamer.ejecutar({ activar: true, juego: 'juego.exe' }, { cfg }), /Modo Gamer ACTIVO \(juego\.exe\)/);
  assert.match(await porNombre.gamer_limpiar.ejecutar({ ids: ['temp'] }, { cfg }), /nunca durante la partida/);
  assert.match(await porNombre.modo_gamer.ejecutar({ activar: false }, { cfg }), /5 cambios deshechos/);
  assert.match(await porNombre.gamer_revisar.ejecutar({}, { cfg }), /admite 144 Hz/);
});
