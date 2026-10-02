const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { siguienteCron, crearTareas } = require('../tareas');

const L = (s) => new Date(s).getTime();           // fecha local
const fmt = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

test('cron: siguiente ejecución', () => {
  assert.strictEqual(fmt(siguienteCron('0 8 * * *', L('2026-10-01T07:30'))), '2026-10-01T08:00');
  assert.strictEqual(fmt(siguienteCron('0 8 * * *', L('2026-10-01T08:00'))), '2026-10-02T08:00');
  assert.strictEqual(fmt(siguienteCron('*/15 * * * *', L('2026-10-01T10:07'))), '2026-10-01T10:15');
  assert.strictEqual(fmt(siguienteCron('30 9 * * 1-5', L('2026-10-03T12:00'))), '2026-10-05T09:30');   // sábado -> lunes
  assert.strictEqual(fmt(siguienteCron('0 0 1 * *', L('2026-10-15T00:00'))), '2026-11-01T00:00');
  assert.strictEqual(fmt(siguienteCron('0 12 * * 7', L('2026-10-01T00:00'))), '2026-10-04T12:00');      // 7 = domingo
  assert.throws(() => siguienteCron('0 25 * * *'));
  assert.throws(() => siguienteCron('0 8 * *'));
});

function entorno(ejecutarAgente = async () => 'hecho') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tareas-'));
  const bus = new EventEmitter(), ev = [];
  bus.on('tarea', e => ev.push(e));
  return { t: crearTareas({ cfg: { dir }, bus, ejecutarAgente }), ev, dir };
}
const espera = () => new Promise(r => setImmediate(r));

test('aviso de una vez: dispara y se desactiva', async () => {
  const { t, ev } = entorno();
  const ahora = Date.now();
  const x = t.crear({ nombre: 'llamar', cuando: { en: fmt(ahora + 120_000) }, accion: { tipo: 'aviso', texto: 'llama a Juan' } });
  t.tick(ahora); assert.strictEqual(ev.length, 0);
  t.tick(x.proxima + 1000); await espera();
  assert.deepStrictEqual(ev.map(e => [e.tipo, e.texto]), [['aviso', 'llama a Juan']]);
  assert.strictEqual(t.obtener(x.id).activa, false);
  assert.throws(() => t.crear({ cuando: { en: '2020-01-01T00:00' }, accion: { tipo: 'aviso', texto: 'x' } }), /ya pasó/);
});

test('heartbeat: NADA no molesta, algo importante sí', async () => {
  const respuestas = ['NADA', 'El servidor está caído'];
  const prompts = [];
  const { t, ev } = entorno(async ({ texto }) => { prompts.push(texto); return respuestas.shift(); });
  const x = t.crear({ cuando: { cadaMin: 30 }, accion: { tipo: 'agente', texto: 'revisa el servidor', soloSiHayAlgo: true } });
  t.tick(x.proxima + 1); await espera();
  assert.strictEqual(ev.length, 0);
  assert.match(prompts[0], /responde exactamente: NADA/);
  t.tick(t.obtener(x.id).proxima + 1); await espera();
  assert.deepStrictEqual(ev.map(e => e.texto), ['El servidor está caído']);
});

test('apagado mucho tiempo: se salta en vez de ejecutarse tarde; se guarda en disco', async () => {
  const { t, ev, dir } = entorno();
  const x = t.crear({ cuando: { cron: '0 8 * * *' }, accion: { tipo: 'aviso', texto: 'buenos días' } });
  const antes = x.proxima;
  t.tick(antes + 5 * 3600_000); await espera();
  assert.strictEqual(ev.length, 0);
  assert.match(t.obtener(x.id).ultimoResultado, /saltada/);
  assert.ok(t.obtener(x.id).proxima > antes);
  const guardadas = JSON.parse(fs.readFileSync(path.join(dir, 'tareas.json'), 'utf8'));
  assert.strictEqual(guardadas[0].id, x.id);
  assert.ok(t.borrar(x.id)); assert.strictEqual(t.lista().length, 0);
});
