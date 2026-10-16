// MCP locales por stdio (core/mcp-local.js) + receta de subtítulos (core/craft/subtitular.js): servidor MCP falso en un proceso node.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { crearMcpLocales, detectarCraft } = require('../mcp-local');
const { montarPalabras, trocear, resaltables, rangosResaltados, tituloDeArchivo, dosLineas, srtCaso } = require('../craft/subtitular');

const SERVIDOR = `
const rl = require('readline').createInterface({ input: process.stdin });
const tools = [
  { name: 'command_list', description: 'List every command', inputSchema: { type: 'object' } },
  { name: 'command_run', description: 'Run a command by id', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
  { name: 'render_frame', description: 'Render a frame as PNG', inputSchema: { type: 'object' } },
];
const out = m => process.stdout.write(JSON.stringify(m) + '\\n');
rl.on('line', l => {
  const m = JSON.parse(l);
  if (m.method === 'initialize') return out({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, instructions: 'Time is in ticks.' } });
  if (m.method === 'tools/list') return out({ jsonrpc: '2.0', id: m.id, result: { tools } });
  if (m.method === 'tools/call') {
    const { name, arguments: a } = m.params;
    if (name === 'render_frame') return out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' }] } });
    if (name === 'command_run' && a.id === 'boom') return out({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: 'falló' }] } });
    return out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ hecho: name, args: a, pid: process.pid }) }] } });
  }
});`;

function montar(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-local-'));
  const srv = path.join(dir, 'srv.js'); fs.writeFileSync(srv, SERVIDOR);
  const reg = new Map();
  const bus = new EventEmitter();
  const m = crearMcpLocales({ cfg: { dir, mcpLocales: extra.conf }, bus, registrar: hs => hs.forEach(h => reg.set(h.nombre, h)), quitar: ns => ns.forEach(n => reg.delete(n)),
    detectar: () => [{ id: 'filmcraft', nombre: 'FilmCraft', comando: process.execPath, args: [srv], descripcion: 'vídeo', origen: 'craft' }] });
  return { dir, m, reg, bus };
}

test('mcp-local: detecta, registra una herramienta por app, lista, llama y convierte imágenes', async () => {
  const { dir, m, reg } = montar();
  const h = reg.get('filmcraft');
  assert.ok(h, 'la app detectada queda registrada y activa');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'mcp-locales.json'), 'utf8')).map(s => s.id), ['filmcraft']);
  const lista = await h.ejecutar({});
  assert.match(lista, /3 herramientas/); assert.match(lista, /Time is in ticks/); assert.match(lista, /command_run/);
  assert.match(await h.ejecutar({ buscar: 'render' }), /1 de 3/);
  assert.match(await h.ejecutar({ esquema: 'command_run' }), /"id"/);
  const r = JSON.parse(await h.ejecutar({ herramienta: 'command_run', args: { id: 'file.save', params: {} } }));
  assert.strictEqual(r.hecho, 'command_run'); assert.strictEqual(r.args.id, 'file.save');
  const r2 = JSON.parse(await h.ejecutar({ herramienta: 'command_run', args: { id: 'x' } }));
  assert.strictEqual(r2.pid, r.pid, 'reutiliza el mismo proceso');
  const img = await h.ejecutar({ herramienta: 'render_frame', args: {} });
  assert.strictEqual(img.imagenes.length, 1); assert.ok(fs.existsSync(img.imagenes[0].ruta));
  assert.match(await h.ejecutar({ herramienta: 'command_run', args: { id: 'boom' } }), /^⚠ falló/);
  assert.match(await h.ejecutar({ herramienta: 'no_existe' }), /no existe la herramienta/);
  m.matarTodo();
});

test('mcp-local: riesgo por llamada y permiso "siempre" por app', () => {
  const { m, reg } = montar();
  const h = reg.get('filmcraft');
  assert.strictEqual(h.riesgo({}), 'lectura');
  assert.strictEqual(h.riesgo({ herramienta: 'render_frame' }), 'lectura');
  assert.strictEqual(h.riesgo({ herramienta: 'sequence_inspect' }), 'lectura');
  assert.strictEqual(h.riesgo({ herramienta: 'command_run', args: { id: 'graphics.list' } }), 'lectura');
  assert.strictEqual(h.riesgo({ herramienta: 'command_run', args: { id: 'file.exportMedia' } }), 'escritura');
  assert.strictEqual(h.riesgo({ herramienta: 'command_batch', args: {} }), 'escritura');
  assert.strictEqual(h.riesgo({ herramienta: 'media_import' }), 'escritura');
  assert.strictEqual(h.clavePermiso({ herramienta: 'x' }), 'filmcraft');
  m.matarTodo();
});

test('mcp-local: desactivar quita la herramienta, el pánico mata los procesos, API', async () => {
  const { m, reg, bus } = montar();
  await reg.get('filmcraft').ejecutar({});
  assert.strictEqual(m.estado()[0].vivo, true);
  bus.emit('panico', {});
  assert.strictEqual(m.estado()[0].vivo, false);
  assert.strictEqual((await m.http('PATCH', ['v1', 'mcp-locales', 'filmcraft'], { activo: false })).ok, true);
  assert.ok(!reg.has('filmcraft'));
  await m.http('PATCH', ['v1', 'mcp-locales', 'filmcraft'], { activo: true });
  assert.ok(reg.has('filmcraft'));
  const nuevo = await m.http('POST', ['v1', 'mcp-locales'], { id: 'otro', comando: process.execPath, args: ['-e', ''] });
  assert.strictEqual(nuevo.origen, 'manual'); assert.ok(reg.has('otro'));
  await assert.rejects(m.http('POST', ['v1', 'mcp-locales'], { id: 'Mal Id', comando: 'x' }), /id no válido/);
  assert.strictEqual((await m.http('DELETE', ['v1', 'mcp-locales', 'otro'])).ok, true);
  assert.deepStrictEqual((await m.http('GET', ['v1', 'mcp-locales'])).servidores.map(s => s.id), ['filmcraft']);
  m.matarTodo();
});

test('mcp-local: detectarCraft encuentra <carpeta>/<id>-cli(.exe) y los args sin ventana', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-'));
  const ext = process.platform === 'win32' ? '.exe' : '';
  for (const [c, id] of [['FilmCraft', 'filmcraft'], ['VectorCraft', 'vectorcraft']]) { fs.mkdirSync(path.join(raiz, c)); fs.writeFileSync(path.join(raiz, c, `${id}-cli${ext}`), ''); }
  const d = detectarCraft([raiz]);
  assert.deepStrictEqual(d.map(x => x.id).sort(), ['filmcraft', 'vectorcraft']);
  assert.deepStrictEqual(d.find(x => x.id === 'vectorcraft').args, ['mcp', '--headless']);
  assert.deepStrictEqual(d.find(x => x.id === 'filmcraft').args, ['mcp']);
});

test('fuentes propias: Trueno existe, todos los estilos la usan y se instala una sola vez', () => {
  const { asegurarFuentes } = require('../craft/fuentes/instalar');
  const { ESTILOS } = require('../craft/estilos');
  assert.ok(Object.values(ESTILOS).every(e => e.fuente === 'Trueno'), 'ningún estilo depende de fuentes de terceros');
  for (const f of ['Trueno-Black.ttf', 'Trueno-Regular.ttf']) assert.ok(fs.statSync(path.join(__dirname, '..', 'craft', 'fuentes', f)).size > 5000);
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'fuentes-'));
  const antes = process.env.LOCALAPPDATA; process.env.LOCALAPPDATA = casa;
  const llamadas = [];
  try {
    const plat = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.strictEqual(asegurarFuentes({ ejecutar: (...a) => llamadas.push(a) }).length, 2);
      assert.strictEqual(asegurarFuentes({ ejecutar: (...a) => llamadas.push(a) }).length, 0, 'la segunda vez no copia nada');
    } finally { Object.defineProperty(process, 'platform', plat); }
  } finally { process.env.LOCALAPPDATA = antes; }
  assert.strictEqual(llamadas.length, 2);
  assert.ok(llamadas[0][1].includes('Trueno (TrueType)'));
  assert.ok(fs.existsSync(path.join(casa, 'Microsoft', 'Windows', 'Fonts', 'Trueno-Black.ttf')));
});

test('emojis propios: palabras → emoji, sin falsos positivos y sin saturar', () => {
  const em = require('../craft/emojis');
  assert.strictEqual(em.disponibles().length, Object.keys(em.PALABRAS).length, 'cada emoji tiene su PNG');
  assert.strictEqual(em.emojiDe('¡VUELA LA BANDITA!'), 'rayo');
  assert.strictEqual(em.emojiDe('LA LLORONA'), 'fantasma');
  assert.strictEqual(em.emojiDe('MANEJAR EN MÉXICO'), 'mexico');
  assert.strictEqual(em.emojiDe('ES PA GENTE PRO'), 'corona');
  assert.strictEqual(em.emojiDe('UN PROBLEMA'), null, '"pro" solo como palabra entera');
  assert.strictEqual(em.emojiDe('ESO ES CORRECTO'), null);
  const tr = [['GRACIAS', 1], ['GRACIAS', 2], ['¡VUELA!', 3], ['¡VUELA!', 20], ['GRACIAS', 30]].map(([texto, s]) => ({ texto, s, e: s + 0.5 }));
  assert.deepStrictEqual(em.elegir(tr).map(x => `${x.emoji}@${x.s}`), ['corazon@1', 'rayo@20', 'corazon@30'], 'hueco de 2,5 s y sin repetir en 12 s');
  const { ESTILOS, props } = require('../craft/estilos');
  assert.ok(Object.values(ESTILOS).filter(e => e.paquete === 'color').length >= 9);
  assert.strictEqual(props(ESTILOS.atardecer, 1).fill_kind, 1, 'degradado');
  assert.strictEqual(props(ESTILOS.retro, 1).shadow_blur, 0, 'sombra dura');
});

test('subtitular: trocear, resaltar, título y 2 líneas', () => {
  const w = (texto, s, e, p = 0.9) => ({ w: texto, s, e, p });
  const palabras = [w('Hola,', 13.9, 14.3), w('bro,', 14.3, 14.4), w('¿cómo', 14.5, 14.7), w('estás?', 14.7, 14.9),
    w('Como', 38.2, 39.6), w('120', 40.0, 40.6), w('toneladas,', 40.6, 41.0), w('dímelo,', 82.2, 82.6), w('David.', 82.7, 82.9)];
  const t = trocear(palabras);
  assert.deepStrictEqual(t.map(x => x.texto), ['HOLA, BRO', '¿CÓMO ESTÁS?', 'COMO 120 TONELADAS', 'DÍMELO, DAVID']);
  assert.ok(t.every(x => x.e - x.s >= 0.199), 'duración mínima o hasta el siguiente');
  assert.ok(t.every((x, i) => !t[i + 1] || x.e <= t[i + 1].s), 'sin solapes');
  const claves = resaltables(palabras, ['toneladas']);
  assert.ok(claves.has('DAVID') && claves.has('120') && claves.has('TONELADAS') && !claves.has('HOLA'));
  assert.deepStrictEqual(rangosResaltados('DÍMELO, DAVID', claves), [[8, 13]]);
  assert.strictEqual(tituloDeArchivo('C:/x/08 - Saludos al chat y el puente gigante (2m05s).mp4'), 'SALUDOS AL CHAT Y EL PUENTE GIGANTE');
  assert.deepStrictEqual(dosLineas('SALUDOS AL CHAT Y EL PUENTE GIGANTE'), ['SALUDOS AL CHAT Y', 'EL PUENTE GIGANTE']);
  assert.strictEqual(srtCaso('GRACIAS, MI JESSY', new Map([['jessy', 'Jessy']])), 'Gracias, mi Jessy');
  // un trozo no acaba en "para"/"de": la palabra pasa al siguiente
  const t2 = trocear([w('Bendiciones', 70, 70.4), w('para', 70.4, 70.6), w('todos', 70.6, 70.9), w('los', 70.9, 71), w('del', 71, 71.1), w('chat', 71.1, 71.4)], { maxPalabras: 2 });
  assert.deepStrictEqual(t2.map(x => x.texto), ['BENDICIONES', 'PARA TODOS', 'LOS', 'DEL CHAT']);
  // karaoke: rango de cada palabra sin signos; la última pierde la coma/punto
  const m = montarPalabras([w('¿Gracias,', 0, 1), w('Miguel?', 1, 2), w('hermano.', 2, 3)]);
  assert.strictEqual(m.texto, '¿GRACIAS, MIGUEL? HERMANO');
  assert.deepStrictEqual(m.rangos.map(([a, b]) => m.texto.slice(a, b)), ['GRACIAS', 'MIGUEL', 'HERMANO']);
  assert.strictEqual(montarPalabras([w('Hola', 0, 1)], false).texto, 'Hola');
});
