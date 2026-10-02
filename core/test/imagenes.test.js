// Imágenes (capturas de ver_pantalla): conversión en cada adaptador, solo las 2 últimas al modelo,
// y si el modelo no acepta imágenes, la sesión sigue solo con texto.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IMG = { mime: 'image/jpeg', datos: Buffer.from('jpeg-falso').toString('base64') };
const conversacion = [
  { role: 'user', content: 'mira la pantalla' },
  { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'ver_pantalla', args: {} }] },
  { role: 'tool', toolCallId: 't1', name: 'ver_pantalla', content: 'Ventana activa: "Bloc de notas"', imagenes: [IMG] },
];

async function servidor(t, responder) {
  const cuerpos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      const j = JSON.parse(b); cuerpos.push({ url: req.url, j });
      const [code, cuerpo] = responder(req.url, j);
      res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo));
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  return { cuerpos, url: `http://127.0.0.1:${srv.address().port}` };
}

test('adaptadores: la captura llega como imagen en OpenAI, Anthropic y Gemini', async t => {
  const { cuerpos, url } = await servidor(t, u => [200, u.includes('generateContent')
    ? { candidates: [{ content: { parts: [{ text: 'veo un bloc de notas' }] } }] }
    : u.includes('/messages') ? { content: [{ type: 'text', text: 'ok' }], usage: {} }
    : { choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: {} }]);
  await require('../proveedores/openai')({ baseUrl: url + '/v1' }).chat({ model: 'm', system: 's', mensajes: conversacion });
  await require('../proveedores/anthropic')({ baseUrl: url + '/v1', apiKey: 'k' }).chat({ model: 'm', mensajes: conversacion });
  await require('../proveedores/gemini')({ baseUrl: url + '/v1beta', apiKey: 'k' }).chat({ model: 'm', mensajes: conversacion });

  // OpenAI: el "tool" va con texto y justo después un mensaje de usuario con la imagen
  const o = cuerpos[0].j.messages;
  assert.strictEqual(o.at(-2).role, 'tool');
  assert.strictEqual(o.at(-1).role, 'user');
  assert.strictEqual(o.at(-1).content[1].image_url.url, `data:image/jpeg;base64,${IMG.datos}`);
  // Anthropic: dentro del tool_result
  const a = cuerpos[1].j.messages.at(-1).content[0];
  assert.strictEqual(a.type, 'tool_result');
  assert.deepStrictEqual(a.content[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMG.datos } });
  // Gemini: inlineData en el mismo turno que la functionResponse
  const g = cuerpos[2].j.contents.at(-1).parts;
  assert.ok(g[0].functionResponse);
  assert.deepStrictEqual(g[1], { inlineData: { mimeType: 'image/jpeg', data: IMG.datos } });
});

test('agente: solo las 2 últimas capturas van al modelo; si no acepta imágenes, sigue con texto', async t => {
  let rechazar = true;
  const { cuerpos, url } = await servidor(t, (u, j) => {
    const conImagen = j.messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'));
    if (conImagen && rechazar) return [400, { error: { message: 'this model does not support images' } }];
    return [200, { choices: [{ message: { role: 'assistant', content: 'listo' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }];
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: url + '/v1', local: true } }, memoria: { embeddings: null },
  }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir });
  const s = n.sesiones.crear({ cwd: dir });
  // tres capturas antiguas en el historial (en disco, como las guarda ver_pantalla)
  n.sesiones.agregar(s, { role: 'user', content: 'mira' });
  for (const k of [1, 2, 3]) {
    const ruta = path.join(dir, `c${k}.jpg`); fs.writeFileSync(ruta, `img${k}`);
    n.sesiones.agregar(s, { role: 'assistant', content: '', toolCalls: [{ id: `t${k}`, name: 'ver_pantalla', args: {} }] });
    n.sesiones.agregar(s, { role: 'tool', toolCallId: `t${k}`, name: 'ver_pantalla', content: `captura ${k}`, imagenes: [{ mime: 'image/jpeg', ruta }] });
  }
  n.sesiones.agregar(s, { role: 'assistant', content: 'visto' });

  rechazar = false;
  await n.enviar(s, '¿y ahora?');
  const imgs = cuerpos[0].j.messages.flatMap(m => (Array.isArray(m.content) ? m.content : [])).filter(p => p.type === 'image_url');
  assert.deepStrictEqual(imgs.map(p => Buffer.from(p.image_url.url.split(',')[1], 'base64').toString()), ['img2', 'img3']);
  assert.match(cuerpos[0].j.messages.find(m => m.role === 'tool' && m.tool_call_id === 't1').content, /captura antigua omitida/);

  rechazar = true;
  const eventos = [];
  const r = await n.enviar(s, 'otra vez', e => eventos.push(e));
  assert.strictEqual(r, 'listo');
  assert.ok(eventos.some(e => e.tipo === 'aviso' && /no aceptó la imagen/.test(e.texto)));
  assert.strictEqual(s.sinVision, true);
  const ultimo = cuerpos.at(-1).j.messages;
  assert.ok(!JSON.stringify(ultimo).includes('image_url'));
  assert.match(ultimo.find(m => m.tool_call_id === 't3').content, /este modelo no ve imágenes/);
});

test('ver_pantalla: ventanas protegidas por título o proceso', () => {
  const { bloqueada } = require('../escritorio');
  assert.ok(bloqueada({}, { titulo: 'Bank of America - Google Chrome', proceso: 'chrome' }));
  assert.ok(bloqueada({}, { titulo: 'Bóveda', proceso: 'Bitwarden' }));
  assert.ok(bloqueada({}, { titulo: 'PayPal: Resumen', proceso: 'msedge' }));
  assert.strictEqual(bloqueada({}, { titulo: 'Bloc de notas', proceso: 'notepad' }), null);
  assert.ok(bloqueada({ escritorio: { bloqueadas: ['taller'] } }, { titulo: 'Facturas del taller', proceso: 'excel' }));
});
