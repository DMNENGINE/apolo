// Registro de proveedores. Un modelo se escribe "proveedor/modelo", ej: "ollama/qwen3.6", "openai/gpt-4.1-mini",
// "anthropic/claude-sonnet-5-5", "gemini/gemini-2.5-flash", "claudecode/haiku". El modelo puede contener "/" (OpenRouter).
const TIPOS = {
  openai: require('./openai'),
  anthropic: require('./anthropic'),
  gemini: require('./gemini'),
  'claude-cli': require('./claude-cli'),
};

function crearProveedores(cfg) {
  const cache = {};
  function resolver(id) {
    const i = String(id || '').indexOf('/');
    if (i < 1) throw new Error(`modelo "${id}" no válido: usa proveedor/modelo`);
    const nombre = id.slice(0, i), model = id.slice(i + 1);
    const p = cfg.proveedores[nombre];
    if (!p) throw new Error(`proveedor "${nombre}" no configurado`);
    const crear = TIPOS[p.tipo];
    if (!crear) throw new Error(`tipo de proveedor "${p.tipo}" desconocido`);
    if (['anthropic', 'gemini'].includes(p.tipo) && !p.apiKey) throw new Error(`falta la API key de ${nombre} (config.json o ${p.env})`);
    if (p.tipo === 'openai' && !p.apiKey && !p.local) throw new Error(`falta la API key de ${nombre} (config.json o ${p.env})`);
    return { nombre, model, api: cache[nombre] ||= crear(p) };
  }
  function disponibles() {
    return Object.entries(cfg.proveedores).map(([nombre, p]) => ({
      nombre, tipo: p.tipo, listo: p.tipo === 'claude-cli' || !!p.local || !!p.apiKey,
    }));
  }
  return { resolver, disponibles, reset: () => { for (const k of Object.keys(cache)) delete cache[k]; } };
}

module.exports = { crearProveedores };
