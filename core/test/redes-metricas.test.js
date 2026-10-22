// Publicar y aprender: diccionario del canal (diccionario.js), textos/inglés/horas (redes.js), YouTube (youtube.js, Google
// falso), métricas y lo aprendido (metricas.js) y el flujo entero en lotes.js: aprobar → títulos es/en + .srt en inglés →
// 4K → Drive/Discord → YouTube programado → 4K local fuera; corregir un subtítulo → diccionario.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { aplicarDiccionario, crearDiccionario } = require('../craft/diccionario');
const redes = require('../craft/redes');
const { crearYouTube } = require('../craft/youtube');
const met = require('../craft/metricas');
const { crearLotes } = require('../craft/lotes');

const pal = txt => txt.split(' ').map((w, i) => ({ w, s: i, e: i + 0.9, p: 0.5 }));

test('diccionario: cambia todas las veces (varias palabras, sin tildes ni mayúsculas, con su puntuación) y aprende sin duplicar', () => {
  const r = aplicarDiccionario(pal('hola compa juan, ya llego el compa Juan.'), [{ mal: 'compa juan', bien: 'compa Chuy' }, { mal: 'llego', bien: 'llegó' }]);
  assert.strictEqual(r.palabras.map(p => p.w).join(' '), 'hola compa Chuy, ya llegó el compa Chuy.');
  assert.strictEqual(r.cambios, 3);
  assert.strictEqual(aplicarDiccionario(pal('qué caos'), [{ mal: 'que caos', bien: 'qué caos' }]).cambios, 0, 'lo que ya estaba bien no cuenta');
  assert.strictEqual(aplicarDiccionario(pal('que caos'), [{ mal: 'que caos', bien: 'qué caos' }]).palabras.map(p => p.w).join(' '), 'qué caos', 'una tilde también corrige');
  assert.deepStrictEqual([r.palabras[1].s, r.palabras[2].e], [1, 2.9], 'el tiempo se reparte entre las nuevas');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dic-'));
  const d = crearDiccionario({ cfg: { dir } });
  d.aprender('lagctrucks', [{ mal: 'compa Juan', bien: 'compa Chuy' }, { mal: 'de', bien: 'dé' }], 'c1');
  d.aprender('lagctrucks', [{ mal: 'Compa juan', bien: 'compa Chuy' }], 'c1');
  d.aprender('lagctrucks', [{ mal: 'compa juan', bien: 'Don Chuy' }], 'c2');
  const l = d.lista('lagctrucks');
  assert.strictEqual(l.length, 1, 'una por "mal"; las de 1–2 letras no se aprenden');
  assert.deepStrictEqual([l[0].bien, l[0].clips], ['Don Chuy', ['c1', 'c2']]);
  assert.strictEqual(d.pista('lagctrucks'), 'Don Chuy');
  assert.strictEqual(d.aplicar('lagctrucks', pal('el compa juan')).palabras.map(p => p.w).join(' '), 'el Don Chuy');
  d.anadir('lagctrucks', 'trueno', 'Trueno'); assert.strictEqual(d.lista('lagctrucks').length, 2);
  d.quitar('lagctrucks', 'compa juan'); assert.deepStrictEqual(d.lista('lagctrucks').map(x => x.bien), ['Trueno']);
  assert.throws(() => d.quitar('lagctrucks', 'nada'), /no está/);
});

test('redes: .srt ida y vuelta, traducción línea a línea (se reintenta si faltan líneas), títulos con hashtags y textos con el modelo', async () => {
  const srt = '1\n00:00:00,000 --> 00:00:01,500\nYA LLEGAMOS\n\n2\n00:00:01,500 --> 00:00:03,250\nCOMPA\n';
  const cues = redes.leerSrt(srt);
  assert.deepStrictEqual(cues, [{ s: 0, e: 1.5, texto: 'YA LLEGAMOS' }, { s: 1.5, e: 3.25, texto: 'COMPA' }]);
  assert.strictEqual(redes.escribirSrt(cues).trim(), srt.trim());
  let n = 0;
  const gj = async ({ prompt }) => (n++ === 0 ? { datos: { lineas: ['WE MADE IT'] } } : { datos: { lineas: ['1. WE MADE IT', 'BRO'] } });
  const en = await redes.traducirSrt(srt, { generarJSON: gj });
  assert.deepStrictEqual(redes.leerSrt(en).map(c => [c.s, c.texto]), [[0, 'WE MADE IT'], [1.5, 'BRO']]);
  await assert.rejects(redes.traducirSrt(srt, { generarJSON: async () => ({ datos: { lineas: [] } }) }), /completa/);
  assert.strictEqual(redes.tituloConHashtags('Caos total', '#a #b nada #c', 16), 'Caos total #a #b');
  const t = await redes.textosRedes({ gancho: 'CAOS TOTAL', stream: 'AAA', generarJSON: async () => ({ datos: { es: { titulo: '"Caos total" #ats', descripcion: 'Mira https://x.y esto' }, en: { titulo: 'Total chaos', descripcion: 'Watch' }, gancho_en: 'total chaos' } }) });
  assert.strictEqual(t.es.titulo, 'Caos total'); assert.match(t.es.descripcion, /^Mira esto\n\n.*watch\?v=AAA/);
  assert.strictEqual(t.ganchoEn, 'TOTAL CHAOS');
  const sin = await redes.textosRedes({ gancho: 'CAOS TOTAL', generarJSON: async () => { throw new Error('caído'); } });
  assert.deepStrictEqual([sin.es.titulo, sin.modelo], ['Caos total', false]);
});

test('redes: siguiente hueco a las horas del kit en su zona, sin pasar de N por día ni pegarse a otro', () => {
  const z = 'America/Mexico_City';                       // UTC−6 todo el año
  const ahora = Date.UTC(2026, 9, 18, 17, 0);            // 11:00 en CDMX
  const h = { horas: ['18:00', '12:00'], zona: z, ahora, maxPorDia: 2 };
  assert.strictEqual(redes.siguienteHueco(h), Date.UTC(2026, 9, 18, 18, 0), '12:00 CDMX = 18:00 UTC');
  const t1 = redes.siguienteHueco(h), t2 = redes.siguienteHueco({ ...h, ocupados: [t1] });
  assert.strictEqual(t2, Date.UTC(2026, 9, 19, 0, 0), '18:00 CDMX');
  assert.strictEqual(redes.siguienteHueco({ ...h, ocupados: [t1, t2] }), Date.UTC(2026, 9, 19, 18, 0), 'el día lleno: al siguiente');
  assert.strictEqual(redes.instanteEn('2026-07-01', '09:30', 'America/Los_Angeles'), Date.UTC(2026, 6, 1, 16, 30), 'con horario de verano');
  assert.strictEqual(redes.siguienteHueco({ horas: [] }), null);
});

// Google falso: token, canal, subida reanudable (308 → 200), portada, subtítulos y cuota
function google({ cuota = false } = {}) {
  const llamadas = [];
  const pedir = async (url, o = {}) => {
    llamadas.push({ url, o });
    const resp = (status, json, cab = {}) => ({ ok: status < 300, status, json: async () => json, headers: { get: k => cab[k.toLowerCase()] ?? null } });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return resp(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: 'youtube' });
    if (url.includes('/channels?')) return resp(200, { items: [{ id: 'UC1', snippet: { title: 'LAGCTRUCKS' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    if (url.includes('/upload/youtube/v3/videos?uploadType=resumable')) return cuota ? resp(403, { error: { message: 'cuota', errors: [{ reason: 'quotaExceeded' }] } }) : resp(200, {}, { location: 'https://subida/sesion' });
    if (url === 'https://subida/sesion') {
      const rango = o.headers['content-range'];
      return /^bytes 0-/.test(rango) ? resp(308, {}, { range: `bytes=0-${33554431}` }) : resp(200, { id: 'VID12345678' });
    }
    if (url.includes('/thumbnails/set') || url.includes('/captions?')) return resp(200, { id: 'ok' });
    return resp(404, { error: { message: 'no' } });
  };
  return { pedir, llamadas };
}

test('youtube: conectar con OAuth (vuelta al puerto local con el código), subir en trozos programado, portada, subtítulos y cuota', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-'));
  const g = google(); let abierta = null;
  const yt = crearYouTube({ dir, pedir: g.pedir, abrir: u => { abierta = u; } });
  await assert.rejects(yt.conectar(), /cliente OAuth/);
  assert.throws(() => yt.ponerCliente('{"x":1}'), /client_id/);
  yt.ponerCliente({ installed: { client_id: 'CID', client_secret: 'SEC' } });
  const { url } = await yt.conectar();
  assert.strictEqual(abierta, url);
  const q = new URL(url).searchParams;
  assert.match(q.get('scope'), /youtube\.force-ssl/); assert.strictEqual(q.get('code_challenge_method'), 'S256');
  const vuelta = await fetch(`${q.get('redirect_uri')}?code=COD&state=${q.get('state')}`);   // el navegador vuelve con el código
  assert.match(await vuelta.text(), /LAGCTRUCKS/);
  await yt.esperarConexion?.();
  assert.deepStrictEqual([yt.estado().conectado, yt.estado().canal.titulo], [true, 'LAGCTRUCKS']);
  const pedido = g.llamadas.find(l => l.url.startsWith('https://oauth2')).o.body;
  assert.match(pedido, /code_verifier=/); assert.match(pedido, /code=COD/);

  const mp4 = path.join(dir, 'v.mp4'); fs.writeFileSync(mp4, Buffer.alloc(33 * 1048576));
  const cuando = Date.UTC(2030, 0, 1, 18);
  const v = await yt.subir({ archivo: mp4, titulo: 'Caos total', descripcion: 'd', etiquetas: ['ats'], publicarEn: cuando, localizaciones: { en: { title: 'Total chaos', description: 'd' } } });
  assert.strictEqual(v.id, 'VID12345678');
  const ini = g.llamadas.find(l => l.url.includes('uploadType=resumable'));
  const meta = JSON.parse(ini.o.body);
  assert.deepStrictEqual([meta.status.privacyStatus, meta.status.publishAt], ['private', new Date(cuando).toISOString()], 'programado = privado + publishAt');
  assert.strictEqual(meta.localizations.en.title, 'Total chaos'); assert.match(ini.url, /part=snippet,status,localizations/);
  const trozos = g.llamadas.filter(l => l.url === 'https://subida/sesion').map(l => l.o.headers['content-range']);
  assert.deepStrictEqual(trozos, [`bytes 0-33554431/${33 * 1048576}`, `bytes 33554432-${33 * 1048576 - 1}/${33 * 1048576}`]);
  await yt.subtitulos('VID12345678', { idioma: 'en', nombre: 'English', srt: '1\n00:00:00,000 --> 00:00:01,000\nHI\n' });
  const cap = g.llamadas.find(l => l.url.includes('/captions?'));
  assert.match(cap.o.headers['content-type'], /^multipart\/related; boundary=/); assert.match(cap.o.body.toString(), /"language":"en"[\s\S]*HI/);

  const g2 = google({ cuota: true });
  const yt2 = crearYouTube({ dir, pedir: g2.pedir });
  const e = await yt2.subir({ archivo: mp4, titulo: 't' }).catch(x => x);
  assert.strictEqual(e.cuota, true);
  yt2.desconectar(); assert.strictEqual(yt2.estado().conectado, false);
});

test('métricas: empareja por id, por título + duración y no adivina con duraciones repetidas; lo aprendido y sus pistas', () => {
  const ap = Date.UTC(2026, 9, 16), h = 3600e3;
  const clips = [
    { id: 'a', decidido: ap, gancho: 'CAOS TOTAL ENTRE CAMIONEROS', estilo: 'pop', k4: { medidas: { duracion: 97.2 } }, youtube: { id: 'Y1' }, momento: { tipo: 'risa' }, disenos: [{ tipo: 'enfoque' }] },
    { id: 'b', decidido: ap, gancho: 'ME CHOCARON EL CAMION', estilo: 'terror', calidad: { medidas: { duracion: 60.4 } }, momento: { tipo: 'choque' } },
    { id: 'c', decidido: ap, gancho: 'OTRO', estilo: 'pop', inicio: 0, fin: 80 },
    { id: 'd', decidido: ap, gancho: 'OTRO MAS', estilo: 'pop', inicio: 0, fin: 80 },
  ];
  const videos = [
    { plataforma: 'youtube', id: 'Y1', titulo: 'TOTAL CHAOS', duracion: 97, fecha: ap + h, vistas: 4000 },
    { plataforma: 'tiktok', id: 'T1', titulo: 'Me chocaron el camión #ats', duracion: 60, fecha: ap + 2 * h, vistas: 13000 },
    { plataforma: 'tiktok', id: 'T2', titulo: 'algo', duracion: 80, fecha: ap + 3 * h, vistas: 100 },
    { plataforma: 'tiktok', id: 'T3', titulo: 'viejo', duracion: 97, fecha: ap - 5 * h, vistas: 9 },
  ];
  const { pares, libres } = met.emparejar(clips, videos);
  assert.deepStrictEqual([pares.a.youtube.como, pares.b.tiktok.como], ['id', 'titulo']);
  assert.ok(!pares.c && !pares.d, 'dos clips de 80 s: solo por duración no se decide');
  assert.deepStrictEqual(libres.map(v => v.id).sort(), ['T2', 'T3'], 'el de antes de aprobar no cuenta');
  // el streamer lo recortó a 97 s y le puso otro título en TikTok: la misma duración en la otra red, si es la única
  const largo = { ...clips[0], k4: { medidas: { duracion: 150 } } };
  const otro = met.emparejar([largo], [videos[0], { plataforma: 'tiktok', id: 'T9', titulo: 'Me chocaron', duracion: 97, fecha: ap + 30 * h, vistas: 13000 }]);
  assert.deepStrictEqual([otro.pares.a.tiktok?.id, otro.pares.a.tiktok?.como], ['T9', 'misma-duracion']);
  const dos = met.emparejar([largo], [videos[0], ...['T8', 'T9'].map(id => ({ plataforma: 'tiktok', id, titulo: 'x', duracion: 97, fecha: ap + 30 * h }))]);
  assert.ok(!dos.pares.a.tiktok, 'dos candidatos: no adivina');

  const canal = { youtube: [{ vistas: 2000 }, { vistas: 2000 }], tiktok: [{ vistas: 10000 }, { vistas: 10000 }] };
  const conM = [
    ...['pop', 'pop', 'pop'].map((e, i) => ({ id: 'p' + i, estilo: e, momento: { tipo: 'risa' }, metricas: { youtube: { vistas: 8000, fecha: ap + 18 * h } } })),
    ...['karaoke', 'karaoke'].map((e, i) => ({ id: 'k' + i, estilo: e, momento: { tipo: 'charla' }, metricas: { tiktok: { vistas: 2500, fecha: ap + 12 * h } } })),
  ];
  const a = met.aprender(conM, canal, { zona: 'UTC' });
  assert.strictEqual(a.muestras, 5);
  assert.ok(a.estilos.pop.factor > 2 && a.estilos.karaoke.factor < 0.6, JSON.stringify(a.estilos));
  assert.deepStrictEqual(Object.keys(a.estilos), ['pop', 'karaoke'], 'de mejor a peor');
  assert.strictEqual(a.horas['18:00'].n, 3);
  const p = met.pistas(a);
  assert.match(p.estilo, /pop ×\d/); assert.match(p.estilo, /Rinden menos: karaoke/); assert.match(p.estilo, /risa/);
  assert.deepStrictEqual(met.pistas({ ...a, muestras: 2 }), { estilo: '', titulo: '', director: '' }, 'con pocos clips, nada');
  assert.deepStrictEqual(met.mejoresHoras(a, ['21:00']), ['21:00'], 'con una sola hora buena se quedan las del kit');
});

// lotes de punta a punta con Google, Discord, rclone y el modelo falsos
function montar({ kit } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-lotes-'));
  const salida = path.join(dir, 'videos'), token = path.join(dir, 'token');
  fs.writeFileSync(token, 'T');
  const bus = new EventEmitter(), avisos = [];
  bus.on('aviso-externo', a => avisos.push(a));
  const manif = { '2026-10-14_AAA': { video: 'AAA', titulo: 'Camioneros (Portrait)', fecha: '2026-10-14', duracion: 14000,
    clips: [{ rank: 1, archivo: '01.mp4', inicio: 100, fin: 200, chat: ['jajaja'], tipo: 'risa', autores: 29, ingles: 9, puntaje: 9.6 }] } };
  const borrados = [];
  const ejecutar = (cmd, args, o, cb) => {
    if (cmd === 'ssh') { const c = args.at(-1); if (c.startsWith('ls')) return cb(null, Object.keys(manif).join('\n'), ''); return cb(null, JSON.stringify(manif[c.match(/'([^']+)'\/manifiesto/)[1]]), ''); }
    if (cmd === 'scp') { fs.mkdirSync(path.dirname(args.at(-1)), { recursive: true }); fs.writeFileSync(args.at(-1), 'video'); return cb(null, '', ''); }
    if (cmd === 'ffmpeg') { fs.writeFileSync(args.at(-1), 'jpg'); return cb(null, '', ''); }
    if (cmd === 'rclone' && args.includes('lsjson')) return cb(null, JSON.stringify([{ Size: 9 }]), '');
    if (cmd === 'rclone' && args.includes('link')) return cb(null, 'https://drive.google.com/open?id=D1\n', '');
    cb(null, '', '');
  };
  const subtitulos = [];
  const subtitulador = { async reexportar(o) { fs.writeFileSync(o.mp4, 'k'.repeat(9)); return o; }, async subtitular(a) {
    subtitulos.push(a);
    if (a.soloTranscribir) return JSON.stringify({ subtitulos: [{ s: 0, e: 1, texto: 'CAOS' }] });
    fs.mkdirSync(a.carpeta, { recursive: true });
    const b = path.join(a.carpeta, a.nombre);
    fs.writeFileSync(b + '.mp4', 'x'); fs.writeFileSync(b + '.png', 'x'); fs.writeFileSync(b + '.fcproj', 'x');
    fs.writeFileSync(b + '.srt', '1\n00:00:00,000 --> 00:00:01,000\nYA LLEGAMOS COMPA\n\n2\n00:00:01,000 --> 00:00:02,000\nQUE CAOS\n');
    return { datos: { mp4: b + '.mp4', srt: b + '.srt', previa: b + '.png', proyecto: b + '.fcproj', gancho: 'CAOS TOTAL', fuente: a.video, plan: { disenos: [] }, noCorregidas: [],
      calidad: { ok: true, errores: [], avisos: [], medidas: { duracion: 100 } } } };
  } };
  const prompts = [];
  const generarJSON = async ({ prompt }) => {
    prompts.push(prompt);
    if (/Traduce CADA línea/.test(prompt)) return { datos: { lineas: prompt.split('\n').filter(l => /^\d+\. /.test(l)).map(l => 'EN ' + l.replace(/^\d+\. /, '')) } };
    if (/Devuelve es y en/.test(prompt)) return { datos: { es: { titulo: 'Caos total en la carretera', descripcion: '¿Qué harías tú?' }, en: { titulo: 'Total chaos on the road', descripcion: 'What would you do?' }, gancho_en: 'TOTAL CHAOS' } };
    if (/Lo que pide/.test(prompt)) return { datos: { temblor: { modo: 'igual' }, correcciones: [{ t: 1, mal: 'que caos', bien: 'qué caos' }], respuesta: 'ok' } };
    return { datos: { estilo: 'pop' } };
  };
  const pedir = async (url, o) => ({ ok: true, json: async () => ({ id: 'M1', cuerpo: JSON.parse(o.body.get('payload_json')) }) });
  const discord = [];
  const pedirD = async (url, o) => { discord.push(JSON.parse(o.body.get('payload_json'))); return pedir(url, o); };
  const subidas = [];
  const youtube = { conectado: () => true, estado: () => ({ configurado: true, conectado: true, canal: { titulo: 'LAGCTRUCKS' } }),
    async subir(o) { subidas.push({ ...o, existia: fs.existsSync(o.archivo) }); return { id: 'VID12345678' }; }, async portada() { }, subs: [], async subtitulos(id, s) { this.subs.push(s); } };
  const medidas = { pares: {} };
  const metricas = { async medir(clips) { return { canal: { youtube: [{ vistas: 1000 }], tiktok: [] }, pares: medidas.pares, errores: [] }; } };
  fs.mkdirSync(path.join(dir, 'craft', 'kits'), { recursive: true });
  if (kit) fs.writeFileSync(path.join(dir, 'craft', 'kits', 'lagctrucks.json'), JSON.stringify(kit));
  fs.writeFileSync(path.join(dir, 'craft', 'lotes.json'), JSON.stringify({ salida, fuentes: [{ id: 'lagc', nombre: 'LAGCTRUCKS', tipo: 'ssh', host: 'pi', ruta: '~/s', perfil: 'lagctrucks', minClipSeg: 30, minStreamSeg: 600 }],
    discordClips: { canal: '9', token, rclone: 'rclone', borrarLocal: true }, youtube: { activo: true } }));
  const l = crearLotes({ cfg: { dir }, bus, subtitulador, generarJSON, ejecutar, pedir: pedirD, medir: async () => ({ video: true, audio: true, ancho: 2160, alto: 3840, duracion: 100, bytes: 9 }), youtube, metricas });
  return { l, dir, avisos, subtitulos, prompts, discord, subidas, youtube, medidas, borrados };
}
const esperar = async (fn, fin = 5000) => { const t = Date.now(); while (Date.now() - t < fin) { const r = fn(); if (r) return r; await new Promise(ok => setTimeout(ok, 10)); } throw new Error('no llegó'); };

test('lotes: aprobar → títulos es/en + .srt en inglés → 4K → Drive/Discord (dice que APOLO lo sube) → YouTube programado → 4K local fuera', async () => {
  const { l, subtitulos, prompts, discord, subidas, youtube, avisos } = montar();
  await l.revisar();
  const c0 = await esperar(() => l.estado().clips.find(c => c.estado === 'revisar'));
  assert.deepStrictEqual(c0.momento, { tipo: 'risa', autores: 29, ingles: 9, puntaje: 9.6 }, 'lo que sabe la Pi del momento');
  assert.match(prompts.find(p => /Estilos disponibles/.test(p)), /reaccionó sobre todo con: risa \(29 personas\)/);
  l.decidir(c0.id, 'aprobar');
  const c = await esperar(() => { const x = l.estado().clips[0]; return x.youtube?.estado === "listo" && x.publicado?.estado === "listo" ? x : null; });
  assert.deepStrictEqual([c.textos.es.titulo, c.textos.en.titulo, c.textos.ganchoEn], ['Caos total en la carretera', 'Total chaos on the road', 'TOTAL CHAOS']);
  assert.ok(fs.existsSync(c.en.srt) && c.en.srt.endsWith('.en.srt'));
  assert.match(fs.readFileSync(c.en.srt, 'utf8'), /EN YA LLEGAMOS COMPA[\s\S]*EN QUE CAOS/);
  assert.ok(!subtitulos.some(a => /EN$/.test(a.nombre || '')), 'sin versión quemada si el kit no la pide');
  // Discord: texto en español y en inglés, aviso de YouTube y botón de los subtítulos EN
  const d = discord[0].embeds[0];
  assert.match(d.description, /Caos total en la carretera #lagctrucks/); assert.match(d.description, /En inglés[\s\S]*Total chaos on the road #simulator/);
  assert.match(d.description, /YouTube: ya lo sube APOLO[\s\S]*<t:\d+:f>/);
  assert.ok(discord[0].components[0].components.some(b => /Subtítulos EN/.test(b.label)));
  // YouTube: el 4K aún estaba, título + hashtags del kit, inglés como localización, programado a una hora del kit, subtítulos EN
  const s = subidas[0];
  assert.ok(s.existia, 'el 4K no se borra antes de subirlo a YouTube');
  assert.strictEqual(s.titulo, 'Caos total en la carretera #simulator #ats #truck #truckdriver #lagctrucks');
  assert.match(s.localizaciones.en.title, /^Total chaos on the road #simulator/);
  const hora = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(s.publicarEn));
  assert.ok(['12:00', '18:00', '21:00'].includes(hora) && s.publicarEn > Date.now(), hora);
  assert.match(youtube.subs[0].srt, /EN YA LLEGAMOS/);
  assert.strictEqual(c.youtube.url, 'https://www.youtube.com/shorts/VID12345678');
  assert.ok(!fs.existsSync(c.k4.mp4) && c.publicado.borradoLocal, '4K local fuera después de YouTube');
  assert.ok(avisos.some(a => /Subido a YouTube: «Caos total en la carretera»/.test(a.texto)));
});

test('lotes: un subtítulo corregido en Revisión pasa al diccionario del canal; las métricas se guardan y vuelven como pistas', async () => {
  const { l, dir, subtitulos, medidas } = montar();
  await l.revisar();
  const c0 = await esperar(() => l.estado().clips.find(c => c.estado === 'revisar'));
  await l.modificar(c0.id, { comentarios: [{ t: 1, texto: 'dice qué caos con tilde' }] });
  await esperar(() => l.estado().clips[0].estado === 'revisar' && subtitulos.filter(a => !a.soloTranscribir).length >= 2);
  const r = await l.http('GET', ['', 'revision', 'diccionario'], {}, {});
  assert.deepStrictEqual(r.entradas.map(x => [x.mal, x.bien]), [['que caos', 'qué caos']]);
  assert.deepStrictEqual(l.estado().diccionario, { lagctrucks: 1 });
  await l.http('POST', ['', 'revision', 'diccionario'], { quitar: 'que caos' });
  assert.strictEqual((await l.http('GET', ['', 'revision', 'diccionario'], {}, {})).entradas.length, 0);
  // métricas: lo publicado se empareja y queda guardado; con 5+ clips medidos sale en el prompt del estilo
  l.decidir(c0.id, 'aprobar');
  await esperar(() => l.estado().clips[0].youtube?.estado === 'listo');
  medidas.pares = { [c0.id]: { youtube: { id: 'VID12345678', url: 'u', titulo: 't', fecha: Date.now(), duracion: 100, vistas: 5000, likes: 50, comentarios: 3, retencion: 81, segundosMedios: 70, como: 'id' } } };
  const ap = await l.actualizarMetricas();
  const c = l.estado().clips[0];
  assert.deepStrictEqual([c.metricas.youtube.vistas, c.metricas.youtube.retencion], [5000, 81]);
  assert.strictEqual(ap.muestras, 1); assert.ok(fs.existsSync(path.join(dir, 'craft', 'aprendizaje.json')));
  assert.strictEqual((await l.http('GET', ['', 'revision', 'metricas'])).aprendido.muestras, 1);
  // vincular a mano una publicación de TikTok
  const v = await l.http('POST', ['', 'revision', encodeURIComponent(c0.id), 'vincular'], { url: 'https://www.tiktok.com/@lagctrucks/video/7697679911368084767' });
  assert.deepStrictEqual(v.vinculos, { tiktok: '7697679911368084767' });
  await assert.rejects(l.http('POST', ['', 'revision', encodeURIComponent(c0.id), 'vincular'], { url: 'https://x.com/a' }), /YouTube, TikTok, Facebook o Instagram/);
  assert.throws(() => l.aYouTube(l.estado().clips[0]), /ya está en YouTube/);
});

test('lotes: con ingles.quemado en el kit sale también la versión en inglés (mismo plan, subtítulos y título en inglés) y va a Drive/Discord', async () => {
  const { l, subtitulos, discord } = montar({ kit: { ingles: { quemado: true, cta: 'Follow for more' } } });
  await l.revisar();
  const c0 = await esperar(() => l.estado().clips.find(c => c.estado === 'revisar'));
  l.decidir(c0.id, 'aprobar');
  const c = await esperar(() => { const x = l.estado().clips[0]; return x.publicado?.estado === 'listo' ? x : null; });
  const en = subtitulos.find(a => / EN$/.test(a.nombre || ''));
  assert.ok(en, 'se editó la versión EN');
  assert.deepStrictEqual(en.subtitulos.map(x => x.texto), ['EN YA LLEGAMOS COMPA', 'EN QUE CAOS']);
  assert.deepStrictEqual([en.gancho, en.cta, en.diccionario, en.estilo], ['TOTAL CHAOS', 'Follow for more', false, 'pop']);
  assert.strictEqual(en.video, c0.fuenteVideo, 'sobre el mismo vídeo de origen');
  assert.ok(c.en.mp4.endsWith(' EN.mp4') && fs.existsSync(c.en.mp4));
  assert.ok(discord[0].components[0].components.some(b => /Versión en inglés/.test(b.label)));
});

test('métricas de Meta: Facebook (reels + vídeos, vistas por insights si faltan) e Instagram (reels con vistas/compartidos), emparejado sin duración y conectar', async () => {
  const llamadas = [];
  const R = (j, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => j });
  const pedir = async url => {
    const u = new URL(url); llamadas.push(u.pathname + '?' + [...u.searchParams.keys()].join(','));
    const p = u.pathname.replace('/v22.0', '');
    if (p === '/123/video_reels') return R({ data: [{ id: '900', description: 'PELIGRO AL CONDUCIR CON EL TELÉFONO #ats', created_time: '2026-10-22T20:00:00+0000', length: 93.2, permalink_url: '/reel/900', likes: { summary: { total_count: 7 } }, comments: { summary: { total_count: 2 } } }] });
    if (p === '/123/videos') return R({ data: [{ id: '900', length: 93.2 }, { id: '901', title: 'otro', created_time: '2026-10-01T00:00:00+0000', length: 30, views: 50 }] });
    if (p === '/900/video_insights') return R({ data: [{ name: 'blue_reels_play_count', values: [{ value: 410 }] }] });
    if (p === '/ig1/media') return R({ data: [{ id: 'm1', caption: 'PELIGRO AL CONDUCIR CON EL TELÉFONO\n#truck', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-22T21:00:00+0000', permalink: 'https://www.instagram.com/reel/AbC_1/', like_count: 30, comments_count: 4 },
      { id: 'm2', caption: 'foto', media_type: 'IMAGE', timestamp: '2026-10-22T21:00:00+0000' }] });
    if (p === '/m1/insights') return R({ data: [{ name: 'views', values: [{ value: 1200 }] }, { name: 'shares', values: [{ value: 9 }] }, { name: 'saved', values: [{ value: 3 }] }] });
    if (p === '/oauth/access_token') return R({ access_token: 'LARGO' });
    if (p === '/me/accounts') return R({ data: [{ id: '123', name: 'LAGC Trucks', access_token: 'PAGINA', instagram_business_account: { id: 'ig1', username: 'lagctrucks' } }] });
    return R({ error: { message: 'ruta ' + p } }, false);
  };
  const m = met.crearMetricas({ meta: { config: () => ({ token: 'PAGINA', pagina: '123', instagram: 'ig1' }) }, pedir, ejecutar: (cmd, args, o, cb) => cb(new Error('sin red en la prueba')) });
  const fb = await m.deFacebook(), ig = await m.deInstagram();
  assert.deepStrictEqual(fb.map(v => [v.id, v.vistas, v.duracion]), [['900', 410, 93.2], ['901', 50, 30]], 'reels y vídeos sin repetir; vistas del reel por insights');
  assert.strictEqual(fb[0].url, 'https://www.facebook.com/reel/900');
  assert.deepStrictEqual([ig.length, ig[0].vistas, ig[0].compartidos, ig[0].codigo, ig[0].titulo], [1, 1200, 9, 'AbC_1', 'PELIGRO AL CONDUCIR CON EL TELÉFONO'], 'solo vídeos; título = primera línea');
  const clip = { id: 'c1', estado: 'aprobado', decidido: Date.parse('2026-10-22T19:35:00Z'), gancho: 'PELIGRO AL CONDUCIR CON EL TELÉFONO', inicio: 0, fin: 93, k4: { medidas: { duracion: 93.0 } } };
  const r = await m.medir([clip], {});
  assert.strictEqual(r.pares.c1.facebook.id, '900', 'Facebook por título + duración');
  assert.strictEqual(r.pares.c1.instagram.id, 'm1', 'Instagram (sin duración) por el texto');
  assert.ok(!r.errores.some(e => /facebook|instagram/.test(e)), 'Facebook e Instagram sin errores');
  assert.deepStrictEqual(met.emparejar([{ ...clip, vinculos: { instagram: 'AbC_1' } }], [{ ...ig[0], fecha: 1 }]).pares.c1.instagram.como, 'id', 'el enlace pegado de Instagram (código del reel) vincula');
  const ap = met.aprender([{ ...clip, metricas: { instagram: { vistas: 1200, fecha: Date.now() } } }], { instagram: [{ vistas: 600 }, { vistas: 600 }] });
  assert.strictEqual(ap.muestras, 1, 'Instagram cuenta para lo aprendido');
  const sin = met.crearMetricas({ meta: { config: () => null }, pedir });
  assert.deepStrictEqual([await sin.deFacebook(), await sin.deInstagram()], [[], []], 'sin conectar no hace nada');
  const c = await met.conectarMeta({ token: 'CORTO', appId: 'a', appSecret: 's' }, pedir);
  assert.deepStrictEqual(c.guardar, { ...c.guardar, token: 'PAGINA', pagina: '123', instagram: 'ig1', ig_usuario: 'lagctrucks', largo: true });
  assert.deepStrictEqual(c.publico, { pagina: 'LAGC Trucks', instagram: 'lagctrucks' }, 'lo que se enseña no lleva el token');
});
