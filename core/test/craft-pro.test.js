// Suite de edición profesional (core/craft): kit de marca, control de calidad, portadas (PhotoCraft), audio de estudio
// (SoundCraft), rótulos/título con los colores del kit (EffectCraft) y correcciones del texto. Las apps van falsas: aquí se
// prueba la receta (qué comandos, en qué orden, con qué valores); las recetas se probaron en vivo con las apps reales.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const kit = require('../craft/kit');
const calidad = require('../craft/calidad');
const { crearMiniaturas, elegirMomentos, lineas } = require('../craft/miniatura');
const { crearAudio, tramosVoz, puntosDucking } = require('../craft/audio');
const { corregirPalabras, cajaTexto } = require('../craft/subtitular');
const marca = require('../craft/marca');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'craftpro-'));

// ── kit de marca ──
test('kit: el de serie + los cambios del usuario encima (campo a campo); valida colores y zonas; herramienta kit_marca', async () => {
  const dir = tmp();
  const k = kit.crearKits({ cfg: { dir } });
  assert.ok(k.ids().includes('lagctrucks'));
  const l = k.obtener('lagctrucks');
  assert.strictEqual(l.colores.acento, '#00d9ff'); assert.deepStrictEqual(l.letrero, { nombre1: 'LAGC', nombre2: 'TRUCKS' });
  assert.strictEqual(l.audio.lufs, -14); assert.strictEqual(l.fuente.familia, 'Trueno');
  assert.strictEqual(k.obtener('../etc'), null); assert.strictEqual(k.obtener('nada'), null);
  const g = k.guardar('lagctrucks', { colores: { acento: '#ff3355' }, cta: 'Únete al convoy' });
  assert.strictEqual(g.colores.acento, '#ff3355'); assert.strictEqual(g.colores.resaltado, '#ffd400', 'lo demás sigue');
  assert.strictEqual(k.obtener('lagctrucks').cta, 'Únete al convoy');
  assert.ok(fs.existsSync(path.join(dir, 'craft', 'kits', 'lagctrucks.json')), 'en los datos del usuario, no en el de serie');
  assert.throws(() => k.guardar('lagctrucks', { colores: { acento: 'rojo' } }), /acento no es #rrggbb/);
  assert.throws(() => k.guardar('lagctrucks', { video: { zonas: { cara: [0, 0, 10] } } }), /zona cara/);
  const nuevo = k.guardar('mi-canal', { nombre: 'Mi canal', colores: { acento: '#123456' } });
  assert.strictEqual(nuevo.colores.primario, '#ffffff', 'lo que no dice sale de la base');
  assert.ok(k.ids().includes('mi-canal'));
  const h = k.HERRAMIENTA;
  assert.strictEqual(h.riesgo({ accion: 'ver' }), 'lectura'); assert.strictEqual(h.riesgo({ accion: 'guardar' }), 'escritura');
  assert.match(await h.ejecutar({ accion: 'lista' }), /lagctrucks/);
  assert.match(await h.ejecutar({ accion: 'ver', id: 'lagctrucks' }), /Únete al convoy/);
  // perfil → opciones de subtitular_video
  const p = kit.perfil(k.obtener('lagctrucks'));
  assert.strictEqual(p.y, 0.78); assert.strictEqual(p.audioPro, true); assert.strictEqual(p.marca, 'LAGCTRUCKS'); assert.ok(p.zonas.cara);
});

test('kit: zona segura — ancho centrado y límite derecho fuera de la columna de botones', () => {
  const k = kit.crearKits({ cfg: { dir: tmp() } }).obtener('lagctrucks');
  assert.strictEqual(Math.round(kit.anchoSeguro(k, 0.78, 1080)), Math.round(2 * (0.88 * 1080 - 540)), 'a la altura de los botones');
  assert.strictEqual(Math.round(kit.anchoSeguro(k, 0.2, 1080)), Math.round(1080 - 2 * 0.04 * 1080), 'arriba solo cuentan los lados');
  assert.strictEqual(Math.round(kit.limiteDerecho(k, 0.6, 1080)), Math.round(0.88 * 1080));
  assert.strictEqual(Math.round(kit.limiteDerecho(k, 0.2, 1080)), Math.round(0.96 * 1080));
  assert.deepStrictEqual(kit.rectSeguro(k, 1080, 1920).map(Math.round), [43, 115, 1037, 1690]);
});

// ── control de calidad ──
const SALIDA_FFMPEG = `[Parsed_blackdetect_0 @ 0000020395f6c000] black_start:0 black_end:1 black_duration:1
[Parsed_silencedetect_1 @ 0000020395f6c900] silence_start: 1.021678
[Parsed_silencedetect_1 @ 0000020395f6c900] silence_end: 6.020113 | silence_duration: 4.998435
[Parsed_freezedetect_1 @ 00000222c6487680] lavfi.freezedetect.freeze_start: 10
[Parsed_freezedetect_1 @ 00000222c6487680] lavfi.freezedetect.freeze_duration: 4
[Parsed_freezedetect_1 @ 00000222c6487680] lavfi.freezedetect.freeze_end: 14
[Parsed_ebur128_0 @ 0000020395f6c800] t: 3.9 M: -20 S: -21 I: -21.0 LUFS
[Parsed_ebur128_0 @ 0000020395f6c800] Summary:

  Integrated loudness:
    I:         -16.2 LUFS
    Threshold: -32.2 LUFS

  True peak:
    Peak:       -0.4 dBFS
`;
test('calidad: lee la salida real de ffmpeg (ebur128 resumen, negro, silencio, congelado) y ffprobe', () => {
  const m = calidad.leerInforme(SALIDA_FFMPEG);
  assert.strictEqual(m.lufs, -16.2, 'el del resumen, no el de una línea de progreso');
  assert.strictEqual(m.picoReal, -0.4);
  assert.deepStrictEqual(m.negros, [[0, 1]]);
  assert.deepStrictEqual(m.silencios, [[1.021678, 6.020113]]);
  assert.deepStrictEqual(m.congelados, [[10, 14]]);
  assert.deepStrictEqual(calidad.leerInforme('[x] lavfi.freezedetect.freeze_start: 3').congelados, [[3, null]], 'congelado hasta el final');
  const s = calidad.leerSondeo({ streams: [{ codec_type: 'video', width: 1080, height: 1920, avg_frame_rate: '60/1', codec_name: 'h264' }, { codec_type: 'audio' }], format: { duration: '97.012', size: '263714980' } });
  assert.deepStrictEqual(s, { ancho: 1080, alto: 1920, fps: 60, duracion: 97.012, audio: true, video: true, codec: 'h264', bytes: 263714980 });
});

test('calidad: errores y avisos; la sonoridad y el pico traen el objetivo corregido para reexportar', () => {
  const m = { video: true, audio: true, ancho: 1080, alto: 1920, duracion: 30, ...calidad.leerInforme(SALIDA_FFMPEG) };
  const q = calidad.evaluar(m, { lufs: -14, picoMax: -1, esperado: { ancho: 1080, alto: 1920, duracion: 30 } });
  assert.strictEqual(q.ok, false);
  assert.deepStrictEqual(q.errores.map(e => e.tipo).sort(), ['negro', 'pico', 'sonoridad']);
  assert.match(q.errores.find(e => e.tipo === 'negro').texto, /empieza con 1\.0 s en negro/);
  // −16,2 → hay que pedir 2,2 más; el pico (−0,4 > −1) obliga a bajar: gana el más prudente
  assert.strictEqual(q.arreglos.lufs, Math.min(+(-14 + 2.2).toFixed(1), +(-14 - Math.min(1.5, -0.4 + 1 + 0.3)).toFixed(1)));
  assert.deepStrictEqual(q.avisos.map(a => a.tipo).sort(), ['congelado', 'silencio']);
  const bien = calidad.evaluar({ video: true, audio: true, ancho: 1080, alto: 1920, duracion: 30, lufs: -14.2, picoReal: -1.8, negros: [], silencios: [], congelados: [] }, { esperado: { duracion: 30 } });
  assert.deepStrictEqual([bien.ok, bien.errores, bien.avisos], [true, [], []]);
  const cortado = calidad.evaluar({ video: true, audio: false, ancho: 1080, alto: 1920, duracion: 20 }, { esperado: { ancho: 2160, alto: 3840, duracion: 30 } });
  assert.deepStrictEqual(cortado.errores.map(e => e.tipo), ['audio', 'resolucion', 'duracion']);
  assert.match(calidad.resumen({ ...bien, medidas: { lufs: -14.2, picoReal: -1.8 } }), /todo bien \(-14\.2 LUFS, pico -1\.8 dBTP\)/);
});

test('calidad: diseño — zona segura, columna de botones, solapes en el tiempo, lectura', () => {
  const k = kit.crearKits({ cfg: { dir: tmp() } }).obtener('lagctrucks');
  const r = calidad.revisarDiseno([
    { tipo: 'subtitulo', texto: 'HOLA COMPA', s: 0, e: 1, caja: [300, 1400, 780, 1500] },
    { tipo: 'gancho', texto: 'CAOS TOTAL', s: 0, e: 3.5, caja: [100, 1000, 1000, 1150] },              // se mete en los botones (x > 950)
    { tipo: 'cta', texto: 'SÍGUEME', s: 25, e: 30, caja: [200, 1750, 880, 1820] },                    // abajo, bajo la interfaz
    { tipo: 'emoji', s: 2, e: 3, caja: [445, 1050, 635, 1240] },                                       // pisa el gancho a la vez
    { tipo: 'emoji', s: 10, e: 11, caja: [445, 1050, 635, 1240] },                                     // misma caja pero el gancho ya no está
    { tipo: 'marca', s: 0, e: 30, caja: [0, 0, 1080, 150] },                                           // el letrero arriba no cuenta
  ], { W: 1080, H: 1920, kit: k });
  assert.deepStrictEqual(r.errores.map(e => e.tipo).sort(), ['botones', 'solape', 'zona']);
  assert.match(r.errores.find(e => e.tipo === 'zona').texto, /cta fuera de la zona segura \(abajo\)/);
  assert.match(r.errores.find(e => e.tipo === 'solape').texto, /gancho y emoji se pisan en 0:02/);
  const rapido = calidad.revisarDiseno(Array.from({ length: 8 }, (_, i) => ({ tipo: 'subtitulo', texto: 'PALABRAS MUY LARGAS AQUÍ', s: i, e: i + 0.3, caja: [300, 1400, 780, 1500] })), { kit: k });
  assert.match(rapido.avisos[0].texto, /8 de 8 subtítulos van demasiado rápido/);
  assert.ok(calidad.ratio(calidad.lumHex('#ffffff'), calidad.lumHex('#000000')) > 20);
  assert.ok(calidad.ratio(calidad.lumHex('#ffffff'), calidad.lumHex('#00d9ff')) < 2, 'blanco sobre cian no se lee');
});

// ── portadas ──
const ANALISIS = {
  ancho: 1080, alto: 1920, duracion: 60, pasoAudio: 0.2, zonas: { cara: [0, 97, 1080, 705] },
  audio: Array.from({ length: 300 }, (_, i) => (i >= 100 && i <= 104 ? -6 : -30)),                     // grito en 20–21 s
  caras: { cara: [[5, [[500, 400, 180, 0.9]]], [20.4, [[520, 410, 200, 0.95]]], [21, [[520, 410, 210, 0.9]]], [40, [[500, 400, 260, 0.9]]], [58.5, [[500, 400, 300, 0.99]]]] },
};
test('portadas: momentos = cara grande + volumen alto, separados, lejos de los bordes; sin caras, repartidos', () => {
  assert.deepStrictEqual(elegirMomentos(ANALISIS, { n: 3 }), [21, 40, 5], 'el grito con la cara más grande gana; 20,4 está a menos de 4 s; 58,5 está en los 2 s del final');
  assert.deepStrictEqual(elegirMomentos({ duracion: 40 }, { n: 3 }), [10, 20, 30]);
  assert.deepStrictEqual(elegirMomentos(ANALISIS, { n: 2, evitar: [[19, 22]] }), [40, 5]);
  assert.deepStrictEqual(lineas('le salvamos la vida al compa'), ['LE SALVAMOS LA', 'VIDA AL COMPA']);
  assert.deepStrictEqual(lineas('récord'), ['RÉCORD']);
  assert.strictEqual(lineas('uno dos tres cuatro cinco seis siete ocho').join(' ').split(' ').length, 6, 'máx. 6 palabras');
});

function photocraftFalso() {
  const llamadas = []; let capa = 5;
  return { llamadas, obtener: () => ({ activo: true }), async llamar(app, nombre, args) {
    llamadas.push([nombre, args?.id || '', args]);
    let r = {};
    if (nombre === 'command_run' && args.id === 'type.create') r = { layer: ++capa, bounds: args.params.text.length > 13 ? [0, 0, 1200, 108] : [300, 0, 780, 108] };
    else if (nombre === 'command_run' && args.id === 'layer.newFillLayer.solidColor') r = { layer: ++capa };
    else if (nombre === 'doc_save') fs.writeFileSync(args.path, 'x');
    return { content: [{ type: 'text', text: JSON.stringify(r) }] };
  } };
}
test('portadas: receta de PhotoCraft — fondo, franja difuminada, título del kit ajustado al ancho, contorno + sombra, letrero, JPG + .pcraft', async () => {
  const pc = photocraftFalso(), dir = tmp();
  const k = kit.crearKits({ cfg: { dir } }).obtener('lagctrucks');
  const fondo = path.join(dir, 'f.png'); fs.writeFileSync(fondo, 'png');
  const letrero = path.join(dir, 'l.png'); fs.writeFileSync(letrero, 'png');
  const m = crearMiniaturas({ mcpLocales: pc, cfg: {} });
  const r = await m.componer({ fondo, texto: 'le salvamos la vida al compa', kit: k, variante: 1, letrero, salida: path.join(dir, 'out', 'p.jpg') });
  assert.ok(fs.existsSync(r.jpg) && fs.existsSync(r.pcraft));
  const ids = pc.llamadas.map(([n, id]) => id || n);
  assert.deepStrictEqual(ids.slice(0, 6), ['doc_new', 'doc_place', 'select.rect', 'select.modify.feather', 'layer.newFillLayer.solidColor', 'layer.setProps']);
  assert.strictEqual(pc.llamadas.find(x => x[1] === 'layer.setProps')[2].params.opacity, 0.6);
  const textos = pc.llamadas.filter(x => x[1] === 'type.create').map(x => x[2].params);
  assert.deepStrictEqual(textos.map(t => [t.text, t.color, t.font]), [['LE SALVAMOS LA', '#00d9ff', 'Trueno'], ['VIDA AL COMPA', '#ffffff', 'Trueno']], 'variante 1: acento + primario');
  const escala = pc.llamadas.filter(x => x[1] === 'edit.transform');
  assert.strictEqual(escala.length, 2, 'la más ancha (1200 px) no cabe en 929: las dos a la misma escala (también la que sí cabía)');
  assert.strictEqual(escala[0][2].params.scaleX, +(100 * 1080 * 0.86 / 1200).toFixed(1));
  assert.strictEqual(pc.llamadas.filter(x => x[1] === 'layer.layerStyle.replace').length, 2);
  assert.deepStrictEqual(pc.llamadas.filter(x => x[0] === 'doc_place').map(x => x[2].path), [fondo, letrero]);
  assert.deepStrictEqual(ids.slice(-3), ['doc_save', 'doc_save', 'doc_close'], '.pcraft (capas) + .jpg, y cierra el documento');
});

// ── audio de estudio ──
test('audio: tramos con voz y puntos del ducking (la música baja mientras se habla, con rampas)', () => {
  assert.deepStrictEqual(tramosVoz([{ s: 0.5, e: 1 }, { s: 1.5, e: 2 }, { s: 5, e: 6 }]), [[0.5, 2], [5, 6]]);
  assert.deepStrictEqual(puntosDucking([[2, 4], [8, 9]], { base: -20, bajo: -32, rampa: 0.25 }),
    [[0, -20], [1.75, -20], [2, -32], [4, -32], [4.25, -20], [7.75, -20], [8, -32], [9, -32], [9.25, -20]]);
});

function soundcraftFalso(lufsPorVuelta) {
  const llamadas = []; let vuelta = 0;
  return { llamadas, obtener: () => ({ activo: true }), async llamar(app, nombre, args) {
    llamadas.push([nombre, args?.command || '', args]);
    let r = {};
    if (nombre === 'execute' && args.command === 'track.new' && args.params.kind === 'master') r = { tracks: [9] };
    if (nombre === 'bounce_mix') { const [l, tp] = lufsPorVuelta[Math.min(vuelta++, lufsPorVuelta.length - 1)]; fs.writeFileSync(args.path, 'wav'); r = { lufs: l, true_peak_db: tp }; }
    return { content: [{ type: 'text', text: JSON.stringify(r) }] };
  } };
}
test('audio: cadena de voz + maximizer (techo −1,5) y vueltas de ajuste hasta −14 LUFS y pico ≤ −1', async () => {
  const dir = tmp(), ent = path.join(dir, 'v.mp4'); fs.writeFileSync(ent, 'v');
  const sc = soundcraftFalso([[-17, -3], [-14.1, -0.6], [-14.2, -1.3]]);
  const ff = [];
  // ffmpeg falso: crea el archivo de salida
  const a = crearAudio({ mcpLocales: sc, cfg: {}, ejecutar: (cmd, args, o, cb) => { ff.push(args); fs.writeFileSync(args.at(-1), 'x'); cb(null, '', ''); } });
  const r = await a.masterizar({ entrada: ent, salida: path.join(dir, 'm.wav') });
  assert.deepStrictEqual([r.lufs, r.picoReal, r.vueltas], [-14.2, -1.3, 3]);
  assert.ok(fs.existsSync(path.join(dir, 'm.wav')));
  assert.ok(ff[0].includes('-vn') && ff[0].includes('48000') && ff[0].includes('pcm_s24le'), 'audio a 48 kHz / 24 bits sin vídeo');
  const plugins = sc.llamadas.filter(x => x[1] === 'mix.insert').map(x => x[2].params.plugin);
  assert.deepStrictEqual(plugins, ['eq_7band', 'de_esser', 'compressor', 'maximizer']);
  assert.strictEqual(sc.llamadas.find(x => x[2]?.params?.plugin === 'maximizer')[2].params.params.ceiling, -1.5);
  assert.deepStrictEqual(sc.llamadas.filter(x => x[1] === 'mix.volume').map(x => x[2].params.delta_db), [3], 'vuelta 1: +3 dB');
  const techo = sc.llamadas.filter(x => x[1] === 'mix.insert_param');
  assert.strictEqual(techo.length, 1, 'vuelta 2: el pico real (−0,6) pasa de −1 → baja el techo');
  assert.strictEqual(techo[0][2].params.value, +(-1.5 - (-0.6 + 1 + 0.2)).toFixed(2));
  assert.ok(a.HERRAMIENTA.disponible());
});

// ── rótulos y título con los colores del kit ──
test('marca: colores del kit → variables de los .jsx (0..1)', () => {
  assert.deepStrictEqual(marca.rgb('#00d9ff'), [0, 0.851, 1]);
  assert.strictEqual(marca.rgb('cian'), null);
  assert.deepStrictEqual(marca.varsColor({ acento: '#ff0000', primario: '#ffffff', fondo: 'x' }), { COLOR_ACENTO: [1, 0, 0], COLOR_TEXTO: [1, 1, 1] });
  for (const f of ['titulo.jsx', 'rotulo.jsx']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'craft', 'marca', f), 'utf8');
    for (const v of ['COLOR_ACENTO', 'COLOR_TEXTO', 'COLOR_FONDO', 'ANCHO_MAX']) assert.match(s, new RegExp(`var ${v} = typeof ${v} !== 'undefined'`), `${f} lee ${v}`);
  }
});

// ── correcciones del texto y cajas ──
test('subtitular: correcciones pedidas en Revisión — busca las palabras cerca del momento y reparte su tiempo', () => {
  const ps = [{ w: 'Saludos', s: 0, e: 0.5 }, { w: 'al', s: 0.5, e: 0.6 }, { w: 'compa', s: 0.6, e: 1 }, { w: 'Juan,', s: 1, e: 1.4 },
    { w: 'y', s: 10, e: 10.2 }, { w: 'compa', s: 10.2, e: 10.6 }, { w: 'Juan', s: 10.6, e: 11 }];
  const r = corregirPalabras(ps, [{ t: 10, mal: 'compa juan', bien: 'compa Chuy' }, { t: 1, mal: 'Juan', bien: 'Don Chuy' }, { t: 30, mal: 'nada', bien: 'x' }]);
  assert.deepStrictEqual(r.palabras.map(p => p.w), ['Saludos', 'al', 'compa', 'Don', 'Chuy,', 'y', 'compa', 'Chuy'], 'la más cercana a t; conserva la coma');
  assert.deepStrictEqual(r.palabras.slice(3, 5).map(p => [p.s, p.e]), [[1, 1.2], [1.2, 1.4]]);
  assert.strictEqual(r.aplicadas.length, 2); assert.deepStrictEqual(r.sinAplicar.map(x => x.mal), ['nada']);
  assert.deepStrictEqual(cajaTexto(540, 1500, [-200, -80, 200, 10], 0.5), [440, 1460, 640, 1505]);
  assert.strictEqual(cajaTexto(540, 1500, null), null);
});

// ── publicar con la portada elegida y el kit ──
test('publicar: la portada elegida va al anuncio y a Drive (botón "Descargar portada"); hashtags y color del kit', async () => {
  const { crearPublicador } = require('../craft/publicar');
  const dir = tmp(), mp4 = path.join(dir, 'c 4K.mp4'), jpg = path.join(dir, 'c - portada.jpg'), tok = path.join(dir, 't');
  fs.writeFileSync(mp4, 'v'.repeat(100)); fs.writeFileSync(jpg, 'j'); fs.writeFileSync(tok, 'tk');
  const rc = [];
  const ejecutar = (cmd, args, o, cb) => {
    rc.push(args.join(' '));
    if (args[0] === 'link') return cb(null, args[1].includes('portada') ? 'https://drive.google.com/open?id=POR' : 'https://drive.google.com/open?id=VID', '');
    if (args[0] === 'lsjson') return cb(null, JSON.stringify([{ Size: 100 }]), '');
    cb(null, '', '');
  };
  let cuerpo = null, archivos = [];
  const pedir = async (u, o) => { cuerpo = JSON.parse(o.body.get('payload_json')); archivos = [...o.body.keys()]; return { ok: true, json: async () => ({ id: 'M1' }) }; };
  const k = kit.crearKits({ cfg: { dir } }).obtener('lagctrucks');
  const p = crearPublicador({ conf: () => ({ canal: 'C', token: tok, remoto: 'gdrive:X' }), ejecutar, pedir, kitDe: () => ({ ...k, colores: { ...k.colores, acento: '#ff3355' } }) });
  const r = await p.publicar({ id: 'a', fecha: '2026-10-15', rank: 6, inicio: 0, fin: 60, gancho: 'CAOS', stream: 'S', k4: { estado: 'listo', mp4 }, portadas: [{ jpg }], portada: 0 });
  assert.ok(rc.some(x => x.startsWith('copyto') && x.includes('c - portada.jpg') && x.endsWith('c 4K - portada.jpg')), 'la portada sube junto al vídeo');
  assert.strictEqual(r.portadaDrive.id, 'POR');
  assert.strictEqual(cuerpo.embeds[0].color, 0xff3355);
  assert.match(cuerpo.embeds[0].description, /#lagctrucks/);
  assert.deepStrictEqual(cuerpo.components[0].components.map(b => b.label), ['Descargar 4K', 'Ver en Drive', 'Descargar portada']);
  assert.ok(archivos.includes('files[0]'));
  assert.ok(fs.existsSync(jpg), 'la portada elegida no se borra al anunciar');
});
