// Salida estructurada (JSON con esquema) con CUALQUIER modelo: lo pide en el prompt, activa el modo JSON
// nativo donde existe (OpenAI/Ollama/Gemini), extrae el objeto, valida lo básico y reintenta una vez.

// saca el primer objeto JSON de un texto (con o sin ```json, con texto alrededor)
function extraerJSON(texto) {
  const t = String(texto || '').replace(/```(?:json)?/gi, '');
  const ini = t.indexOf('{'); if (ini < 0) return null;
  let prof = 0, enCadena = false, esc = false;
  for (let i = ini; i < t.length; i++) {
    const c = t[i];
    if (enCadena) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enCadena = false; continue; }
    if (c === '"') enCadena = true;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) { try { return JSON.parse(t.slice(ini, i + 1)); } catch { return null; } }
  }
  return null;
}

// validación ligera: tipos, requeridos y enums (suficiente para detectar respuestas rotas)
function validar(v, s, ruta = '') {
  if (!s) return '';
  const tipo = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  if (s.type === 'integer' ? !Number.isInteger(v) : s.type === 'number' ? typeof v !== 'number' : s.type && s.type !== tipo) return `${ruta || 'raíz'}: se esperaba ${s.type}`;
  if (s.enum && !s.enum.includes(v)) return `${ruta}: valor fuera de ${s.enum.join('/')}`;
  if (s.type === 'object') {
    for (const k of s.required || []) if (!(k in v)) return `${ruta}.${k}: falta`;
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in v) { const e = validar(v[k], sub, `${ruta}.${k}`); if (e) return e; }
  }
  if (s.type === 'array' && s.items) for (let i = 0; i < v.length; i++) { const e = validar(v[i], s.items, `${ruta}[${i}]`); if (e) return e; }
  return '';
}

function crearEstructurado(proveedores) {
  // imagenes (opcional): [{ mime, datos(base64) }] → van con la petición (modelos con visión)
  return async function generarJSON({ modelo, system, prompt, schema, signal, imagenes }) {
    const { api, model } = proveedores.resolver(modelo);
    const sys = `${system || ''}\n\nResponde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después y sin \`\`\`. Debe cumplir este JSON Schema:\n${JSON.stringify(schema)}`;
    let pedido = prompt, ultimoError = '';
    for (let intento = 0; intento < 2; intento++) {
      const r = await api.chat({ model, system: sys, mensajes: [{ role: 'user', content: pedido, ...(imagenes?.length ? { imagenes } : {}) }], herramientas: [], formatoJSON: true, signal });
      const j = extraerJSON(r.texto);
      ultimoError = j ? validar(j, schema) : 'no era JSON';
      if (j && !ultimoError) return { datos: j, uso: r.uso };
      pedido = `${prompt}\n\n(Tu respuesta anterior no sirvió: ${ultimoError}. Devuelve solo el JSON correcto.)`;
    }
    throw new Error(`el modelo no devolvió JSON válido (${ultimoError})`);
  };
}

module.exports = { crearEstructurado, extraerJSON, validar };
