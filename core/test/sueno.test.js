// Fases de sueño: ligera (fusión por Jaccard y por coseno, caducar), REM (patrones + grafo), profunda (perfil sin perder datos),
// copia de seguridad y deshacer, informe, aviso por la mañana y tarea interna. generarJSON y embedder falsos (sin red).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearMemoria } = require('../memoria');
const { crearGrafo } = require('../grafo');
const { crearSueno, datosDuros } = require('../sueno');
const { crearTareas } = require('../tareas');
const { normalizar } = require('../vectores');

// embedder falso: vector por "tema" (palabras clave) → los textos del mismo tema salen casi idénticos
const TEMAS = ['impresora', 'ender', 'robot', 'camion', 'taller', 'miami', 'cafe', 'telegram'];
const embedder = { id: 'falso/emb', async embeber(textos) { return textos.map(t => { const n = t.toLowerCase(); return normalizar(TEMAS.map(w => (n.includes(w) ? 1 : 0.01))); }); } };

function entorno({ generarJSON, conVectores = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sueno-'));
  const cfg = { dir, memoria: { sueno: { hora: '04:00' } } };
  const memoria = crearMemoria({ cfg, embedder: conVectores ? embedder : null });
  const grafo = crearGrafo({ cfg, memoria });
  const bus = new EventEmitter();
  const tareas = crearTareas({ cfg, bus, ejecutarAgente: async () => '' });
  const sueno = crearSueno({ cfg, bus, memoria, grafo, generarJSON, modelo: () => 'falso/m', tareas, horaBriefing: () => '08:00' });
  return { dir, cfg, memoria, grafo, bus, tareas, sueno };
}

test('fase ligera: fusiona repetidos (Jaccard y coseno), suma usos y caduca hechos viejos sin usar', async () => {
  const { memoria, sueno, dir } = entorno({ generarJSON: async () => { throw new Error('sin modelo'); } });
  const a = memoria.recordar({ texto: 'Prefiere respuestas cortas y en español', tipo: 'preferencia' });
  memoria.editar(a.id, { usos: 3 });
  // casi igual por palabras pero distinto (el recordar normal lo deduplicaría: se fuerza como nuevo)
  memoria.recordar({ texto: 'Prefiere respuestas cortas, en español y sin rodeos', tipo: 'preferencia', nuevo: true });
  // mismo significado con otras palabras: lo une el coseno (mismo "tema" en el embedder falso + algo de palabras)
  memoria.recordar({ texto: 'Imprime piezas en su impresora Ender 3', tipo: 'hecho', nuevo: true });
  memoria.recordar({ texto: 'Usa una impresora Ender', tipo: 'hecho', nuevo: true });
  const viejo = memoria.recordar({ texto: 'El teléfono viejo tenía Android 9', tipo: 'hecho' });
  memoria.editar(viejo.id, { actualizada: Date.now() - 400 * 86400_000 });
  const manual = memoria.recordar({ texto: 'Su cumpleaños es en marzo', tipo: 'hecho', origen: 'api' });
  memoria.editar(manual.id, { actualizada: Date.now() - 400 * 86400_000 });
  await memoria.indexar();
  const inf = await sueno.dormir({ motivo: 'prueba' });
  assert.strictEqual(inf.fusionados.length, 2, JSON.stringify(inf.fusionados));
  const pref = memoria.lista().filter(m => m.tipo === 'preferencia');
  assert.strictEqual(pref.length, 1);
  assert.match(pref[0].texto, /sin rodeos/);                      // se queda el más completo
  assert.strictEqual(pref[0].usos, 3);                            // con los usos sumados
  assert.deepStrictEqual(inf.olvidados.map(o => o.id), [viejo.id]); // el guardado a mano (origen api) no caduca
  assert.ok(memoria.lista().some(m => m.id === manual.id));
  // REM falló (sin modelo) pero el sueño sigue y lo apunta
  assert.match(inf.fases.rem, /error/);
  assert.ok(fs.existsSync(path.join(dir, 'suenos', `${inf.id}.json`)));
  assert.ok(fs.existsSync(path.join(dir, 'suenos', `${inf.id}.memoria.bak.json`)));
});

test('REM crea patrones (origen sueño) y alimenta el grafo; profunda condensa el perfil sin perder datos y deshacer lo revierte', async () => {
  let llamadas = 0;
  const generarJSON = async ({ schema, prompt }) => {
    llamadas++;
    if (schema.required.includes('patrones')) {
      const ids = [...prompt.matchAll(/^(\w{6}) · /gm)].map(m => m[1]);
      return { datos: {
        patrones: [{ texto: 'Usa el turno de noche para avanzar sus proyectos de robótica', recuerdos: ids.slice(0, 2), confianza: 0.8 },
          { texto: 'Patrón sin apoyo suficiente', recuerdos: [ids[0]], confianza: 0.9 }, { texto: 'Patrón dudoso', recuerdos: ids.slice(0, 3), confianza: 0.2 }],
        entidades: [{ nombre: 'Robot humanoide', tipo: 'proyecto', recuerdos: [ids[0]] }, { nombre: 'Carlos', tipo: 'persona', recuerdos: [ids[2]] }],
        relaciones: [{ de: 'usuario', a: 'Robot humanoide', tipo: 'construye' }, { de: 'Carlos', a: 'El Trueno', tipo: 'es dueño de' }],
        aprendi: 'Esta noche aprendí que te gusta trabajar de madrugada.' } };
    }
    // perfil: la primera vez pierde un dato (rechazo), la segunda lo conserva
    if (llamadas === 2) return { datos: { perfil: ['Demon tiene un taller de camiones'] } };
    return { datos: { perfil: ['Demon (@DEMON_CUBA) tiene el taller Power Truck Services en Miami', 'Habla español y es maker'] } };
  };
  const { memoria, grafo, sueno, bus } = entorno({ generarJSON });
  memoria.recordar({ texto: 'Está construyendo un robot humanoide con MuJoCo', tipo: 'proyecto' });
  memoria.recordar({ texto: 'Deja encargos al turno de noche casi a diario', tipo: 'hecho' });
  memoria.recordar({ texto: 'Su amigo Carlos tiene un Peterbilt 389 llamado El Trueno', tipo: 'persona' });
  memoria.recordar({ texto: 'Se llama Demon (@DEMON_CUBA) y es maker', tipo: 'perfil' });
  memoria.recordar({ texto: 'Tiene el taller Power Truck Services en Miami', tipo: 'perfil' });
  memoria.recordar({ texto: 'Habla español', tipo: 'perfil' });
  const antes = memoria.lista().length;

  const i1 = await sueno.dormir({ motivo: 'noche' });
  assert.strictEqual(i1.nuevos.length, 1);                                    // solo el patrón con ≥2 apoyos y confianza suficiente
  const p = memoria.lista().find(m => m.tipo === 'patron');
  assert.strictEqual(p.origen, 'sueño');
  assert.match(i1.fases.profunda, /rechazado/);                               // perdía "Power Truck Services", "Miami"…
  assert.strictEqual(memoria.lista().filter(m => m.tipo === 'perfil').length, 3);
  assert.match(i1.resumen, /^Esta noche aprendí/);
  const ex = grafo.explorar('Carlos');
  assert.strictEqual(ex.entidad.tipo, 'persona');
  assert.ok(ex.vecinos.some(v => v.nombre === 'El Trueno' && v.relacion === 'es dueño de'), JSON.stringify(ex.vecinos));
  assert.ok(grafo.explorar('Robot humanoide').vecinos.some(v => v.id === 'usuario'));

  // segunda noche: el perfil condensado conserva todos los datos duros → se aplica
  const i2 = await sueno.dormir({ motivo: 'noche' });
  assert.ok(i2.perfilCambiado, i2.fases.profunda);
  assert.deepStrictEqual(memoria.lista().filter(m => m.tipo === 'perfil').map(m => m.texto).sort(), ['Demon (@DEMON_CUBA) tiene el taller Power Truck Services en Miami', 'Habla español y es maker']);
  assert.strictEqual(i2.perfilAntes.length, 3);

  // aviso por la mañana (a la hora del briefing), una sola vez
  const avisos = []; bus.on('aviso-externo', a => avisos.push(a));
  const real = Date.now; Date.now = () => real() + 30 * 3600_000;
  try { sueno.revisarEntregas(); sueno.revisarEntregas(); } finally { Date.now = real; }
  assert.ok(avisos.length >= 1 && avisos.length <= 2 && avisos.every(a => /Sueño de la memoria/.test(a.texto) && !a.urgente), JSON.stringify(avisos));
  assert.ok(sueno.informes().every(i => i.entregado));

  // deshacer la segunda noche → vuelve el perfil de 3 líneas
  sueno.deshacer(i2.id);
  assert.strictEqual(memoria.lista().filter(m => m.tipo === 'perfil').length, 3);
  assert.strictEqual(memoria.lista().length, antes + 1);                       // + el patrón de la primera noche
  assert.ok(sueno.leer(i2.id).deshecho);
});

test('tarea interna programada a la hora de cfg.memoria.sueno, copias limitadas y datos duros', async () => {
  const { tareas, sueno, cfg, dir, memoria } = entorno({ generarJSON: async () => ({ datos: { patrones: [], entidades: [], relaciones: [], aprendi: '' } }), conVectores: false });
  sueno.configurar({ activo: true });
  const t = sueno.programar();
  assert.deepStrictEqual(t.cuando, { cron: '0 4 * * *' });
  assert.deepStrictEqual(t.accion, { tipo: 'interna', nombre: 'sueno' });
  sueno.configurar({ hora: '03:30' });
  assert.strictEqual(tareas.lista().filter(x => x.accion.nombre === 'sueno').length, 1);
  assert.strictEqual(tareas.lista()[0].cuando.cron, '30 3 * * *');
  sueno.configurar({ activo: false });
  assert.strictEqual(tareas.lista().length, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).memoria.sueno.activo, false);
  // copias: se guardan como máximo cfg.memoria.sueno.guardar
  cfg.memoria.sueno.guardar = 2;
  memoria.recordar({ texto: 'algo', tipo: 'hecho' });
  for (let i = 0; i < 4; i++) { await sueno.dormir(); await new Promise(ok => setTimeout(ok, 1100)); }
  assert.strictEqual(fs.readdirSync(path.join(dir, 'suenos')).filter(f => f.endsWith('.bak.json')).length, 2);
  assert.strictEqual(sueno.informes().length, 4);
  const d = datosDuros('Tiene 3 monitores. Vive en Miami con su Peterbilt 389 y usa MuJoCo');
  assert.ok(d.has('3') && d.has('miami') && d.has('peterbilt') && d.has('389') && d.has('mujoco') && !d.has('tiene') && !d.has('vive'));
});
