// Migración desde OpenClaw (robot-migracion/1): personalidad, recuerdos, automatizaciones en pausa, agentes, skills,
// secretos tapados y copia de seguridad. El modelo es falso (no hace falta red).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function nucleoFalso(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ memoria: { embeddings: null } }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir });
  const prompts = [];
  n.generarJSON = async ({ prompt }) => {                     // el importador lo recibe por referencia al crearse: se sustituye abajo
    prompts.push(prompt);
    return { datos: { hechos: [{ texto: 'Tiene un taller de camiones en Texas', tipo: 'perfil' }, { texto: 'Su clave es sk-abcdefghijklmnopqrstuvwx', tipo: 'hecho' }], identidad: 'Jarvis, irónico' } };
  };
  const { crearImportador } = require('../importador');
  n.importador = crearImportador({ cfg: n.cfg, memoria: n.memoria, generarJSON: n.generarJSON, personalidad: n.personalidad, tareas: n.tareas, proveedores: n.proveedores, modelo: () => 'x/y' });
  t.after(() => n.tareas.detener?.());
  return { n, dir, prompts };
}

const MIGRACION = {
  formato: 'robot-migracion/1', origen: 'openclaw', exportado: '2026-10-01T10:00:00Z',
  archivos: {
    'SOUL.md': '# Soy Jarvis\nIrónico pero leal. Token de Discord: ' + ['MTIzNDU2Nzg5MDEyMzQ1Njc4OQ', 'GaBcDe', 'abcdefghijklmnopqrstuvwxyz0123'].join('.'),
    'USER.md': 'Se llama Yosoy. Taller de camiones en Texas.',
    'MEMORY.md': 'Le gusta el ámbar. clave sk-abcdefghijklmnopqrstuvwx',
    'memory/2026-09-30.md': 'Hoy montamos el panel.',
    '../../fuera.md': 'intento de salir del backup',
  },
  automatizaciones: [
    { nombre: 'Resumen de la mañana', cron: '0 8 * * 1-5', prompt: 'Resume mis correos', soloSiHayAlgo: true, activa: true, canal: 'discord' },
    { nombre: 'Sin horario', prompt: 'x' },
    { nombre: 'Vigila la Pi', cadaMin: 30, prompt: 'comprueba 192.168.1.124', modelo: 'modelo/que-no-existe' },
  ],
  agentes: [{ nombre: 'Investigador', descripcion: 'Busca en la web', instrucciones: 'Cita fuentes siempre.', modelo: 'gemma' }],
  skills: [{ nombre: 'ats-mods', descripcion: 'Mods de ATS', contenido: 'Pasos…' }],
  notas: 'No exporté las credenciales.',
};

test('migración completa: personalidad, recuerdos, tareas pausadas, agentes y skills', async t => {
  const { n, dir, prompts } = nucleoFalso(t);
  const r = await n.importador.importar(MIGRACION);
  // personalidad
  const p = Object.fromEntries(n.personalidad.lista().map(x => [x.id, x.contenido]));
  assert.match(p.identidad, /Soy Jarvis/);
  assert.match(p.contexto, /Se llama Yosoy/);
  assert.deepStrictEqual(r.personalidad, ['identidad', 'contexto']);
  // secretos tapados en todo lo guardado y en lo que ve el modelo
  assert.doesNotMatch(p.identidad, /MTIzNDU2/);
  assert.match(p.identidad, /\[REDACTADO\]/);
  assert.ok(prompts.every(x => !/sk-abcdef/.test(x)));
  // recuerdos: el bueno entra, el que trae una clave lo bloquea la memoria
  assert.strictEqual(r.creados, 1);
  assert.ok(n.memoria.lista().some(m => /taller de camiones/.test(m.texto) && m.origen === 'importado de openclaw'));
  // automatizaciones: creadas PAUSADAS; la sin horario da error; modelo inexistente → el por defecto
  assert.strictEqual(r.tareas.length, 2);
  const ts = n.tareas.lista();
  assert.ok(ts.every(x => x.activa === false));
  assert.strictEqual(ts.find(x => /Resumen/.test(x.nombre)).canal, 'discord');
  assert.strictEqual(ts.find(x => /Resumen/.test(x.nombre)).accion.soloSiHayAlgo, true);
  assert.strictEqual(ts.find(x => /Pi/.test(x.nombre)).accion.modelo, undefined);
  assert.ok(r.errores.some(e => /Sin horario/.test(e)));
  // agentes y skills
  const ags = require('../importador').leerAgentes(n.cfg);
  assert.deepStrictEqual(ags.map(a => [a.nombre, a.modelo]), [['Investigador', 'ollama/gemma4:31b-cloud']]);
  assert.ok(fs.existsSync(path.join(dir, 'skills', 'ats-mods.md')));
  // backup: copia de los archivos (con rutas saneadas, nada fuera) y de la personalidad anterior
  assert.ok(fs.existsSync(path.join(r.backup, 'archivos', 'memory', '2026-09-30.md')));
  assert.ok(fs.existsSync(path.join(r.backup, 'archivos', 'fuera.md')));
  assert.ok(fs.existsSync(path.join(r.backup, 'personalidad-anterior', 'identidad.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'fuera.md')));
  assert.strictEqual(n.importador.historial()[0].origen, 'openclaw');
});

test('"delegar" usa la plantilla del agente importado y el sistema lo lista', async t => {
  const { n } = nucleoFalso(t);
  await n.importador.importar({ origen: 'openclaw', agentes: [{ nombre: 'Investigador', descripcion: 'Busca en la web', instrucciones: 'Cita fuentes siempre.' }] });
  let recibido = null;
  const ctx = { cfg: n.cfg, sesion: { id: 's1' }, subagentes: { lanzar: async o => { recibido = o; return { ok: true, nombre: o.nombre, texto: 'hecho' }; } } };
  const { porNombre } = require('../herramientas');
  assert.match(await porNombre.delegar.ejecutar({ agente: 'investigador', tarea: 'precio del diésel', nombre: 'precio' }, ctx), /terminó/);
  assert.match(recibido.tarea, /^INSTRUCCIONES DEL AGENTE "Investigador":\nCita fuentes siempre\.\n\nprecio del diésel$/);
  assert.match(await porNombre.delegar.ejecutar({ agente: 'nadie', tarea: 'x', nombre: 'x' }, ctx), /no hay ningún agente/);
});

test('rechaza un archivo vacío o demasiado grande', async t => {
  const { n } = nucleoFalso(t);
  await assert.rejects(n.importador.importar({ origen: 'openclaw' }), /no trae nada/);
  await assert.rejects(n.importador.importar({ origen: 'x', archivos: { 'a.md': 'x'.repeat(9 * 1024 * 1024) } }), /demasiado grande/);
});
