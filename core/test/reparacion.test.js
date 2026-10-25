const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearPermisos } = require('../permisos');
const { crearSesiones } = require('../sesiones');
const { crearAgente } = require('../agente');
const { crearRegistro } = require('../herramientas');
const { fetchSeguro } = require('../red-segura');
const temporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-reparacion-'));
function montaje(modo = 'preguntar') {
  const cfg = { dir: temporal(), permisos: { modo }, maxPasos: 2, herramientasPorGrupos: false };
  const bus = new EventEmitter(), permisos = crearPermisos({ cfg, bus });
  const sesiones = crearSesiones({ cfg }), herramientas = crearRegistro();
  return { cfg, bus, permisos, sesiones, herramientas };
}
function agente(m, tool) {
  let llamadas = 0;
  const api = { chat: async () => ({ texto: '', toolCalls: llamadas++ ? [] : [tool], uso: { entrada: 0, salida: 0 } }) };
  return crearAgente({ ...m, proveedores: { resolver: () => ({ api, model: 'falso' }) }, tareas: () => null });
}
test('cancelar durante permiso deniega pendientes y no ejecuta una aprobacion tardia', async () => {
  const m = montaje(), s = m.sesiones.crear(); let ejecutadas = 0, id;
  m.herramientas.registrar([{ nombre: 'efecto', riesgo: 'escritura', parametros: { type: 'object' }, resumen: () => 'efecto', ejecutar: () => { ejecutadas++; } }]);
  const a = agente(m, { id: 'c', name: 'efecto', args: {} });
  m.bus.once('permiso', req => { id = req.id; a.cancelar(s.id); });
  await assert.rejects(a.enviar(s, 'hazlo'), /cancelado/);
  assert.equal(ejecutadas, 0); assert.equal(m.permisos.pendientes().length, 0);
  assert.equal(m.permisos.resolver(id, 'allow'), false);
});
test('cancelar funciona aun si el proveedor de permisos ignora la cancelacion', async () => {
  const m = montaje(), s = m.sesiones.crear(); let ejecutadas = 0, a;
  m.herramientas.registrar([{ nombre: 'efecto', riesgo: 'escritura', resumen: () => '', ejecutar: () => ejecutadas++ }]);
  m.permisos.pedir = async () => { a.cancelar(s.id); return { ok: true }; };
  a = agente(m, { id: 'c', name: 'efecto', args: {} });
  await assert.rejects(a.enviar(s, 'hazlo'), /cancelado/); assert.equal(ejecutadas, 0);
});
test('JSONL truncado o corrupto recupera entradas validas y conserva bytes originales', () => {
  const m = montaje(), s = m.sesiones.crear(); m.sesiones.agregar(s, { role: 'user', content: 'uno' });
  const f = path.join(m.cfg.dir, 'sesiones', s.id + '.jsonl');
  fs.appendFileSync(f, 'basura\n{"role":"assistant","content":"dos"}\n{"role":');
  const original = fs.readFileSync(f);
  const ses = crearSesiones({ cfg: m.cfg }), r = ses.obtener(s.id);
  assert.equal(r.mensajes.length, 2); assert.deepEqual(r.recuperacion.lineas, [2, 4]);
  assert.deepEqual(fs.readFileSync(path.join(m.cfg.dir, 'sesiones', r.recuperacion.evidencia)), original);
  ses.agregar(r, { role: 'user', content: 'tres' });
  assert.equal(crearSesiones({ cfg: m.cfg }).obtener(s.id).mensajes.length, 3);
});
test('JSONL valido sin salto final permite agregar sin concatenar JSON', () => {
  const m = montaje(), s = m.sesiones.crear(), f = path.join(m.cfg.dir, 'sesiones', s.id + '.jsonl');
  fs.writeFileSync(f, '{"role":"user","content":"uno"}');
  const ses = crearSesiones({ cfg: m.cfg }), r = ses.obtener(s.id); ses.agregar(r, { role: 'user', content: 'dos' });
  assert.equal(crearSesiones({ cfg: m.cfg }).obtener(s.id).mensajes.length, 2);
});
test('auto permite escritura habitual pero pregunta acciones sensibles y declaradas', async () => {
  const m = montaje('auto'), s = m.sesiones.crear({ cwd: temporal() }), pedidos = [];
  m.bus.on('permiso', r => { pedidos.push(r); m.permisos.resolver(r.id, 'deny'); });
  assert.equal((await m.permisos.pedir({ h: m.herramientas.porNombre.escribir_archivo, args: { ruta: 'nota.txt', contenido: 'ok' }, sesion: s })).ok, true);
  assert.equal((await m.permisos.pedir({ h: m.herramientas.porNombre.leer_archivo, args: { ruta: '.env' }, sesion: s })).ok, false);
  assert.equal((await m.permisos.pedir({ h: { nombre: 'plugin', riesgo: 'lectura', siemprePreguntar: () => 'sensible', resumen: () => '' }, args: {}, sesion: s })).ok, false);
  assert.equal((await m.permisos.pedir({ h: m.herramientas.porNombre.shell, args: { comando: 'rm -rf /' }, sesion: s })).ok, false);
  assert.equal((await m.permisos.pedir({ h: m.herramientas.porNombre.web, args: { url: 'https://dominio-nuevo.test', metodo: 'POST', cuerpo: 'datos leidos' }, sesion: s })).ok, false);
  assert.equal(pedidos.length, 4);
});
test('argumentos invalidos no llegan a permisos ni a ejecucion', async () => {
  const m = montaje('auto'), s = m.sesiones.crear(); let permisos = 0, ejecuciones = 0;
  m.permisos.pedir = async () => { permisos++; return { ok: true }; };
  m.herramientas.registrar([{ nombre: 'efecto', riesgo: 'lectura', parametros: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] }, resumen: () => '', ejecutar: () => ejecuciones++ }]);
  await agente(m, { id: 'c', name: 'efecto', args: { n: '1' } }).enviar(s, 'hazlo');
  assert.equal(permisos, 0); assert.equal(ejecuciones, 0); assert.match(s.mensajes.find(x => x.role === 'tool').content, /argumentos invalidos/);
});
test('solo lectura bloquea escrituras, control y delegacion', async () => {
  const m = montaje('solo-lectura'), s = m.sesiones.crear();
  for (const [nombre, args] of [['recordar', { texto: 'x' }], ['olvidar', { id: '1' }], ['clic', { x: 1, y: 1 }], ['navegador_descargar', { imagen: 'img1' }], ['web', { url: 'https://example.com', metodo: 'DELETE' }], ['delegar', { tarea: 'x' }]]) {
    assert.equal((await m.permisos.pedir({ h: m.herramientas.porNombre[nombre], args, sesion: s })).ok, false, nombre);
  }
});
test('registros de herramientas independientes y nombres heredados no se resuelven', () => {
  const a = crearRegistro(), b = crearRegistro();
  a.registrar([{ nombre: 'propia' }]); assert.equal(b.porNombre.propia, undefined); assert.equal(a.porNombre.constructor, undefined);
  a.quitar('listar'); assert.ok(b.porNombre.listar);
});
test('Codex rechaza JSON roto, argumentos rotos o escalares', () => {
  const { decodificar } = require('../proveedores/codex-cli');
  for (const argsJson of ['{', 'null', '[]', '4']) assert.throws(() => decodificar(JSON.stringify({ texto: '', herramientas: [{ nombre: 'x', argsJson }] })));
  assert.throws(() => decodificar('texto sin JSON'));
  assert.deepEqual(decodificar('{"texto":"","herramientas":[{"nombre":"x","argsJson":"{}"}]}').toolCalls[0].args, {});
});
test('redirecciones se autorizan antes del siguiente request; DNS privado no pasa solo', async () => {
  const vistos = [], lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const request = async d => { vistos.push(d.u.href); return { status: 302, headers: { location: 'http://127.0.0.1/secreto' } }; };
  await assert.rejects(fetchSeguro('http://publico.test', {}, { lookup, request, autorizar: async () => false }), /DENEGADO/);
  assert.equal(vistos.length, 1);
  await assert.rejects(fetchSeguro('http://publico.test', {}, { lookup: async () => [{ address: '127.0.0.1', family: 4 }], request }), /DENEGADO/);
  assert.equal(vistos.length, 1);
});
test('DNS se fija al destino validado y autoriza todos los saltos', async () => {
  const ips = [], aprobaciones = [];
  const r = await fetchSeguro('https://a.test', {}, {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    autorizar: async u => { aprobaciones.push(u); return true; },
    request: async d => { ips.push(d.ip.address); return ips.length === 1 ? { status: 302, headers: { location: 'https://b.test/' } } : { status: 200, headers: {} }; },
  });
  assert.equal(r.status, 200); assert.deepEqual(ips, ['93.184.216.34', '93.184.216.34']); assert.deepEqual(aprobaciones, ['https://b.test/']);
});
test('IPC solo admite el documento local y el frame principal', () => {
  const { esConfiable } = require('../../main/ipc-seguro'), { pathToFileURL } = require('url');
  const archivo = path.resolve('app/index.html'), frame = { url: pathToFileURL(archivo).href };
  assert.equal(esConfiable({ senderFrame: frame, sender: { mainFrame: frame } }, archivo), true);
  assert.equal(esConfiable({ senderFrame: { ...frame }, sender: { mainFrame: frame } }, archivo), false);
  frame.url = 'https://atacante.test'; assert.equal(esConfiable({ senderFrame: frame, sender: { mainFrame: frame } }, archivo), false);
});
test('persistencia atomica reemplaza el archivo y limpia temporales', () => {
  const dir = temporal(), f = path.join(dir, 'estado.json'); fs.writeFileSync(f, 'antes');
  require('../persistencia').escribirAtomico(f, 'despues');
  assert.equal(fs.readFileSync(f, 'utf8'), 'despues'); assert.deepEqual(fs.readdirSync(dir), ['estado.json']);
});
test('Codex adjunta las imagenes del historial al proceso y limpia sus temporales', async t => {
  const cp = require('child_process'), raiz = temporal(), entrada = path.join(raiz, '@openai', 'codex', 'bin', 'codex.js');
  fs.mkdirSync(path.dirname(entrada), { recursive: true }); fs.writeFileSync(entrada, '');
  const modulo = require.resolve('../proveedores/codex-cli'), anterior = require.cache[modulo];
  t.after(() => { require.cache[modulo] = anterior; });
  t.mock.method(cp, 'execFileSync', () => raiz);
  let capturadas, carpeta;
  t.mock.method(cp, 'spawn', (_cmd, args, opts) => {
    carpeta = opts.cwd; const hijo = new EventEmitter(); hijo.stdout = new EventEmitter(); hijo.stderr = new EventEmitter(); hijo.kill = () => {};
    capturadas = args.flatMap((a, i) => a === '--image' ? [fs.readFileSync(args[i + 1]).toString()] : []);
    hijo.stdin = { end: prompt => {
      assert.match(prompt, /Captura adjunta/); assert.doesNotMatch(prompt, /por esta v.a no puedes ver/);
      fs.writeFileSync(args[args.indexOf('-o') + 1], '{"texto":"visto","herramientas":[]}');
      setImmediate(() => hijo.emit('close', 0));
    } };
    return hijo;
  });
  delete require.cache[modulo];
  const api = require('../proveedores/codex-cli')({});
  const r = await api.chat({ mensajes: [{ role: 'tool', name: 'captura', content: 'pantalla', imagenes: [{ mime: 'image/png', datos: Buffer.from('imagen-real-del-test').toString('base64') }] }], herramientas: [] });
  assert.equal(r.texto, 'visto'); assert.deepEqual(capturadas, ['imagen-real-del-test']); assert.equal(fs.existsSync(carpeta), false);
});
test('plugins rechazan Node sin aislamiento en lugar de degradarlo', () => {
  const { entornoHijo, motivoSinSandbox } = require('../plugins');
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node');
  // bajo Electron se usa el Node del sistema (buscarNode), así que fingir la versión propia no aplica
  if (!process.versions.electron) try {
    Object.defineProperty(process.versions, 'node', { ...descriptor, value: '20.0.0' });
    assert.throws(() => entornoHijo({ lectura: [], escritura: [], shell: false }), /inicio bloqueado/);
  } finally { Object.defineProperty(process.versions, 'node', descriptor); }
  if (motivoSinSandbox()) return;                              // este Node no tiene modelo de permisos: no hay entorno que comprobar
  const opciones = entornoHijo({ lectura: ['lectura'], escritura: ['escritura'], shell: false });
  assert.equal(opciones.sandbox, true); assert.ok(opciones.execArgv.includes('--permission')); assert.ok(!opciones.execArgv.includes('--allow-child-process'));
});
test('si falla rename, la persistencia mantiene el archivo original', t => {
  const dir = temporal(), archivo = path.join(dir, 'estado.json'); fs.writeFileSync(archivo, 'original');
  t.mock.method(fs, 'renameSync', () => { throw new Error('fallo simulado'); });
  assert.throws(() => require('../persistencia').escribirAtomico(archivo, 'nuevo'), /fallo simulado/);
  assert.equal(fs.readFileSync(archivo, 'utf8'), 'original'); assert.deepEqual(fs.readdirSync(dir), ['estado.json']);
});
test('la evidencia conserva incluso bytes UTF8 invalidos', () => {
  const m = montaje(), s = m.sesiones.crear(), f = path.join(m.cfg.dir, 'sesiones', s.id + '.jsonl'), bytes = Buffer.from([0xff, 0xfe, 0x7b]);
  fs.writeFileSync(f, bytes);
  const r = crearSesiones({ cfg: m.cfg }).obtener(s.id);
  assert.deepEqual(fs.readFileSync(path.join(m.cfg.dir, 'sesiones', r.recuperacion.evidencia)), bytes);
});
test('un hostname que empieza por fc no es una IPv6 privada; :: si lo es', () => {
  const { urlPrivada } = require('../seguridad');
  assert.equal(urlPrivada('https://fc-ejemplo.com'), false); assert.equal(urlPrivada('http://[::]/'), true);
});
