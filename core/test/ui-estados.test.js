const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function panel() {
  const icono = {}, salida = {}, detalle = {}, avisos = [];
  const ctx = vm.createContext({ VISTAS: {}, E: { trabajando: new Set() }, tr: x => x, ic: x => x, aviso: (...a) => avisos.push(a),
    document: { getElementById: () => detalle },
    $: s => s === '.e' ? icono : s === 'pre' ? salida : s === '.respuesta-parcial' ? null : {},
    NOMBRE_HERR: {}, ICONO_HERR: {}, esc: x => x });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/vistas.js'), 'utf8'), ctx);
  return { ctx, chat: ctx.VISTAS.chat, detalle, icono, salida, avisos };
}
test('panel: un resultado incierto o desconocido nunca lleva la marca de exito', () => {
  const p = panel();
  p.chat.paso('id', 'shell', '', 'proceso interrumpido', 'incierto');
  assert.equal(p.detalle.className, 'paso pendiente'); assert.notEqual(p.icono.innerHTML, 'check');
  p.chat.paso('id', 'legacy', '', 'hecho');
  assert.equal(p.detalle.className, 'paso pendiente');
  p.chat.paso('id', 'shell', '', 'sin resultado', 'error'); assert.equal(p.detalle.className, 'paso fallo');
  p.chat.paso('id', 'leer', '', 'dato', 'exito'); assert.equal(p.detalle.className, 'paso ok');
});
test('panel: conserva el estado al recibir resultados en vivo', () => {
  const { chat } = panel(); let recibido;
  chat.paso = (...a) => { recibido = a; }; chat.estadoBoton = chat.abajo = () => {};
  chat.evento({ tipo: 'resultado', id: 'a', nombre: 'shell', resultado: 'incierto', estado: 'incierto' });
  assert.equal(recibido[4], 'incierto');
});
test('panel: recuperar el historial conserva el estado de cada herramienta', () => {
  const { chat } = panel(); let recibido;
  chat.sesion = { id: 's', uso: {}, mensajes: [{ role: 'assistant', toolCalls: [{ id: 'a', name: 'shell', args: {} }] }, { role: 'tool', toolCallId: 'a', content: 'salida', estado: 'incierto' }] };
  chat.paso = (...a) => { recibido = a; }; chat.pie = chat.abajo = () => {};
  chat.pintarMensajes(); assert.equal(recibido[4], 'incierto');
});
test('panel: avisa cuando el turno termina con verificacion pendiente', () => {
  const p = panel(); p.chat.sesion = {}; p.chat.pensando = p.chat.pie = p.chat.pintarInspector = p.chat.estadoBoton = p.chat.abajo = () => {};
  p.chat.evento({ tipo: 'fin', estado: 'requiere_verificacion', uso: {} });
  assert.ok(p.avisos.some(a => /verific/i.test(a[0])));
});
test('Mission Control: identifica un trabajo incompleto en vez de mostrar en espera', () => {
  const ctx = vm.createContext({ VISTAS: {} }); vm.runInContext(fs.readFileSync(path.join(__dirname, '../ui/mision.js'), 'utf8'), ctx);
  assert.equal(vm.runInContext('ESTADO_AG.incompleto[1]', ctx), 'Incompleto');
});

function eventos() {
  const conexiones = [], timers = [], destellos = [], punto = {};
  const ctx = vm.createContext({ AbortController, PANEL_ID: 'fixture', E: { trabajando: new Set(), pendientes: new Map(), oyentes: [] },
    $: () => punto, tr: x => x, robotsLog() {}, robotsFlash: (...a) => destellos.push(a), cargarSesiones() {}, actualizarEstadoRobot() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); }, avisarFoco() {},
    flujo: (m, r, b, recibir, signal) => new Promise(resolve => conexiones.push({ recibir, signal, resolve })) });
  const src = fs.readFileSync(path.join(__dirname, '../ui/base.js'), 'utf8').replace(/\r\n/g, '\n');
  const inicio = src.indexOf('let flujoGlobal = null;');
  vm.runInContext(src.slice(inicio, src.indexOf('\n// ¿', inicio)), ctx);
  return { ctx, conexiones, timers, destellos, punto };
}
test('panel: el robot no celebra un turno que necesita verificacion', () => {
  const p = eventos(); p.ctx.conectarEventos();
  p.conexiones[0].recibir({ sesion: 's', tipo: 'fin', estado: 'requiere_verificacion' });
  assert.equal(p.destellos[0][0], 'REVISAR RESULTADO'); assert.notEqual(p.destellos[0][1], 'listo');
});
test('panel: cerrar una conexion antigua no desconecta ni duplica la nueva', async () => {
  const p = eventos(); p.ctx.conectarEventos(); p.ctx.conectarEventos();
  assert.equal(p.conexiones[0].signal.aborted, true);
  p.conexiones[0].recibir({ sesion: 'antigua', tipo: 'inicio' });
  assert.equal(p.ctx.E.trabajando.size, 0, 'se ignoran eventos tardios del flujo cancelado');
  p.conexiones[0].resolve(); await new Promise(ok => setImmediate(ok));
  assert.equal(p.punto.className, 'punto ok'); assert.equal(p.timers.filter(t => t.ms === 3000).length, 0);
  p.conexiones[1].resolve(); await new Promise(ok => setImmediate(ok));
  const reconectar = p.timers.find(t => t.ms === 3000); assert.ok(reconectar);
  p.ctx.conectarEventos(); reconectar.fn(); assert.equal(p.conexiones.length, 3);
});
