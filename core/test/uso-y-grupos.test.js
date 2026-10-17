// Claude Code dentro de APOLO: espejo de sus sesiones (core/espejo-cc.js), Uso por origen, encargos (core/encargos-claude.js) y herramientas por grupos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearEspejoCC, idsDe } = require('../espejo-cc');
const { crearSesiones } = require('../sesiones');
const { crearEncargosClaude } = require('../encargos-claude');
const { EventEmitter } = require('events');
const g = require('../herramientas-grupos');
const admin = require('../admin');

const hoy = Date.now(), ts = s => new Date(hoy - 60_000 + s * 1000).toISOString();
const UID = '0b5f8d2e-1111-4222-8333-944455556666';
// líneas como las de un transcript real de Claude Code
const L = {
  titulo: t => ({ type: 'ai-title', aiTitle: t, sessionId: UID }),
  humano: (t, s) => ({ type: 'user', turnOrigin: 'human', origin: { kind: 'human' }, cwd: 'C:\\Users\\yo\\Projects\\linkcore', timestamp: ts(s), message: { role: 'user', content: t } }),
  aviso: s => ({ type: 'user', turnOrigin: 'task_notification', timestamp: ts(s), message: { role: 'user', content: '<task-notification>…</task-notification>' } }),
  meta: s => ({ type: 'user', isMeta: true, timestamp: ts(s), message: { role: 'user', content: 'Caveat: …' } }),
  asistente: (id, s, bloques, u) => ({ type: 'assistant', timestamp: ts(s), message: { id, model: 'claude-opus-5-5', role: 'assistant', content: bloques, usage: u } }),
  resultado: (toolId, s) => ({ type: 'user', timestamp: ts(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: 'salida enorme que no se guarda' }] } }),
};
const U = { input_tokens: 2, cache_creation_input_tokens: 8, cache_read_input_tokens: 90, output_tokens: 10 };

test('espejo: una sesión de Claude Code es una conversación de APOLO (título, modelo, carpeta, tokens, mensajes, herramientas) y se lee solo lo nuevo', async () => {
  assert.deepStrictEqual(idsDe(`C:/x/proj/${UID}.jsonl`), { id: `cc-${UID}` });
  assert.deepStrictEqual(idsDe(`C:/x/proj/${UID}/subagents/agent-a0ba5b37ce3018ade.jsonl`), { id: 'cc-a0ba5b37ce3018ade', padre: `cc-${UID}` });
  assert.strictEqual(idsDe('C:/x/proj/notas.jsonl'), null);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-')), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-d-'));
  fs.mkdirSync(path.join(raiz, 'proj', UID, 'subagents'), { recursive: true });
  const f = path.join(raiz, 'proj', `${UID}.jsonl`), fs1 = path.join(raiz, 'proj', UID, 'subagents', 'agent-a0ba5b37ce3018ade.jsonl');
  const escribir = (file, ls, parcial = '') => fs.writeFileSync(file, ls.map(x => JSON.stringify(x)).join('\n') + '\n' + parcial);
  const lineas = [L.humano('pon login con google en linkcore; mi token es sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef', 0), L.meta(1), L.aviso(2),
    L.asistente('m1', 3, [{ type: 'thinking', thinking: '' }], U), L.asistente('m1', 3, [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'a.js' } }], U),
    L.resultado('t1', 4), L.asistente('m2', 5, [{ type: 'text', text: 'Listo: login con Google añadido.' }], U), L.titulo('Login con Google en Linkcore')];
  escribir(f, lineas, JSON.stringify(L.humano('a medias', 9)).slice(0, 30));
  escribir(fs1, [L.asistente('s1', 4, [{ type: 'tool_use', id: 'x1', name: 'Grep', input: {} }], U), L.resultado('x1', 4)]);
  const sesiones = crearSesiones({ cfg: { dir } });
  const e = crearEspejoCC({ cfg: { dir }, sesiones, dirClaude: raiz });
  await e.actualizar({ forzar: true });
  const s = sesiones.obtener(`cc-${UID}`);
  assert.deepStrictEqual([s.titulo, s.modelo, s.canal, s.cwd], ['Login con Google en Linkcore', 'claudecode/claude-opus-5-5', 'claude-code', 'C:\\Users\\yo\\Projects\\linkcore']);
  assert.deepStrictEqual(s.uso, { entrada: 200, salida: 20, cacheLeida: 180 }, 'm1 en dos líneas = una respuesta');
  assert.deepStrictEqual(s.mensajes.map(m => [m.role, m.name || (m.toolCalls || []).map(c => c.name).join() || m.content.slice(0, 20)]),
    [['user', 'pon login con google'], ['assistant', 'Edit'], ['tool', 'Edit'], ['assistant', 'Listo: login con Goo']], 'sin avisos, meta ni pensamiento; la línea a medias espera');
  assert.ok(!s.mensajes[0].content.includes('sk-ant-api03'), 'las claves se tapan');
  assert.strictEqual(s.mensajes.find(m => m.role === 'tool').content, '', 'sin la salida de la herramienta');
  assert.strictEqual(s.creada, Date.parse(ts(0))); assert.strictEqual(s.actualizada, Date.parse(ts(5)));
  const sub = sesiones.obtener('cc-a0ba5b37ce3018ade');
  assert.strictEqual(sub.padre, `cc-${UID}`); assert.match(sub.titulo, /^⤷/);
  // en vivo: llega más y solo se lee lo nuevo (la línea que estaba a medias, completa)
  escribir(f, [...lineas, L.humano('a medias, ya completa', 9), L.asistente('m3', 10, [{ type: 'text', text: 'Hecho.' }], U)]);
  await e.actualizar({ forzar: true });
  const s2 = sesiones.obtener(`cc-${UID}`);
  assert.strictEqual(s2.mensajes.length, 6); assert.strictEqual(s2.uso.entrada, 300);
  await e.actualizar({ forzar: true });
  assert.strictEqual(sesiones.obtener(`cc-${UID}`).mensajes.length, 6, 'nada repetido');
  // otro proceso (APOLO reiniciado) sigue desde lo guardado
  const otro = crearEspejoCC({ cfg: { dir }, sesiones: crearSesiones({ cfg: { dir } }), dirClaude: raiz });
  assert.strictEqual(await otro.actualizar({ forzar: true }), 0);
  // Uso: por origen (las de APOLO y las de Claude Code), sin contar dos veces
  const ap = sesiones.crear({ modelo: 'ollama/gemma', canal: 'isla' }); ap.uso = { entrada: 1000, salida: 10 }; sesiones.guardarMeta(ap);
  const u = admin.uso(sesiones, 30);
  assert.deepStrictEqual(u.fuentes.claudeCode, { entrada: 400, salida: 40, cacheLeida: 360, sesiones: 1 }, 'el subagente suma tokens pero no es otra conversación');
  assert.strictEqual(u.fuentes.apolo.entrada, 1000);
  assert.strictEqual(u.porModelo['claudecode/claude-opus-5-5'].cacheLeida, 360);
});

test('encargos: APOLO le pasa un trabajo a Claude Code en segundo plano (stream-json), con hooks, y el resultado vuelve a su conversación', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enc-'));
  const sesiones = crearSesiones({ cfg: { dir } }), bus = new EventEmitter(), avisos = [];
  bus.on('aviso-externo', a => avisos.push(a));
  const lanzados = [];
  const lanzar = (cmd, args, o) => {
    const h = new EventEmitter(); h.stdout = new EventEmitter(); h.stderr = new EventEmitter();
    let entrada = ''; h.stdin = { on() { }, end: t => { entrada = t; } };
    lanzados.push({ cmd, args, o, h, entrada: () => entrada });
    h.terminar = (resultado, error = false) => {
      h.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }) + '\n' + JSON.stringify({ type: 'assistant' }) + '\n');
      h.stdout.emit('data', JSON.stringify({ type: 'result', subtype: error ? 'error' : 'success', is_error: error, result: resultado, session_id: 'ses-1', total_cost_usd: 0.12 }) + '\n');
      h.emit('close', 0);
    };
    return h;
  };
  const enc = crearEncargosClaude({ cfg: { dir, claudeCode: { max: 1 } }, sesiones, bus, lanzar });
  const s = sesiones.crear({ modelo: 'ollama/gemma', canal: 'panel' });
  const r = await enc.HERRAMIENTA.ejecutar({ tarea: 'añade login con google a linkcore' }, { sesion: s, cwd: os.homedir() });
  assert.match(r, /Encargado a Claude Code \(opus/);
  const l = lanzados[0];
  assert.strictEqual(l.cmd, 'claude');
  assert.deepStrictEqual(l.args.slice(0, 8), ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'opus', '--permission-mode', 'auto']);
  assert.strictEqual(l.entrada(), 'añade login con google a linkcore', 'el encargo por stdin');
  assert.strictEqual(l.o.env.ROBOT_INTERNAL, undefined, 'con hooks: la isla y el espejo lo ven');
  assert.throws(() => enc.encargar({ tarea: 'otro', sesionApolo: s }), /máximo 1/);
  l.h.terminar('Hecho: login con Google en src/auth.js. Falta poner la clave de Google.');
  const fin = sesiones.obtener(s.id).mensajes.at(-1);
  assert.match(fin.content, /✅ Claude Code terminó.*\n\nHecho: login con Google/s);
  assert.deepStrictEqual(sesiones.obtener(s.id).encargoClaude.sesionCC, 'ses-1');
  assert.strictEqual(avisos.length, 1); assert.match(avisos[0].texto, /✅ añade login.*Hecho: login/);
  // "y añade también…": sigue la misma sesión de Claude Code
  await enc.HERRAMIENTA.ejecutar({ tarea: 'y que también acepte GitHub', continuar: true }, { sesion: sesiones.obtener(s.id) });
  assert.deepStrictEqual(lanzados[1].args.slice(-2), ['--resume', 'ses-1']);
  lanzados[1].h.terminar('no pude: falta la clave', true);
  assert.match(sesiones.obtener(s.id).mensajes.at(-1).content, /❌ Claude Code no pudo terminar/);
  // alTerminar (p. ej. responder por Discord) en lugar del aviso general
  let respuesta = null;
  enc.encargar({ tarea: 'x', alTerminar: e => { respuesta = e; } });
  lanzados[2].h.terminar('ok');
  assert.strictEqual(respuesta.estado, 'listo'); assert.strictEqual(avisos.length, 2);
  assert.ok(g.NUCLEO.has('encargar_a_claude'), 'siempre a mano del modelo');
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
