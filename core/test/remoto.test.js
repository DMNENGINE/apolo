// Escritorio remoto desde el móvil: permiso por dispositivo (solo desde el PC), aprobación de cada sesión (PC o PIN),
// ventanas protegidas tapadas y no tocables, vigilante/pánico cortan la sesión, tiempo máximo e inactividad, auditoría sin el texto.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearNucleo } = require('../index');
const { iniciar } = require('../daemon');
const MV = require('../movil');

const base = process.env.NUCLEO_HOME && fs.existsSync(process.env.NUCLEO_HOME) ? process.env.NUCLEO_HOME : os.tmpdir();
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
const BANCO = { x: 500, y: 300, ancho: 600, alto: 400 };

// capturador falso con el mismo protocolo binario que flujo.ps1
function marco(cab, jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])) {
  const h = Buffer.from(JSON.stringify(cab)), t = Buffer.alloc(6);
  t.writeUInt32BE(2 + h.length + jpg.length, 0); t.writeUInt16BE(h.length, 4);
  return Buffer.concat([t, h, jpg]);
}
function flujoFalso(registro) {
  return () => {
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter();
    let vivo = true;
    p.stdin = { write: l => { for (const x of String(l).split('\n').filter(Boolean)) {
      const o = JSON.parse(x); registro.push(o);
      if (o.op === 'config') setImmediate(() => {
        if (!vivo) return;
        p.stdout.emit('data', marco({ evento: 'listo', monitores: [{ n: 1, x: 0, y: 0, ancho: 1920, alto: 1080, primario: true }] }));
        p.stdout.emit('data', marco({ x: 0, y: 0, w: 1280, h: 720, W: 1280, H: 720, mon: 1, origen: { x: 0, y: 0 }, mw: 1920, mh: 1080, escala: 1.5, clave: true, tapadas: [BANCO], fgProt: false }));
      });
    } return true; }, end: () => { } };
    p.kill = () => { if (vivo) { vivo = false; p.emit('exit', 0); } };
    return p;
  };
}

async function montar({ aprobacion = 'pc', limites = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(base, 'remoto-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m', red: { permitidos: [], moviles: true }, escritorio: { remoto: { aprobacion } } }));
  const manos = [];
  const n = crearNucleo({ dir, embedder: null, sinPlugins: true, escaner: { escanear: async () => ({ nivel: 'verde', hallazgos: [] }) },
    manos: async o => { manos.push(o); return { ok: true }; } });
  const capt = [];
  const estado = { ip: '192.168.1.50' };
  const d = await iniciar({ nucleo: n, puerto: 0, sinTareas: true, ipCliente: () => estado.ip, host: '127.0.0.1', remoto: { lanzarFlujo: flujoFalso(capt), limites } });
  const pet = (M, ruta, { cab = {}, cuerpo, ip } = {}) => new Promise((ok, mal) => {
    estado.ip = ip || (cab['x-robot-token'] ? '127.0.0.1' : '192.168.1.50');
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo));
    const r = http.request({ host: '127.0.0.1', port: d.puerto, method: M, path: ruta, headers: { ...(datos ? { 'content-type': 'application/json', 'content-length': datos.length } : {}), ...cab } }, res => {
      const t = []; res.on('data', x => t.push(x)); res.on('end', () => { const s = Buffer.concat(t).toString(); let j = null; try { j = JSON.parse(s); } catch { } ok({ status: res.statusCode, j, s }); });
    });
    r.on('error', mal); if (datos) r.write(datos); r.end();
  });
  const maestro = { 'x-robot-token': d.token };
  // emparejar un móvil (PIN 1234)
  const c = await pet('POST', '/v1/movil/emparejar', { cab: maestro, cuerpo: {} });
  const r = await pet('POST', '/v1/movil/canjear', { cuerpo: { codigo: c.j.codigo, pin: '1234', nombre: 'Pixel' } });
  const movil = { 'x-dispositivo': r.j.token };
  // flujo: lee fotogramas mientras la respuesta siga abierta
  const flujo = sid => new Promise((ok, mal) => {
    estado.ip = '192.168.1.50';
    const fr = { cabeceras: [], terminado: false, status: 0 };
    const q = http.request({ host: '127.0.0.1', port: d.puerto, method: 'GET', path: '/v1/escritorio/flujo?monitor=1&ancho=1280', headers: { ...movil, 'x-escritorio': sid } }, res => {
      fr.status = res.statusCode; let b = Buffer.alloc(0);
      res.on('data', x => { b = Buffer.concat([b, x]); while (b.length >= 6 && b.length >= 4 + b.readUInt32BE(0)) { const L = b.readUInt32BE(0); fr.cabeceras.push(JSON.parse(b.subarray(6, 6 + b.readUInt16BE(4)).toString())); b = b.subarray(4 + L); } });
      res.on('end', () => { fr.terminado = true; }); res.on('close', () => { fr.terminado = true; });
      ok(fr);
    });
    q.on('error', mal); q.end(); fr.req = q;
  });
  const cerrar = () => { n.escritorioRemoto.cortar('fin del test'); d.servidor.closeAllConnections?.(); d.servidor.close(); };
  return { n, d, pet, maestro, movil, disp: r.j.dispositivo, manos, capt, flujo, cerrar, dir };
}
const auditoria = m => { try { return fs.readFileSync(path.join(m.dir, 'auditoria.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch { return []; } };
async function sesionAprobada(m) {
  const p = m.pet('POST', '/v1/escritorio/sesion', { cab: m.movil, cuerpo: {} });
  let sol; for (let i = 0; i < 50 && !sol; i++) { await dormir(10); sol = m.n.escritorioRemoto.estado().solicitudes[0]; }
  const a = await m.pet('POST', `/v1/escritorio/solicitudes/${sol.id}`, { cab: m.maestro, cuerpo: { aprobar: true } });
  assert.strictEqual(a.status, 200, a.s);
  const r = await p; assert.strictEqual(r.status, 200, r.s);
  return r.j.sesion;
}

test('alcance: sin el permiso de escritorio → 403; el móvil no puede dárselo; el PC sí', async () => {
  const m = await montar();
  try {
    assert.ok(MV.alcance('POST', ['v1', 'escritorio', 'accion']));
    assert.strictEqual((await m.pet('GET', '/v1/escritorio', { cab: m.movil })).status, 403);
    assert.strictEqual((await m.pet('POST', '/v1/escritorio/sesion', { cab: m.movil, cuerpo: {} })).status, 403);
    await m.pet('PATCH', '/v1/movil/yo', { cab: m.movil, cuerpo: { escritorio: true } });          // intento de auto-concederse
    assert.strictEqual((await m.pet('GET', '/v1/escritorio', { cab: m.movil })).status, 403);
    const ok = await m.pet('PATCH', `/v1/movil/dispositivos/${m.disp.id}`, { cab: m.maestro, cuerpo: { escritorio: true } });
    assert.strictEqual(ok.status, 200); assert.strictEqual(ok.j.escritorio, true);
    const g = await m.pet('GET', '/v1/escritorio', { cab: m.movil });
    assert.strictEqual(g.status, 200, g.s); assert.strictEqual(g.j.permitido, true); assert.strictEqual(g.j.aprobacion, 'pc');
    assert.ok(auditoria(m).some(l => l.tipo === 'seguridad' && /escritorio remoto permitido/.test(l.resumen)));
  } finally { m.cerrar(); }
});

test('cada sesión se aprueba en el PC (rechazar → 403) o con el PIN del móvil', async () => {
  const m = await montar();
  try {
    await m.pet('PATCH', `/v1/movil/dispositivos/${m.disp.id}`, { cab: m.maestro, cuerpo: { escritorio: true } });
    const p = m.pet('POST', '/v1/escritorio/sesion', { cab: m.movil, cuerpo: {} });
    let sol; for (let i = 0; i < 50 && !sol; i++) { await dormir(10); sol = m.n.escritorioRemoto.estado().solicitudes[0]; }
    assert.ok(sol, 'la solicitud aparece en el PC');
    assert.notStrictEqual((await m.pet('POST', `/v1/escritorio/solicitudes/${sol.id}`, { cab: m.movil, cuerpo: { aprobar: true } })).status, 200, 'el móvil no se aprueba a sí mismo');
    await m.pet('POST', `/v1/escritorio/solicitudes/${sol.id}`, { cab: m.maestro, cuerpo: { aprobar: false } });
    assert.strictEqual((await p).status, 403);
    assert.ok(!m.n.escritorioRemoto.activa());
    const sid = await sesionAprobada(m);
    assert.ok(sid && m.n.escritorioRemoto.activa());
  } finally { m.cerrar(); }
  const m2 = await montar({ aprobacion: 'pin' });
  try {
    await m2.pet('PATCH', `/v1/movil/dispositivos/${m2.disp.id}`, { cab: m2.maestro, cuerpo: { escritorio: true } });
    assert.strictEqual((await m2.pet('POST', '/v1/escritorio/sesion', { cab: m2.movil, cuerpo: {} })).status, 428);
    assert.strictEqual((await m2.pet('POST', '/v1/escritorio/sesion', { cab: m2.movil, cuerpo: { prueba: { tipo: 'pin', pin: '9999' } } })).status, 403);
    const r = await m2.pet('POST', '/v1/escritorio/sesion', { cab: m2.movil, cuerpo: { prueba: { tipo: 'pin', pin: '1234' } } });
    assert.strictEqual(r.status, 200, r.s); assert.ok(r.j.sesion);
  } finally { m2.cerrar(); }
});

test('flujo: ventana protegida tapada en el flujo y sin poder tocarla; fuera de ella el clic llega a las manos armadas', async () => {
  const m = await montar();
  try {
    await m.pet('PATCH', `/v1/movil/dispositivos/${m.disp.id}`, { cab: m.maestro, cuerpo: { escritorio: true } });
    const sid = await sesionAprobada(m);
    assert.strictEqual((await m.pet('POST', '/v1/escritorio/accion', { cab: { ...m.movil, 'x-escritorio': 'otra' }, cuerpo: { op: 'clic', x: .1, y: .1 } })).status, 410, 'sesión ajena');
    const f = await m.flujo(sid);
    for (let i = 0; i < 50 && f.cabeceras.length < 2; i++) await dormir(10);
    assert.strictEqual(f.status, 200);
    const cfg = m.capt.find(o => o.op === 'config');
    assert.ok(cfg.bloqueadas.some(p => /bank|banco/.test(p)), 'el capturador recibe la lista de ventanas protegidas');
    const fot = f.cabeceras.find(c => c.W);
    assert.deepStrictEqual(fot.tapadas, [BANCO]);
    // centro de la ventana del banco: (800, 500) de 1920x1080
    const dentro = await m.pet('POST', '/v1/escritorio/accion', { cab: { ...m.movil, 'x-escritorio': sid }, cuerpo: { op: 'clic', x: 800 / 1919, y: 500 / 1079 } });
    assert.strictEqual(dentro.status, 403); assert.match(dentro.j.error, /PROTEGIDA/);
    assert.ok(!m.manos.length, 'no se armó ni se tocó nada');
    const fuera = await m.pet('POST', '/v1/escritorio/accion', { cab: { ...m.movil, 'x-escritorio': sid }, cuerpo: { op: 'clic', x: 0.1, y: 0.1, boton: 'der' } });
    assert.strictEqual(fuera.status, 200, fuera.s);
    assert.deepStrictEqual(m.manos.map(o => o.op), ['armar', 'clic']);
    assert.strictEqual(m.manos[1].boton, 'der'); assert.strictEqual(m.manos[1].armadoRequerido, true); assert.strictEqual(m.manos[1].x, Math.round(0.1 * 1919));
    assert.strictEqual((await m.pet('POST', '/v1/escritorio/accion', { cab: { ...m.movil, 'x-escritorio': sid }, cuerpo: { op: 'tecla', combo: 'ctrl+alt+delete; rm' } })).status, 400);
    assert.ok(m.capt.filter(o => o.op === 'credito').length >= 3, 'control de flujo por créditos');
    // el agente no puede tomar el control mientras hay sesión remota
    assert.match(String(m.n.control.estado && (await m.n.control.tomar({ id: 'x' }, { motivo: 't' }).catch(e => e.message))), /escritorio remoto/);
  } finally { m.cerrar(); }
});

test('vigilante de manos (tocas el PC) y pánico global cortan la sesión y el flujo', async () => {
  const m = await montar();
  try {
    await m.pet('PATCH', `/v1/movil/dispositivos/${m.disp.id}`, { cab: m.maestro, cuerpo: { escritorio: true } });
    let sid = await sesionAprobada(m);
    const f = await m.flujo(sid);
    await m.pet('POST', '/v1/escritorio/accion', { cab: { ...m.movil, 'x-escritorio': sid }, cuerpo: { op: 'escribir', texto: 'secreto123' } });
    m.n.control._evento({ evento: 'panico', motivo: 'raton' });             // lo que emite manos.ps1 al mover el ratón real
    assert.ok(!m.n.escritorioRemoto.activa());
    for (let i = 0; i < 50 && !f.terminado; i++) await dormir(10);
    assert.ok(f.terminado, 'el flujo se cierra');
    assert.strictEqual(m.manos.at(-1).op, 'desarmar');
    assert.strictEqual((await m.pet('POST', '/v1/escritorio/accion', { cab: { ...m.movil, 'x-escritorio': sid }, cuerpo: { op: 'clic', x: .1, y: .1 } })).status, 410);
    sid = await sesionAprobada(m);
    m.n.panico.activar('test');
    assert.ok(!m.n.escritorioRemoto.activa());
    assert.strictEqual((await m.pet('POST', '/v1/escritorio/sesion', { cab: m.movil, cuerpo: {} })).status, 423, 'con pánico no se puede abrir otra');
    const a = auditoria(m);
    assert.ok(a.some(l => l.tipo === 'escritorio-remoto' && l.decision === 'fin' && /recuperaste el control/.test(l.resumen)));
    assert.ok(a.some(l => l.tipo === 'escritorio-remoto' && l.decision === 'fin' && /pánico/.test(l.resumen)));
  } finally { m.cerrar(); }
});

test('tiempo máximo e inactividad; retirar el permiso corta; auditoría sin el texto escrito', async () => {
  const m = await montar({ limites: { maxMs: 150, inactMs: 10_000 } });
  try {
    await m.pet('PATCH', `/v1/movil/dispositivos/${m.disp.id}`, { cab: m.maestro, cuerpo: { escritorio: true } });
    await sesionAprobada(m);
    await dormir(320);
    assert.ok(!m.n.escritorioRemoto.activa(), 'tiempo máximo');
    assert.ok(auditoria(m).some(l => l.decision === 'fin' && /tiempo máximo/.test(l.resumen)));
  } finally { m.cerrar(); }
  const m2 = await montar({ limites: { maxMs: 60_000, inactMs: 150 } });
  try {
    await m2.pet('PATCH', `/v1/movil/dispositivos/${m2.disp.id}`, { cab: m2.maestro, cuerpo: { escritorio: true } });
    const sid = await sesionAprobada(m2);
    await m2.flujo(sid); await dormir(50);
    await m2.pet('POST', '/v1/escritorio/accion', { cab: { ...m2.movil, 'x-escritorio': sid }, cuerpo: { op: 'escribir', texto: 'secreto123' } });
    await dormir(80);
    assert.ok(m2.n.escritorioRemoto.activa(), 'la acción reinicia la inactividad');
    await dormir(250);
    assert.ok(!m2.n.escritorioRemoto.activa(), 'inactividad');
    const sid2 = await sesionAprobada(m2);
    assert.ok(sid2);
    await m2.pet('PATCH', `/v1/movil/dispositivos/${m2.disp.id}`, { cab: m2.maestro, cuerpo: { escritorio: false } });
    assert.ok(!m2.n.escritorioRemoto.activa(), 'retirar el permiso corta la sesión');
    const a = auditoria(m2), txt = JSON.stringify(a);
    assert.ok(!txt.includes('secreto123'), 'el texto escrito nunca va a la auditoría');
    const acc = a.find(l => l.decision === 'accion' && l.herramienta === 'escribir');
    assert.strictEqual(acc.resumen, '10 caracteres'); assert.strictEqual(acc.quien, 'movil:Pixel');
    assert.ok(a.some(l => l.decision === 'inicio') && a.some(l => l.decision === 'fin' && /inactividad/.test(l.resumen)));
    assert.ok(a.some(l => l.decision === 'fin' && /permiso retirado/.test(l.resumen)));
    assert.ok(m2.n.auditoria.verificar().ok, 'la cadena sigue íntegra');
  } finally { m2.cerrar(); }
});

test('flujo.ps1 real en modo prueba: tapa en negro SOLO la ventana protegida', { skip: process.platform !== 'win32' }, async () => {
  const so = require('../escritorio/so');
  const p = so.lanzarFlujo(['-Prueba']);
  let b = Buffer.alloc(0); const cabs = [];
  p.stdout.on('data', x => { b = Buffer.concat([b, x]); while (b.length >= 6 && b.length >= 4 + b.readUInt32BE(0)) { const L = b.readUInt32BE(0); cabs.push(JSON.parse(b.subarray(6, 6 + b.readUInt16BE(4)).toString())); b = b.subarray(4 + L); } });
  p.stdin.write(JSON.stringify({ op: 'config', monitor: 1, ancho: 960, calidad: 50, fps: 5, bloqueadas: require('../escritorio').BLOQUEADAS,
    ventanasPrueba: [{ titulo: 'Banco Santander — Google Chrome', proceso: 'chrome', ...BANCO, fg: true }, { titulo: 'notas.txt - Bloc de notas', proceso: 'notepad', x: 0, y: 0, ancho: 300, alto: 300 }] }) + '\n{"op":"credito"}\n');
  try {
    for (let i = 0; i < 300 && !cabs.some(c => c.W); i++) await dormir(50);
    const c = cabs.find(x => x.W);
    assert.ok(c, 'llega un fotograma');
    assert.deepStrictEqual(c.tapadas, [BANCO]);
    assert.strictEqual(c.fgProt, true);
    assert.deepStrictEqual(c.muestras, [0], 'el píxel de la ventana protegida es negro');
  } finally { p.stdin.write('{"op":"parar"}\n'); setTimeout(() => p.kill(), 300); }
});

test('regresión: la app (main.js) pone nucleo.remoto para la Pi y el escritorio remoto sigue respondiendo', async () => {
  const m = await montar();
  try {
    m.n.remoto = { decidir() { }, texto() { } };                    // lo que hace main.js con las acciones remotas de la Pi
    const r = await m.pet('GET', '/v1/escritorio', { cab: m.maestro });
    assert.strictEqual(r.status, 200, `GET /v1/escritorio → ${r.status} ${r.b || ''}`);
  } finally { m.cerrar(); }
});
