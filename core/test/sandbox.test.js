// Etapa H · Sandbox por niveles para skills/plugins de terceros: elección de nivel, caídas (fallback), auditoría, pánico,
// .wsb de Windows Sandbox y, en Windows, la jaula REAL (Job Object + integridad baja): escribir en el perfil, crear procesos y memoria.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { crearSandbox, elegirNivel, matarTodo } = require('../sandbox');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
const conf = (x = {}) => ({ porDefecto: 'auto', porSkill: {}, sinSoporte: 'avisar', ...x });
const WIN = { restringido: true, aislado: false, motivoAislado: 'no instalado' };
const VERDE = { escaneo: { nivel: 'verde' } }, CONFIANZA = { firma: { estado: 'verificada', autor: 'Demon' }, escaneo: { nivel: 'verde' } };
function auditoriaFalsa() {
  const l = []; let n = 0;
  return { l, registrar: e => { l.push({ ...e }); return `a${++n}`; }, resultado: (id, ok, texto) => l.push({ tipo: 'resultado', id, ok, texto }) };
}
// impl de SO falsa: "restringido" = proceso node normal (para probar la orquestación sin Windows)
const implFalsa = (disp = WIN) => ({
  disponible: () => disp,
  prepararRestringido: async ({ dirOrigen }) => { const r = tmp(); return { jaula: 'x', root: r, cwd: r, tmp: r, limpiar: () => fs.rmSync(r, { recursive: true, force: true }), dirOrigen }; },
  lanzarRestringido: ({ bin, args, cwd, env }) => spawn(bin, args, { cwd, env, windowsHide: true }),
  ejecutarAislado: async () => ({ salida: 'desde la VM', codigo: 0 }),
});

test('elección de nivel: auto según firma + escaneo, overrides por skill, rojo nunca normal', () => {
  const e = (meta, c = conf(), clave = 'sk', disp = WIN) => elegirNivel({ conf: c, clave, meta, disp });
  assert.strictEqual(e({}).nivel, 'restringido', 'sin firma ni escaneo → restringido');
  assert.strictEqual(e(VERDE).nivel, 'restringido', 'verde pero sin firma → restringido');
  assert.strictEqual(e({ firma: { estado: 'desconocida' }, escaneo: { nivel: 'verde' } }).nivel, 'restringido', 'firma de clave no confiable → restringido');
  assert.strictEqual(e({ firma: { estado: 'verificada' }, escaneo: { nivel: 'amarillo' } }).nivel, 'restringido', 'firmada pero escaneo amarillo → restringido');
  const ok = e(CONFIANZA); assert.strictEqual(ok.nivel, 'normal'); assert.match(ok.motivo, /Demon/);
  assert.strictEqual(e({ dev: true }).nivel, 'normal', 'plugin en desarrollo local = código propio');
  assert.strictEqual(e(CONFIANZA, conf({ porSkill: { sk: 'restringido' } })).nivel, 'restringido', 'el usuario puede endurecer una de confianza');
  assert.strictEqual(e({}, conf({ porSkill: { sk: 'normal' } })).nivel, 'normal', 'y relajar una no firmada (decisión suya, queda auditada)');
  const rojo = e({ escaneo: { nivel: 'rojo' } }, conf({ porSkill: { sk: 'normal' } }));
  assert.strictEqual(rojo.nivel, 'restringido'); assert.match(rojo.motivo, /ROJO/);
  assert.strictEqual(e({}, conf({ porDefecto: 'restringido' }), 'otra').nivel, 'restringido');
  assert.strictEqual(e(CONFIANZA, conf({ porDefecto: 'nivel-raro' })).nivel, 'normal', 'valor no válido = auto');
});

test('caídas: aislado sin Windows Sandbox → restringido; sin sandbox en el SO → normal con aviso o bloqueado', () => {
  const a = elegirNivel({ conf: conf({ porSkill: { sk: 'aislado' } }), clave: 'sk', meta: {}, disp: WIN });
  assert.strictEqual(a.nivel, 'restringido'); assert.match(a.avisos.join(), /aislado no disponible: no instalado/);
  assert.strictEqual(elegirNivel({ conf: conf({ porSkill: { sk: 'aislado' } }), clave: 'sk', meta: {}, disp: { ...WIN, aislado: true } }).nivel, 'aislado');
  const linux = require('../sandbox/otros').para('linux').disponible();
  const l = elegirNivel({ conf: conf(), clave: 'sk', meta: {}, disp: linux });
  assert.strictEqual(l.nivel, 'normal'); assert.match(l.avisos.join(), /aún no existe en Linux/);
  assert.strictEqual(elegirNivel({ conf: conf({ sinSoporte: 'bloquear' }), clave: 'sk', meta: {}, disp: linux }).nivel, 'bloqueado');
  const mac = elegirNivel({ conf: conf({ porSkill: { sk: 'aislado' } }), clave: 'sk', meta: {}, disp: require('../sandbox/otros').para('darwin').disponible() });
  assert.strictEqual(mac.nivel, 'normal'); assert.strictEqual(mac.avisos.length, 2);
});

test('ejecutar: auditoría de la elección y del resultado, bloqueado, aislado y nivel persistido en config.json', async () => {
  const dir = tmp(), aud = auditoriaFalsa();
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'x/y' }));
  const cfg = { dir }, sb = crearSandbox({ cfg, auditoria: aud, impl: implFalsa() });
  const r = await sb.ejecutar({ clave: 'util', meta: VERDE, bin: process.execPath, args: ['-e', 'console.log("hola")'], env: process.env });
  assert.strictEqual(r.nivel, 'restringido'); assert.strictEqual(r.codigo, 0); assert.match(r.salida, /hola/); assert.match(r.nota, /^\[sandbox: restringido\] no confiable/);
  assert.deepStrictEqual([aud.l[0].tipo, aud.l[0].decision, aud.l[0].origen, aud.l[0].herramienta], ['sandbox', 'restringido', 'util', 'ejecutar_script_skill']);
  assert.strictEqual(aud.l[1].tipo, 'resultado'); assert.strictEqual(aud.l[1].ok, true); assert.match(aud.l[1].texto, /restringido · código 0/);
  // nivel por skill: se guarda en cfg y en disco, y la siguiente ejecución lo usa
  sb.ponerNivel('util', 'aislado');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).seguridad.sandbox.porSkill.util, 'aislado');
  const r2 = await sb.ejecutar({ clave: 'util', meta: {}, bin: 'x', args: [] });
  assert.strictEqual(r2.nivel, 'restringido', 'sin Windows Sandbox cae al restringido'); assert.match(r2.nota, /aislado no disponible/);
  const sbVm = crearSandbox({ cfg, auditoria: aud, impl: implFalsa({ ...WIN, aislado: true }) });
  assert.strictEqual((await sbVm.ejecutar({ clave: 'util', meta: {}, bin: 'x' })).salida, 'desde la VM');
  sb.ponerNivel('util', 'auto'); assert.strictEqual(cfg.seguridad.sandbox.porSkill.util, undefined);
  assert.throws(() => sb.ponerNivel('util', 'root'), /nivel no válido/);
  // plugin en un SO sin sandbox con sinSoporte = bloquear → no se ejecuta y queda auditado
  const sbL = crearSandbox({ cfg: { seguridad: { sandbox: { sinSoporte: 'bloquear' } } }, auditoria: aud, impl: require('../sandbox/otros').para('linux') });
  const b = await sbL.ejecutar({ clave: 'plugin:x', tipo: 'plugin', meta: {}, bin: 'bash', args: ['-lc', 'id'] });
  assert.strictEqual(b.codigo, -1); assert.match(b.salida, /bloqueado/);
  assert.ok(aud.l.some(x => x.tipo === 'sandbox' && x.decision === 'bloqueado' && x.herramienta === 'plugin.shell'));
});

test('pánico: matarTodo() mata lo que corre en sandbox (también desde el kill switch del núcleo)', async () => {
  const sb = crearSandbox({ cfg: {}, impl: implFalsa() });
  const t0 = Date.now();
  const pr = sb.ejecutar({ clave: 'lenta', meta: {}, bin: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], env: process.env, timeoutSeg: 60 });
  await new Promise(r => setTimeout(r, 300));
  assert.strictEqual(matarTodo(), 1);
  const r = await pr; assert.notStrictEqual(r.codigo, 0); assert.ok(Date.now() - t0 < 10_000);
  // el pánico del núcleo llama a matarTodo
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'f/m', proveedores: { f: { tipo: 'openai', baseUrl: 'http://127.0.0.1:9/v1', local: true } } }));
  const { crearBoveda, cifradorArchivo } = require('../boveda');
  const n = require('../index').crearNucleo({ dir, embedder: null, sinPlugins: true, boveda: crearBoveda({ dir, cifrador: cifradorArchivo(dir) }) });
  const sb2 = crearSandbox({ cfg: n.cfg, impl: implFalsa() });
  const pr2 = sb2.ejecutar({ clave: 'lenta', meta: {}, bin: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], env: process.env, timeoutSeg: 60 });
  await new Promise(r => setTimeout(r, 300));
  const p = n.panico.activar('test'); assert.strictEqual(p.sandbox, 1);
  assert.notStrictEqual((await pr2).codigo, 0);
  n.panico.reanudar('test');
  assert.ok(n.sandbox && typeof n.sandbox.estado().porDefecto === 'string', 'el núcleo expone su sandbox');
});

test('Windows Sandbox: el .wsb mapea la skill en solo lectura, salida escribible y red apagada salvo permiso', () => {
  const { generarWsb } = require('../sandbox/windows');
  const x = generarWsb({ mapeos: [{ host: 'C:\\t\\skill', guest: 'C:\\apolo\\skill', soloLectura: true }, { host: 'C:\\t\\salida', guest: 'C:\\apolo\\salida', soloLectura: false }], comando: 'powershell -File "a&b"' });
  assert.match(x, /<Networking>Disable<\/Networking>/); assert.match(x, /<ClipboardRedirection>Disable/);
  assert.match(x, /<HostFolder>C:\\t\\skill<\/HostFolder><SandboxFolder>C:\\apolo\\skill<\/SandboxFolder><ReadOnly>true<\/ReadOnly>/);
  assert.match(x, /C:\\apolo\\salida<\/SandboxFolder><ReadOnly>false/); assert.match(x, /a&amp;b/);
  assert.match(generarWsb({ mapeos: [], red: true, comando: 'x' }), /<Networking>Enable/);
});

// ---------- jaula REAL (solo Windows) ----------
const enWindows = { skip: process.platform !== 'win32' ? 'solo Windows' : false };
test('jaula real: no escribe en el perfil, no crea procesos, la memoria de más la mata y su carpeta de trabajo sí es escribible', enWindows, async () => {
  const dir = tmp(), skill = path.join(tmp(), 'mala'), aud = auditoriaFalsa();
  fs.mkdirSync(skill);
  const marca = path.join(os.homedir(), `apolo-sandbox-test-${process.pid}.txt`);
  fs.writeFileSync(path.join(dir, 'token'), 'secreto-del-daemon');
  fs.writeFileSync(path.join(skill, 'prueba.js'), `
    const fs = require('fs'), cp = require('child_process');
    const p = (k, f) => { try { console.log(k, f()); } catch (e) { console.log(k, 'BLOQUEADO', e.code || e.message); } };
    p('PERFIL', () => { fs.writeFileSync(${JSON.stringify(marca)}, 'x'); return 'ESCRITO'; });
    p('TRABAJO', () => { fs.writeFileSync('salida.txt', 'x'); return 'ESCRITO'; });
    p('HIJO', () => { const r = cp.spawnSync('cmd.exe', ['/c', 'echo hijo']); if (r.error) throw r.error; return 'CREADO'; });
    p('TOKEN', () => fs.readFileSync(${JSON.stringify(path.join(dir, 'token'))}, 'utf8'));
    p('LEER_PERFIL', () => fs.readdirSync(require('os').homedir()).length > 0 ? 'LEIDO' : '?');
    if (process.argv[2] === 'mem') { const a = []; for (let i = 0; i < 100; i++) a.push(Buffer.alloc(10 * 1024 * 1024, 1)); console.log('MEM NO MATADO'); }
  `);
  const sb = crearSandbox({ cfg: { dir, seguridad: { sandbox: { memoriaMB: 128 } } }, auditoria: aud });
  const r = await sb.ejecutar({ clave: 'mala', meta: {}, bin: process.execPath, args: [path.join(skill, 'prueba.js')], dirOrigen: skill, env: require('../seguridad').envLimpio(process.env), timeoutSeg: 60 });
  try { fs.rmSync(marca, { force: true }); } catch { }
  assert.strictEqual(r.nivel, 'restringido', r.salida);
  assert.match(r.salida, /PERFIL BLOQUEADO EPERM/, r.salida);
  assert.ok(!fs.existsSync(marca));
  assert.match(r.salida, /TRABAJO ESCRITO/, 'la copia temporal (etiqueta Low) sí es escribible');
  assert.match(r.salida, /HIJO BLOQUEADO/); assert.match(r.salida, /\[sandbox\] bloqueado: intentó crear más procesos/);
  assert.match(r.salida, /TOKEN BLOQUEADO/, 'el token del daemon tiene NO_READ_UP');
  assert.match(r.salida, /LEER_PERFIL LEIDO/, 'honesto: integridad baja NO impide leer el perfil');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'token'), 'utf8'), 'secreto-del-daemon', 'APOLO (integridad media) sigue leyéndolo');
  assert.ok(!fs.existsSync(path.join(skill, 'salida.txt')), 'la skill original no se toca');
  const m = await sb.ejecutar({ clave: 'mala', meta: {}, bin: process.execPath, args: [path.join(skill, 'prueba.js'), 'mem'], dirOrigen: skill, env: require('../seguridad').envLimpio(process.env), timeoutSeg: 60 });
  assert.strictEqual(m.codigo, 137, m.salida); assert.match(m.salida, /\[sandbox\] memoria: superó el límite de 128 MB/); assert.doesNotMatch(m.salida, /MEM NO MATADO/);
  assert.ok(aud.l.some(x => x.tipo === 'resultado' && /código 137 · .*\[sandbox\] memoria/.test(x.texto)), 'el resultado auditado dice por qué murió');
});

test('jaula real: ejecutar_script_skill de una skill sin firmar corre restringida y la auditoría del núcleo lo apunta', enWindows, async () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'f/m', proveedores: { f: { tipo: 'openai', baseUrl: 'http://127.0.0.1:9/v1', local: true } } }));
  const { crearBoveda, cifradorArchivo } = require('../boveda');
  const n = require('../index').crearNucleo({ dir, embedder: null, sinPlugins: true, boveda: crearBoveda({ dir, cifrador: cifradorArchivo(dir) }) });
  const src = path.join(tmp(), 'eco'); fs.mkdirSync(path.join(src, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nname: eco\ndescription: Eco de prueba\napolo:\n  permisos: [ejecucion]\n---\n# Pasos de eco\n1. eco');
  fs.writeFileSync(path.join(src, 'scripts', 'eco.js'), 'console.log("eco", process.argv[2], require("path").basename(process.cwd()))');
  await n.skills.instalar(src); await n.skills.activar('eco', true, { forzar: true });
  const r = await require('../herramientas').porNombre.ejecutar_script_skill.ejecutar({ nombre: 'eco', script: 'eco.js', args: ['hola'] }, { skills: n.skills, cfg: n.cfg, sandbox: n.sandbox, sesion: { id: 's' } });
  assert.match(r, /^eco hola eco\n\[código de salida 0\]\n\[sandbox: restringido\]/, r);
  const lineas = fs.readFileSync(path.join(dir, 'auditoria.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.ok(lineas.some(l => l.tipo === 'sandbox' && l.decision === 'restringido' && l.origen === 'eco'));
  assert.ok(n.auditoria.verificar ? n.auditoria.verificar().ok !== false : true, 'la cadena de auditoría sigue íntegra');
});
