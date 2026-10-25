const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearPermisos } = require('../permisos');
const { porNombre: H } = require('../herramientas');
const { crearSkills } = require('../skills');
const seg = require('../seguridad');
const rutas = require('../rutas-seguras');
const enlace = (de, a) => fs.symlinkSync(de, a, process.platform === 'win32' ? 'junction' : 'dir');
function entorno(modo = 'auto') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-rutas-'));
  const dir = path.join(base, 'datos'), cwd = path.join(base, 'trabajo');
  fs.mkdirSync(dir); fs.mkdirSync(cwd);
  const cfg = { dir, permisos: { modo }, skills: { rutas: [], reglasProyecto: false } };
  const bus = new EventEmitter(), pedidos = [], permisos = crearPermisos({ cfg, bus });
  bus.on('permiso', p => { pedidos.push(p); permisos.resolver(p.id, 'deny'); });
  return { base, dir, cwd, cfg, bus, pedidos, permisos, sesion: { id: 'fixture', cwd } };
}
function skill(m, nombre = 'prueba') {
  const d = path.join(m.dir, 'skills', nombre); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${nombre}\ndescription: fixture\n---\nPrueba.`);
  fs.writeFileSync(path.join(d, 'instalado.json'), JSON.stringify({ activa: true }));
  return d;
}

test('NTFS: flujos, dispositivos y alias no llegan a herramientas de archivo', { skip: process.platform !== 'win32' }, async t => {
  const m = entorno(); fs.writeFileSync(path.join(m.dir, 'token'), 'MARCADOR');
  assert.equal(fs.readFileSync(path.join(m.dir, 'token::$DATA'), 'utf8'), 'MARCADOR');
  for (const rel of ['token::$DATA', 'config.json:flujo', '.env::$DATA', 'token.', 'token ', 'NUL']) {
    const ruta = path.join(m.dir, rel);
    for (const nombre of ['leer_archivo', 'listar', 'escribir_archivo', 'editar_archivo']) {
      const args = { ruta, contenido: 'NO', buscar: 'MARCADOR', reemplazar: 'NO' };
      assert.equal((await m.permisos.pedir({ h: H[nombre], args, sesion: m.sesion })).ok, false, nombre + ':' + rel);
      await assert.rejects(H[nombre].ejecutar(args, { cwd: m.cwd }), /ruta especial/);
    }
  }
  assert.equal(fs.readFileSync(path.join(m.dir, 'token'), 'utf8'), 'MARCADOR');
  assert.equal(m.pedidos.length, 0);
  let accesos = 0;
  t.mock.method(fs, 'lstatSync', () => { accesos++; throw new Error('no contactar la red'); });
  assert.throws(() => rutas.rutaReal('\\\\servidor-ficticio\\share\\nota.txt'), /ruta de red/);
  assert.throws(() => rutas.rutaReal('\\\\?\\C:\\archivo.txt'), /dispositivo/);
  assert.equal(accesos, 0);
});

test('enlaces a datos internos preguntan incluso en auto; no se aplica siempre', async () => {
  const m = entorno(); enlace(m.dir, path.join(m.cwd, 'alias'));
  fs.writeFileSync(path.join(m.dir, 'token'), 'MARCADOR');
  m.permisos.reglas().push({ herramienta: 'leer_archivo', prefijo: m.base }, { herramienta: 'escribir_archivo', prefijo: m.base });
  for (const [nombre, args] of [
    ['leer_archivo', { ruta: 'alias/token' }],
    ['escribir_archivo', { ruta: 'alias/reglas.json', contenido: '[]' }],
    ['editar_archivo', { ruta: 'alias/token', buscar: 'MARCADOR', reemplazar: 'NO' }],
  ]) assert.equal((await m.permisos.pedir({ h: H[nombre], args, sesion: m.sesion })).ok, false);
  assert.equal(m.pedidos.length, 3);
  assert.ok(m.pedidos.every(p => p.peligro.includes('acceso sensible')));
  assert.equal(fs.existsSync(path.join(m.dir, 'reglas.json')), false);
});

test('enlaces a .env fuera del nucleo se reconocen como sensibles', async () => {
  const m = entorno(), privada = path.join(m.base, 'privada'); fs.mkdirSync(privada);
  fs.writeFileSync(path.join(privada, '.env'), 'FICTICIO=valor'); enlace(privada, path.join(m.cwd, 'alias'));
  assert.ok(seg.rutaSensible(path.join(m.cwd, 'alias', '.env')));
  assert.equal((await m.permisos.pedir({ h: H.leer_archivo, args: { ruta: 'alias/.env' }, sesion: m.sesion })).ok, false);
});

test('reglas de carpeta se comparan con el destino real de un enlace', async () => {
  const m = entorno('preguntar'), externa = path.join(m.base, 'externa'); fs.mkdirSync(externa);
  enlace(externa, path.join(m.cwd, 'alias'));
  m.permisos.reglas().push({ herramienta: 'escribir_archivo', prefijo: m.cwd });
  assert.equal((await m.permisos.pedir({ h: H.escribir_archivo, args: { ruta: 'alias/nota.txt', contenido: 'NO' }, sesion: m.sesion })).ok, false);
  assert.equal(m.pedidos.length, 1);
});

test('un cambio de enlace durante la aprobacion invalida el permiso', async () => {
  const m = entorno('preguntar'), original = path.join(m.base, 'original'); fs.mkdirSync(original);
  const alias = path.join(m.cwd, 'alias'); enlace(original, alias);
  m.bus.removeAllListeners('permiso');
  m.bus.on('permiso', p => { fs.renameSync(alias, alias + '-anterior'); enlace(m.dir, alias); m.permisos.resolver(p.id, 'allow'); });
  const r = await m.permisos.pedir({ h: H.escribir_archivo, args: { ruta: 'alias/nueva.txt', contenido: 'NO' }, sesion: m.sesion });
  assert.equal(r.ok, false); assert.match(r.motivo, /cambio/);
  assert.equal(fs.existsSync(path.join(m.dir, 'nueva.txt')), false);
});

test('un cambio despues de aprobar no permite leer, listar, editar ni escribir otro destino', async () => {
  const m = entorno(), original = path.join(m.base, 'original'); fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, 'nota.txt'), 'ANTES'); fs.writeFileSync(path.join(m.dir, 'nota.txt'), 'PRIVADO');
  const alias = path.join(m.cwd, 'alias'); enlace(original, alias);
  const solicitudes = ['leer_archivo', 'listar', 'editar_archivo', 'escribir_archivo'].map(nombre => ({ nombre, args: { ruta: nombre === 'listar' ? 'alias' : 'alias/nota.txt', buscar: 'PRIVADO', reemplazar: 'NO', contenido: 'NO' } }));
  for (const { nombre, args } of solicitudes) assert.equal((await m.permisos.pedir({ h: H[nombre], args, sesion: m.sesion })).ok, true);
  fs.renameSync(alias, alias + '-anterior'); enlace(m.dir, alias);
  for (const { nombre, args } of solicitudes) await assert.rejects(H[nombre].ejecutar(args, { cwd: m.cwd }), /cambio despues del permiso/);
  assert.equal(fs.readFileSync(path.join(m.dir, 'nota.txt'), 'utf8'), 'PRIVADO');
});

test('listar sin ruta no omite la clasificacion sensible del cwd', async () => {
  const m = entorno(); m.sesion.cwd = path.join(m.base, '.ssh'); fs.mkdirSync(m.sesion.cwd);
  // El propio directorio .ssh tambien debe tratarse como privado.
  assert.equal((await m.permisos.pedir({ h: H.listar, args: {}, sesion: m.sesion })).ok, false);
});

test('worktrees enlazados a la raiz de datos no amplian la excepcion de escritura', async () => {
  const m = entorno(); fs.mkdirSync(path.join(m.dir, 'turno'));
  enlace(m.dir, path.join(m.dir, 'turno', 'worktrees'));
  const r = await m.permisos.pedir({ h: H.escribir_archivo, args: { ruta: path.join(m.dir, 'interno.txt'), contenido: 'NO' }, sesion: m.sesion });
  assert.equal(r.ok, false); assert.equal(m.pedidos.length, 1);
});

test('skill: lectura y anotaciones rechazan junctions externas sin tocar el destino', async () => {
  const m = entorno(), sd = skill(m), skills = crearSkills({ cfg: m.cfg, bus: m.bus });
  fs.writeFileSync(path.join(m.dir, 'config.json'), 'ORIGINAL');
  enlace(m.dir, path.join(sd, 'alias')); enlace(m.dir, path.join(sd, '_datos'));
  assert.throws(() => skills.rutaDentro(skills.activa('prueba'), 'alias/config.json'), /fuera de la skill/);
  await assert.rejects(H.leer_recurso_skill.ejecutar({ nombre: 'prueba', ruta: 'alias/config.json' }, { skills }), /fuera de la skill/);
  assert.throws(() => skills.anotar('prueba', 'config.json', 'NO', 'reemplazar'), /fuera de la skill/);
  assert.equal(fs.readFileSync(path.join(m.dir, 'config.json'), 'utf8'), 'ORIGINAL');
});

test('skill: enlaces internos y notas normales siguen funcionando', () => {
  const m = entorno(), sd = skill(m); fs.mkdirSync(path.join(sd, 'references'));
  fs.writeFileSync(path.join(sd, 'references', 'nota.txt'), 'INTERNO'); enlace(path.join(sd, 'references'), path.join(sd, 'alias'));
  const skills = crearSkills({ cfg: m.cfg, bus: m.bus });
  assert.equal(fs.readFileSync(skills.rutaDentro(skills.activa('prueba'), 'alias/nota.txt'), 'utf8'), 'INTERNO');
  skills.anotar('prueba', 'nota.txt', 'uno'); skills.anotar('prueba', 'nota.txt', 'dos');
  assert.match(fs.readFileSync(path.join(sd, '_datos', 'nota.txt'), 'utf8'), /uno\s+dos/);
  assert.throws(() => skills.rutaDentro(skills.activa('prueba'), '../config.json'), /ruta no/);
});

test('skills externas permanecen intactas al intentar anotar', () => {
  const m = entorno(), externas = path.join(m.base, 'externas'), sd = path.join(externas, 'externa'); fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, 'SKILL.md'), '---\nname: externa\ndescription: fixture\n---\nPrueba.');
  m.cfg.skills = { rutas: [externas], externasActivas: true, reglasProyecto: false };
  const skills = crearSkills({ cfg: m.cfg, bus: m.bus });
  assert.equal(skills.activa('externa').externa, true);
  assert.throws(() => skills.anotar('externa', 'nota.txt', 'NO'), /solo lectura/);
  assert.deepEqual(fs.readdirSync(sd), ['SKILL.md']);
});

test('rutas con padres inexistentes conservan el destino real; enlaces rotos se rechazan', () => {
  const m = entorno(); enlace(m.cwd, path.join(m.base, 'alias'));
  assert.equal(rutas.rutaReal(path.join(m.base, 'alias', 'nueva', 'nota.txt')), path.join(fs.realpathSync(m.cwd), 'nueva', 'nota.txt'));
  enlace(path.join(m.base, 'no-existe'), path.join(m.cwd, 'roto'));
  assert.throws(() => rutas.rutaReal(path.join(m.cwd, 'roto', 'nota.txt')));
});
