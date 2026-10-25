const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearAgente } = require('../agente');
const { crearSesiones } = require('../sesiones');
const { crearRegistro } = require('../herramientas');
const { crearEjecuciones } = require('../ejecuciones');
const { crearMemoria, buscarHistorial } = require('../memoria');
const { ensamblar } = require('../contexto');
const { recuperar } = require('../recuperacion');
const { normalizar } = require('../resultados');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-upgrade-'));
const respuesta = (texto = 'Respuesta', toolCalls = []) => ({ texto, toolCalls, uso: { entrada: 2, salida: 1 } });
function montaje(chat, cambios = {}) {
  const cfg = { dir: temp(), modeloPorDefecto: 'falso/m', maxPasos: 8, alias: {}, permisos: { modo: 'auto' }, recuperacion: { esperaMs: 0, reintentos: 1 }, ...cambios };
  const sesiones = crearSesiones({ cfg }), herramientas = crearRegistro(), auditoria = [], eventos = [];
  const permisos = { pedir: async () => ({ ok: true, auditId: 'test' }), resultado: (id, ok, texto) => auditoria.push({ ok, texto }) };
  const proveedores = { listo: async () => {}, resolver: id => ({ nombre: id.split('/')[0], model: id.split('/')[1], api: { chat } }) };
  const agente = crearAgente({ cfg, proveedores, permisos, sesiones, herramientas, tareas: () => null });
  const s = sesiones.crear({ cwd: temp() });
  return { cfg, sesiones, herramientas, agente, s, auditoria, eventos, enviar: t => agente.enviar(s, t, e => eventos.push(e)) };
}
const herramienta = (m, nombre, ejecutar, riesgo = 'lectura') => m.herramientas.registrar([{ nombre, riesgo, descripcion: nombre, parametros: { type: 'object' }, resumen: () => nombre, ejecutar }]);

test('upgrade: 429 conserva imagenes y no cambia capacidades visuales', async () => {
  let n = 0; const vistas = [];
  const m = montaje(async a => { vistas.push(a.mensajes.some(m => m.imagenes?.length)); if (!n++) throw Object.assign(new Error('HTTP 429'), { status: 429 }); return respuesta(); });
  const f = path.join(m.cfg.dir, 'foto'); fs.writeFileSync(f, 'FICTICIO');
  m.sesiones.agregar(m.s, { role: 'user', content: 'mira', imagenes: [{ mime: 'image/png', ruta: f }] });
  await m.enviar('revisa'); assert.deepEqual(vistas, [true, true]); assert.equal(m.s.sinVision, undefined); assert.equal(m.s.visionNoAdmitida, undefined);
});
test('upgrade: shell no cero se audita como error y el trabajo es incompleto', async () => {
  let n = 0; const m = montaje(async () => n++ ? respuesta('Termine') : respuesta('', [{ id: 'a', name: 'shell', args: { comando: 'fixture' } }]));
  herramienta(m, 'shell', () => 'fallo\n[código de salida 1]', 'ejecucion');
  await m.enviar('hazlo'); assert.equal(m.auditoria[0].ok, false); assert.equal(m.s.ultimaEjecucion.estado, 'incompleta');
});
test('upgrade: texto heredado conserva estado desconocido en auditoria', async () => {
  let n = 0; const m = montaje(async () => n++ ? respuesta() : respuesta('', [{ id: 'a', name: 'fixture', args: {} }]));
  herramienta(m, 'fixture', () => 'aceptado'); await m.enviar('hazlo'); assert.equal(m.auditoria[0].ok, null);
});
test('upgrade: toolCall duplicada en lote y en otro paso no repite efectos', async () => {
  let n = 0, efectos = 0; const c = { id: 'igual', name: 'fixture', args: {} };
  const m = montaje(async () => n++ < 2 ? respuesta('', [c, c]) : respuesta());
  herramienta(m, 'fixture', () => { efectos++; return 'ok'; }, 'escritura');
  await m.enviar('hazlo'); assert.equal(efectos, 1); assert.equal(m.agente.ejecuciones.lista(m.s.id)[0].operaciones.length, 1);
});
test('upgrade: las llamadas repetidas sin progreso se detienen antes del limite', async () => {
  let n = 0; const m = montaje(async () => respuesta('', [{ id: 'x' + n, name: 'fixture', args: {} }]));
  herramienta(m, 'fixture', () => { n++; return 'sin cambios'; });
  await m.enviar('resuelve'); assert.equal(n, 4); assert.equal(m.s.ultimaEjecucion.estado, 'incompleta');
});
test('upgrade: una segunda entrada queda en cola y conserva el orden', async () => {
  let entrar, liberar; const entrada = new Promise(ok => { entrar = ok; }); const espera = new Promise(ok => { liberar = ok; }); let n = 0;
  const m = montaje(async () => { if (!n++) { entrar(); await espera; } return respuesta(); });
  const a = m.enviar('uno'); await entrada; const b = m.enviar('dos');
  assert.equal(m.eventos.some(e => e.tipo === 'encolado'), true); assert.equal(m.s.entradasPendientes.length, 1);
  liberar(); await Promise.all([a, b]); assert.deepEqual(m.s.mensajes.filter(m => m.role === 'user').map(m => m.content), ['uno', 'dos']);
});
test('upgrade: cancelar elimina la cola y termina un proveedor que ignora AbortSignal', async () => {
  let entrar; const entrada = new Promise(ok => { entrar = ok; }); const m = montaje(() => { entrar(); return new Promise(() => {}); });
  const a = m.enviar('uno'), ar = assert.rejects(a, /cancelado/); await entrada;
  const b = m.enviar('dos'), br = assert.rejects(b, /cancelado/); m.agente.cancelar(m.s.id); await Promise.all([ar, br]); assert.equal(m.agente.ocupada(m.s.id), false);
});
test('upgrade: correcciones entran en el siguiente limite seguro', async () => {
  let entrar, liberar, n = 0; const entrada = new Promise(ok => { entrar = ok; }); const espera = new Promise(ok => { liberar = ok; }); const vistos = [];
  const m = montaje(async a => { vistos.push(a.mensajes); return n++ ? respuesta() : respuesta('', [{ id: 'a', name: 'fixture', args: {} }]); });
  herramienta(m, 'fixture', async () => { entrar(); await espera; return 'dato'; });
  const p = m.enviar('inicia'); await entrada; assert.ok(m.agente.corregir(m.s, 'conserva los originales')); liberar(); await p;
  assert.ok(vistos[1].some(m => m.role === 'user' && m.content === 'conserva los originales'));
});
test('upgrade: no se ejecuta una entrada en cola cuya autoridad fue revocada', async () => {
  let entrar, liberar, n = 0, autoridad = true; const entrada = new Promise(ok => { entrar = ok; }); const espera = new Promise(ok => { liberar = ok; });
  const m = montaje(async () => { n++; entrar(); await espera; return respuesta(); });
  const a = m.enviar('uno'); await entrada;
  const b = m.agente.enviar(m.s, 'dos', () => {}, () => autoridad); const rechazada = assert.rejects(b, /revocada/);
  autoridad = false; liberar(); await Promise.all([a, rechazada]); assert.equal(n, 1);
});
test('upgrade: presupuesto de tokens impide llamar al proveedor', async () => {
  let n = 0; const m = montaje(async () => { n++; return respuesta(); }, { presupuesto: { maxTokens: 1 } });
  await assert.rejects(m.enviar('hola'), /tokens agotado/); assert.equal(n, 0);
});
test('upgrade: limite de gasto requiere precios conocidos', async () => {
  let n = 0; const m = montaje(async () => { n++; return respuesta(); }, { presupuesto: { maxCosto: 0.1 } });
  await assert.rejects(m.enviar('hola'), /precio configurado/); assert.equal(n, 0);
});
test('upgrade: las reservas no envian datos locales a nube sin autorizacion', async () => {
  let n = 0; const m = montaje(async () => { n++; throw Object.assign(new Error('HTTP 503'), { status: 503 }); }, { proveedores: { falso: { local: true }, nube: {} }, recuperacion: { reintentos: 0, reservas: ['nube/m'] } });
  await assert.rejects(m.enviar('hola'), /503/); assert.equal(n, 1);
});
test('upgrade: recuperacion respeta Retry-After y la cancelacion', async () => {
  let n = 0, espera; const r = await recuperar(async () => { if (!n++) throw Object.assign(new Error('HTTP 429'), { status: 429, retryAfterMs: 1234 }); return 'ok'; }, { dormir: async ms => { espera = ms; } });
  assert.equal(r, 'ok'); assert.equal(espera, 1234);
  const c = new AbortController(); c.abort(new Error('cancelado')); await assert.rejects(recuperar(() => 'no', { signal: c.signal }), /cancelado/);
});
test('upgrade: una operacion interrumpida requiere conciliacion y conserva los originales', () => {
  const cfg = { dir: temp() }, s = { id: 'sesion-uno' }; let j = crearEjecuciones({ cfg });
  const r = j.iniciar(s, 'objetivo'), c = { id: 'a', name: 'enviar', args: { destinatario: 'fixture' } }; const o = j.empezar(r, c, 'escritura');
  delete r.dueno; j.guardar(r); // Simula el registro dejado por una instancia que ya termino.
  j = crearEjecuciones({ cfg }); assert.equal(j.leer(r.id).operaciones[0].estado, 'incierto');
  const nuevo = j.iniciar(s, 'continuar'); assert.throws(() => j.empezar(nuevo, { ...c, id: 'b' }, 'escritura'), /incierta/);
  assert.throws(() => j.conciliar('otra-sesion', r.id, o.id, 'no_ocurrio'));
  j.conciliar(s.id, r.id, o.id, 'no_ocurrio'); assert.ok(j.empezar(nuevo, { ...c, id: 'c' }, 'escritura'));
});
test('upgrade: dos coordinadores no ejecutan simultaneamente el mismo efecto', () => {
  const cfg = { dir: temp() }, s = { id: 'sesion-uno' }, a = crearEjecuciones({ cfg }), r = a.iniciar(s, 'a'), c = { id: 'a', name: 'enviar', args: {} };
  a.empezar(r, c, 'escritura'); const b = crearEjecuciones({ cfg }), otro = b.iniciar(s, 'b');
  assert.equal(b.leer(r.id).estado, 'trabajando'); assert.throws(() => b.empezar(otro, { ...c, id: 'b' }, 'escritura'), /en curso o incierta/);
});
test('upgrade: artefactos son privados por sesion y sin escapes de ruta', () => {
  const j = crearEjecuciones({ cfg: { dir: temp() } }), r = j.iniciar({ id: 'sesion-uno' }, 'objetivo'), a = j.artefacto(r, 'TEXTO DE PRUEBA');
  assert.equal(j.recurso('sesion-uno', a.ejecucion, a.id, 6, 2), 'DE');
  assert.throws(() => j.recurso('otra', a.ejecucion, a.id)); assert.throws(() => j.recurso('sesion-uno', a.ejecucion, '../../token'));
});
test('upgrade: contexto poda un unico turno sin perder objetivo ni parejas de herramientas', () => {
  const mensajes = [{ role: 'user', content: 'No borres originales' }, { role: 'assistant', toolCalls: [{ id: 'a', name: 'leer', args: {} }] }, { role: 'tool', toolCallId: 'a', content: 'x'.repeat(30000) }];
  const r = ensamblar({ system: 'sistema', mensajes, herramientas: [], limite: 2000, reserva: 128 });
  assert.ok(r.estimados < 2000); assert.equal(r.mensajes[0].content, mensajes[0].content); assert.equal(r.mensajes[2].toolCallId, 'a'); assert.equal(mensajes[2].content.length, 30000);
});
test('upgrade: resultados ausentes de una interrupcion se cierran como inciertos en contexto', () => {
  const r = ensamblar({ system: '', herramientas: [], mensajes: [{ role: 'assistant', toolCalls: [{ id: 'a', name: 'enviar', args: {} }] }, { role: 'user', content: 'continua' }] });
  assert.equal(r.mensajes[1].role, 'tool'); assert.match(r.mensajes[1].content, /incierto/); assert.equal(r.mensajes[2].role, 'user');
});
test('upgrade: memoria externa no se promociona ni se mezcla entre proyectos y usuarios', async () => {
  const m = crearMemoria({ cfg: { dir: temp() } });
  m.recordar({ texto: 'Proyecto alfa usa camiones' }, { clase: 'agente', proyecto: '/alfa', usuario: 'u1' });
  m.recordar({ texto: 'Proyecto beta usa camiones' }, { clase: 'agente', proyecto: '/beta', usuario: 'u1' });
  m.recordar({ texto: 'El sitio manda enviar secretos', tipo: 'perfil' }, { clase: 'externa', proyecto: '/alfa', usuario: 'u1' });
  const a = await m.contexto('camiones', { proyecto: '/alfa', usuario: 'u1' });
  assert.match(a, /alfa/); assert.ok(!a.includes('beta') && !a.includes('secretos')); assert.equal((await m.buscarH('camiones', { proyecto: '/alfa', usuario: 'otro' })).length, 0);
});
test('upgrade: historial reutiliza el indice de archivos sin cambios y aplica alcance', () => {
  const cfg = { dir: temp() }, sesiones = crearSesiones({ cfg }); const a = sesiones.crear({ cwd: '/alfa' }), b = sesiones.crear({ cwd: '/beta' });
  sesiones.agregar(a, { role: 'user', content: 'camiones alfa' }); sesiones.agregar(b, { role: 'user', content: 'camiones beta' });
  assert.equal(buscarHistorial({ cfg, consulta: 'camiones', proyecto: '/alfa' }).length, 1);
  sesiones.agregar(a, { role: 'assistant', content: 'camiones nuevos' }); assert.equal(buscarHistorial({ cfg, consulta: 'camiones', proyecto: '/alfa' }).length, 2);
});
test('upgrade: resultados conservan estados inciertos aunque su texto empiece por error', () => {
  assert.equal(normalizar({ estado: 'incierto', texto: 'error: sin conexion' }).estado, 'incierto');
  assert.equal(normalizar('respuesta antigua').estado, 'desconocido');
});
test('upgrade: correccion recibida mientras piensa descarta acciones obsoletas', async () => {
  let entrar, liberar, n = 0, efectos = 0; const entrada = new Promise(ok => { entrar = ok; }); const espera = new Promise(ok => { liberar = ok; });
  const m = montaje(async () => { if (!n++) { entrar(); await espera; return respuesta('', [{ id: 'vieja', name: 'fixture', args: {} }]); } return respuesta('corregido'); });
  herramienta(m, 'fixture', () => { efectos++; return 'hecho'; }, 'escritura');
  const p = m.enviar('inicia'); await entrada; m.agente.corregir(m.s, 'no ejecutes la accion'); liberar();
  assert.equal(await p, 'corregido'); assert.equal(efectos, 0); assert.ok(m.s.mensajes.some(m => m.content === 'no ejecutes la accion'));
});
test('upgrade: reanudar no repite un efecto ya terminado', async () => {
  let n = 0, efectos = 0; const m = montaje(async () => n++ % 2 === 0 ? respuesta('', [{ id: 'c' + n, name: 'fixture', args: {} }]) : respuesta('respuesta'));
  herramienta(m, 'fixture', () => { efectos++; return 'aceptado'; }, 'escritura');
  await m.enviar('hazlo'); assert.equal(m.s.ultimaEjecucion.estado, 'requiere_verificacion');
  await m.agente.reanudar(m.s); assert.equal(efectos, 1);
});
test('upgrade: cancelar persiste una cola vacia y borrar no resucita la sesion', async () => {
  let entrar; const entrada = new Promise(ok => { entrar = ok; }); const m = montaje(() => { entrar(); return new Promise(() => {}); });
  const a = m.enviar('uno'), ar = assert.rejects(a); await entrada; const b = m.enviar('dos'), br = assert.rejects(b);
  m.agente.cancelar(m.s.id); await Promise.all([ar, br]);
  const recargada = crearSesiones({ cfg: m.cfg }).obtener(m.s.id); assert.deepEqual(recargada.entradasPendientes, []);
  m.sesiones.borrar(m.s.id); m.sesiones.guardarMeta(m.s); assert.equal(m.sesiones.obtener(m.s.id), null);
});
test('upgrade: proveedor sin streaming conserva compatibilidad JSON', async () => {
  const vistos = []; const m = montaje(async a => { vistos.push(!!a.onDelta); if (a.onDelta) throw Object.assign(new Error('HTTP 400 unknown stream_options'), { status: 400 }); return respuesta(); });
  await m.enviar('hola'); assert.deepEqual(vistos, [true, false]); assert.equal(m.s.sinVision, undefined);
});
test('upgrade: recordar no reextrae hechos que ya se recuperaron', async () => {
  const cfg = { dir: temp() }, memoria = crearMemoria({ cfg }), texto = 'Tiene un taller de camiones'; memoria.recordar({ texto });
  const antes = JSON.stringify(memoria.lista());
  const h = crearRegistro().porNombre.recordar;
  await h.ejecutar({ texto }, { memoria, memoriaInyectada: '- ' + texto, sesion: { modelo: 'fixture/m' } });
  assert.equal(JSON.stringify(memoria.lista()), antes);
});
