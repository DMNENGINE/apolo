// Modo Gamer fase 2 (medir de verdad): TODO con datos falsos. Ni PresentMon real, ni nvidia-smi real, ni tocar el PC.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { parsearCSV, metricas, fpsVivo, texto, crearPresentMon } = require('../gamer/presentmon');
const { parsearNvidiaSmi, parsearCpu, razones, resumir } = require('../gamer/sensores');
const { crearGamer, HERRAMIENTAS } = require('../gamer');

const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-gamer2-')); t.after(() => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }); return d; };
const dormir = ms => new Promise(ok => setTimeout(ok, ms));

// 1.x: msBetweenPresents, \r\n · 2.x: BOM, comillas, FrameTime
function csvV1(fts, { pid = 500, swap = '0x0000021A' } = {}) {
  return 'Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,Dropped,TimeInSeconds,msInPresentAPI,msBetweenPresents,msBetweenDisplayChange\r\n' +
    fts.map((f, i) => `juego.exe,${pid},${swap},DXGI,0,0,1,Hardware: Independent Flip,0,${(i / 100).toFixed(4)},0.10,${f},${f}`).join('\r\n') + '\r\n';
}
function csvV2(fts, { pid = 500 } = {}) {
  return '﻿Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,GPULatency,GPUTime,GPUBusy,GPUWait,DisplayLatency,DisplayedTime\n' +
    fts.map((f, i) => `"juego.exe",${pid},0x00000AAA,DXGI,0,0,1,"Composed: Flip",Application,${i * 10},${f},1,2,3,4,5,6,7,${f}`).join('\n') + '\n';
}
// 1000 frames: 980 a 10 ms, 15 a 20 ms, 5 a 40 ms (fácil de comprobar a mano)
const FTS = [...Array(980).fill(10), ...Array(15).fill(20), ...Array(5).fill(40)];

test('CSV de PresentMon 1.x y 2.x → mismas métricas correctas', () => {
  const a = parsearCSV(csvV1(FTS)), b = parsearCSV(csvV2(FTS));
  assert.strictEqual(a.columna, 'msbetweenpresents');
  assert.strictEqual(b.columna, 'frametime');
  assert.deepStrictEqual(b.aplicaciones, ['juego.exe']);
  const m = metricas(a.filas.map(f => f.ft));
  assert.deepStrictEqual(metricas(b.filas.map(f => f.ft)), m);
  assert.strictEqual(m.frames, 1000); assert.strictEqual(m.segundos, 10.3);
  assert.strictEqual(m.ftMedio, 10.3); assert.strictEqual(m.fps, 97.1);          // 10 300 ms / 1000 frames
  assert.strictEqual(m.low1, 33.3);                                                 // 10 más lentos: 5×40 + 5×20 → 30 ms
  assert.strictEqual(m.low01, 25);                                                  // el más lento: 40 ms
  assert.strictEqual(m.ftP99, 20);
  assert.strictEqual(m.tirones, 0.5);                                               // > 2×10,3 ms: solo los 5 de 40 ms
  assert.deepStrictEqual(metricas([]).fps, null);
});

test('CSV robusto: NA, línea a medias, otro pid, varias swapchains, solo MsBetweenDisplayChange, basura', () => {
  let txt = csvV2([10, 10, 10]).replace(/,10,1,2,3/, ',NA,1,2,3') + '"juego.exe",500,0x00000AAA,DXGI';   // un NA + línea cortada
  assert.strictEqual(parsearCSV(txt).filas.length, 2);
  txt = csvV1([10, 10]) + csvV1([16, 16], { pid: 777 }).split('\r\n').slice(1).join('\r\n');
  assert.deepStrictEqual(parsearCSV(txt, { pid: 500 }).filas.map(f => f.ft), [10, 10]);
  txt = csvV1([5, 5, 5]) + csvV1([16, 16, 16, 16], { swap: '0xBEEF' }).split('\r\n').slice(1).join('\r\n');   // overlay vs juego
  assert.deepStrictEqual(parsearCSV(txt).filas.map(f => f.ft), [16, 16, 16, 16]);
  const solo = 'Application,ProcessID,MsBetweenDisplayChange\njuego.exe,1,8\njuego.exe,1,8\n';
  assert.strictEqual(parsearCSV(solo).columna, 'msbetweendisplaychange');
  assert.deepStrictEqual(parsearCSV('error: access denied').filas, []);
  assert.strictEqual(fpsVivo([...Array(200).fill(10)]), 100);
  assert.strictEqual(texto(Buffer.from('﻿error: access denied', 'utf16le')), 'error: access denied');
});

test('nvidia-smi y CPU (WMI) falsos → sensores + alerta de thermal throttling', () => {
  const g = parsearNvidiaSmi('NVIDIA GeForce RTX 5060, 37, 6, 1185, 3090, 21.87, 145.00, 0x0000000000000400\r\n');
  assert.deepStrictEqual(g[0], { nombre: 'NVIDIA GeForce RTX 5060', temp: 37, uso: 6, reloj: 1185, relojMax: 3090, potencia: 21.87, limite: 145, razones: ['otro (0x400)'], throttleTermico: false, throttlePotencia: false });
  assert.deepStrictEqual(razones('0x0000000000000044'), { mascara: 0x44, lista: ['límite de potencia (SW)', 'térmico (HW)'], termico: true, potencia: true });
  assert.deepStrictEqual(parsearNvidiaSmi('NVIDIA-SMI has failed'), []);
  const c = parsearCpu('{"cpu":{"PercentProcessorUtility":85,"PercentofMaximumFrequency":55,"ProcessorFrequency":2000},"zonas":[{"HighPrecisionTemperature":3531,"PercentPassiveLimit":100},{"HighPrecisionTemperature":3010,"PercentPassiveLimit":100}]}');
  assert.deepStrictEqual(c, { uso: 85, frecPct: 55, frecMHz: 2000, zonaTemp: 80, limitePasivo: 100 });
  const caliente = { gpu: { nombre: 'X', temp: 90, uso: 99, reloj: 1500, relojMax: 3000, potencia: 140, limite: 145, throttleTermico: true }, cpu: c };
  const r = resumir([{ gpu: { ...caliente.gpu, temp: 80, throttleTermico: false }, cpu: c }, caliente]);
  assert.strictEqual(r.gpu.tempMax, 90); assert.strictEqual(r.gpu.tempMedia, 85); assert.strictEqual(r.gpu.throttleTermico, 1);
  assert.strictEqual(r.alertas.length, 2);
  assert.match(r.alertas[0], /90 °C.*bajando reloj/);
  assert.match(r.alertas[1], /55 %/);
  assert.deepStrictEqual(resumir([{ gpu: { temp: 60, uso: 50 }, cpu: { uso: 30, frecPct: 99, limitePasivo: 100 } }]).alertas, []);
});

// proceso falso de PresentMon: escribe el CSV en --output_file y sale con el código pedido
function lanzarFalso({ csv = '', codigo = 0, stderr = null } = {}) {
  const llamadas = [];
  const fn = (bin, args) => {
    llamadas.push([bin, args]);
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => { };
    setImmediate(() => {
      if (csv) fs.writeFileSync(args[args.indexOf('--output_file') + 1], csv);
      if (stderr) p.stderr.emit('data', stderr);
      p.emit('exit', codigo);
    });
    return p;
  };
  fn.llamadas = llamadas; return fn;
}

test('PresentMon: captura con CSV, error de permisos ETW (UTF-16) y sin instalar', async t => {
  const dir = tmp(t), exe = path.join(dir, 'gamer', 'bin', 'PresentMon-2.6.0-x64.exe');
  const cfg = { dir };
  const sin = crearPresentMon({ cfg, entorno: {} });
  assert.strictEqual(sin.buscar().instalado, false);
  await assert.rejects(sin.capturar({ pid: 500, csv: path.join(dir, 'x.csv') }), e => e.codigo === 'NO_INSTALADO');
  fs.mkdirSync(path.dirname(exe), { recursive: true }); fs.writeFileSync(exe, 'MZ');
  const l = lanzarFalso({ csv: csvV2(FTS) });
  const pm = crearPresentMon({ cfg, lanzar: l, entorno: {} });
  assert.deepStrictEqual({ ...pm.buscar(), exe: undefined }, { instalado: true, exe: undefined, version: '2.6.0', sha256: null, fuente: 'apolo' });
  const r = await pm.capturar({ pid: 500, segundos: 5, csv: path.join(dir, 'c.csv') });
  assert.strictEqual(r.metricas.fps, 97.1); assert.strictEqual(r.aplicacion, 'juego.exe');
  const args = l.llamadas[0][1];
  assert.strictEqual(l.llamadas[0][0], exe);
  for (const a of ['--process_id', '500', '--timed', '5', '--terminate_after_timed', '--stop_existing_session']) assert.ok(args.includes(a), a);
  const denegado = crearPresentMon({ cfg, entorno: {}, lanzar: lanzarFalso({ codigo: 6, stderr: Buffer.from('error: failed to start trace session: access denied.', 'utf16le') }) });
  await assert.rejects(denegado.capturar({ pid: 500, segundos: 5, csv: path.join(dir, 'd.csv') }), e => e.codigo === 'ACCESO' && /S-1-5-32-559/.test(e.message));
  const vacio = crearPresentMon({ cfg, entorno: {}, lanzar: lanzarFalso({ csv: 'Application,ProcessID,FrameTime\n' }) });
  await assert.rejects(vacio.capturar({ pid: 500, segundos: 5, csv: path.join(dir, 'e.csv') }), e => e.codigo === 'SIN_FRAMES');
});

test('descargar PresentMon: solo la release oficial, comprueba tamaño y sha256', async t => {
  const dir = tmp(t), bin = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 7)]);
  const sha = crypto.createHash('sha256').update(bin).digest('hex');
  const fetchFalso = (digest, cuerpo = bin) => async url => {
    if (url.includes('api.github.com')) return { ok: true, json: async () => ({ tag_name: 'v2.6.0', html_url: 'https://github.com/x', assets: [
      { name: 'PresentMon-2.6.0.msi', size: 9, browser_download_url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0.msi' },
      { name: 'PresentMon-2.6.0-x64.exe', size: bin.length, digest, browser_download_url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe' }] }) };
    return { ok: true, arrayBuffer: async () => cuerpo };
  };
  const malo = crearPresentMon({ cfg: { dir }, entorno: {}, fetchFn: fetchFalso('sha256:' + '0'.repeat(64)) });
  await assert.rejects(malo.descargar(), e => e.codigo === 'SHA');
  assert.strictEqual(malo.buscar().instalado, false);
  const pm = crearPresentMon({ cfg: { dir }, entorno: {}, fetchFn: fetchFalso('sha256:' + sha) });
  const inf = await pm.release();
  assert.deepStrictEqual([inf.version, inf.bytes, inf.sha256], ['2.6.0', bin.length, sha]);
  const r = await pm.descargar();
  assert.strictEqual(r.sha256, sha); assert.strictEqual(r.shaVerificado, true);
  assert.ok(fs.existsSync(path.join(dir, 'gamer', 'bin', 'PresentMon-2.6.0-x64.exe')));
  assert.deepStrictEqual([pm.buscar().version, pm.buscar().sha256], ['2.6.0', sha]);
});

// ---------- benchmark y auto: Modo Gamer con so falso + PresentMon/sensores falsos ----------
function montar(t, { gamer = {}, fpsAntes = 60, fpsDespues = 75 } = {}) {
  const dir = tmp(t), bus = new EventEmitter(), llamadas = [];
  const so = {
    gamerPlanes: async () => [{ guid: '381b4222-f694-41f0-9685-ff5bb260df2e', nombre: 'Equilibrado', activo: true }],
    gamerPonerPlan: async () => { }, gamerProcesos: async () => [{ nombre: 'juego.exe', pid: 500 }, { nombre: 'chrome.exe', pid: 600 }],
    gamerPrioridad: async () => 'High', gamerNoMolestar: async () => 0, gamerPonerNoMolestar: async () => { }, gamerSuspender: async () => { }, gamerReanudar: async () => { },
  };
  let n = 0;
  const presentmon = {
    buscar: () => ({ instalado: true, version: '2.6.0' }),
    capturar: async ({ pid, segundos, enVivo }) => {
      llamadas.push({ pid, segundos, gamer: G.estado().activo });
      const fps = n++ === 0 ? fpsAntes : fpsDespues;
      enVivo?.(fps); await dormir(5);
      const fts = Array(fps * segundos).fill(1000 / fps); fts[0] = 3 * 1000 / fps;
      return { metricas: metricas(fts), columna: 'frametime', aplicacion: 'juego.exe', version: '2.6.0' };
    },
  };
  const sensores = { leer: async () => ({ t: Date.now(), gpu: { nombre: 'GPU falsa', temp: 70, uso: 97, reloj: 2500, relojMax: 3000, potencia: 120, limite: 145, throttleTermico: false }, cpu: { uso: 40, frecPct: 100, limitePasivo: 100 } }) };
  const cfg = { dir, gamer: { acciones: { pausar: false, prioridad: false, noMolestar: false, plan: false }, ...gamer } };
  const G = crearGamer({ cfg, bus, so, propios: [], presentmon, sensores, retardoAutoMs: 30, rendimiento: { dormir: ms => dormir(Math.min(ms, 5)), asentarMs: 1, intervaloSensores: 5 } });
  return { G, bus, cfg, dir, llamadas };
}

test('benchmark antes/después: mide sin modo gamer, lo activa, mide con él y guarda el JSON', async t => {
  const { G, dir, llamadas } = montar(t);
  await assert.rejects(G.http('POST', ['v1', 'gamer', 'bench'], { segundos: 10 }), /dime el juego/);   // sin juego ni pantalla completa
  const r = await G.rendimiento.benchmark({ segundos: 10, juego: 'juego.exe' });
  assert.deepStrictEqual(llamadas.map(l => [l.pid, l.segundos, l.gamer]), [[500, 10, false], [500, 10, true]]);
  assert.strictEqual(r.tipo, 'bench'); assert.strictEqual(r.juego, 'juego.exe');
  assert.ok(r.antes.fps > 59 && r.antes.fps < 60); assert.ok(r.despues.fps > 74 && r.despues.fps < 75);
  assert.ok(r.delta.fps > 14.5 && r.delta.fps < 15.5); assert.ok(r.delta.pct > 24 && r.delta.pct < 26);
  assert.strictEqual(r.despues.sensores.gpu.tempMax, 70);
  assert.deepStrictEqual(r.alertas, []);
  assert.strictEqual(G.estado().activo, true);                       // se queda activo: estás jugando
  const guardado = JSON.parse(fs.readFileSync(path.join(dir, 'gamer', 'bench', `${r.id}.json`), 'utf8'));
  assert.strictEqual(guardado.delta.fps, r.delta.fps);
  const h = (await G.http('GET', ['v1', 'gamer', 'rendimiento'])).historial;
  assert.strictEqual(h[0].id, r.id); assert.strictEqual(h[0].antes, r.antes.fps);
  assert.strictEqual(G.rendimiento.estadoVivo().fase, 'listo');
  // con el modo gamer ya activo no hay "antes" honesto
  await assert.rejects(G.rendimiento.benchmark({ segundos: 10, juego: 'juego.exe' }), /tiene que estar apagado/);
  // la página de la tarjeta lleva los datos y el script
  const html = G.rendimiento.paginaTarjeta(r);
  assert.match(html, /gamer-tarjeta\.js/); assert.ok(!/<\/script><script>alert/.test(html));
  await G.desactivar();
});

test('POST /bench responde enseguida, el estado en vivo avanza y la herramienta gamer_medir existe', async t => {
  const { G, bus } = montar(t);
  bus.emit('pantalla-completa', { completa: true, proceso: 'juego' });   // sin juego: usa el último a pantalla completa
  const r = await G.http('POST', ['v1', 'gamer', 'bench'], { segundos: 10 });
  assert.strictEqual(r.ok, true);
  await assert.rejects(G.http('POST', ['v1', 'gamer', 'medir'], { segundos: 10 }), /en curso/);
  for (let i = 0; i < 100 && G.rendimiento.estadoVivo().fase !== 'listo'; i++) await dormir(10);
  const v = G.rendimiento.estadoVivo();
  assert.strictEqual(v.fase, 'listo'); assert.strictEqual(v.juego, 'juego.exe'); assert.ok(v.antes.fps > 59);
  await assert.rejects(G.http('POST', ['v1', 'gamer', 'presentmon', 'descargar'], {}), /confirma/);
  const h = HERRAMIENTAS.find(x => x.nombre === 'gamer_medir');
  assert.strictEqual(h.riesgo, 'ejecucion');
  await G.desactivar();
  const txt = await h.ejecutar({ segundos: 10, juego: 'juego.exe' }, {});
  assert.match(txt, /error/);                                         // sin ctx no hay instancia
});

test('auto-activación: solo con cfg.gamer.auto, ignora navegadores y desactiva al salir (solo si la activó ella)', async t => {
  const apagado = montar(t);
  apagado.bus.emit('pantalla-completa', { completa: true, proceso: 'juego' });
  await dormir(20);
  assert.strictEqual(apagado.G.estado().activo, false);                // auto=false por defecto

  const { G, bus } = montar(t, { gamer: { auto: true } });
  bus.emit('pantalla-completa', { completa: true, proceso: 'chrome' });
  await dormir(20); assert.strictEqual(G.estado().activo, false);       // vídeo en el navegador ≠ juego
  bus.emit('pantalla-completa', { completa: true, proceso: 'juego' });
  await dormir(20);
  assert.strictEqual(G.estado().activo, true); assert.strictEqual(G.estado().auto, true); assert.strictEqual(G.estado().juego, 'juego');
  bus.emit('pantalla-completa', { completa: false });
  bus.emit('pantalla-completa', { completa: true, proceso: 'juego' });  // alt-tab rápido: no se apaga
  await dormir(60); assert.strictEqual(G.estado().activo, true);
  bus.emit('pantalla-completa', { completa: false });
  await dormir(80);
  assert.strictEqual(G.estado().activo, false);
  assert.match(G.ultima().motivo, /auto/);
  // encendido a mano: salir de pantalla completa NO lo apaga
  await G.activar('juego.exe');
  bus.emit('pantalla-completa', { completa: false });
  await dormir(80); assert.strictEqual(G.estado().activo, true);
  await G.desactivar();
  assert.strictEqual(G.configurar({ auto: false }).auto, false);
});
