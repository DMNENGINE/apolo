// Nacimiento (como BOOTSTRAP.md de OpenClaw): instalación nueva → NACIMIENTO.md → su primera conversación es una entrevista;
// la herramienta "nacer" escribe IDENTITY/USER (+ alma y límites) con un solo aviso y lo termina. Renacer / saltar por la API.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearAlma } = require('../alma');

function montar({ viejo = false, cfg = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nacer-'));
  if (viejo) {
    fs.mkdirSync(path.join(dir, 'personalidad'));
    fs.writeFileSync(path.join(dir, 'personalidad', 'identidad.md'), '# IDENTITY.md\n\n- **Name:** APOLO\n');
  }
  const bus = new EventEmitter(), avisos = [], eventos = [];
  bus.on('aviso-externo', a => avisos.push(a));
  bus.on('evento', e => eventos.push(e));
  const alma = crearAlma({ dir, ...cfg }, bus);
  return { dir, alma, avisos, eventos, nacer: alma.HERRAMIENTAS.find(x => x.nombre === 'nacer') };
}

test('instalación nueva nace; una que ya existía (o con nacimiento:false) no', () => {
  const n = montar();
  assert.ok(n.alma.naciendo());
  assert.match(n.alma.nacimiento(), /NACIMIENTO[\s\S]*propón uno o pregúntale[\s\S]*"nacer"/);
  const v = montar({ viejo: true });
  assert.ok(!v.alma.naciendo());
  assert.strictEqual(v.alma.nacimiento(), '');
  assert.ok(!montar({ cfg: { alma: { nacimiento: false } } }).alma.naciendo());
});

test('nacer escribe identidad, humano, alma y límites con UN aviso, sin gastar el tope diario, y termina', async () => {
  const { alma, avisos, eventos, nacer } = montar();
  const r = await nacer.ejecutar({
    identidad: '# IDENTITY.md\n\n- **Nombre:** Nova\n- **Criatura:** espíritu del ordenador\n- **Emoji:** ✨\n',
    usuario: '- **Nombre:** Sara\n- **Cómo llamarle:** Sari\n- **Zona horaria:** Europe/Madrid\n',
    alma: 'Soy bromista pero voy al grano.',
    limites: ['Nunca le hables de política.'],
    resumen: 'Soy Nova, el espíritu bromista del ordenador de Sari.',
  });
  assert.match(r, /naciste/);
  assert.strictEqual(alma.nombre(), 'Nova');
  assert.match(alma.leer('usuario'), /^# USER\.md[\s\S]*Sari/);                     // le pone cabecera si no la trae
  const soul = alma.leer('alma');
  assert.match(soul, /## Límites[\s\S]*- Nunca le hables de política\.[\s\S]*## Continuidad/);   // dentro de su sección de límites
  assert.match(soul, /## Cómo soy\n\nSoy bromista/);
  assert.strictEqual(avisos.length, 1);
  assert.match(avisos[0].texto, /He nacido: Soy Nova[\s\S]*IDENTITY\.md, USER\.md, SOUL\.md[\s\S]*Mente → Alma/);
  assert.ok(!alma.naciendo());
  assert.ok(eventos.some(e => e.tipo === 'nacimiento' && e.estado === 'hecho'));
  assert.deepStrictEqual(alma.historial(10).map(h => h.quien), ['apolo', 'apolo', 'apolo']);
  // no gastó el tope diario de evolucionar_alma
  const evo = alma.HERRAMIENTAS.find(x => x.nombre === 'evolucionar_alma');
  assert.match(await evo.ejecutar({ archivo: 'alma', operacion: 'anadir', texto: 'Algo más.', motivo: 'prueba' }), /^Hecho/);
  assert.match(await nacer.ejecutar({ identidad: 'x', usuario: 'y', resumen: 'z' }), /ya naciste/);   // solo una vez
});

test('nacer respeta las reglas del alma: sin secretos', async () => {
  const { alma, nacer } = montar();
  const r = await nacer.ejecutar({ identidad: '- **Nombre:** X\n- password=hunter22\n', usuario: '- **Nombre:** Y', resumen: 'r' });
  assert.match(r, /^error: no se guardan contraseñas/);
  assert.ok(alma.naciendo());                                                       // sigue naciendo
});

test('API: GET dice si nace, POST /nacimiento renace, DELETE lo salta', async () => {
  const { alma } = montar({ viejo: true });
  assert.strictEqual((await alma.http('GET', ['v1', 'alma'])).naciendo, false);
  assert.deepStrictEqual(await alma.http('POST', ['v1', 'alma', 'nacimiento']), { naciendo: true });
  assert.ok(alma.naciendo() && /APOLO/.test(alma.nacimiento()));                     // con el nombre que ya tiene
  assert.deepStrictEqual(await alma.http('DELETE', ['v1', 'alma', 'nacimiento']), { naciendo: false });
  assert.ok(!alma.naciendo());
});

test('agente: mientras nace, la charla lleva la guía y la herramienta nacer; las tareas no; luego desaparece', async () => {
  const { crearNucleo } = require('..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nacer-n-'));
  const n = crearNucleo({ dir, sinPlugins: true, embedder: null });
  if (!n.proveedores.registrarExterno) return;
  const vistos = [];
  let llamar = null;
  n.proveedores.registrarExterno('falso', { chat: async ({ system, herramientas }) => {
    vistos.push({ guia: /ESTÁS NACIENDO/.test(system), nacer: herramientas.some(h => (h.nombre || h.name) === 'nacer') });
    if (llamar) { const c = llamar; llamar = null; return { texto: '', toolCalls: [c], uso: { entrada: 1, salida: 1 } }; }
    return { texto: 'hola', toolCalls: [], uso: { entrada: 1, salida: 1 } };
  } });
  const tarea = n.sesiones.crear({ modelo: 'falso/m', canal: 'tarea', tarea: true, cwd: dir });
  await n.enviar(tarea, 'tarea programada');
  assert.deepStrictEqual(vistos.pop(), { guia: false, nacer: false });
  const s = n.sesiones.crear({ modelo: 'falso/m', canal: 'panel', cwd: dir });
  llamar = { id: 'a', name: 'nacer', args: { identidad: '- **Nombre:** Kai', usuario: '- **Nombre:** Leo', resumen: 'Soy Kai.' } };
  await n.enviar(s, 'hola');
  assert.deepStrictEqual(vistos[0], { guia: true, nacer: true });
  assert.match(s.mensajes.find(x => x.role === 'tool').content, /naciste/);
  assert.strictEqual(n.personalidad.nombre(), 'Kai');
  await n.enviar(s, '¿y ahora?');
  assert.deepStrictEqual(vistos.pop(), { guia: false, nacer: false });
  n.conciencia?.detener();
});
