// Embeddings para la memoria semántica: busca por significado, no solo por palabras.
// cfg.memoria.embeddings = 'proveedor/modelo' (API compatible OpenAI /embeddings; por defecto Ollama local) o null para apagarlo.
// Si el servicio no responde, la memoria sigue funcionando con la búsqueda léxica.

// embeddinggemma rinde mejor con estos prefijos (consulta vs. documento); a otros modelos no les molestan
const PREFIJO = { consulta: 'task: search result | query: ', documento: 'title: none | text: ' };

function crearEmbedder(cfg) {
  const id = cfg.memoria?.embeddings;
  if (!id) return null;
  const i = id.indexOf('/');
  const p = cfg.proveedores[id.slice(0, i)], modelo = id.slice(i + 1);
  if (!p || p.tipo !== 'openai') return null;
  let caidoHasta = 0;                                   // tras un fallo, no reintentar en 60 s (no frenar cada mensaje)

  async function embeber(textos, { tipo = 'documento', timeout = 8000 } = {}) {
    if (Date.now() < caidoHasta) throw new Error('embeddings no disponibles');
    try {
      const r = await fetch(p.baseUrl.replace(/\/$/, '') + '/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(p.apiKey ? { authorization: 'Bearer ' + p.apiKey } : {}) },
        body: JSON.stringify({ model: modelo, input: textos.map(t => PREFIJO[tipo] + t) }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!r.ok) throw new Error(`embeddings HTTP ${r.status}`);
      const j = await r.json();
      return j.data.sort((a, b) => a.index - b.index).map(d => normalizar(d.embedding));
    } catch (e) {
      // un timeout suele ser el modelo cargándose en frío: esa petición sigue y lo calienta, no lo damos por caído
      if (e.name !== 'TimeoutError' && e.name !== 'AbortError') caidoHasta = Date.now() + 60_000;
      throw e;
    }
  }
  return { id, embeber };
}

function normalizar(v) {
  let n = 0; for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, x => x / n);
}

const coseno = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };   // ya normalizados
const aBase64 = v => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
const deBase64 = s => new Float32Array(Uint8Array.from(Buffer.from(s, 'base64')).buffer);   // copia: el Buffer puede no estar alineado a 4

module.exports = { crearEmbedder, normalizar, coseno, aBase64, deBase64 };
