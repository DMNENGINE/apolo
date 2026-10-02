// Adaptador para APIs compatibles con OpenAI Chat Completions (OpenAI, Ollama, OpenRouter, Groq, LM Studio, DeepSeek...).
// Formato interno de mensajes (común a todos los adaptadores):
//   { role: 'user'|'assistant'|'tool', content: string, toolCalls?: [{id,name,args,extra?}], toolCallId?, name? }
const { pedir } = require('./http');

// imágenes: { imagenes: [{ mime, datos(base64) }] } en mensajes de usuario o de herramienta.
// Chat Completions no admite imágenes en un mensaje "tool": van en un mensaje de usuario justo después de los resultados.
const partesImagen = imgs => imgs.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.datos}` } }));

function aMensajes(system, mensajes) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  let pendientes = [];
  const soltar = () => {
    if (!pendientes.length) return;
    out.push({ role: 'user', content: [{ type: 'text', text: '(Capturas devueltas por las herramientas anteriores.)' }, ...partesImagen(pendientes)] });
    pendientes = [];
  };
  for (const m of mensajes) {
    if (m.role !== 'tool') soltar();
    if (m.role === 'tool') { out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content }); if (m.imagenes?.length) pendientes.push(...m.imagenes); }
    else if (m.role === 'user' && m.imagenes?.length) out.push({ role: 'user', content: [{ type: 'text', text: m.content || '' }, ...partesImagen(m.imagenes)] });
    else if (m.role === 'assistant' && m.toolCalls?.length) out.push({
      role: 'assistant', content: m.content || null,
      tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })),
    });
    else out.push({ role: m.role, content: m.content });
  }
  soltar();
  return out;
}

function parseArgs(s) {
  if (s && typeof s === 'object') return s;
  try { return JSON.parse(s || '{}'); } catch { return { _crudo: s }; }
}

// modelos que no sirven para chatear (para elegir el de "auto")
const NO_CHAT = /embed|whisper|tts|audio|speech|transcri|image|dall|vision-only|moderation|guard|rerank|ocr|search-preview|realtime|instruct-?\d*k?$/i;

module.exports = (cfg) => {
  let autoCache = null, autoT = 0;
  // "auto": pregunta al proveedor qué modelos tiene y elige el principal (cfg.preferido = regex en orden de preferencia)
  async function elegirAuto(api) {
    if (autoCache && Date.now() - autoT < 6 * 3600_000) return autoCache;
    const todos = (await api.modelos()).filter(m => !NO_CHAT.test(m));
    if (!todos.length) throw new Error('el proveedor no devolvió ningún modelo de chat');
    let elegido = null;
    for (const p of [].concat(cfg.preferido || [])) { const re = new RegExp(p, 'i'); elegido = todos.filter(m => re.test(m)).sort().reverse()[0]; if (elegido) break; }
    autoCache = elegido || todos[0]; autoT = Date.now();
    return autoCache;
  }
  const api = {
  async chat({ model, system, mensajes, herramientas, signal, formatoJSON }) {
    if (!model || model === 'auto') model = await elegirAuto(api);
    const body = { model, messages: aMensajes(system, mensajes) };
    if (formatoJSON && !herramientas?.length) body.response_format = { type: 'json_object' };
    if (herramientas?.length) body.tools = herramientas.map(h => ({ type: 'function', function: { name: h.nombre, description: h.descripcion, parameters: h.parametros } }));
    const j = await pedir(`${cfg.baseUrl}/chat/completions`, {
      headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}, body, signal,
    });
    const msg = j.choices?.[0]?.message || {};
    return {
      texto: msg.content || '',
      toolCalls: (msg.tool_calls || []).map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, name: c.function?.name, args: parseArgs(c.function?.arguments) })),
      uso: { entrada: j.usage?.prompt_tokens || 0, salida: j.usage?.completion_tokens || 0 },
    };
  },
  async modelos() {
    if (Array.isArray(cfg.modelos) && cfg.modelos.length) return cfg.modelos;   // proveedores sin GET /models (Perplexity)
    const j = await pedir(`${cfg.baseUrl}/models`, { method: 'GET', headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {} });
    return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
  },
  };
  return api;
};
