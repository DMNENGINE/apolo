// Estudio de Avatares: receta → SVG determinista, validación de recetas, estado → pose (pura), API /v1/avatar y Personaje IA
// (prompt propio sin inferir edad/género; nada se genera sin confirmar; OpenAI y Gemini contra servidores falsos). Sin red.
// El PNG lo hace el navegador del panel (canvas, AvatarSVG.aPNG): en Node no hay rasterizador SVG sin dependencias.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const A = require('../ui/avatar');
const { crearAvatar, promptIA } = require('../avatar');

test('16 formas, 12 presets y SVG determinista (misma receta → mismo SVG, byte a byte)', () => {
  assert.strictEqual(A.FORMAS.length, 16);
  assert.strictEqual(A.PRESETS.length, 12);
  const vistos = new Set();
  for (const forma of A.FORMAS) {
    const r = { forma, cuerpo: '#2bdc7c', ojos: 'casco', semilla: 42 };
    const s1 = A.svg(r), s2 = A.svg(JSON.parse(JSON.stringify(r)));
    assert.strictEqual(s1, s2, `determinista: ${forma}`);
    assert.match(s1, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 200"/);
    assert.ok(!/NaN|undefined|Infinity/.test(s1), `números válidos: ${forma}`);
    assert.ok(s1.length < 12000, `ligero: ${forma} ${s1.length}`);
    vistos.add(A.svg(r, { animado: false }));
  }
  assert.strictEqual(vistos.size, 16, 'cada forma da un SVG distinto');
  // el blob depende de la semilla; el resto no cambia con ella
  assert.notStrictEqual(A.svg({ forma: 'blob', semilla: 1 }), A.svg({ forma: 'blob', semilla: 2 }));
  // export (animado:false) sin <style>; animado con CSS propio y respeta reduce-motion
  assert.ok(!A.svg(A.PRESETS[0], { animado: false }).includes('<style>'));
  const an = A.svg(A.PRESETS[0]);
  assert.match(an, /<style>.*@keyframes/); assert.match(an, /prefers-reduced-motion/);
  // todos los estilos de ojos, accesorios y fondos pintan algo distinto
  const ojos = new Set(A.OJOS.map(o => A.svg({ ojos: o }, { animado: false })));
  assert.strictEqual(ojos.size, A.OJOS.length);
  const acc = new Set(A.ACCESORIOS.map(a => A.svg({ accesorio: a }, { animado: false })));
  assert.strictEqual(acc.size, A.ACCESORIOS.length);
  assert.match(A.svg({ fondo: { tipo: 'degradado', c1: '#000000', c2: '#ffffff' } }), /linearGradient id="[\w-]+-fd"/);
  // aleatoria: misma semilla → misma receta; siempre válida
  assert.deepStrictEqual(A.aleatoria(123), A.aleatoria(123));
  for (let i = 0; i < 50; i++) assert.ok(A.validar(A.aleatoria(i)).ok);
  // la receta es pequeña
  for (const p of A.PRESETS) assert.ok(JSON.stringify(p).length < 400);
});

test('validar: errores claros; normalizar rellena; nada de texto del usuario dentro del SVG', () => {
  assert.strictEqual(A.validar(null).ok, false);
  assert.strictEqual(A.validar([]).ok, false);
  const mal = A.validar({ forma: 'pentagrama', cuerpo: 'red', ojos: 'laser', accesorio: 'corona', semilla: -1, fondo: { tipo: 'video', c1: '#zzzzzz' }, mejillas: 'si' });
  assert.strictEqual(mal.ok, false);
  for (const k of ['forma', 'cuerpo', 'ojos', 'accesorio', 'semilla', 'fondo.tipo', 'fondo.c1', 'mejillas']) assert.ok(mal.errores.some(e => e.startsWith(k)), k);
  assert.strictEqual(A.validar({ tipo: 'ia' }).ok, false, 'ia sin id');
  assert.strictEqual(A.validar({ forma: 'x'.repeat(3000) }).ok, false, 'tamaño');
  const ok = A.validar({ forma: 'gota', cuerpo: '#AABBCC', extra: '<script>' });
  assert.ok(ok.ok); assert.strictEqual(ok.receta.cuerpo, '#aabbcc'); assert.strictEqual(ok.receta.extra, undefined);
  assert.strictEqual(ok.receta.ojos, 'casco'); assert.match(ok.receta.colorOjos, /^#[0-9a-f]{6}$/);
  // normalizar nunca deja pasar colores o formas raras (el SVG va a innerHTML)
  const n = A.normalizar({ forma: '"><script>', cuerpo: '"/><script>alert(1)</script>', colorOjos: 'javascript:', nombre: '<b>x</b>' });
  const s = A.svg(n);
  assert.ok(!/<script|javascript:/i.test(s));
  assert.ok(!s.includes('<b>'), 'el nombre no se pinta');
});

test('estado → pose: los mismos 6 estados que el casco 3D, función pura', () => {
  assert.deepStrictEqual(A.ESTADOS, ['reposo', 'trabajando', 'permiso', 'listo', 'error', 'dormido']);
  const p = A.pose('permiso'); p.escala = 99;
  assert.strictEqual(A.pose('permiso').escala, 1.3, 'devuelve un objeto nuevo cada vez');
  assert.strictEqual(A.pose('nada').estado, 'reposo');
  assert.strictEqual(A.pose('reposo').parpadeo, true);
  assert.strictEqual(A.pose('trabajando').mirar, 'escanear');
  assert.ok(A.pose('permiso').alerta && A.pose('permiso').escala > 1);
  assert.strictEqual(A.pose('listo').ojos, 'felices');
  assert.strictEqual(A.pose('error').ojos, 'x');
  assert.ok(A.pose('dormido').zzz && A.pose('dormido').ojos === 'cerrados' && !A.pose('dormido').parpadeo);
  const r = A.PRESETS[1];
  const svgs = A.ESTADOS.map(e => A.svg(r, { estado: e }));
  assert.strictEqual(new Set(svgs).size, 6);
  assert.match(svgs[1], /class="mira"/); assert.match(svgs[1], /-e\{0%,100%\{transform:translateX/);
  assert.match(svgs[2], /class="halo"/);
  assert.match(svgs[4], /#ff4d5e/);
  assert.match(svgs[5], /class="zz"/);
  assert.match(svgs[3], /class="chispa"/);
});

function entorno(proveedores = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-'));
  const bus = new EventEmitter(), eventos = [];
  bus.on('evento', e => eventos.push(e));
  const cfg = { dir, proveedores };
  return { dir, bus, eventos, cfg, av: crearAvatar({ cfg, bus }) };
}

test('API /v1/avatar: PUT/GET receta, SVG por estado, ajustes de la isla y overlay, historial', async () => {
  const { av, dir, eventos } = entorno();
  let g = await av.http('GET', ['v1', 'avatar']);
  assert.strictEqual(g.usuario, null); assert.strictEqual(g.usarEnIsla, false, 'la skin del compañero viene APAGADA');
  assert.ok(g.motores.every(m => !m.listo && m.falta));
  assert.strictEqual(av.paraIsla().usar, false, 'sin avatar: la isla muestra el casco 3D');
  await assert.rejects(av.http('PUT', ['v1', 'avatar', 'usuario'], { receta: { forma: 'pentagrama' } }), /receta no válida/);
  const { receta } = await av.http('PUT', ['v1', 'avatar', 'usuario'], { receta: { forma: 'nube', cuerpo: '#5ab0ff' } });
  assert.strictEqual(receta.forma, 'nube');
  assert.ok(eventos.some(e => e.tipo === 'avatar' && e.quien === 'usuario'));
  await av.http('PUT', ['v1', 'avatar', 'usuario'], { forma: 'gota' });          // también acepta la receta suelta
  g = await av.http('GET', ['v1', 'avatar']);
  assert.strictEqual(g.usuario.forma, 'gota'); assert.strictEqual(g.historial.length, 2);
  const f = await av.http('GET', ['v1', 'avatar', 'svg'], {}, { quien: 'usuario', estado: 'dormido' });
  assert.ok(f.__archivo.endsWith('.svg') && fs.readFileSync(f.__archivo, 'utf8') === A.svg(g.usuario, { estado: 'dormido', animado: false }));
  // "Un solo avatar para todo": tu avatar (usuario) conduce la isla automáticamente, reemplazando al casco, sin activar nada.
  assert.strictEqual(av.paraIsla().usar, true); assert.strictEqual(av.paraIsla().receta.forma, 'gota');
  assert.strictEqual(av.paraOverlay(), null, 'el overlay de streaming sigue requiriendo su interruptor');
  await av.http('PATCH', ['v1', 'avatar'], { enOverlay: true });
  assert.ok(av.paraOverlay().receta); assert.strictEqual(av.paraOverlay().receta.forma, 'gota');
  await av.http('DELETE', ['v1', 'avatar', 'usuario']);
  assert.strictEqual((await av.http('GET', ['v1', 'avatar'])).usuario, null);
  await assert.rejects(av.http('GET', ['v1', 'avatar', 'svg'], {}, { quien: 'usuario' }), /sin avatar/);
  await assert.rejects(av.http('GET', ['v1', 'avatar', 'ia', '../../x']), /id/);
  assert.ok(fs.existsSync(path.join(dir, 'avatar', 'avatar.json')));
});

test('Personaje IA: prompt propio sin inferir edad ni género', () => {
  const p = promptIA({ descripcion: 'un astronauta que cultiva tomates', pelo: 'rizado azul' });
  assert.match(p, /APOLO/); assert.match(p, /gender-neutral/); assert.match(p, /Do not give the character a specific age/);
  assert.ok(!/\b(boy|girl|man|woman|male|female)\b/i.test(p), 'no inventa género');
  assert.match(p, /Hair: rizado azul/);
  assert.match(p, /No text, no letters, no logos/);
  const con = promptIA({ descripcion: 'x', genero: 'femenino', edad: 'adulto' });
  assert.match(con, /an adult, feminine-presenting/); assert.ok(!/gender-neutral/.test(con));
  const forma = promptIA({ descripcion: 'x', desdeForma: true }, { forma: 'hexagono', cuerpo: '#f5a524', ojos: 'pixel', accesorio: 'antena' });
  assert.match(forma, /honeycomb-hexagon-shaped body in the color #f5a524/); assert.match(forma, /pixel-art eyes/); assert.match(forma, /antenna/);
  assert.ok(!promptIA({ descripcion: 'a\nb\u0000c' }).includes('\n'));
});

async function servidorFalso(t, responder) {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => { const j = b ? JSON.parse(b) : {}; pedidos.push({ url: req.url, j, h: req.headers }); const [c, x] = responder(req.url, j); res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(x)); });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  return { pedidos, url: `http://127.0.0.1:${srv.address().port}` };
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 7)]).toString('base64');

test('Personaje IA: sin motor lo explica; sin confirmar no llama a nadie; OpenAI y Gemini generan y se guarda', async t => {
  const sin = entorno();
  await assert.rejects(sin.av.generarIA({ descripcion: 'x', confirmar: true }), e => e.status === 409 && /OpenAI o de Gemini/.test(e.message));

  const oa = await servidorFalso(t, () => [200, { data: [{ b64_json: PNG }] }]);
  const ge = await servidorFalso(t, () => [200, { candidates: [{ content: { parts: [{ text: 'aquí está' }, { inlineData: { mimeType: 'image/png', data: PNG } }] } }] }]);
  const { av, dir } = entorno({ openai: { apiKey: 'sk-falsa', baseUrl: oa.url }, gemini: { apiKey: 'g-falsa', baseUrl: ge.url } });
  // presupuesto: coste/uso + prompt, y NINGUNA llamada
  const pre = await av.http('POST', ['v1', 'avatar', 'generar-ia'], { descripcion: 'robot jardinero', motor: 'openai' });
  assert.ok(pre.presupuesto && pre.presupuesto.imagenes === 1 && pre.presupuesto.coste.aprox && /robot jardinero/.test(pre.presupuesto.prompt));
  assert.strictEqual(oa.pedidos.length + ge.pedidos.length, 0, 'nada se genera sin pulsar');
  await assert.rejects(av.generarIA({ descripcion: 'x', genero: 'x', opciones: { genero: 'robot' }, confirmar: true }), /genero/);
  // OpenAI
  const r1 = await av.http('POST', ['v1', 'avatar', 'generar-ia'], { descripcion: 'robot jardinero', motor: 'openai', confirmar: true });
  assert.strictEqual(oa.pedidos.length, 1);
  assert.strictEqual(oa.pedidos[0].url, '/images/generations');
  assert.strictEqual(oa.pedidos[0].h.authorization, 'Bearer sk-falsa');
  assert.strictEqual(oa.pedidos[0].j.size, '1024x1024'); assert.strictEqual(oa.pedidos[0].j.n, 1);
  const arch = path.join(dir, 'avatar', 'ia', r1.imagen.id + '.png');
  assert.ok(fs.existsSync(arch));
  assert.ok((await av.http('GET', ['v1', 'avatar', 'ia', r1.imagen.id])).__archivo === arch);
  // Gemini, partiendo del avatar Forma con imagen de referencia
  await av.ponerReceta('usuario', { forma: 'casco', cuerpo: '#c7ced6' });
  const r2 = await av.generarIA({ descripcion: 'piloto', motor: 'gemini', desdeForma: true, referencia: PNG, confirmar: true });
  const pg = ge.pedidos[0];
  assert.match(pg.url, /\/models\/gemini-2\.5-flash-image:generateContent$/);
  assert.strictEqual(pg.h['x-goog-api-key'], 'g-falsa');
  assert.deepStrictEqual(pg.j.generationConfig.responseModalities, ['IMAGE', 'TEXT']);
  assert.ok(pg.j.contents[0].parts.some(x => x.inlineData?.data === PNG), 'manda el avatar Forma como referencia');
  assert.match(pg.j.contents[0].parts[0].text, /robot-helmet-shaped body in the color #c7ced6/);
  // usarla como avatar y borrarla (la receta vuelve a Forma)
  await av.http('PUT', ['v1', 'avatar', 'usuario'], { receta: { ...av.recetaDe('usuario'), tipo: 'ia', ia: { id: r2.imagen.id } } });
  assert.match(av.svgDe('usuario'), /<image href="data:image\/png;base64,/);
  await assert.rejects(av.http('PUT', ['v1', 'avatar', 'apolo'], { receta: { tipo: 'ia', ia: { id: 'noexiste-123' } } }), /no existe/);
  await av.http('DELETE', ['v1', 'avatar', 'ia', r2.imagen.id]);
  assert.strictEqual(av.recetaDe('usuario').tipo, 'forma');
  assert.strictEqual((await av.http('GET', ['v1', 'avatar'])).ia.length, 1);
});

test('el daemon sirve /v1/avatar y /avatar.js; el móvil solo puede leer', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'falso/m' }));
  const { iniciar } = require('../daemon');
  const n = require('../index').crearNucleo({ dir, embedder: null, sinPlugins: true });
  const { servidor, puerto } = await iniciar({ nucleo: n, puerto: 0, sinTareas: true, host: '127.0.0.1' });
  t.after(() => { servidor.closeAllConnections?.(); servidor.close(); });
  const tok = fs.readFileSync(path.join(dir, 'token'), 'utf8').trim();
  const base = `http://127.0.0.1:${puerto}`;
  const js = await fetch(base + '/avatar.js'); assert.strictEqual(js.status, 200);
  const put = await fetch(base + '/v1/avatar/usuario', { method: 'PUT', headers: { 'x-robot-token': tok, 'content-type': 'application/json' }, body: JSON.stringify({ receta: A.PRESETS[3] }) });
  assert.strictEqual(put.status, 200);
  const s = await fetch(base + '/v1/avatar/svg?quien=usuario&estado=listo', { headers: { 'x-robot-token': tok } });
  assert.strictEqual(s.status, 200); assert.match(s.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await s.text(), /^<svg/);
  const MV = require('../movil');
  assert.ok(MV.alcance('GET', ['v1', 'avatar']) && MV.alcance('GET', ['v1', 'avatar', 'svg']));
  assert.ok(!MV.alcance('PUT', ['v1', 'avatar', 'usuario']) && !MV.alcance('POST', ['v1', 'avatar', 'generar-ia']));
  assert.ok(MV.estaticoMovil('avatar.js'));
});
