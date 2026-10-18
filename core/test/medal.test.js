// Clips de Medal (core/craft/medal.js): formato binario de su metadata, filas → clips, búsqueda, carpeta de clips y traer.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearMedal, decodificar, normalizar, filtrar } = require('../craft/medal');

// codificador del mismo formato (byte tipo|largo; 0xC_/0xD_ = largo en 1/2 bytes)
function cab(t, n) { return n < 12 ? Buffer.from([(n << 4) | t]) : n < 256 ? Buffer.from([0xc0 | t, n]) : Buffer.from([0xd0 | t, n >> 8, n & 255]); }
function enc(v) {
  if (v === null || v === undefined) return Buffer.from([0]);
  if (v === true) return Buffer.from([1]);
  if (v === false) return Buffer.from([2]);
  if (typeof v === 'number') { const s = Buffer.from(String(v)); return Buffer.concat([cab(Number.isInteger(v) ? 3 : 5, s.length), s]); }
  if (typeof v === 'string') { const s = Buffer.from(v); return Buffer.concat([cab(7, s.length), s]); }
  if (Array.isArray(v)) { const c = Buffer.concat(v.map(enc)); return Buffer.concat([cab(11, c.length), c]); }
  const c = Buffer.concat(Object.entries(v).flatMap(([k, x]) => [enc(k), enc(x)]));
  return Buffer.concat([cab(12, c.length), c]);
}
const meta = o => enc(o).toString('base64');
const rc = (o = {}) => ({ contentId: 'C1', contentTitle: 'Untitled', contentType: 15, created: Date.UTC(2026, 6, 4, 18), category: { categoryName: 'Call of Duty: Black Ops 7' },
  contentShareUrl: 'https://medal.tv/clips/C1', contentUrl: 'https://cdn.medal.tv/c1.mp4', urlsExpireAt: Date.now() + 3600e3, videoLengthSeconds: 29.7, views: 3, ...o });

test('medal: decodifica su formato (objetos, listas, números, booleanos, nulos, textos largos, JSON y rutas escapadas)', () => {
  const o = { title: 'Archienemigo', clipDuration: 29.7667, tags: [], fav: false, ok: true, nada: null, largo: 'x'.repeat(300), anidado: { n: 1783188950980, l: ['a', 2] } };
  assert.deepStrictEqual(decodificar(enc(o))[0], o);
  const ruta = Buffer.concat([Buffer.from([0xc8, 21]), Buffer.from('C:\\\\Users\\\\yo\\\\Medal')]);
  assert.strictEqual(decodificar(ruta)[0], 'C:\\Users\\yo\\Medal');
  assert.strictEqual(decodificar(Buffer.from([0x08]))[0], null, 'JSON vacío = nada');
  assert.deepStrictEqual(decodificar(Buffer.concat([Buffer.from([0x29]), Buffer.from('xy'), enc('sigue')]), 0), [undefined, 3], 'un tipo desconocido se salta por su largo');
});

test('medal: filas → clips (título propio, juego, duración, captura, en el PC) y búsqueda por texto, juego, fechas, duración y orden', () => {
  const filas = [
    { remoto: 'C1', categoria: 'bo7', creado: 1783188950, meta: meta({ title: 'Archienemigo', clipDuration: 29.7667, userTags: ['sniper'], remoteContent: rc() }) },
    { remoto: 'C2', categoria: 'arc', meta: meta({ remoteContent: rc({ contentId: 'C2', contentTitle: 'Extracción épica', category: { categoryName: 'ARC Raiders' }, videoLengthSeconds: 120, created: Date.UTC(2026, 1, 26), views: 40 }) }) },
    { remoto: 'C3', meta: meta({ remoteContent: rc({ contentId: 'C3', contentType: 29, category: { categoryName: 'American Truck Simulator' }, contentUrl: 'https://cdn/s.jpg', created: Date.UTC(2026, 5, 26) }) }) },
    { remoto: 'P1', meta: meta({ remoteSyncedAt: 0, isPlaceholder: true }) },
  ];
  const cs = filas.map(normalizar).filter(Boolean);
  assert.strictEqual(cs.length, 3, 'los marcadores vacíos fuera');
  assert.deepStrictEqual([cs[0].titulo, cs[0].juego, cs[0].duracion, cs[0].etiquetas, cs[0].tipo], ['Archienemigo', 'Call of Duty: Black Ops 7', 29.7667, ['sniper'], 'clip']);
  assert.deepStrictEqual([cs[2].tipo, cs[2].foto], ['captura', 'https://cdn/s.jpg']);
  assert.deepStrictEqual(filtrar(cs, { texto: 'archienemigo' }).clips.map(c => c.id), ['C1']);
  assert.deepStrictEqual(filtrar(cs, { texto: 'extraccion epica' }).clips.map(c => c.id), ['C2'], 'sin tildes ni mayúsculas');
  assert.deepStrictEqual(filtrar(cs, { juego: 'arc' }).clips.map(c => c.id), ['C2']);
  assert.deepStrictEqual(filtrar(cs, { tipo: 'captura' }).clips.map(c => c.id), ['C3']);
  assert.deepStrictEqual(filtrar(cs, { desde: '2026-06-01' }).clips.map(c => c.id), ['C1', 'C3']);
  assert.deepStrictEqual(filtrar(cs, { hasta: '2026-02-26' }).clips.map(c => c.id), ['C2'], 'el día entero');
  assert.deepStrictEqual(filtrar(cs, { minSeg: 60, tipo: 'clip' }).clips.map(c => c.id), ['C2']);
  assert.deepStrictEqual(filtrar(cs, { orden: 'vistas' }).clips[0].id, 'C2');
  assert.strictEqual(filtrar(cs, { soloLocales: true }).total, 0);
});

test('medal: lee las bases con medal.py, añade lo que hay en la carpeta de clips y trae al PC lo que solo está en la nube', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medal-'));
  const appdata = path.join(dir, 'Roaming'), clips = path.join(dir, 'Clips');
  fs.mkdirSync(path.join(appdata, 'Medal'), { recursive: true });
  fs.writeFileSync(path.join(appdata, 'Medal', 'medal-1.db'), '');
  fs.mkdirSync(path.join(clips, 'Rust'), { recursive: true }); fs.mkdirSync(path.join(clips, 'Thumbnails'));
  fs.writeFileSync(path.join(clips, 'Rust', 'raid.mp4'), 'v'); fs.writeFileSync(path.join(clips, 'Thumbnails', 'x.jpg'), 'j');
  const carpetaEsc = clips.replace(/\\/g, '\\\\');
  const llamadas = [];
  const ejecutar = (cmd, args, o, cb) => {
    llamadas.push(args);
    cb(null, JSON.stringify({ filas: [{ remoto: 'C1', meta: meta({ title: 'Archienemigo', remoteContent: rc() }) }, { remoto: 'C9', local: 'L9', meta: meta({ remoteContent: rc({ contentId: 'C9' }) }) }],
      borrados: ['L9'], ajustes: { ClipFolder: Buffer.concat([cab(8, Buffer.byteLength(carpetaEsc)), Buffer.from(carpetaEsc)]).toString('base64') }, errores: [] }), '');
  };
  const bajadas = [];
  const pedir = async url => { bajadas.push(url); return { ok: true, arrayBuffer: async () => Buffer.from('MP4DATA') }; };
  const antes = process.env.APPDATA; process.env.APPDATA = appdata;
  try {
    const m = crearMedal({ cfg: { craft: { python: 'py' } }, ejecutar, pedir });
    const c = await m.cargar();
    assert.match(llamadas[0][0], /medal\.py$/); assert.ok(llamadas[0][1].endsWith('medal-1.db'));
    assert.strictEqual(c.carpeta, clips, 'la carpeta de clips sale de los ajustes de Medal');
    assert.deepStrictEqual(c.clips.map(x => x.id).sort(), ['C1', 'archivo:' + path.join('Rust', 'raid.mp4')], 'lo borrado en Medal y las miniaturas no cuentan');
    const raid = c.clips.find(x => x.local);
    assert.deepStrictEqual([raid.juego, raid.tipo, raid.titulo], ['Rust', 'clip', 'raid']);
    const r = await m.HERRAMIENTA.ejecutar({ accion: 'buscar', juego: 'black ops' });
    assert.match(r, /\[C1\] 🎬 Archienemigo · Call of Duty: Black Ops 7 .* solo en la nube/);
    assert.match(await m.HERRAMIENTA.ejecutar({ accion: 'juegos' }), /Rust: 1 clips, 0 capturas \(1 en el PC\)/);
    const ruta = await m.traer('C1');
    assert.deepStrictEqual(bajadas, ['https://cdn.medal.tv/c1.mp4']);
    assert.ok(ruta.startsWith(path.join(clips, 'APOLO', 'Call of Duty Black Ops 7')) && ruta.endsWith('Archienemigo.mp4'));
    assert.strictEqual(fs.readFileSync(ruta, 'utf8'), 'MP4DATA');
    assert.strictEqual(await m.traer('C1'), ruta); assert.strictEqual(bajadas.length, 1, 'ya bajado: no se repite');
    assert.strictEqual(m.HERRAMIENTA.riesgo({ accion: 'traer' }), 'escritura'); assert.strictEqual(m.HERRAMIENTA.riesgo({ accion: 'buscar' }), 'lectura');
  } finally { process.env.APPDATA = antes; }
});

test('medal: enlace caducado → pide abrir Medal; sin Medal lo dice claro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medal2-'));
  fs.mkdirSync(path.join(dir, 'Medal'));
  fs.writeFileSync(path.join(dir, 'Medal', 'medal-1.db'), '');
  const ejecutar = (c, a, o, cb) => cb(null, JSON.stringify({ filas: [{ remoto: 'V', meta: meta({ remoteContent: rc({ contentId: 'V', urlsExpireAt: Date.now() - 1000 }) }) }], borrados: [], ajustes: {}, errores: [] }), '');
  const antes = process.env.APPDATA; process.env.APPDATA = dir;
  try {
    await assert.rejects(crearMedal({ cfg: {}, ejecutar }).traer('V'), /abre Medal/);
    process.env.APPDATA = path.join(dir, 'nada');
    const vacio = crearMedal({ cfg: {}, ejecutar: () => { throw new Error('no debería llamar'); } });
    const r = await vacio.HERRAMIENTA.ejecutar({ accion: 'juegos' });
    assert.ok(/no está instalado|elementos/.test(r));
  } finally { process.env.APPDATA = antes; }
});
