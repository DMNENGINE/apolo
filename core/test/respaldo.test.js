// Respaldo de modelos (core/proveedores): si el modelo pedido no se puede usar en este PC (sin Ollama, Ollama sin ese modelo,
// sin API key) se usa otro que sí; sin ninguno, error claro. listo() espera a la primera comprobación.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { crearProveedores } = require('../proveedores');

async function servidor(t, modelos) {
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: modelos.map(id => ({ id })) })); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  t.after(() => { srv.closeAllConnections?.(); srv.close(); });
  return `http://127.0.0.1:${srv.address().port}/v1`;
}
const CAIDO = 'http://127.0.0.1:9/v1';                     // puerto cerrado: "Ollama no instalado"

async function montar({ ollama, groqKey = 'gsk_x' }) {
  const P = crearProveedores({ proveedores: {
    ollama: { tipo: 'openai', baseUrl: ollama, apiKey: 'ollama', local: true },
    groq: { tipo: 'openai', baseUrl: 'https://api.groq.com/openai/v1', apiKey: groqKey },
  } });
  await P.comprobar();                                     // en los tests no se comprueba solo
  const usa = id => { const r = P.resolver(id); return `${r.nombre}/${r.model}`; };
  return { P, usa };
}

test('Ollama con el modelo: se usa tal cual (con o sin :latest)', async t => {
  const { P, usa } = await montar({ ollama: await servidor(t, ['qwen3.6:latest', 'gemma4:31b-cloud', 'embeddinggemma:latest']) });
  assert.strictEqual(usa('ollama/qwen3.6'), 'ollama/qwen3.6');
  assert.strictEqual(usa('ollama/gemma4:31b-cloud'), 'ollama/gemma4:31b-cloud');
  assert.ok(P.disponible('ollama/qwen3.6') && !P.disponible('ollama/llama3'));
  assert.strictEqual(P.efectivo('ollama/qwen3.6'), 'ollama/qwen3.6');
});

test('Ollama sin ese modelo: otro modelo suyo ("auto"); si solo tiene embeddings, otro proveedor', async t => {
  const a = await montar({ ollama: await servidor(t, ['llama3.2:latest']) });
  assert.strictEqual(a.usa('ollama/qwen3.6'), 'ollama/auto');
  const b = await montar({ ollama: await servidor(t, ['embeddinggemma:latest']) });
  assert.strictEqual(b.usa('ollama/qwen3.6'), 'groq/auto');
});

test('sin Ollama: el primero listo; el que no tiene key tampoco vale', async () => {
  const { P, usa } = await montar({ ollama: CAIDO });
  assert.strictEqual(usa('ollama/qwen3.6'), 'groq/auto');
  assert.strictEqual(usa('groq/llama-3.3-70b'), 'groq/llama-3.3-70b');
  assert.ok(!P.disponible('ollama/qwen3.6'));
  assert.strictEqual(P.resolver('ollama/qwen3.6', { sinRespaldo: true }).nombre, 'ollama');   // el consejo pide el exacto
});

test('ninguno disponible: error claro (no un "fetch failed" críptico) y efectivo = null', async () => {
  const { P } = await montar({ ollama: CAIDO, groqKey: '' });
  assert.throws(() => P.resolver('ollama/qwen3.6'), /no hay ningún modelo disponible en este equipo/);
  assert.strictEqual(P.efectivo('ollama/qwen3.6'), null);
});

test('listo() no se queda colgado', async () => {
  const P = crearProveedores({ proveedores: {} });
  await P.listo();
});
