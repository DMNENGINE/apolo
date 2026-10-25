// SSE con cierre explicito: ninguna llamada parcial a herramientas se ejecuta.
async function leerStream(res, tipo, onDelta = () => {}) {
  const decoder = new TextDecoder(); let buffer = '', bytes = 0, fin = false;
  const j = tipo === 'anthropic' ? { content: [], usage: {} } : tipo === 'gemini' ? { candidates: [{ content: { parts: [] } }] } : { choices: [{ message: { content: '', tool_calls: [] } }], usage: {} };
  const tools = new Map();
  function evento(texto) {
    const datos = texto.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!datos) return;
    if (datos === '[DONE]') { fin = true; return; }
    const x = JSON.parse(datos);
    if (x.error || x.type === 'error' || x.type === 'response.failed') {
      const err = x.error || x.response?.error || x;
      throw Object.assign(new Error(String(err.message || err.type || 'error de streaming')), { status: /rate.limit/i.test(err.type) ? 429 : /overload/i.test(err.type) ? 503 : 500 });
    }
    if (tipo === 'responses') {
      if (x.type === 'response.output_text.delta') onDelta(x.delta || '');
      if (x.type === 'response.completed') { Object.assign(j, x.response); fin = true; }
    } else if (tipo === 'anthropic') {
      if (x.type === 'message_start') Object.assign(j, x.message, { content: [] });
      if (x.type === 'content_block_start') j.content[x.index] = { ...x.content_block };
      if (x.type === 'content_block_delta') {
        const b = j.content[x.index]; if (!b) throw new Error('bloque SSE fuera de orden');
        if (x.delta.type === 'text_delta') { b.text = (b.text || '') + x.delta.text; onDelta(x.delta.text); }
        if (x.delta.type === 'input_json_delta') b._json = (b._json || '') + x.delta.partial_json;
      }
      if (x.type === 'message_delta') { j.usage = { ...j.usage, ...x.usage }; j.stop_reason = x.delta?.stop_reason; }
      if (x.type === 'message_stop') fin = true;
    } else if (tipo === 'gemini') {
      const c = x.candidates?.[0];
      for (const p of c?.content?.parts || []) { j.candidates[0].content.parts.push(p); if (p.text && !p.thought) onDelta(p.text); }
      if (c?.finishReason) { j.candidates[0].finishReason = c.finishReason; fin = true; }
      if (x.usageMetadata) j.usageMetadata = x.usageMetadata;
    } else {
      const c = x.choices?.[0]; const d = c?.delta;
      if (x.model) j.model = x.model;
      if (x.usage) j.usage = x.usage;
      if (d?.content) { j.choices[0].message.content += d.content; onDelta(d.content); }
      for (const t of d?.tool_calls || []) {
        const anterior = tools.get(t.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (t.id) anterior.id = t.id;
        if (t.function?.name) anterior.function.name += t.function.name;
        if (t.function?.arguments) anterior.function.arguments += t.function.arguments;
        tools.set(t.index, anterior);
      }
      if (c?.finish_reason) { j.choices[0].finish_reason = c.finish_reason; fin = true; }
    }
  }
  for await (const chunk of res.body) {
    bytes += chunk.length; if (bytes > 8 * 1024 * 1024) throw new Error('stream supera 8 MiB');
    buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
    let i; while ((i = buffer.indexOf('\n\n')) >= 0) { evento(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
  }
  buffer += decoder.decode(); if (buffer.trim()) evento(buffer);
  if (!fin) throw Object.assign(new Error('stream interrumpido antes del cierre'), { code: 'ECONNRESET' });
  if (tipo === 'openai') j.choices[0].message.tool_calls = [...tools.values()];
  if (tipo === 'anthropic') for (const b of j.content) if (b?._json) { b.input = JSON.parse(b._json); delete b._json; }
  return j;
}
module.exports = { leerStream };
