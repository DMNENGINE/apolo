// Adaptador para la API "Responses" (formato nuevo de OpenAI): POST {baseUrl}/responses.
// La usa Perplexity (su Agent API: /v1/responses es el alias compatible con OpenAI) y vale para otros que la adopten.
// Mismo formato interno de mensajes que el resto de adaptadores; las herramientas van como "function" tools.
// cfg.presets: nombres de modelo que en realidad son "presets" del proveedor (Perplexity: fast/low/medium/high/xhigh).
// cfg.herramientasNativas: tools propias del proveedor que se añaden siempre (Perplexity: web_search).
const { pedir } = require('./http');

function aEntrada(mensajes) {
  const out = [];
  for (const m of mensajes) {
    if (m.role === 'tool') { out.push({ type: 'function_call_output', call_id: m.toolCallId, output: String(m.content ?? '') }); continue; }
    if (m.role === 'assistant') {
      if (m.content) out.push({ role: 'assistant', content: m.content });
      for (const c of m.toolCalls || []) out.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args || {}) });
      continue;
    }
    if (m.imagenes?.length) out.push({ role: 'user', content: [{ type: 'input_text', text: m.content || '' }, ...m.imagenes.map(i => ({ type: 'input_image', image_url: `data:${i.mime};base64,${i.datos}` }))] });
    else out.push({ role: m.role === 'system' ? 'system' : 'user', content: m.content || '' });
  }
  return out;
}
const parseArgs = s => { if (s && typeof s === 'object') return s; try { return JSON.parse(s || '{}'); } catch { return { _crudo: s }; } };

module.exports = (cfg) => {
  const presets = cfg.presets || [];
  const api = {
    async chat({ model, system, mensajes, herramientas, signal, formatoJSON }) {
      if (!model || model === 'auto') model = cfg.porDefecto || presets[0] || cfg.modelos?.[0];
      const body = { input: aEntrada(mensajes) };
      if (presets.includes(model)) body.preset = model; else body.model = model;
      if (system) body.instructions = formatoJSON ? `${system}\n\nResponde solo con JSON.` : system;
      const tools = [...(cfg.herramientasNativas || []).map(t => ({ ...t }))];
      if (herramientas?.length) tools.push(...herramientas.map(h => ({ type: 'function', name: h.nombre, description: h.descripcion, parameters: h.parametros })));
      if (tools.length) body.tools = tools;
      const j = await pedir(`${cfg.baseUrl}/responses`, { headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}, body, signal });
      const salida = j.output || [];
      const texto = j.output_text || salida.filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text' || c.text).map(c => c.text).join('');
      const toolCalls = salida.filter(o => o.type === 'function_call').map((c, i) => ({ id: c.call_id || c.id || `call_${Date.now()}_${i}`, name: c.name, args: parseArgs(c.arguments) }));
      return { texto: texto || '', toolCalls, uso: { entrada: j.usage?.input_tokens || 0, salida: j.usage?.output_tokens || 0 } };
    },
    async modelos() { return [...presets, ...(cfg.modelos || []).filter(m => !presets.includes(m))]; },
  };
  return api;
};
