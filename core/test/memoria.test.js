const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearMemoria, buscarHistorial } = require('../memoria');
const { normalizar } = require('../vectores');

const nueva = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-')); return { mem: crearMemoria({ cfg: { dir } }), dir }; };

test('recordar, deduplicar y buscar sin acentos ni plurales', () => {
  const { mem } = nueva();
  mem.recordar({ texto: 'Tiene un taller de camiones llamado Ruedas Grandes', tipo: 'perfil' });
  mem.recordar({ texto: 'Prefiere respuestas cortas y en español', tipo: 'preferencia' });
  mem.recordar({ texto: 'Está construyendo un robot humanoide de 1.5 m con MuJoCo', tipo: 'proyecto' });
  const r = mem.recordar({ texto: 'Prefiere respuestas cortas, en español', tipo: 'preferencia' });
  assert.strictEqual(r.accion, 'actualizada');
  assert.strictEqual(mem.lista().length, 3);
  assert.match(mem.buscar('cómo va el robot humanoide')[0].texto, /MuJoCo/);
  assert.match(mem.buscar('camion')[0].texto, /Ruedas Grandes/);
  assert.strictEqual(mem.buscar('zzzz').length, 0);
});

test('contexto: el perfil va siempre, lo demás solo si es relevante', async () => {
  const { mem } = nueva();
  mem.recordar({ texto: 'Se llama Alex y vive en USA', tipo: 'perfil' });
  mem.recordar({ texto: 'Su Raspberry Pi 5 está en 10.0.0.5', tipo: 'hecho' });
  mem.recordar({ texto: 'Le gusta el American Truck Simulator', tipo: 'preferencia' });
  const c = await mem.contexto('reinicia la raspberry');
  assert.match(c, /Alex/); assert.match(c, /10\.0\.0/); assert.doesNotMatch(c, /Truck Simulator/);
  assert.match(await mem.contexto('hola'), /Alex/);
});

test('bloquea secretos, corrige con reemplaza y olvida', () => {
  const { mem } = nueva();
  assert.throws(() => mem.recordar({ texto: 'su api key: sk-abcdefghijklmnopqrstuv' }), /secretos/);
  assert.throws(() => mem.recordar({ texto: 'password = hunter2222' }), /secretos/);
  const m = mem.recordar({ texto: 'Su color favorito es el verde', tipo: 'preferencia' });
  mem.recordar({ texto: 'Su color favorito ahora es el naranja', reemplaza: m.id, tipo: 'preferencia' });
  assert.strictEqual(mem.lista().length, 1);
  assert.match(mem.lista()[0].texto, /naranja/);
  assert.ok(mem.olvidar(m.id)); assert.strictEqual(mem.lista().length, 0);
});

test('historial: encuentra lo hablado en otras sesiones', () => {
  const { dir } = nueva();
  fs.mkdirSync(path.join(dir, 'sesiones'));
  fs.writeFileSync(path.join(dir, 'sesiones', 'abc123.jsonl'), [
    { role: 'user', content: 'el pedido de frenos para el Peterbilt llega el viernes', t: Date.now() - 86400_000 },
    { role: 'tool', content: 'frenos frenos', t: Date.now() },
    { role: 'user', content: 'otra cosa sin relación', t: Date.now() },
  ].map(x => JSON.stringify(x)).join('\n'));
  const r = buscarHistorial({ cfg: { dir }, consulta: '¿cuándo llegan los frenos?' });
  assert.strictEqual(r.length, 1);
  assert.match(r[0].texto, /viernes/);
});

test('agente: la memoria entra en el system prompt de cualquier modelo', async () => {
  const http = require('http');
  const cuerpos = [];
  const srv = http.createServer((q, s) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', () => { cuerpos.push(JSON.parse(b)); s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] })); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ modeloPorDefecto: 'f/m', proveedores: { f: { tipo: 'openai', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, local: true } } }));
  const n = require('../index').crearNucleo({ dir });
  n.memoria.recordar({ texto: 'Tiene un Kenworth azul', tipo: 'perfil' });
  await n.enviar(n.sesiones.crear({ cwd: os.tmpdir() }), 'hola');
  assert.match(cuerpos[0].messages[0].content, /Kenworth azul/);
  srv.close();
});

// embedder falso: cada "concepto" es una dimensión, así se prueba la búsqueda por significado sin Ollama
const CONCEPTOS = [['camion', 'camiones', 'trailer', 'trailers', 'tráilers', 'taller', 'reparación', 'mecánico'], ['helado', 'postre', 'chocolate'], ['raspberry', 'servidor', 'pi']];
const falso = (fallar = false) => ({
  id: 'falso/v1', llamadas: 0,
  async embeber(textos) {
    this.llamadas++;
    if (fallar) throw new Error('caído');
    return textos.map(t => { const p = t.toLowerCase().split(/[^a-záéíóúñ]+/); return normalizar([...CONCEPTOS.map(c => p.filter(x => c.includes(x)).length), 0.05]); });
  },
});

test('semántica: encuentra por significado aunque no compartan palabras', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  const mem = crearMemoria({ cfg: { dir }, embedder: falso() });
  mem.recordar({ texto: 'Tiene un taller de camiones', tipo: 'proyecto' });
  mem.recordar({ texto: 'Le encanta el helado de chocolate', tipo: 'preferencia' });
  assert.strictEqual(mem.buscar('reparación de tráilers').length, 0);          // la léxica no lo ve
  const r = await mem.buscarH('reparación de tráilers');
  assert.strictEqual(r.length, 1); assert.match(r[0].texto, /camiones/);
  assert.match(await mem.contexto('quiero un postre'), /helado/);
  assert.ok(fs.existsSync(path.join(dir, 'memoria_vec.json')));
  // al olvidar se borra también su vector
  mem.olvidar(r[0].id); await mem.indexar();
  assert.strictEqual(mem.semantica().indexados, 1);
});

test('semántica: si los embeddings fallan, cae a la búsqueda léxica', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'));
  const mem = crearMemoria({ cfg: { dir }, embedder: falso(true) });
  mem.recordar({ texto: 'Su Raspberry Pi 5 está en 10.0.0.5', tipo: 'hecho' });
  assert.match((await mem.buscarH('la raspberry'))[0].texto, /10.0.0.5/);
});
