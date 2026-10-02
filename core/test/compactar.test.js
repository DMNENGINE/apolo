// Compactación de conversaciones largas: corte, vista del modelo, resumen + recuerdos, y el bucle del agente.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { vista, puntoDeCorte, crearCompactador } = require('../compactar');
const { crearSesiones } = require('../sesiones');
const { crearMemoria } = require('../memoria');

const u = c => ({ role: 'user', content: c });
const a = c => ({ role: 'assistant', content: c });
const largo = n => 'x'.repeat(n);

test('corte: siempre al inicio de un turno del usuario y nunca el turno en curso', () => {
  const m = [u('hola'), a(largo(700)), u('dos'), a(largo(700)), u('tres'), { role: 'assistant', content: null, toolCalls: [{ id: 'c', name: 'leer_archivo', args: {} }] }, { role: 'tool', toolCallId: 'c', content: largo(700) }];
  const c = puntoDeCorte(m, 0, 300);                     // presupuesto pequeño: se queda solo el turno en curso
  assert.strictEqual(c, 4);
  assert.strictEqual(m[c].role, 'user');
  assert.strictEqual(puntoDeCorte(m, 0, 100_000), 2);    // presupuesto enorme: aun así el primer turno se resume
  assert.strictEqual(puntoDeCorte([u('solo uno'), a('ok')], 0, 10), -1);
});

test('vista: resumen del último marcador + mensajes desde su corte, sin marcas de tiempo', () => {
  const m = [u('a'), a('b'), u('c'), a('d'), { role: 'compactacion', content: 'R1', desde: 2, t: 1 }, u('e')];
  m[2].t = 5;
  const v = vista(m);
  assert.strictEqual(v.resumen, 'R1');
  assert.deepStrictEqual(v.mensajes.map(x => x.content), ['c', 'd', 'e']);
  assert.ok(!('t' in v.mensajes[0]));
  assert.deepStrictEqual(vista([u('x')]), { resumen: '', desde: 0, mensajes: [{ role: 'user', content: 'x' }] });
});

test('compactar: resume lo antiguo, integra el resumen previo y guarda lo duradero (sin secretos)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-'));
  const cfg = { dir, compactar: { umbral: 100, conservar: 50 } };
  const sesiones = crearSesiones({ cfg });
  const memoria = crearMemoria({ cfg });
  const prompts = [];
  const generarJSON = async ({ prompt }) => {
    prompts.push(prompt);
    return { datos: { resumen: `resumen ${prompts.length}`, recuerdos: [{ texto: 'Tiene un taller de camiones', tipo: 'proyecto' }, { texto: 'su password = hunter22222', tipo: 'hecho' }] } };
  };
  const comp = crearCompactador({ cfg, generarJSON, memoria, sesiones });
  const s = sesiones.crear({ cwd: dir });
  for (const x of [u('mi taller ' + largo(300)), a(largo(300)), u('segundo'), a(largo(300)), u('tercero')]) sesiones.agregar(s, x);
  assert.ok(comp.hace(s, ''));
  const r = await comp.compactar(s);
  assert.ok(r.despues < r.antes);
  assert.deepStrictEqual(r.recuerdos, ['Tiene un taller de camiones']);   // el secreto lo bloquea la memoria
  assert.match(prompts[0], /mi taller/);
  assert.strictEqual(vista(s.mensajes).resumen, 'resumen 1');
  assert.strictEqual(vista(s.mensajes).mensajes[0].content, 'tercero');
  // el historial completo sigue en disco, y al recargar la sesión la vista es la misma
  const s2 = crearSesiones({ cfg }).obtener(s.id);
  assert.strictEqual(s2.mensajes.filter(m => m.role === 'user').length, 3);
  assert.strictEqual(vista(s2.mensajes).resumen, 'resumen 1');
  // segunda compactación: recibe el resumen anterior para integrarlo
  sesiones.agregar(s, a(largo(300))); sesiones.agregar(s, u('cuarto'));
  await comp.compactar(s, { forzar: true });
  assert.match(prompts[1], /RESUMEN PREVIO:\nresumen 1/);
  assert.doesNotMatch(prompts[1], /mi taller/);
  assert.strictEqual(memoria.lista().length, 1);           // el recuerdo repetido no se duplica
});

test('agente: al pasar el umbral resume antes de llamar al modelo y el resumen va al system prompt', async t => {
  const recibidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      const j = JSON.parse(b); recibidos.push(j);
      const sys = j.messages.find(m => m.role === 'system')?.content || '';
      const content = /Resumes una conversación/.test(sys)
        ? JSON.stringify({ resumen: 'El usuario está montando un panel de control.', recuerdos: [] })
        : 'respuesta';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nucleo-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    modeloPorDefecto: 'falso/m1', proveedores: { falso: { tipo: 'openai', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, local: true } },
    memoria: { embeddings: null }, compactar: { umbral: 1500, conservar: 200 },
  }));
  const { crearNucleo } = require('../index');
  const n = crearNucleo({ dir });
  const s = n.sesiones.crear({ cwd: dir });
  const eventos = []; const ev = e => eventos.push(e.tipo === 'aviso' ? 'aviso:' + e.texto : e.tipo);
  await n.enviar(s, 'primero ' + largo(8000), ev);
  assert.ok(!eventos.includes('compactacion'));            // un solo turno: no hay nada antiguo que resumir
  await n.enviar(s, 'segundo', ev);
  assert.ok(eventos.includes('compactacion'), eventos.join(','));
  const ultimo = recibidos.at(-1);
  assert.match(ultimo.messages[0].content, /RESUMEN DE LA PARTE ANTERIOR[\s\S]*panel de control/);
  assert.ok(!JSON.stringify(ultimo.messages).includes('primero'));
  assert.strictEqual(ultimo.messages.filter(m => m.role === 'user').at(-1).content, 'segundo');
});
