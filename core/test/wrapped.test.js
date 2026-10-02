// APOLO Wrapped: métricas reales (horas de agente, racha, modelo favorito, herramientas, ahorro explicado, logro),
// privacidad por defecto (sin textos de conversaciones), página de las tarjetas y API. Sin navegador ni red.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearSesiones } = require('../sesiones');
const { crearWrapped, categoria } = require('../wrapped');
const { crearMemoria } = require('../memoria');
const { crearTareas } = require('../tareas');
const { EventEmitter } = require('events');

const DIA = 86400_000;
function entorno() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-'));
  const cfg = { dir, modeloPorDefecto: 'ollama/gemma' };
  const sesiones = crearSesiones({ cfg }), memoria = crearMemoria({ cfg }), tareas = crearTareas({ cfg, bus: new EventEmitter(), ejecutarAgente: async () => '' });
  const ahora = new Date(); ahora.setHours(15, 0, 0, 0);
  // 3 días seguidos (hoy, ayer, anteayer) + uno suelto hace 5 días; cada turno: usuario → herramientas → respuesta
  const turno = (s, t, herr, durMin) => {
    sesiones.agregar(s, { role: 'user', content: 'SECRETO_DE_CONVERSACION presupuesto del cliente', t });
    herr.forEach((h, i) => {
      sesiones.agregar(s, { role: 'assistant', content: '', toolCalls: [{ id: 'c' + i, name: h, args: h === 'usar_skill' ? { nombre: 'brand-guidelines' } : {} }], t: t + 1000 });
      sesiones.agregar(s, { role: 'tool', toolCallId: 'c' + i, name: h, content: 'ok', t: t + 2000 });
    });
    sesiones.agregar(s, { role: 'assistant', content: 'hecho', t: t + durMin * 60_000 });
  };
  for (const [d, modelo, herr] of [[0, 'ollama/gemma', ['shell', 'shell', 'editar_archivo']], [1, 'ollama/gemma', ['web', 'usar_skill']], [2, 'anthropic/claude-x', ['delegar']], [5, 'ollama/gemma', ['leer_archivo']]]) {
    const s = sesiones.crear({ modelo, titulo: 'Título privado ' + d, cwd: path.join(dir, 'MiProyectoSecreto') });
    turno(s, ahora.getTime() - d * DIA, herr, 30);
    turno(s, ahora.getTime() - d * DIA + 3600_000, ['shell'], 90);          // turno de 90 min → cuenta 30 (tope)
  }
  const vieja = sesiones.crear({ modelo: 'otro/m', titulo: 'vieja' }); turno(vieja, ahora.getTime() - 20 * DIA, ['shell'], 10);   // fuera de la semana
  fs.writeFileSync(path.join(dir, 'tareas_historial.jsonl'), [0, 1].map(d => JSON.stringify({ t: ahora.getTime() - d * DIA, fin: ahora.getTime() - d * DIA + 1000, id: 'x', nombre: 'Heartbeat', tipo: 'agente', ok: true, resultado: 'NADA' })).join('\n') + '\n');
  const turnoFalso = { informes: () => [{ id: 't1', creado: ahora.getTime() - DIA, hecho: 2, encargos: 3 }] };
  const consejoFalso = { historial: () => [{ creado: ahora.getTime() - 2 * DIA, acuerdo: 80, pregunta: 'pregunta privada' }] };
  const suenoFalso = { informes: () => [{ inicio: ahora.getTime() - DIA, fusionados: [{ borrados: [1, 2] }], nuevos: [{}], frase: 'Esta noche aprendí algo PRIVADO de ti.' }] };
  const wr = crearWrapped({ cfg, sesiones, tareas, turno: turnoFalso, consejo: consejoFalso, sueno: suenoFalso, memoria, personalidad: { nombre: () => 'APOLO' } });
  return { dir, wr, ahora: ahora.getTime() + 3 * 3600_000 };
}

test('métricas de la semana: horas, racha, modelo favorito, herramientas, ahorro explicado y logro', () => {
  const { wr, ahora } = entorno();
  const d = wr.datos({ periodo: 'semana', ahora });
  assert.strictEqual(d.periodo, 'semana');
  assert.strictEqual(d.sesiones, 4);                                     // la de hace 20 días no cuenta
  assert.strictEqual(d.turnos, 8);
  assert.strictEqual(d.minutosAgente, 4 * 30 + 4 * 30);                  // 30 min + 90 min topado a 30, por sesión
  assert.deepStrictEqual(d.racha, { mejor: 3, actual: 3 });
  assert.strictEqual(d.diasActivos, 4);
  assert.strictEqual(d.modeloFavorito.id, 'ollama/gemma');
  assert.strictEqual(d.modeloFavorito.pct, 75);
  assert.strictEqual(d.herramientas.top[0].nombre, 'shell');
  assert.strictEqual(d.herramientas.top[0].usos, 6);
  assert.strictEqual(d.herramientas.categorias[0].nombre, 'Terminal');
  assert.deepStrictEqual(d.skills, [{ nombre: 'brand-guidelines', usos: 1 }]);
  // ahorro = 6×2 (terminal) + 1×3 (archivo editar) + 1×3 (leer) + 1×3 (web) + 1×5 (skill) + 1×10 (subagente) + 2×45 (encargos) + 2×5 (tareas) + 1×15 (consejo)
  assert.strictEqual(d.ahorro.minutos, 12 + 6 + 3 + 5 + 10 + 90 + 10 + 15);
  assert.ok(d.ahorro.desglose.some(x => x.concepto === 'Encargos nocturnos' && x.min === 90));
  assert.match(d.ahorro.explicacion, /Estimación/);
  assert.strictEqual(d.turno.hechos, 2); assert.strictEqual(d.consejos.total, 1); assert.strictEqual(d.tareas.total, 2);
  assert.ok(d.logro.titulo && d.logros.length >= 2);
  assert.strictEqual(d.ritmo.horaPico, 15);
  assert.strictEqual(d.calendario.length, 7);
  assert.strictEqual(d.calendario.filter(c => c.on).length, 4);
  assert.strictEqual(categoria('navegador_clic'), 'Web');
  // el mes incluye la sesión de hace 20 días
  assert.strictEqual(wr.datos({ periodo: 'mes', ahora }).sesiones, 5);
});

test('privacidad: por defecto nada de textos; con privado=true títulos, proyectos y la frase del sueño', () => {
  const { wr, ahora } = entorno();
  const pub = JSON.stringify(wr.datos({ periodo: 'semana', ahora }));
  for (const x of ['SECRETO_DE_CONVERSACION', 'presupuesto', 'Título privado', 'MiProyectoSecreto', 'PRIVADO', 'pregunta privada']) assert.ok(!pub.includes(x), x);
  assert.match(JSON.parse(pub).sueno.frase, /Esta noche aprendí 1 cosa nueva/);   // frase genérica con números
  const priv = wr.datos({ periodo: 'semana', ahora, privado: true });
  assert.match(priv.sueno.frase, /PRIVADO/);
  assert.ok(priv.privadoDatos.proyectos.some(p => p.nombre === 'MiProyectoSecreto'));
  assert.ok(!JSON.stringify(priv).includes('SECRETO_DE_CONVERSACION'));          // ni con detalles salen los mensajes
});

test('página de las tarjetas y API /v1/wrapped', async t => {
  const { wr, dir } = entorno();
  const { d, dir: out } = wr.preparar({ periodo: 'semana', acento: '#ff5fa2' });
  const html = fs.readFileSync(path.join(out, 'video.html'), 'utf8');
  assert.match(html, /<script type="application\/json" id="datos">/);
  assert.match(html, /\/ui\/wrapped-tarjetas\.js/);
  assert.match(html, /"acento":"#ff5fa2"/);
  assert.ok(!html.includes('SECRETO_DE_CONVERSACION'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(out, 'datos.json'), 'utf8')).sesiones, d.sesiones);
  // el renderizador es un script válido
  new Function(fs.readFileSync(path.join(__dirname, '..', 'ui', 'wrapped-tarjetas.js'), 'utf8'));
  assert.deepStrictEqual(await wr.http('GET', ['v1', 'wrapped'], {}, { periodo: 'mes' }).then(x => x.periodo), 'mes');
  await assert.rejects(wr.http('GET', ['v1', 'wrapped', 'video'], {}, {}), /aún no hay vídeo/);
  // por la API del daemon
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'x/y', memoria: { embeddings: null }, proveedores: { x: { tipo: 'openai', baseUrl: 'http://127.0.0.1:9/v1', local: true } } }));
  const { iniciar } = require('../daemon');
  const { servidor, puerto, token } = await iniciar({ dir, puerto: 0, sinTareas: true, sinPlugins: true });
  t.after(() => { servidor.closeAllConnections?.(); servidor.close(); });
  const r = await (await fetch(`http://127.0.0.1:${puerto}/v1/wrapped?periodo=año`, { headers: { 'x-robot-token': token } })).json();
  assert.strictEqual(r.periodo, 'año');
  assert.ok(r.sesiones >= 4);                                            // las de hoy a las 15:00 pueden ser "futuras" según la hora del test
  const pag = await fetch(`http://127.0.0.1:${puerto}/wrapped.html`);
  assert.strictEqual(pag.headers.get('x-frame-options'), 'SAMEORIGIN');           // el panel lo enmarca; el resto sigue en DENY
  assert.strictEqual((await fetch(`http://127.0.0.1:${puerto}/index.html`)).headers.get('x-frame-options'), 'DENY');
});
