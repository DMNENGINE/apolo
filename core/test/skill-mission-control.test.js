// La skill mission-control: sus mundos de ejemplo pasan su validador (0 errores) y el del núcleo los deja igual; la galería los ofrece.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validar: validarSkill } = require('../../skills/maker/mission-control/scripts/validar');
const { validar, crearMundo, BASE } = require('../mundo');

const dir = path.join(__dirname, '..', '..', 'skills', 'maker', 'mission-control', 'references', 'ejemplos');
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
  test(`ejemplo ${f}: válido para la skill y para el núcleo`, () => {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.deepStrictEqual(validarSkill(m).err, []);
    assert.deepStrictEqual(validar(m), m);
  });
}
test('el validador de la skill detecta lo típico', () => {
  const m = JSON.parse(JSON.stringify(BASE));
  m.objetos.push({ tipo: 'rack', x: 26, y: 10 }, { tipo: 'dragon', x: 1, y: 1 });             // tapa el pasillo principal→bahía y un tipo inventado
  m.salas = m.salas.filter(s => s.rol !== 'subagentes');
  const e = validarSkill(m).err.join('\n');
  assert.match(e, /dragon/); assert.match(e, /subagentes/);
});
test('la galería incluye los mundos de serie y los del usuario', async t => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gal-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  fs.mkdirSync(path.join(d, 'mundos')); fs.writeFileSync(path.join(d, 'mundos', 'mio.json'), JSON.stringify({ ...BASE, nombre: 'Mío' }));
  const w = crearMundo({ cfg: { dir: d }, generarJSON: async () => ({}), modelo: () => 'x' });
  const l = await w.http('GET', ['', 'mundo', 'presets'], {});
  for (const id of ['mazmorra', 'colmena', 'infierno', 'estacion', 'mio']) assert.ok(l.some(x => x.id === id), id);
  assert.strictEqual((await w.http('GET', ['', 'mundo', 'presets', 'infierno'], {})).mundo.tema, 'infierno');
});
