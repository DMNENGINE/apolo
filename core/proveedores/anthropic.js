// Adaptador para la API de Anthropic (Messages).
const { pedir } = require('./http');

function aMensajes(mensajes) {
  const out = [];
  const push = (role, bloque) => {
    const ult = out[out.length - 1];
    if (ult && ult.role === role) ult.content.push(bloque); else out.push({ role, content: [bloque] });
  };
  const imgs = l => (l || []).map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.datos } }));
  for (const m of mensajes) {
    if (m.role === 'tool') push('user', { type: 'tool_result', tool_use_id: m.toolCallId, content: m.imagenes?.length ? [{ type: 'text', text: m.content || '(sin texto)' }, ...imgs(m.imagenes)] : m.content });
    else if (m.role === 'user' && m.imagenes?.length) { push('user', { type: 'text', text: m.content || '' }); for (const b of imgs(m.imagenes)) push('user', b); }
    else if (m.role === 'assistant') {
      if (m.content) push('assistant', { type: 'text', text: m.content });
      for (const c of m.toolCalls || []) push('assistant', { type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
    } else push('user', { type: 'text', text: m.content });
  }
  return out;
}

module.exports = (cfg) => ({
  async chat({ model, system, mensajes, herramientas, signal }) {
    const body = { model, max_tokens: cfg.maxTokens || 8192, messages: aMensajes(mensajes) };
    if (system) body.system = system;
    if (herramientas?.length) body.tools = herramientas.map(h => ({ name: h.nombre, description: h.descripcion, input_schema: h.parametros }));
    const j = await pedir(`${cfg.baseUrl}/messages`, {
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }, body, signal,
    });
    const bloques = j.content || [];
    return {
      texto: bloques.filter(b => b.type === 'text').map(b => b.text).join(''),
      toolCalls: bloques.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
      uso: { entrada: j.usage?.input_tokens || 0, salida: j.usage?.output_tokens || 0 },
    };
  },
  async modelos() {
    const j = await pedir(`${cfg.baseUrl}/models`, { method: 'GET', headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' } });
    return (j.data || []).map(m => m.id);
  },
});
