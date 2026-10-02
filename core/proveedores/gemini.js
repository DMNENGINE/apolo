// Adaptador para Google Gemini (generateContent).
const { pedir } = require('./http');

// Gemini acepta un subconjunto de JSON Schema: quitamos lo que no entiende.
function limpiarEsquema(s) {
  if (Array.isArray(s)) return s.map(limpiarEsquema);
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) if (!['additionalProperties', '$schema', 'default'].includes(k)) o[k] = limpiarEsquema(v);
  return o;
}

function aContenidos(mensajes) {
  const out = [];
  const nombres = {};                                   // toolCallId -> nombre de función
  const push = (role, part) => {
    const ult = out[out.length - 1];
    if (ult && ult.role === role) ult.parts.push(part); else out.push({ role, parts: [part] });
  };
  for (const m of mensajes) {
    if (m.role === 'tool') {
      push('user', { functionResponse: { name: nombres[m.toolCallId] || m.name, response: { resultado: m.content } } });
      for (const i of m.imagenes || []) push('user', { inlineData: { mimeType: i.mime, data: i.datos } });
    } else if (m.role === 'user' && m.imagenes?.length) {
      push('user', { text: m.content || '' });
      for (const i of m.imagenes) push('user', { inlineData: { mimeType: i.mime, data: i.datos } });
    }
    else if (m.role === 'assistant') {
      if (m.content) push('model', { text: m.content });
      for (const c of m.toolCalls || []) {
        nombres[c.id] = c.name;
        push('model', { functionCall: { name: c.name, args: c.args || {} }, ...(c.extra?.thoughtSignature ? { thoughtSignature: c.extra.thoughtSignature } : {}) });
      }
    } else push('user', { text: m.content });
  }
  return out;
}

async function pedirGemini(url, opts, reintentos = 2) {
  for (let i = 0; i <= reintentos; i++) {
    try {
      return await pedir(url, opts);
    } catch (e) {
      if (/503|high demand|temporarily unavailable/i.test(e.message) && i < reintentos) {
        await new Promise(r => setTimeout(r, 1200 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
}

module.exports = (cfg) => ({
  async chat({ model, system, mensajes, herramientas, signal, formatoJSON }) {
    const body = { contents: aContenidos(mensajes) };
    if (formatoJSON && !herramientas?.length) body.generationConfig = { responseMimeType: 'application/json' };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (herramientas?.length) body.tools = [{ functionDeclarations: herramientas.map(h => ({ name: h.nombre, description: h.descripcion, parameters: limpiarEsquema(h.parametros) })) }];
    
    let j;
    try {
      j = await pedirGemini(`${cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        headers: { 'x-goog-api-key': cfg.apiKey }, body, signal,
      });
    } catch (e) {
      // Si el modelo principal está saturado (503), recurrir a un modelo lite de reserva
      if (/503|high demand/i.test(e.message) && !model.includes('lite')) {
        const fallback = 'gemini-3.5-flash-lite';
        j = await pedirGemini(`${cfg.baseUrl}/models/${fallback}:generateContent`, {
          headers: { 'x-goog-api-key': cfg.apiKey }, body, signal,
        });
      } else {
        throw e;
      }
    }
    const parts = j.candidates?.[0]?.content?.parts || [];
    return {
      texto: parts.filter(p => p.text && !p.thought).map(p => p.text).join(''),
      toolCalls: parts.filter(p => p.functionCall).map((p, i) => ({
        id: `gem_${Date.now()}_${i}`, name: p.functionCall.name, args: p.functionCall.args || {},
        extra: p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : undefined,
      })),
      uso: { entrada: j.usageMetadata?.promptTokenCount || 0, salida: j.usageMetadata?.candidatesTokenCount || 0 },
    };
  },
  async modelos() {
    const j = await pedir(`${cfg.baseUrl}/models`, { method: 'GET', headers: { 'x-goog-api-key': cfg.apiKey } });
    return (j.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  },
});
