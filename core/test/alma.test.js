// Alma (core/alma.js): migración del formato antiguo, versiones + deshacer, APOLO evoluciona su alma y avisa,
// límites protegidos (solo añadir), sin secretos, instrucciones solo del usuario, tope diario.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearAlma, lineasProtegidas } = require('../alma');

const VIEJO = `# Identidad (importado de openclaw)

# SOUL.md - Who You Are

_You're becoming someone._

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.

## Vibe

Be good.

# IDENTITY.md - Who Am I?

- **Name:** APOLO
- **Emoji:** ☀️
`;

function montar(viejo = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alma-'));
  if (viejo) {
    fs.mkdirSync(path.join(dir, 'personalidad'));
    fs.writeFileSync(path.join(dir, 'personalidad', 'identidad.md'), VIEJO);
    fs.writeFileSync(path.join(dir, 'personalidad', 'contexto.md'), '# Sobre el usuario (importado de openclaw)\n\n# USER.md\n\n- **Name:** Demon\n');
    fs.writeFileSync(path.join(dir, 'personalidad', 'instrucciones.md'), '# Instrucciones\n\n- Revisa antes de borrar.\n');
  }
  const bus = new EventEmitter(), avisos = [];
  bus.on('aviso-externo', a => avisos.push(a));
  const alma = crearAlma({ dir }, bus);
  const h = n => alma.HERRAMIENTAS.find(x => x.nombre === n);
  return { dir, bus, avisos, alma, h };
}

test('migra identidad.md (SOUL + IDENTITY pegados) y contexto.md al formato SOUL/IDENTITY/USER', () => {
  const { dir, alma } = montar();
  const P = f => path.join(dir, 'personalidad', f);
  assert.match(fs.readFileSync(P('SOUL.md'), 'utf8'), /^# SOUL\.md/);
  assert.doesNotMatch(fs.readFileSync(P('SOUL.md'), 'utf8'), /IDENTITY/);
  assert.match(fs.readFileSync(P('IDENTITY.md'), 'utf8'), /^# IDENTITY\.md[\s\S]*APOLO/);
  assert.match(fs.readFileSync(P('USER.md'), 'utf8'), /^# USER\.md[\s\S]*Demon/);
  assert.ok(fs.existsSync(P('_antes/identidad.md')) && fs.existsSync(P('_antes/contexto.md')));
  assert.ok(!fs.existsSync(P('identidad.md')));
  assert.strictEqual(alma.nombre(), 'APOLO');
  const pr = alma.prompt();
  assert.ok(pr.indexOf('SOUL.md') < pr.indexOf('IDENTITY.md') && pr.indexOf('IDENTITY.md') < pr.indexOf('USER.md') && /Revisa antes de borrar/.test(pr));
  assert.deepStrictEqual(alma.lista().map(x => x.id), ['alma', 'identidad', 'usuario', 'instrucciones']);
  assert.strictEqual(alma.leer('contexto'), alma.leer('usuario'));         // alias antiguo
});

test('instalación nueva: plantillas, nombre por defecto y USER vacío fuera del prompt', () => {
  const { alma } = montar(false);
  assert.strictEqual(alma.nombre(), 'Robot');
  assert.match(alma.prompt(), /SOUL\.md/);
  assert.doesNotMatch(alma.prompt(), /USER\.md/);
  assert.strictEqual(alma.ponerNombre('Nova'), 'Nova');
  assert.strictEqual(alma.historial()[0].motivo, 'nuevo nombre: Nova');
});

test('APOLO evoluciona su alma: versión, aviso al usuario, diff y deshacer', async () => {
  const { alma, h, avisos } = montar();
  const r = await h('evolucionar_alma').ejecutar({ archivo: 'alma', operacion: 'anadir', seccion: 'Vibe', texto: 'Me gusta celebrar los pequeños logros.', motivo: 'descubrí que me alegra' });
  assert.match(r, /^Hecho/);
  const soul = alma.leer('alma');
  assert.match(soul, /## Vibe\n\nBe good\.\nMe gusta celebrar/);
  assert.strictEqual(avisos.length, 1);
  assert.match(avisos[0].texto, /SOUL\.md: descubrí que me alegra[\s\S]*\+Me gusta celebrar/);
  const v = alma.historial()[0];
  assert.strictEqual(v.quien, 'apolo'); assert.strictEqual(v.mas, 1);
  assert.match(alma.version(v.id).diff, /\+Me gusta celebrar/);
  alma.deshacer(v.id);
  assert.doesNotMatch(alma.leer('alma'), /celebrar/);
  assert.strictEqual(alma.historial()[0].quien, 'usuario');
  // sección nueva
  await h('evolucionar_alma').ejecutar({ archivo: 'alma', operacion: 'anadir', seccion: 'Lo que aprendí', texto: '- Demon prefiere respuestas cortas.', motivo: 'm' });
  assert.match(alma.leer('alma'), /## Lo que aprendí\n\n- Demon prefiere respuestas cortas\.\n$/);
});

test('límites: APOLO puede añadir pero no quitar ni cambiar; sin secretos; instrucciones solo del usuario; tope diario', async () => {
  const { alma, h } = montar();
  assert.deepStrictEqual(lineasProtegidas(alma.leer('alma')), ['- Private things stay private. Period.', '- When in doubt, ask before acting externally.']);
  let r = await h('evolucionar_alma').ejecutar({ archivo: 'alma', operacion: 'reemplazar', buscar: '- Private things stay private. Period.', texto: '- Private things are mostly private.', motivo: 'x' });
  assert.match(r, /no puedes quitar ni cambiar tus límites/);
  r = await h('evolucionar_alma').ejecutar({ archivo: 'alma', operacion: 'anadir', seccion: 'Boundaries', texto: '- Never share Demon\'s location.', motivo: 'más cuidado' });
  assert.match(r, /^Hecho/);
  r = await h('evolucionar_alma').ejecutar({ archivo: 'usuario', operacion: 'anadir', texto: 'password: hunter2hunter2', motivo: 'x' });
  assert.match(r, /contraseñas/);
  r = await h('evolucionar_alma').ejecutar({ archivo: 'instrucciones', operacion: 'anadir', texto: 'x', motivo: 'x' });
  assert.match(r, /solo puedes cambiar/);
  assert.throws(() => alma.guardar('instrucciones', 'x', { quien: 'apolo' }), /solo lo cambia el usuario/);
  // el usuario sí puede cambiar los límites
  alma.guardar('alma', alma.leer('alma').replace('- When in doubt, ask before acting externally.\n', ''));
  // tope diario (6 por defecto; ya lleva 1 de APOLO)
  for (let i = 0; i < 5; i++) assert.match(await h('evolucionar_alma').ejecutar({ archivo: 'identidad', operacion: 'anadir', texto: `nota ${i}`, motivo: 'm' }), /^Hecho/);
  assert.match(await h('evolucionar_alma').ejecutar({ archivo: 'identidad', operacion: 'anadir', texto: 'otra', motivo: 'm' }), /ya cambiaste tu alma 6 veces/);
  // ver_alma: historial
  assert.match(await h('ver_alma').ejecutar({ archivo: 'historial' }), /IDENTITY.md · apolo/);
});

test('API /v1/alma: lista, guardar, versión y deshacer', async () => {
  const { alma } = montar();
  const g = await alma.http('GET', ['v1', 'alma']);
  assert.strictEqual(g.archivos.length, 4); assert.strictEqual(g.nombre, 'APOLO');
  const { version } = await alma.http('PUT', ['v1', 'alma', 'usuario'], { contenido: '# USER.md\n\n- **Name:** Demon\n- Vive en California.\n' });
  const v = await alma.http('GET', ['v1', 'alma', 'versiones', version.id]);
  assert.match(v.diff, /\+- Vive en California/);
  await alma.http('POST', ['v1', 'alma', 'versiones', version.id, 'deshacer']);
  assert.doesNotMatch(alma.leer('usuario'), /California/);
});
