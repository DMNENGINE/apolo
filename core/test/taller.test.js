// Taller de skills (core/skills/taller.js): crear borradores, sugerir skill tras turnos largos, registrar fallos,
// mejorar con diff + versiones, evals con enviar falso, exportar a .zip, tarea semanal, idioma y API. Sin red.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const escanerFalso = { async escanear() { return { nivel: 'verde', hallazgos: [], resumen: 'limpia', explicacion: '' }; } };
function nucleo(extra = {}) {
  const dir = tmp('taller-');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null }, ...extra, skills: { rutas: [], ...extra.skills } }));
  const { crearNucleo } = require('../index');
  return { dir, n: crearNucleo({ dir, escaner: escanerFalso, embedder: null }) };
}
// modelo falso: cada llamada saca la siguiente respuesta del guion
function modeloFalso(n, guion) {
  const llamadas = [];
  n.proveedores.resolver = () => ({ model: 'm', api: { chat: async o => { llamadas.push(o); const r = guion.shift() || { texto: 'fin' }; if (r instanceof Error) throw r; return { texto: '', toolCalls: [], uso: { entrada: 1, salida: 1 }, ...r }; } } });
  return llamadas;
}
const tc = (name, args = {}, id = name + Math.random()) => ({ id, name, args });

test('crear_skill: borrador desactivado, origen taller, escaneado, scripts y pruebas', async () => {
  const { n } = nucleo();
  const s = await n.skills.taller.crear({ nombre: 'Renombrar Fotos', descripcion: 'Renombra fotos por fecha. Úsala cuando pidan ordenar fotos.', instrucciones: '1. Lista las fotos\n2. Renombra con la fecha EXIF',
    scripts: [{ ruta: 'renombrar.py', contenido: 'print(1)' }, { ruta: 'references/notas.md', contenido: '# notas' }], disparadores: ['fotos', '/renombra\\s+fotos/i'], pruebas: [{ pregunta: '¿cómo?', debeContener: ['fecha'] }] });
  assert.strictEqual(s.slug, 'renombrar-fotos');
  assert.strictEqual(s.activa, false); assert.strictEqual(s.origen.tipo, 'taller'); assert.strictEqual(s.escaneo.nivel, 'verde'); assert.strictEqual(s.borrador, true);
  assert.deepStrictEqual(s.disparadores, ['fotos', '/renombra\\s+fotos/i']);
  assert.ok(s.archivos.includes('scripts/renombrar.py') && s.archivos.includes('references/notas.md') && s.archivos.includes('tests/basico.json'));
  const c = n.skills.almacen.contenido(s.slug);
  assert.match(c.cuerpo, /^# Renombrar Fotos/); assert.strictEqual(c.apolo.version, '0.1.0');
  await assert.rejects(n.skills.taller.crear({ nombre: 'x', descripcion: 'una descripción larga', instrucciones: 'pasos suficientes aquí dentro', scripts: [{ ruta: '../fuera.py', contenido: '' }] }), /no válida/);
  await assert.rejects(n.skills.taller.crear({ nombre: 'x', descripcion: 'corta', instrucciones: 'pasos' }), /descripcion/);
  assert.ok(!fs.existsSync(path.join(n.skills.almacen.dir, 'x')));
  // la herramienta (riesgo escritura) devuelve el resumen
  const h = require('../herramientas').porNombre.crear_skill;
  assert.strictEqual(h.riesgo, 'escritura');
  const out = await h.ejecutar({ nombre: 'otra', descripcion: 'Otra skill de prueba para el taller', instrucciones: 'Paso uno y paso dos, bien explicados.' }, { skills: n.skills });
  assert.match(out, /BORRADOR \(desactivada\)/);
});

test('sugerir skill tras un turno largo: evento + nota, 1 vez por sesión; desactivable', async () => {
  const { n } = nucleo({ permisos: { modo: 'auto' } });
  const seis = Array.from({ length: 6 }, (_, i) => tc('ver_skills', {}, 'c' + i));
  modeloFalso(n, [{ toolCalls: seis }, { texto: 'Hecho todo.' }, { toolCalls: seis }, { texto: 'Otra vez.' }]);
  const evs = []; n.bus.on('evento', e => { if (e.tipo === 'skill-sugerida') evs.push(e); });
  const s = n.sesiones.crear({ modelo: 'falso/m' });
  const r1 = await n.enviar(s, 'ordena mis fotos');
  assert.match(r1, /crea una skill con esto/);
  assert.strictEqual(evs.length, 1); assert.strictEqual(evs[0].sesion, s.id); assert.match(evs[0].resumen, /ordena mis fotos — 6 herramientas \(ver_skills\)/);
  const r2 = await n.enviar(s, 'otra vez');
  assert.doesNotMatch(r2, /skill/); assert.strictEqual(evs.length, 1);
  // corto o con sugerir:false → nada
  const { n: n2 } = nucleo({ permisos: { modo: 'auto' }, skills: { sugerir: false } });
  modeloFalso(n2, [{ toolCalls: seis }, { texto: 'ok' }]);
  const evs2 = []; n2.bus.on('evento', e => { if (e.tipo === 'skill-sugerida') evs2.push(e); });
  assert.strictEqual(await n2.enviar(n2.sesiones.crear({ modelo: 'falso/m' }), 'x'), 'ok'); assert.strictEqual(evs2.length, 0);
  // en inglés si cfg.idioma = en (y el prompt de sistema lo dice)
  const { n: n3 } = nucleo({ permisos: { modo: 'auto' }, idioma: 'en' });
  const ll = modeloFalso(n3, [{ toolCalls: seis }, { texto: 'done' }]);
  assert.match(await n3.enviar(n3.sesiones.crear({ modelo: 'falso/m' }), 'x'), /make a skill out of this/);
  assert.match(ll[0].system, /Responde por defecto en inglés/);
  const { n: n4 } = nucleo();
  const ll4 = modeloFalso(n4, [{ texto: 'hola' }]); await n4.enviar(n4.sesiones.crear({ modelo: 'falso/m' }), 'hola');
  assert.match(ll4[0].system, /Responde en el idioma del usuario/);
});

test('registro de fallos: turno con skill que acaba en error y corrección del usuario', async () => {
  const { n } = nucleo({ permisos: { modo: 'auto' } });
  const s0 = await n.skills.taller.crear({ nombre: 'facturas', descripcion: 'Hace facturas en PDF para clientes.', instrucciones: 'Pide los datos y genera la factura.' });
  await n.skills.activar(s0.slug, true);
  modeloFalso(n, [{ toolCalls: [tc('usar_skill', { nombre: 'facturas' })] }, new Error('se cayó el modelo'),
    { toolCalls: [tc('usar_skill', { nombre: 'facturas' })] }, { texto: 'Factura hecha con IVA 10%' }, { texto: 'corregido' }, { texto: 'nada' }]);
  const s = n.sesiones.crear({ modelo: 'falso/m' });
  await assert.rejects(n.enviar(s, 'hazme la factura de Juan'), /se cayó/);
  let f = n.skills.taller.aprendizaje('facturas');
  assert.strictEqual(f.length, 1); assert.match(f[0].problema, /terminó en error: se cayó el modelo/); assert.match(f[0].contexto, /factura de Juan/);
  await n.enviar(s, 'otra factura');
  await n.enviar(s, 'no, el IVA es del 21%');
  f = n.skills.taller.aprendizaje('facturas');
  assert.strictEqual(f.length, 2); assert.match(f[1].problema, /el usuario corrigió: no, el IVA/); assert.match(f[1].contexto, /IVA 10%/);
  await n.enviar(s, 'no pasa nada');                      // ya no hay turno con skill justo antes: no se apunta
  assert.strictEqual(n.skills.taller.aprendizaje('facturas').length, 2);
  // el archivo no forma parte de la skill (ni del escaneo ni de los archivos)
  assert.ok(!n.skills.almacen.obtener('facturas').archivos.includes('aprendizaje.jsonl'));
});

test('mejorar: propone diff sin aplicar, aplica con versión anterior, re-escanea y restaura', async () => {
  const { n } = nucleo();
  const pedidos = [];
  n.generarJSON = async o => { pedidos.push(o); return { datos: { skill_md: '---\nname: facturas\ndescription: Hace facturas en PDF para clientes.\n---\n\n# facturas\n\nPide los datos y genera la factura.\nUsa SIEMPRE IVA del 21%.\n', cambios: ['IVA del 21% explícito'] } }; };
  await n.skills.taller.crear({ nombre: 'facturas', descripcion: 'Hace facturas en PDF para clientes.', instrucciones: 'Pide los datos y genera la factura.' });
  const sinFallos = await n.skills.taller.mejorar('facturas');
  assert.strictEqual(sinFallos.propuesta, null); assert.strictEqual(pedidos.length, 0);
  n.skills.taller.registrarFallo('facturas', { problema: 'usó IVA 10% en vez de 21%' });
  const r = await n.skills.taller.mejorar('facturas');
  assert.strictEqual(r.aplicado, false); assert.match(r.diff, /\+Usa SIEMPRE IVA del 21%/); assert.deepStrictEqual(r.cambios, ['IVA del 21% explícito']);
  assert.match(pedidos[0].prompt, /<fallos>[\s\S]*IVA 10%/);
  assert.doesNotMatch(n.skills.almacen.contenido('facturas').contenido, /21%/);   // sin aplicar
  // aplicar reutiliza la propuesta pendiente (no vuelve a llamar al modelo)
  await n.skills.activar('facturas', true);
  const a = await n.skills.taller.mejorar('facturas', { aplicar: true });
  assert.strictEqual(pedidos.length, 1); assert.strictEqual(a.aplicado, true); assert.strictEqual(a.escaneo.nivel, 'verde');
  assert.match(n.skills.almacen.contenido('facturas').contenido, /IVA del 21%/);
  assert.strictEqual(n.skills.taller.aprendizaje('facturas').length, 0);           // los fallos ya usados se archivan con la versión
  const vs = n.skills.taller.versiones('facturas');
  assert.strictEqual(vs.length, 1); assert.strictEqual(vs[0].conFallos, true);
  assert.ok(!n.skills.almacen.obtener('facturas').archivos.some(x => x.startsWith('_versiones')));
  const rs = await n.skills.taller.restaurar('facturas', vs[0].version);
  assert.doesNotMatch(n.skills.almacen.contenido('facturas').contenido, /21%/);
  assert.strictEqual(n.skills.taller.versiones('facturas').length, 2); assert.ok(rs.versionAnterior);
  await assert.rejects(n.skills.taller.restaurar('facturas', '../x'), /no válida/);
  // propuesta sin frontmatter o con otro name: se conserva el frontmatter
  n.generarJSON = async () => ({ datos: { skill_md: '# facturas\n\nNuevo cuerpo', cambios: [] } });
  n.skills.taller.registrarFallo('facturas', { problema: 'otro' });
  const r2 = await n.skills.taller.mejorar('facturas');
  assert.match(r2.propuesta, /^---\nname: facturas\ndescription: Hace facturas/);
  // tarea semanal: propone para las que tienen fallos nuevos y no repite
  n.generarJSON = async () => ({ datos: { skill_md: '# facturas\n\nCuerpo semanal', cambios: ['x'] } });
  n.skills.taller.registrarFallo('facturas', { problema: 'otro más' });
  assert.match(await n.skills.taller.mejoraSemanal(), /facturas \(2 fallos, 1 cambios\)/);
  assert.strictEqual(await n.skills.taller.mejoraSemanal(), '');
});

test('evals: por contenido y por juez, comparativa entre modelos, guarda el resumen', async () => {
  const { n } = nucleo();
  await n.skills.taller.crear({ nombre: 'saludo', descripcion: 'Saluda al estilo pirata cuando lo pidan.', instrucciones: 'Di "Arrr, marinero" y el nombre.',
    pruebas: [{ pregunta: 'saluda a Ana', debeContener: ['arrr', 'Ana'] }, { pregunta: 'saluda a Luis', criterio: 'suena a pirata' }] });
  await assert.rejects(n.skills.taller.evaluar('saludo', ['x/y'], { ejecutar: null }), /no están disponibles|casos/);
  n.generarJSON = async o => ({ datos: { cumple: /Arrr/.test(o.prompt), motivo: 'juez falso' } });
  const vistos = [];
  const ejecutar = async ({ modelo, texto }) => { vistos.push(texto); const q = texto.split('---\n').pop(); return modelo === 'bueno/m' ? `¡Árrr, marinero ${q.split(' ').pop()}!` : 'Hola.'; };
  const r = await n.skills.taller.evaluar('saludo', ['bueno/m', 'malo/m'], { ejecutar });
  assert.match(vistos[0], /INSTRUCCIONES DE LA SKILL "saludo"[\s\S]*Arrr, marinero[\s\S]*saluda a Ana$/);
  const [b, m] = r.resultados;
  assert.deepStrictEqual([b.modelo, b.aciertos, b.total], ['bueno/m', 1, 2]);           // "Árrr" con tilde cuenta para debeContener; el juez falso exige "Arrr" literal
  assert.deepStrictEqual([m.modelo, m.aciertos, m.total], ['malo/m', 0, 2]);
  assert.match(m.detalles[0].motivo, /no contiene: arrr, Ana/); assert.strictEqual(b.detalles[1].juez, true);
  assert.deepStrictEqual(n.skills.obtener('saludo').evals.resultados, [{ modelo: 'bueno/m', aciertos: 1, total: 2 }, { modelo: 'malo/m', aciertos: 0, total: 2 }]);
  // sesión efímera real (canal eval): solo herramientas de lectura y no queda guardada
  const ll = modeloFalso(n, [{ toolCalls: [tc('escribir_archivo', { ruta: 'x.txt', contenido: 'x' })] }, { texto: 'Arrr, marinero Ana' }, { texto: 'Arrr' }]);
  const antes = n.sesiones.lista().length;
  const r2 = await n.skills.taller.evaluar('saludo', ['falso/m']);
  assert.strictEqual(r2.resultados[0].aciertos, 2);
  assert.match(ll[1].mensajes.find(x => x.role === 'tool').content, /DENEGADO: en una evaluación/);
  assert.strictEqual(n.sesiones.lista().length, antes);
});

test('exportar: .zip sin datos privados', { skip: process.platform !== 'win32' && 'usa tar.exe de Windows' }, async () => {
  const { n, dir } = nucleo();
  await n.skills.taller.crear({ nombre: 'exportable', descripcion: 'Skill para probar la exportación a zip.', instrucciones: 'Pasos de prueba suficientes.', scripts: [{ ruta: 'a.py', contenido: 'print(1)' }] });
  n.skills.taller.registrarFallo('exportable', { problema: 'secreto' });
  const r = await n.skills.taller.exportar('exportable', { destino: path.join(dir, 'out') });
  assert.strictEqual(r.ruta, path.join(dir, 'out', 'exportable.zip'));
  const buf = fs.readFileSync(r.ruta); assert.strictEqual(buf.subarray(0, 2).toString(), 'PK');
  const txt = buf.toString('latin1');
  assert.ok(txt.includes('exportable/SKILL.md') && txt.includes('exportable/scripts/a.py'));
  assert.ok(!txt.includes('aprendizaje.jsonl') && !txt.includes('instalado.json'));
});

test('tareas internas + mejora semanal opcional + API del daemon', async () => {
  const { n, dir } = nucleo({ skills: { mejoraSemanal: true } });
  const t = n.tareas.lista().find(x => x.accion.tipo === 'interna');
  assert.ok(t); assert.strictEqual(t.accion.nombre, 'mejorar-skills'); assert.deepStrictEqual(t.cuando, { cron: '0 10 * * 1' });
  const avisos = []; n.bus.on('tarea', e => avisos.push(e));
  await n.tareas.ejecutar(t); assert.strictEqual(n.tareas.obtener(t.id).ultimoResultado, 'nada que hacer'); assert.strictEqual(avisos.length, 0);
  // al apagarlo en la config, la tarea desaparece
  const cfgF = path.join(dir, 'config.json'); const c = JSON.parse(fs.readFileSync(cfgF, 'utf8')); c.skills.mejoraSemanal = false; fs.writeFileSync(cfgF, JSON.stringify(c));
  const n2 = require('../index').crearNucleo({ dir, escaner: escanerFalso, embedder: null });
  assert.ok(!n2.tareas.lista().some(x => x.accion.tipo === 'interna'));

  const { iniciar } = require('../daemon');
  const { servidor, puerto, token } = await iniciar({ nucleo: n, puerto: 0, sinTareas: true });
  const api = async (M, ruta, cuerpo) => { const r = await fetch(`http://127.0.0.1:${puerto}/v1${ruta}`, { method: M, headers: { 'x-robot-token': token, 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); return { status: r.status, j: await r.json() }; };
  try {
    let r = await api('POST', '/skills/crear', { nombre: 'api-skill', descripcion: 'Creada desde la API del daemon.', instrucciones: 'Pasos creados por la API.', pruebas: [{ pregunta: 'hola', debeContener: ['hola'] }] });
    assert.strictEqual(r.status, 201); assert.strictEqual(r.j.skill.activa, false); assert.strictEqual(r.j.skill.origen.tipo, 'taller');
    assert.strictEqual((await api('POST', '/skills/crear', { nombre: 'x' })).status, 400);
    n.skills.taller.registrarFallo('api-skill', { problema: 'falló algo' });
    r = await api('GET', '/skills/api-skill/aprendizaje'); assert.strictEqual(r.j.fallos.length, 1);
    n.generarJSON = async () => ({ datos: { skill_md: '# api-skill\n\nPasos mejorados.', cambios: ['mejor'] } });
    r = await api('POST', '/skills/api-skill/mejorar', {}); assert.strictEqual(r.j.aplicado, false); assert.match(r.j.diff, /\+Pasos mejorados/);
    r = await api('POST', '/skills/api-skill/mejorar', { aplicar: true }); assert.strictEqual(r.j.aplicado, true);
    r = await api('GET', '/skills/api-skill/versiones'); assert.strictEqual(r.j.versiones.length, 1);
    r = await api('POST', '/skills/api-skill/versiones/restaurar', { version: r.j.versiones[0].version }); assert.strictEqual(r.status, 200); assert.ok(r.j.restaurada);
    modeloFalso(n, [{ texto: 'hola, qué tal' }]);
    r = await api('POST', '/skills/api-skill/evaluar', { modelos: ['falso/m'] }); assert.strictEqual(r.j.resultados[0].aciertos, 1);
    if (process.platform === 'win32') { r = await api('POST', '/skills/api-skill/exportar', { destino: path.join(dir, 'zips') }); assert.strictEqual(r.status, 200); assert.ok(fs.existsSync(r.j.ruta)); }
    assert.strictEqual((await api('GET', '/skills/no-existe/versiones')).status, 404);
  } finally { servidor.close(); }
});
