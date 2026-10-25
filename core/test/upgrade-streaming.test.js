const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const { leerStream } = require('../proveedores/streaming');
const { pedir } = require('../proveedores/http');
const { validarCampo } = require('../config-motor');
const grupos = require('../herramientas-grupos');
function stream(eventos, partes = 3) {
  const bytes = Buffer.from(eventos.map(e => 'data: ' + (typeof e === 'string' ? e : JSON.stringify(e)) + '\r\n\r\n').join(''));
  const chunks = []; for (let i = 0; i < bytes.length; i += partes) chunks.push(bytes.subarray(i, i + partes));
  return { body: Readable.from(chunks) };
}
test('stream: OpenAI recompone UTF8, argumentos parciales y consumo', async () => {
  const texto = []; const j = await leerStream(stream([
    { choices: [{ delta: { content: 'Español 🌞' } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'leer', arguments: '{"ruta":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] }, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }, '[DONE]'
  ]), 'openai', t => texto.push(t));
  assert.equal(texto.join(''), 'Español 🌞'); assert.equal(j.choices[0].message.tool_calls[0].function.arguments, '{"ruta":"x"}'); assert.equal(j.usage.prompt_tokens, 5);
});
test('stream: Anthropic conserva bloques y no interpreta JSON hasta el cierre', async () => {
  const j = await leerStream(stream([
    { type: 'message_start', message: { usage: { input_tokens: 7 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'a', name: 'leer', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ruta":"x"}' } },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } }, { type: 'message_stop' }
  ]), 'anthropic');
  assert.deepEqual(j.content[0].input, { ruta: 'x' }); assert.equal(j.usage.input_tokens, 7); assert.equal(j.usage.output_tokens, 3);
});
test('stream: Gemini conserva firmas y texto por fragmentos', async () => {
  const j = await leerStream(stream([{ candidates: [{ content: { parts: [{ text: 'hola' }, { functionCall: { name: 'leer', args: {} }, thoughtSignature: 'firma' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 9 } }]), 'gemini');
  assert.equal(j.candidates[0].content.parts[1].thoughtSignature, 'firma'); assert.equal(j.usageMetadata.promptTokenCount, 9);
});
test('stream: Responses requiere el evento final confirmado', async () => {
  const t = []; const j = await leerStream(stream([{ type: 'response.output_text.delta', delta: 'hola' }, { type: 'response.completed', response: { output_text: 'hola', output: [], usage: { input_tokens: 2 } } }]), 'responses', x => t.push(x));
  assert.equal(j.output_text, 'hola'); assert.deepEqual(t, ['hola']);
  await assert.rejects(leerStream(stream([{ type: 'response.output_text.delta', delta: 'sin terminar' }]), 'responses'), /interrumpido/);
});
test('stream: una conexion truncada nunca entrega herramientas parciales', async () => {
  await assert.rejects(leerStream(stream([{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'escribir', arguments: '{' } }] } }] }]), 'openai'), /interrumpido/);
});
test('stream: un error de saturacion conserva su clasificacion', async () => {
  await assert.rejects(leerStream(stream([{ type: 'error', error: { type: 'overloaded_error', message: 'ocupado' } }]), 'anthropic'), e => e.status === 503);
});
test('HTTP: conserva estado y Retry-After sin revelar claves', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: 'ocupado', type: 'rate_limit' } }), { status: 429, headers: { 'retry-after': '2' } }));
  await assert.rejects(pedir('https://fixture.invalid/api'), e => e.status === 429 && e.retryAfterMs === 2000);
});
test('configuracion de limites rechaza numeros invalidos y campos desconocidos', () => {
  assert.throws(() => validarCampo('presupuesto', { maxTokens: -1 })); assert.throws(() => validarCampo('agente', { streaming: 'si' }));
  assert.throws(() => validarCampo('recuperacion', { permiso: 'todo' }));
  assert.deepEqual(validarCampo('presupuesto', { maxTokens: 10000 }), { maxTokens: 10000 });
});
test('herramientas: expiran los grupos y el catalogo respeta la lista permitida', async () => {
  const s = { turnosAgente: 5, gruposCargados: ['correo'], gruposActividad: { correo: 1 }, mensajes: [], herramientasPermitidas: ['permitida'] };
  assert.equal(grupos.gruposActivos(s, 'hola').has('correo'), false);
  const h = grupos.crearBuscar(() => [{ nombre: 'permitida', descripcion: 'leer camiones' }, { nombre: 'prohibida', descripcion: 'camiones secretos' }]);
  const r = await h.ejecutar({ consulta: 'camiones' }, { sesion: s }); assert.match(r, /permitida/); assert.ok(!r.includes('prohibida'));
});
test('stream: la redaccion oculta prefijos de secretos antes del ultimo fragmento', () => {
  const s = require('../seguridad'), secreto = 'SECRETO_FICTICIO_FRAGMENTADO_123456'; s.registrarSecreto(secreto);
  assert.equal(s.redactarParcial('texto ' + secreto.slice(0, 16)), 'texto [REDACTADO]');
  assert.equal(s.redactarParcial('sk-abc'), '[REDACTADO]'); s.olvidarSecreto(secreto);
});
