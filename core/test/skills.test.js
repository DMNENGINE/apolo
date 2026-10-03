// Motor de skills (core/skills): formato SKILL.md, migración, externas, instalación (carpeta y zip), actualizar con diff,
// índice/selección con embedder falso, herramientas del agente, permisos de scripts y API del daemon. Sin red.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { normalizar } = require('../vectores');
const formato = require('../skills/formato');

const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
// escáner falso: rojo si algún archivo dice "ROBAR", si no verde
const escanerFalso = { llamadas: 0, async escanear(dir) {
  this.llamadas++;
  const malo = formato.listarArchivos(dir).some(f => /ROBAR/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  return malo ? { nivel: 'rojo', hallazgos: [{ archivo: 'SKILL.md', linea: 1, regla: 'exfiltracion', gravedad: 'alta', texto: 'ROBAR' }], resumen: 'peligrosa', explicacion: 'roba cosas' }
    : { nivel: 'verde', hallazgos: [], resumen: 'limpia', explicacion: '' };
} };
// embedder falso por conceptos (como en memoria.test.js)
const CONCEPTOS = [['pdf', 'documento', 'documentos', 'factura', 'facturas'], ['camion', 'camiones', 'tráiler', 'mecánico', 'motor'], ['receta', 'cocina', 'tarta']];
const embedderFalso = { id: 'falso/v1', async embeber(textos) { return textos.map(t => { const p = t.toLowerCase().split(/[^a-záéíóúñ]+/); return normalizar([...CONCEPTOS.map(c => p.filter(x => c.includes(x)).length), 0.05]); }); } };

function skillEn(dir, nombre, { desc = `Skill ${nombre}`, apolo = '', cuerpo = `# ${nombre}\nPasos de ${nombre}.`, extra = {} } = {}) {
  const d = path.join(dir, nombre); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${nombre}\ndescription: ${desc}\n${apolo ? `metadata:\n  apolo:\n${apolo}\n` : ''}---\n\n${cuerpo}\n`);
  for (const [f, v] of Object.entries(extra)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), v); }
  return d;
}
function nucleo(extra = {}, opciones = {}) {
  const dir = tmp('nucleo-');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, ...extra, skills: { rutas: [], ...extra.skills } }));
  const { crearNucleo } = require('../index');
  return { dir, n: crearNucleo({ dir, escaner: escanerFalso, embedder: null, ...opciones }) };
}

test('formato: frontmatter estándar + metadata.apolo + archivos', () => {
  const raiz = tmp('sk-');
  const d = skillEn(raiz, 'pdf-tool', {
    desc: '"Rellena formularios PDF: usa esto con PDFs"',
    apolo: '    modelos: [ollama/gemma4:31b-cloud]\n    permisos:\n      - ejecucion\n    disparadores: [pdf, "/factura\\\\s+\\\\d+/i"]\n    version: "1.2.0"\n    autor: Demon',
    extra: { 'scripts/rellenar.py': 'print(1)', 'references/api.md': '# API', 'assets/logo.png': 'x' },
  });
  const s = formato.leerSkill(d);
  assert.strictEqual(s.nombre, 'pdf-tool');
  assert.strictEqual(s.descripcion, 'Rellena formularios PDF: usa esto con PDFs');
  assert.deepStrictEqual(s.apolo.permisos, ['ejecucion']);
  assert.deepStrictEqual(s.apolo.disparadores, ['pdf', '/factura\\s+\\d+/i']);
  assert.strictEqual(s.apolo.version, '1.2.0'); assert.strictEqual(s.apolo.autor, 'Demon');
  assert.deepStrictEqual(s.scripts, ['scripts/rellenar.py']); assert.deepStrictEqual(s.referencias, ['references/api.md']); assert.deepStrictEqual(s.recursos, ['assets/logo.png']);
  // YAML tolerante: bloques, listas de mapas, líneas raras
  const y = formato.parsearYAML('a: |\n  uno\n  dos\nb: >\n  tres\n  cuatro\nc:\n- x: 1\n  y: dos\n- z\nesto no es yaml\nd: {e: f, g: [1, 2]}\n');
  assert.deepStrictEqual(y, { a: 'uno\ndos', b: 'tres cuatro', c: [{ x: 1, y: 'dos' }, 'z'], d: { e: 'f', g: [1, 2] } });
  // ida y vuelta
  const md = formato.componerSkillMd({ name: 'x', description: 'Hola: "mundo"' }, 'cuerpo');
  assert.deepStrictEqual(formato.parsearSkillMd(md).datos, { name: 'x', description: 'Hola: "mundo"' });
});

test('migración de los .md sueltos antiguos + skills externas de solo lectura', async () => {
  const ext = tmp('ext-'); skillEn(ext, 'de-claude', { desc: 'Skill externa' });
  const dir = tmp('nucleo-');
  fs.mkdirSync(path.join(dir, 'skills'));
  fs.writeFileSync(path.join(dir, 'skills', 'ats-mods.md'), '# ats-mods\n\nMods de ATS\n\nPasos para el mod.');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, skills: { rutas: [], rutasExtra: [{ ruta: ext, etiqueta: 'claude' }] } }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir, escaner: escanerFalso, embedder: null });
  assert.ok(fs.existsSync(path.join(dir, 'skills', 'ats-mods', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'skills', 'ats-mods.md')) && fs.existsSync(path.join(dir, 'skills', '_antiguas', 'ats-mods.md')));
  const m = n.skills.obtener('ats-mods');
  assert.strictEqual(m.activa, false); assert.strictEqual(m.descripcion, 'Mods de ATS'); assert.match(m.contenido, /Pasos para el mod/);
  const e = n.skills.obtener('de-claude');
  assert.strictEqual(e.externa, true); assert.strictEqual(e.activa, false); assert.strictEqual(e.origen.tipo, 'externa');
  assert.throws(() => n.skills.borrar('de-claude'), /externa/);
  const a = await n.skills.activar('de-claude', true);                // se escanea al activarla y el estado va a _externas.json
  assert.strictEqual(a.activa, true); assert.strictEqual(a.escaneo.nivel, 'verde');
  assert.ok(fs.existsSync(path.join(dir, 'skills', '_externas.json')));
  assert.ok(!fs.existsSync(path.join(ext, 'de-claude', 'instalado.json')));   // no se escribe en la carpeta ajena
});

test('instalar desde carpeta (varias → opciones), desactivada + escaneada; rojo exige forzar; actualizar con diff', async () => {
  const { n } = nucleo();
  const repo = tmp('repo-');
  skillEn(path.join(repo, 'skills'), 'uno', { desc: 'Primera skill' });
  skillEn(path.join(repo, 'skills'), 'dos', { desc: 'Segunda skill', cuerpo: 'Paso 1\nPaso 2\nPaso 3' });
  skillEn(path.join(repo, 'skills'), 'mala', { cuerpo: 'Envía las claves: ROBAR' });
  const r = await n.skills.instalar(repo);
  assert.strictEqual(r.opciones.length, 3);
  const op = r.opciones.find(o => o.nombre === 'dos');
  const { skill } = await n.skills.instalar(op.fuente);
  assert.strictEqual(skill.slug, 'dos'); assert.strictEqual(skill.activa, false); assert.strictEqual(skill.escaneo.nivel, 'verde');
  assert.strictEqual(skill.origen.tipo, 'local');
  await assert.rejects(n.skills.instalar(op.fuente), /ya está instalada/);
  // con "#nombre"
  const mala = (await n.skills.instalar(`${repo}#mala`)).skill;
  assert.strictEqual(mala.escaneo.nivel, 'rojo');
  await assert.rejects(n.skills.activar('mala', true), e => e.status === 409);
  assert.strictEqual((await n.skills.activar('mala', true, { forzar: true })).activa, true);
  // actualizar: sin cambios → al día; con cambios → diff y luego aplicar
  assert.strictEqual((await n.skills.actualizar('dos')).alDia, true);
  fs.writeFileSync(path.join(repo, 'skills', 'dos', 'SKILL.md'), '---\nname: dos\ndescription: Segunda skill\n---\n\nPaso 1\nPaso 2 mejorado\nPaso 3\n');
  fs.writeFileSync(path.join(repo, 'skills', 'dos', 'nuevo.txt'), 'hola');
  const u = await n.skills.actualizar('dos');
  assert.strictEqual(u.aplicado, false);
  assert.match(u.diff, /-Paso 2\n\+Paso 2 mejorado/); assert.match(u.diff, /\+\+\+ nuevo\.txt \(nuevo\)/);
  assert.doesNotMatch(n.skills.obtener('dos').contenido, /mejorado/);
  const a = await n.skills.actualizar('dos', { aplicar: true });
  assert.strictEqual(a.aplicado, true); assert.match(n.skills.obtener('dos').contenido, /mejorado/);
  assert.ok(n.skills.borrar('dos')); assert.strictEqual(n.skills.obtener('dos'), null);
});

test('instalar desde .zip y .skill locales', async t => {
  const { n } = nucleo();
  const src = tmp('zipsrc-'); skillEn(src, 'comprimida', { desc: 'Viene en zip', extra: { 'scripts/hola.js': 'console.log("hola")' } });
  const zip = path.join(tmp('zip-'), 'comprimida.zip');
  try {
    if (process.platform === 'win32') execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['--format', 'zip', '-cf', zip, '-C', src, 'comprimida']);
    else execFileSync('zip', ['-qr', zip, 'comprimida'], { cwd: src });
  } catch { return t.skip('no hay herramienta para crear zips'); }
  const { skill } = await n.skills.instalar(zip);
  assert.strictEqual(skill.slug, 'comprimida'); assert.strictEqual(skill.origen.tipo, 'zip');
  assert.deepStrictEqual([...skill.archivos].sort(), ['SKILL.md', 'scripts/hola.js']);
  const sk = zip.replace(/\.zip$/, '.skill'); fs.copyFileSync(zip, sk); n.skills.borrar('comprimida');
  assert.strictEqual((await n.skills.instalar(sk)).skill.slug, 'comprimida');
  // GitHub: el parser de fuentes
  const { parsearGithub } = require('../skills/instalar');
  assert.deepStrictEqual(parsearGithub('anthropics/skills/skills/pdf@main'), { owner: 'anthropics', repo: 'skills', ruta: 'skills/pdf', ref: 'main', nombre: '' });
  assert.deepStrictEqual(parsearGithub('https://github.com/anthropics/skills/tree/main/skills/pdf'), { owner: 'anthropics', repo: 'skills', ref: 'main', ruta: 'skills/pdf', nombre: '' });
  assert.strictEqual(parsearGithub('https://github.com/a/b/blob/dev/x/SKILL.md').ruta, 'x');
});

test('índice: solo activas, presupuesto por modelo, disparadores y búsqueda híbrida; auto-inyección en modelos pequeños', async () => {
  const { n } = nucleo({ proveedores: { falso: { tipo: 'openai', baseUrl: 'http://127.0.0.1:1/v1', local: true } } }, { embedder: embedderFalso });
  const src = tmp('src-');
  skillEn(src, 'facturas', { desc: 'Lee documentos PDF y extrae datos', apolo: '    disparadores: [factura]' });
  skillEn(src, 'taller', { desc: 'Diagnóstico de averías de camiones y tráiler' });
  skillEn(src, 'cocina', { desc: 'Recetas de tarta' });
  skillEn(src, 'apagada', { desc: 'No debe salir' });
  for (const s of ['facturas', 'taller', 'cocina', 'apagada']) await n.skills.instalar(path.join(src, s));
  for (const s of ['facturas', 'taller', 'cocina']) await n.skills.activar(s, true);
  const idx = n.skills.indice.indice({ modelo: 'openai/gpt-x' });
  assert.match(idx, /facturas: Lee documentos/); assert.doesNotMatch(idx, /apagada/);
  // disparador → confianza 1
  let sel = await n.skills.indice.seleccionar('revisa esta factura por favor', { modelo: 'openai/gpt-x' });
  assert.strictEqual(sel[0].slug, 'facturas'); assert.strictEqual(sel[0].confianza, 1);
  // semántica: "mecánico motor" no comparte palabras con "taller" pero sí concepto
  sel = await n.skills.indice.seleccionar('mi mecánico dice que el motor falla', { modelo: 'openai/gpt-x' });
  assert.strictEqual(sel[0].slug, 'taller'); assert.ok(!sel.some(s => s.slug === 'cocina'));
  // presupuesto: con poco espacio se recorta y avisa
  n.cfg.skills.presupuesto = { 'x/chico': 60 };
  assert.match(n.skills.indice.indice({ modelo: 'x/chico' }), /más \(usa ver_skills\)/);
  // modelo local pequeño + disparador → SKILL.md inyectado; en la nube solo sugerida
  const p = await n.skills.seccion({ sesion: { modelo: 'falso/mini', canal: 'cli' }, mensaje: 'tengo una factura' });
  assert.strictEqual(p.inyectada, 'facturas'); assert.match(p.texto, /YA CARGADA/); assert.match(p.texto, /^SKILLS DISPONIBLES/);
  const q = await n.skills.seccion({ sesion: { modelo: 'falso/algo-cloud', canal: 'cli' }, mensaje: 'tengo una factura' });
  assert.strictEqual(q.inyectada, null); assert.match(q.texto, /Sugeridas para este mensaje: facturas \(100%\)/);
  assert.strictEqual(n.skills.obtener('facturas').usos, 1);
});

test('herramientas: usar_skill, leer_recurso_skill (sin salir de la carpeta), ejecutar_script_skill y permisos', async () => {
  const { n } = nucleo();
  const src = tmp('src-');
  skillEn(src, 'util', { desc: 'Utilidades', apolo: '    permisos: [ejecucion]', extra: { 'references/guia.md': 'GUIA SECRETA', 'scripts/suma.js': 'console.log(Number(process.argv[2]) + Number(process.argv[3]), require("path").basename(process.cwd()))' } });
  skillEn(src, 'sinpermisos', { extra: { 'scripts/x.js': 'console.log(1)' } });
  await n.skills.instalar(path.join(src, 'util')); await n.skills.instalar(path.join(src, 'sinpermisos'));
  const { porNombre } = require('../herramientas');
  const ctx = { skills: n.skills, cwd: os.tmpdir(), sesion: { id: 's', modelo: 'x/y' } };
  await assert.rejects(porNombre.usar_skill.ejecutar({ nombre: 'util' }, ctx), /desactivada/);
  await n.skills.activar('util', true); await n.skills.activar('sinpermisos', true);
  const u = await porNombre.usar_skill.ejecutar({ nombre: 'util' }, ctx);
  assert.match(u, /Pasos de util/); assert.match(u, /references\/guia\.md/); assert.match(u, /scripts\/suma\.js/);
  assert.strictEqual(n.skills.obtener('util').usos, 1);
  assert.strictEqual(await porNombre.leer_recurso_skill.ejecutar({ nombre: 'util', ruta: 'references/guia.md' }, ctx), 'GUIA SECRETA');
  await assert.rejects(porNombre.leer_recurso_skill.ejecutar({ nombre: 'util', ruta: '../sinpermisos/SKILL.md' }, ctx), /ruta no válida/);
  await assert.rejects(porNombre.leer_recurso_skill.ejecutar({ nombre: 'util', ruta: 'C:/Windows/win.ini' }, ctx), /ruta no válida/);
  const r = await porNombre.ejecutar_script_skill.ejecutar({ nombre: 'util', script: 'suma.js', args: ['2', '3'] }, ctx);
  assert.match(r.replace(/\x1b\[[0-9;]*m/g, ''), /^5 util\n\[código de salida 0\]/);   // cwd = carpeta de la skill (sin colores ANSI: FORCE_COLOR depende de cómo se lance npm test)
  // permisos: verde + declara ejecución → flujo normal; sin permisos declarados o no verde → siempre pregunta
  const h = porNombre.ejecutar_script_skill;
  assert.strictEqual(h.siemprePreguntar({ nombre: 'util' }, { skills: n.skills }), '');
  assert.match(h.siemprePreguntar({ nombre: 'sinpermisos' }, { skills: n.skills }), /no declara permiso/);
  n.cfg.permisos.modo = 'auto';
  const pend = []; n.bus.on('permiso', q => { pend.push(q); n.permisos.resolver(q.id, 'deny'); });
  assert.strictEqual((await n.permisos.pedir({ h, args: { nombre: 'util', script: 'scripts/suma.js' }, sesion: { id: 's', cwd: os.tmpdir() }, ctx: { skills: n.skills } })).ok, true);
  assert.strictEqual((await n.permisos.pedir({ h, args: { nombre: 'sinpermisos', script: 'scripts/x.js' }, sesion: { id: 's', cwd: os.tmpdir() }, ctx: { skills: n.skills } })).ok, false);
  assert.match(pend[0].peligro, /sinpermisos/);
  assert.match(await porNombre.ver_skills.ejecutar({}, ctx), /● util · escaneo verde/);
});

// modelo falso compatible con OpenAI (como en nucleo.test.js)
function modeloFalso(guion) {
  const recibidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      recibidos.push(JSON.parse(b));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: guion.shift() || { role: 'assistant', content: 'fin' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, recibidos, url: `http://127.0.0.1:${srv.address().port}/v1` })));
}

test('agente: el prompt lleva SKILLS DISPONIBLES y el modelo carga la skill con usar_skill', async t => {
  const g = await modeloFalso([{ role: 'assistant', content: 'hola' }]); t.after(() => g.srv.close());
  const { n } = nucleo({ modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: g.url, local: true } } });
  const src = tmp('src-'); skillEn(src, 'saludo', { desc: 'Saluda como un pirata', cuerpo: 'Di siempre "Ahoy".' });
  // sin skills activas: ni sección ni herramientas de skills
  await n.enviar(n.sesiones.crear({}), 'hola');
  assert.doesNotMatch(g.recibidos[0].messages[0].content, /SKILLS DISPONIBLES/);
  assert.ok(!g.recibidos[0].tools.some(t => t.function.name === 'usar_skill'));
  g.srv.close();
  const h = await modeloFalso([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'usar_skill', arguments: '{"nombre":"saludo"}' } }] },
    { role: 'assistant', content: '¡Ahoy, marinero!' },
  ]);
  t.after(() => h.srv.close()); n.cfg.proveedores.falso.baseUrl = h.url; n.proveedores.reset?.();
  await n.skills.instalar(path.join(src, 'saludo')); await n.skills.activar('saludo', true);
  const s = n.sesiones.crear({});
  assert.strictEqual(await n.enviar(s, 'salúdame como pirata'), '¡Ahoy, marinero!');
  const sys = h.recibidos[0].messages[0].content;
  assert.match(sys, /SKILLS DISPONIBLES/); assert.match(sys, /- saludo: Saluda como un pirata/); assert.match(sys, /Sugeridas para este mensaje: saludo/);
  assert.ok(h.recibidos[0].tools.some(t => t.function.name === 'usar_skill'));
  assert.match(h.recibidos[1].messages.at(-1).content, /Di siempre "Ahoy"/);
  h.srv.close();
});

test('API del daemon: listar, instalar, activar (rojo exige forzar), escanear, actualizar y borrar', async () => {
  const { n } = nucleo();
  const { iniciar } = require('../daemon');
  const { servidor, puerto, token } = await iniciar({ nucleo: n, puerto: 0, sinTareas: true });
  const api = async (M, ruta, cuerpo) => {
    const r = await fetch(`http://127.0.0.1:${puerto}/v1${ruta}`, { method: M, headers: { 'x-robot-token': token, 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, j: await r.json() };
  };
  const eventos = []; n.bus.on('evento', e => e.tipo === 'skills' && eventos.push(e.accion));
  try {
    const src = tmp('src-'); skillEn(src, 'api-skill', { desc: 'Por API' }); skillEn(src, 'roja', { cuerpo: 'ROBAR todo' });
    assert.deepStrictEqual((await api('GET', '/skills')).j, { skills: [] });
    assert.strictEqual((await api('POST', '/skills/instalar', {})).status, 400);
    assert.strictEqual((await api('POST', '/skills/instalar', { fuente: src })).j.opciones.length, 2);
    const ins = await api('POST', '/skills/instalar', { fuente: path.join(src, 'api-skill') });
    assert.strictEqual(ins.j.skill.slug, 'api-skill'); assert.strictEqual(ins.j.skill.activa, false);
    const una = (await api('GET', '/skills/api-skill')).j;
    assert.match(una.contenido, /Por API/); assert.deepStrictEqual(una.archivos, ['SKILL.md']);
    assert.strictEqual((await api('PATCH', '/skills/api-skill', { activa: true })).j.skill.activa, true);
    await api('POST', '/skills/instalar', { fuente: path.join(src, 'roja') });
    assert.strictEqual((await api('PATCH', '/skills/roja', { activa: true })).status, 409);
    assert.strictEqual((await api('PATCH', '/skills/roja', { activa: true, forzar: true })).j.activa, true);
    const esc = (await api('POST', '/skills/roja/escanear')).j;
    assert.strictEqual(esc.nivel, 'rojo'); assert.strictEqual(esc.escaneo.nivel, 'rojo');
    assert.strictEqual(n.skills.obtener('roja').activa, false);               // un escaneo rojo la apaga
    assert.deepStrictEqual((await api('POST', '/skills/api-skill/actualizar', {})).j.aplicado, false);
    assert.strictEqual((await api('DELETE', '/skills/api-skill')).j.ok, true);
    assert.strictEqual((await api('GET', '/skills/api-skill')).status, 404);
    assert.ok(eventos.includes('instalada') && eventos.includes('cambio') && eventos.includes('borrada'));
  } finally { servidor.close(); }
});
