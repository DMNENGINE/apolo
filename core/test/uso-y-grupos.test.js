// Página de Uso con Claude Code (core/uso-claude.js) y herramientas por grupos (core/herramientas-grupos.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearUsoClaude, leerLinea } = require('../uso-claude');
const g = require('../herramientas-grupos');
const admin = require('../admin');

const linea = (id, ts, modelo, u, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: ts, requestId: 'r' + id, message: { id, model: modelo, role: 'assistant', content: [], usage: u }, ...extra });
const hoy = new Date().toISOString();

test('uso Claude Code: una respuesta en varias líneas cuenta una vez; caché dentro de la entrada; lectura incremental', async () => {
  assert.strictEqual(leerLinea('{"type":"user","message":{"content":"hola"}}'), null);
  assert.strictEqual(leerLinea(linea('m0', hoy, '<synthetic>', { input_tokens: 5, output_tokens: 1 })), null);
  const r = leerLinea(linea('m1', hoy, 'claude-opus-5-5', { input_tokens: 2, cache_creation_input_tokens: 30, cache_read_input_tokens: 1000, output_tokens: 50 }));
  assert.deepStrictEqual([r.entrada, r.salida, r.cacheLeida, r.cacheCreada, r.modelo], [1032, 50, 1000, 30, 'claude-opus-5-5']);

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-')), datos = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-d-'));
  fs.mkdirSync(path.join(raiz, 'proyecto', 'sub', 'subagents'), { recursive: true });
  const f1 = path.join(raiz, 'proyecto', 'a.jsonl'), f2 = path.join(raiz, 'proyecto', 'sub', 'subagents', 'b.jsonl');
  const u = { input_tokens: 2, cache_creation_input_tokens: 8, cache_read_input_tokens: 90, output_tokens: 10 };
  fs.writeFileSync(f1, [linea('m1', hoy, 'claude-opus-5-5', u), linea('m1', hoy, 'claude-opus-5-5', u), '{"type":"user"}', linea('m2', hoy, 'claude-opus-5-5', u)].join('\n') + '\n');
  fs.writeFileSync(f2, linea('m3', hoy, 'claude-sonnet-5', u) + '\n' + linea('m4', hoy, 'claude-sonnet-5', u).slice(0, 40));   // la última, a medio escribir
  const uc = crearUsoClaude({ cfg: { dir: datos }, dirClaude: raiz });
  await uc.actualizar({ forzar: true });
  let res = uc.resumen(30);
  assert.deepStrictEqual(res.porModelo['claude-code/claude-opus-5-5'], { entrada: 200, salida: 20, sesiones: 1, cacheLeida: 180 }, 'm1 dos líneas = una respuesta');
  assert.strictEqual(res.porModelo['claude-code/claude-sonnet-5'].entrada, 100, 'la línea a medias no cuenta todavía');
  assert.strictEqual(res.sesiones, 2);
  // se completa la línea y llega otra: solo se lee lo nuevo
  fs.writeFileSync(f2, linea('m3', hoy, 'claude-sonnet-5', u) + '\n' + linea('m4', hoy, 'claude-sonnet-5', u) + '\n');
  await uc.actualizar({ forzar: true });
  assert.strictEqual(uc.resumen(30).porModelo['claude-code/claude-sonnet-5'].entrada, 200);
  // otro proceso (reinicio de APOLO) parte de lo guardado
  const otro = crearUsoClaude({ cfg: { dir: datos }, dirClaude: raiz });
  assert.strictEqual(otro.resumen(30).porModelo['claude-code/claude-opus-5-5'].entrada, 200);
  // fuera del periodo no cuenta
  fs.appendFileSync(f1, linea('m9', '2020-01-01T00:00:00Z', 'claude-opus-5-5', u) + '\n');
  await uc.actualizar({ forzar: true });
  assert.strictEqual(uc.resumen(30).porModelo['claude-code/claude-opus-5-5'].entrada, 200);
  // admin.uso junta el núcleo y Claude Code, con el total por origen
  const sesiones = { lista: () => [{ modelo: 'ollama/gemma', actualizada: Date.now(), uso: { entrada: 1000, salida: 10 } }] };
  const total = admin.uso(sesiones, 30, uc);
  assert.deepStrictEqual(Object.keys(total.porModelo).sort(), ['claude-code/claude-opus-5-5', 'claude-code/claude-sonnet-5', 'ollama/gemma']);
  assert.strictEqual(total.fuentes.apolo.entrada, 1000); assert.strictEqual(total.fuentes.claudeCode.entrada, 400);
  assert.strictEqual(total.fuentes.claudeCode.cacheLeida, 360);
  assert.strictEqual(total.sesiones, 3);
  assert.strictEqual(admin.uso(sesiones, 30).fuentes.claudeCode, undefined, 'sin lector, como antes');
});

test('herramientas por grupos: un saludo solo lleva el núcleo; el tema, lo usado y lo cargado añaden su grupo', async () => {
  const h = n => ({ nombre: n });
  const todas = ['shell', 'leer_archivo', 'recordar', 'delegar', 'cargar_herramientas', 'clic', 'ver_pantalla', 'navegador_abrir', 'navegador_leer', 'filmcraft', 'subtitular_video', 'hacer_miniatura',
    'correo_leer', 'github_repos', 'crear_dashboard', 'plugin_raro_nuevo'].map(h);
  const nombres = (s, t) => g.filtrar(todas, g.gruposActivos(s, t)).map(x => x.nombre);
  assert.deepStrictEqual(nombres({ mensajes: [] }, 'jhola, cómo estás'), ['shell', 'leer_archivo', 'recordar', 'delegar', 'cargar_herramientas', 'plugin_raro_nuevo'], 'núcleo + lo que no está en ningún grupo');
  assert.ok(nombres({ mensajes: [] }, 'edita este clip para TikTok con subtítulos').includes('subtitular_video'));
  assert.ok(nombres({ mensajes: [] }, 'abre youtube en el navegador').includes('navegador_abrir'));
  assert.ok(nombres({ mensajes: [] }, 'revisa mi correo de gmail').includes('correo_leer'));
  // el tema de los mensajes anteriores sigue valiendo ("¿y el otro?")
  assert.ok(nombres({ mensajes: [{ role: 'user', content: 'mira la página de suno' }] }, 'y dale al botón').includes('navegador_leer'));
  // lo ya usado en la conversación se queda
  assert.ok(nombres({ mensajes: [{ role: 'assistant', toolCalls: [{ name: 'clic' }] }] }, 'sigue').includes('ver_pantalla'));
  // cargar_herramientas
  const s = { mensajes: [] };
  const r = await g.crearCargar().ejecutar({ grupos: ['dashboards', 'nada'] }, { sesion: s });
  assert.match(r, /Cargado: dashboards/); assert.deepStrictEqual(s.gruposCargados, ['dashboards']);
  assert.ok(nombres(s, 'hola').includes('crear_dashboard'));
  assert.match(await g.crearCargar().ejecutar({ grupos: ['nada'] }, { sesion: s }), /No conozco/);
  // todas las herramientas conocidas de APOLO tienen grupo (si no, irían siempre y no se ahorraría)
  for (const n of ['ver_pantalla', 'navegador_captura', 'filmcraft', 'kit_marca', 'mobbin_search_flows', 'gamer_medir', 'modo_gamer', 'turno_ver', 'archive_buscar', 'mis_metas', 'consultar_consejo', 'explorar_grafo', 'crear_skill', 'hf_buscar', 'elevenlabs_hablar', 'nexo_ver'])
    assert.ok(g.grupoDe(n) && g.grupoDe(n) !== 'nucleo', n);
  assert.strictEqual(g.grupoDe('plugin_raro_nuevo'), null);
  assert.match(g.crearCargar().descripcion, /creativo \(suite ArtCraft/);
});
