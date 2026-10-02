// Registro de proveedores. Un modelo se escribe "proveedor/modelo", ej: "ollama/qwen3.6", "openai/gpt-4.1-mini",
// "anthropic/claude-sonnet-5-5", "gemini/gemini-2.5-flash", "claudecode/haiku". El modelo puede contener "/" (OpenRouter).
const TIPOS = {
  openai: require('./openai'),
  anthropic: require('./anthropic'),
  gemini: require('./gemini'),
  'claude-cli': require('./claude-cli'),
  'codex-cli': require('./codex-cli'),
};
const { execFile } = require('child_process');

// respaldo: si el proveedor pedido no está disponible en ESTE equipo (sin Ollama, sin key, CLI sin instalar o sin sesión),
// se usa el primero que sí lo esté, en este orden y con este modelo. Así APOLO funciona en cualquier PC sin tocar nada.
const RESPALDO = [['chatgpt', 'default'], ['claudecode', 'haiku'], ['anthropic', 'claude-haiku-4-5-20251001'], ['openai', 'gpt-4.1-mini'],
  ['gemini', 'gemini-3.8-flash'], ['ollama', 'gemma4:31b-cloud']];
const hayComando = cmd => new Promise(ok => execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true, timeout: 8000 }, e => ok(!e)));

function crearProveedores(cfg) {
  const cache = {};
  const listos = {};                                       // nombre → true/false (undefined = aún sin comprobar)
  let avisado = '';
  async function comprobar() {
    for (const [nombre, p] of Object.entries(cfg.proveedores)) {
      try {
        if (p.tipo === 'claude-cli') listos[nombre] = await hayComando(p.comando || 'claude');
        else if (p.tipo === 'codex-cli') listos[nombre] = (await TIPOS['codex-cli'].estadoAsync()).sesion;
        else if (p.local) listos[nombre] = await fetch(p.baseUrl.replace(/\/v1\/?$/, '') + '/api/tags', { signal: AbortSignal.timeout(2500) }).then(r => r.ok).catch(() => false);
        else listos[nombre] = !!p.apiKey;
      } catch { listos[nombre] = false; }
    }
  }
  if (cfg.respaldoAuto !== false && !process.env.NODE_TEST_CONTEXT) {           // en los tests no (no tocar el equipo real)
    comprobar().catch(() => { });
    const t = setInterval(() => comprobar().catch(() => { }), 120_000); t.unref?.();
  }
  function resolver(id, { sinRespaldo = false } = {}) {
    const i = String(id || '').indexOf('/');
    if (i < 1) throw new Error(`modelo "${id}" no válido: usa proveedor/modelo`);
    let nombre = id.slice(0, i), model = id.slice(i + 1);
    if (!sinRespaldo && cfg.respaldoAuto !== false && listos[nombre] === false) {
      const alt = RESPALDO.find(([n]) => n !== nombre && listos[n] && cfg.proveedores[n]);
      if (alt) {
        if (avisado !== nombre + '>' + alt[0]) { avisado = nombre + '>' + alt[0]; console.log(`[proveedores] ${nombre} no está disponible aquí → uso ${alt[0]}/${alt[1]}`); }
        [nombre, model] = alt;
      }
    }
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
      nombre, tipo: p.tipo, listo: listos[nombre] ?? (p.tipo === 'claude-cli' || !!p.local || !!p.apiKey),
    }));
  }
  return { resolver, disponibles, comprobar, listos: () => ({ ...listos }), reset: () => { for (const k of Object.keys(cache)) delete cache[k]; } };
}

module.exports = { crearProveedores };
