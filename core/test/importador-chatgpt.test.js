// Export de ChatGPT → memoria: normaliza, tapa secretos, trocea por fecha, pausa si el modelo falla y continúa donde se quedó.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearImportadorChatGPT, normalizar, trocear } = require('../importador-chatgpt');

function montar(t, generarJSON) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const recuerdos = [];
  const memoria = { recordar: h => { if (/sk-/.test(h.texto)) throw new Error('secreto'); recuerdos.push(h); return { accion: 'creada' }; } };
  const imp = crearImportadorChatGPT({ cfg: { dir }, memoria, generarJSON, modelo: () => 'x/y' });
  return { dir, imp, recuerdos };
}

const conv = (f, n, largo = 50) => ({ t: `chat ${f}`, f, u: Array.from({ length: n }, (_, i) => `mensaje ${i} `.padEnd(largo, 'x')) });

test('normalizar: ordena por fecha, recorta, tapa claves y quita chats vacíos', () => {
  const r = normalizar([conv('2025-01-02', 1), { t: 'vacío', f: '2024-01-01', u: [] }, { t: 'clave', f: 'mal', u: ['mi clave sk-abcdefghijklmnopqrstuvwx', 'z'.repeat(5000), 7] }]);
  assert.deepStrictEqual(r.map(c => c.f), ['0000-00-00', '2025-01-02']);
  assert.match(r[0].u[0], /\[REDACTADO\]/);
  assert.strictEqual(r[0].u[1].length, 800);
  assert.strictEqual(r[0].u.length, 2);
});

test('trocear: no pasa de ~20k caracteres por trozo', () => {
  const tr = trocear(Array.from({ length: 60 }, (_, i) => conv(`2025-01-${String(i % 28 + 1).padStart(2, '0')}`, 10, 700)));
  assert.ok(tr.length > 1);
  assert.ok(tr.every(x => x.length <= 20_000));
});

test('importa en segundo plano, guarda copia y resultado', async t => {
  const prompts = [];
  const { dir, imp, recuerdos } = montar(t, async ({ prompt }) => { prompts.push(prompt); return { datos: { hechos: [{ texto: 'Tiene un taller de camiones', tipo: 'perfil' }, { texto: 'clave sk-abcdefghijklmnopqrstuvwx', tipo: 'hecho' }] } }; });
  assert.throws(() => imp.empezar({ formato: 'otro', conversaciones: [conv('2025-01-01', 1)] }), /formato/);
  const e = imp.empezar({ formato: 'chatgpt-export/1', conversaciones: Array.from({ length: 40 }, (_, i) => conv('2025-02-01', 10, 700)) });
  assert.strictEqual(e.corriendo, true);
  assert.throws(() => imp.empezar({ formato: 'chatgpt-export/1', conversaciones: [conv('2025-01-01', 1)] }), /en marcha/);
  await imp.esperar();
  assert.strictEqual(prompts.length, e.total);
  assert.match(prompts[0], /solo los suyos/);
  assert.strictEqual(recuerdos.length, e.total);
  assert.ok(recuerdos.every(h => h.origen === 'importado de chatgpt'));
  const res = JSON.parse(fs.readFileSync(path.join(e.backup, '_resultado.json'), 'utf8'));
  assert.strictEqual(res.terminado, true);
  assert.strictEqual(res.creados, e.total);
  assert.strictEqual(res.rechazados, e.total);
  assert.ok(fs.existsSync(path.join(dir, 'importado', 'chatgpt')));
  assert.strictEqual(imp.estado(), null);                    // terminada: ya no está "a medias"
});

test('si el modelo falla se pausa y "continuar" sigue donde se quedó', async t => {
  let llamadas = 0, roto = true;
  const { imp } = montar(t, async () => { llamadas++; if (roto && llamadas > 1) throw new Error('sin red'); return { datos: { hechos: [] } }; });
  const e = imp.empezar({ formato: 'chatgpt-export/1', conversaciones: Array.from({ length: 40 }, () => conv('2025-03-01', 10, 700)) });
  await imp.esperar();
  let s = imp.estado();
  assert.strictEqual(s.corriendo, false);
  assert.strictEqual(s.pausado, true);
  assert.strictEqual(s.hecho, 1);
  assert.match(s.errores[0], /sin red/);
  roto = false;
  imp.continuar();
  await imp.esperar();
  assert.strictEqual(imp.estado(), null);
  assert.ok(fs.existsSync(path.join(e.backup, '_resultado.json')));
});

test('lo que el modelo marca como perfil entra como hecho (el perfil va siempre en el contexto)', async t => {
  const { imp, recuerdos } = montar(t, async () => ({ datos: { hechos: [{ texto: 'Vive en Miami', tipo: 'perfil' }] } }));
  imp.empezar({ formato: 'chatgpt-export/1', conversaciones: [conv('2025-01-01', 1)] });
  await imp.esperar();
  assert.deepStrictEqual(recuerdos.map(h => h.tipo), ['hecho']);
});
