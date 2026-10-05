// CLI estilo Claude Code (core/tui): texto/ancho, markdown, editor, SSE y la TUI con una TTY y un núcleo falsos.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { ancho, ajustar, cortar, quitarAnsi, c } = require('../tui/texto');
const { renderMarkdown } = require('../tui/markdown');
const { Editor } = require('../tui/editor');
const { leerSSE } = require('../tui/conexion');

test('texto: ancho con emojis/ANSI y ajuste sin pasarse', () => {
  assert.strictEqual(ancho(c.rojo('hola')), 4);
  assert.strictEqual(ancho('😀a'), 3);
  const ls = ajustar(c.negrita('una línea bastante larga con ') + c.verde('colores y emojis 😀😀 que hay que partir'), 16);
  assert.ok(ls.length > 2);
  for (const l of ls) assert.ok(ancho(l) <= 16, `«${quitarAnsi(l)}» se pasa`);
  assert.strictEqual(quitarAnsi(ls.join(' ')).replace(/\s+/g, ' '), 'una línea bastante larga con colores y emojis 😀😀 que hay que partir');
  assert.ok(ancho(cortar('abcdefghij', 5)) <= 5);
});

test('markdown: enlaces junto a negritas, código y tablas', () => {
  const [l] = renderMarkdown('Con **negrita** y `x` y [enlace](http://x.com).', 80);
  assert.strictEqual(quitarAnsi(l), 'Con negrita y x y enlace (http://x.com).');
  const t = renderMarkdown('| a | b |\n|---|---|\n| 1 | dos |', 40).map(quitarAnsi);
  assert.deepStrictEqual(t.map(x => x[0]), ['┌', '│', '├', '│', '└']);
  const cod = renderMarkdown('```js\nconst x = 1; // hola\n```', 40).map(quitarAnsi);
  assert.deepStrictEqual(cod, ['  js', '  const x = 1; // hola']);
});

test('editor: multilínea, palabras e historial', () => {
  const e = new Editor(['viejo']);
  e.insertar('uno dos'); e.borrarPalabra(); assert.strictEqual(e.texto, 'uno ');
  e.insertar('\ntres'); assert.deepStrictEqual(e.filaCol(), { fila: 1, col: 4 });
  e.arriba(); assert.deepStrictEqual(e.filaCol(), { fila: 0, col: 4 });
  e.arriba(); assert.strictEqual(e.texto, 'viejo');            // en la 1.ª línea: historial
  e.abajo(); assert.strictEqual(e.texto, 'uno \ntres');        // vuelve al borrador
  e.guardarEnHistorial('uno \ntres'); assert.strictEqual(e.historial.length, 2);
});

test('SSE: eventos partidos entre trozos', async () => {
  const enc = new TextEncoder();
  const trozos = ['data: {"tipo":"te', 'xto","texto":"hola"}\n\n: ping\n\ndata: {"tipo":"fin"}\n', '\n'];
  const cuerpo = new ReadableStream({ start(ctl) { for (const t of trozos) ctl.enqueue(enc.encode(t)); ctl.close(); } });
  const vistos = []; await leerSSE(cuerpo, e => vistos.push(e.tipo));
  assert.deepStrictEqual(vistos, ['texto', 'fin']);
});

test('TUI: envía, muestra herramientas y contesta permisos con el teclado', async t => {
  let crudo = '';
  const out = new Writable({ write(ch, _, cb) { crudo += ch; cb(); } }); Object.assign(out, { isTTY: true, columns: 90, rows: 30 });
  const inp = new PassThrough(); Object.assign(inp, { isTTY: true, setRawMode() { } });
  const so = Object.getOwnPropertyDescriptor(process, 'stdout'), si = Object.getOwnPropertyDescriptor(process, 'stdin');
  Object.defineProperty(process, 'stdout', { value: out, configurable: true }); Object.defineProperty(process, 'stdin', { value: inp, configurable: true });
  const salir = process.exit; process.exit = () => { };
  t.after(() => { Object.defineProperty(process, 'stdout', so); Object.defineProperty(process, 'stdin', si); process.exit = salir; inp.destroy(); });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-'));
  const bus = new EventEmitter(); const resueltos = []; const enviados = [];
  const ses = { id: 's1', modelo: 'falso/m', cwd: dir, titulo: 'x', uso: { entrada: 0, salida: 0 } };
  const con = {
    modo: 'daemon', base: 'http://falso', dir, bus, nombre: 'APOLO', estado: {},
    config: async () => ({ alias: {}, permisos: { modo: 'preguntar' } }), crearSesion: async () => ses, sesiones: async () => [], pendientes: async () => [],
    resolver: async (id, d) => { resueltos.push([id, d]); bus.emit('evento', { tipo: 'permiso-resuelto', id, decision: d, quien: 'cli' }); },
    async enviar(id, texto, ev) {
      enviados.push(texto);
      ev({ tipo: 'herramienta', id: 'h1', nombre: 'shell', resumen: 'ls -la', sesion: id });
      bus.emit('evento', { tipo: 'permiso', id: 'p1', sesion: id, herramienta: 'shell', resumen: 'ls -la' });
      await new Promise(ok => { const f = e => { if (e.tipo === 'permiso-resuelto') { bus.off('evento', f); ok(); } }; bus.on('evento', f); });
      ev({ tipo: 'resultado', id: 'h1', resultado: 'a.txt\nb.txt', sesion: id });
      ev({ tipo: 'texto', texto: 'Hay **2** archivos.', sesion: id });
      ev({ tipo: 'fin', texto: 'Hay 2 archivos.', uso: { entrada: 10, salida: 5 }, sesion: id });
    },
    cancelar: async () => ({}), cerrar() { },
  };
  const { iniciarTUI } = require('../tui/app');
  await iniciarTUI(con, { cwd: dir });
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  for (const ch of 'hola') inp.write(ch);
  await espera(30); inp.write('\r');
  await espera(150);
  assert.match(quitarAnsi(crudo), /¿Permitir Shell\?/);
  inp.write('1'); await espera(150);
  assert.deepStrictEqual(resueltos, [['p1', 'allow']]);
  assert.deepStrictEqual(enviados, ['hola']);
  const visto = quitarAnsi(crudo);
  assert.match(visto, /● Shell\(ls -la\)/);
  assert.match(visto, /⎿  a\.txt/);
  assert.match(visto, /● Hay 2 archivos\./);
  assert.ok(fs.existsSync(path.join(dir, 'cli', 'historial.json')));
});
