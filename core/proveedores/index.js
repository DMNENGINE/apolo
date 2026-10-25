// Registro de proveedores. Un modelo se escribe "proveedor/modelo", ej: "ollama/qwen3.6", "openai/gpt-4.1-mini",
// "anthropic/claude-sonnet-5-5", "gemini/gemini-2.5-flash", "claudecode/haiku". El modelo puede contener "/" (OpenRouter).
const TIPOS = {
  openai: require('./openai'),
  anthropic: require('./anthropic'),
  gemini: require('./gemini'),
  'claude-cli': require('./claude-cli'),
  'codex-cli': require('./codex-cli'),
  responses: require('./responses'),
};
const { execFile } = require('child_process');

// respaldo: si el proveedor pedido no está disponible en ESTE equipo (sin Ollama, sin key, CLI sin instalar o sin sesión),
// o es local (Ollama / LM Studio) pero ese modelo no está descargado, se usa otro que sí funcione: primero otro modelo del mismo
// servidor local ("auto" = uno instalado), si no el primero listo de esta lista. Así APOLO funciona en cualquier PC sin tocar nada.
// Antes de la primera comprobación, listo() espera como mucho ESPERA_MS para no llamar a ciegas a un proveedor que no existe.
const RESPALDO = [['chatgpt', 'default'], ['claudecode', 'haiku'], ['anthropic', 'claude-haiku-4-5-20251001'], ['openai', 'gpt-4.1-mini'],
  ['gemini', 'gemini-3.8-flash'], ['deepseek', 'auto'], ['xai', 'auto'], ['groq', 'auto'], ['mistral', 'auto'], ['moonshot', 'auto'], ['zai', 'auto'],
  ['qwen', 'auto'], ['cerebras', 'auto'], ['together', 'auto'], ['ollama', 'auto'], ['lmstudio', 'auto']];
const ESPERA_MS = 4000;
const NINGUNO = 'no hay ningún modelo disponible en este equipo. Conecta uno en el panel → Configuración → Modelos ' +
  '(Claude Code, ChatGPT, una API key gratis de Gemini o Groq, u Ollama con algún modelo descargado)';
// "qwen3.6" y "qwen3.6:latest" son el mismo modelo en Ollama
const tag = m => (String(m).includes(':') ? String(m) : `${m}:latest`).toLowerCase();
const hayComando = cmd => new Promise(ok => execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true, timeout: 8000 }, e => ok(!e)));

function crearProveedores(cfg) {
  const cache = {};
  const listos = {};                                       // nombre → true/false (undefined = aún sin comprobar)
  let avisado = '';
  const externos = {};                                     // proveedores aportados por plugins: nombre → { api, plugin, modelos }
  const instalados = {};                                   // servidores locales: nombre → modelos descargados (en minúsculas, con tag)
  // todos a la vez (antes en fila: con Codex tardando, Ollama se comprobaba ~20 s tarde y la isla llamaba a ciegas)
  async function comprobar() {
    await Promise.all(Object.entries(cfg.proveedores).map(async ([nombre, p]) => {
      try {
        if (p.tipo === 'claude-cli') listos[nombre] = await hayComando(p.comando || 'claude');
        else if (p.tipo === 'codex-cli') listos[nombre] = (await TIPOS['codex-cli'].estadoAsync()).sesion;
        else if (p.local) {
          const j = await fetch(p.baseUrl.replace(/\/$/, '') + '/models', { signal: AbortSignal.timeout(2500) }).then(r => (r.ok ? r.json() : null)).catch(() => null);
          listos[nombre] = !!j;
          if (j) instalados[nombre] = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).map(tag);
          else delete instalados[nombre];
        }
        else listos[nombre] = !!p.apiKey;
      } catch { listos[nombre] = false; }
    }));
  }
  let primera = Promise.resolve();
  if (cfg.respaldoAuto !== false && !process.env.NODE_TEST_CONTEXT && !process.execArgv.includes('--test')) {           // en los tests no (no tocar el equipo real)
    primera = comprobar().catch(() => { });
    const t = setInterval(() => comprobar().catch(() => { }), 120_000); t.unref?.();
  }
  // espera a la primera comprobación (como mucho ESPERA_MS): lo llaman el agente y la isla antes de resolver
  const listo = () => Promise.race([primera, new Promise(ok => { const t = setTimeout(ok, ESPERA_MS); t.unref?.(); })]);
  // ¿se puede usar este proveedor/modelo aquí? false = seguro que no; true/undefined = sí o aún no se sabe
  function usable(nombre, model) {
    if (listos[nombre] === false) return false;
    const p = cfg.proveedores[nombre];
    if (p?.local && instalados[nombre] && model && model !== 'auto') return instalados[nombre].includes(tag(model));
    return true;
  }
  const hayChatLocal = n => (instalados[n] || []).some(m => !/embed|bge|nomic|minilm|rerank|whisper|tts/i.test(m));
  function resolver(id, { sinRespaldo = false } = {}) {
    const i = String(id || '').indexOf('/');
    if (i < 1) throw new Error(`modelo "${id}" no válido: usa proveedor/modelo`);
    let nombre = id.slice(0, i), model = id.slice(i + 1);
    if (externos[nombre]) return { nombre, model, api: externos[nombre].api };
    if (!sinRespaldo && cfg.respaldoAuto !== false && cfg.proveedores[nombre] && usable(nombre, model) === false) {
      // 1) el servidor local está pero sin ese modelo → otro modelo suyo; 2) el primero listo de RESPALDO (los locales, si tienen modelos de chat)
      const alt = listos[nombre] && hayChatLocal(nombre) ? [nombre, 'auto']
        : RESPALDO.find(([n]) => n !== nombre && listos[n] && cfg.proveedores[n] && (!cfg.proveedores[n].local || hayChatLocal(n)));
      if (!alt) throw new Error(`${id}: ${NINGUNO}`);
      if (avisado !== id + '>' + alt.join('/')) { avisado = id + '>' + alt.join('/'); console.log(`[proveedores] ${id} no está disponible aquí → uso ${alt[0]}/${alt[1]}`); }
      [nombre, model] = alt;
    }
    const p = cfg.proveedores[nombre];
    if (!p) throw new Error(`proveedor "${nombre}" no configurado`);
    const crear = TIPOS[p.tipo];
    if (!crear) throw new Error(`tipo de proveedor "${p.tipo}" desconocido`);
    if (['anthropic', 'gemini'].includes(p.tipo) && !p.apiKey) throw new Error(`falta la API key de ${nombre} (config.json o ${p.env})`);
    if (['openai', 'responses'].includes(p.tipo) && !p.apiKey && !p.local) throw new Error(`falta la API key de ${nombre} (config.json o ${p.env})`);
    return { nombre, model, api: cache[nombre] ||= crear({ ...p, nombre }) };
  }
  function disponibles() {
    return Object.entries(cfg.proveedores).map(([nombre, p]) => ({
      nombre, tipo: p.tipo, listo: listos[nombre] ?? (p.tipo === 'claude-cli' || !!p.local || !!p.apiKey),
    })).concat(Object.entries(externos).map(([nombre, x]) => ({ nombre, tipo: 'plugin', plugin: x.plugin, modelos: x.modelos, listo: true })));
  }
  function registrarExterno(nombre, api, extra = {}) {
    if (cfg.proveedores[nombre] || (externos[nombre] && externos[nombre].plugin !== extra.plugin)) throw new Error(`ya existe un proveedor "${nombre}"`);
    externos[nombre] = { api, ...extra };
  }
  // ¿está seguro listo aquí? (proveedor comprobado y, si es local, con ese modelo descargado)
  function disponible(id) {
    const i = String(id || '').indexOf('/'); if (i < 1) return false;
    const n = id.slice(0, i);
    return !!externos[n] || (listos[n] === true && usable(n, id.slice(i + 1)) === true);
  }
  // el modelo que de verdad se usará para "id" (para enseñarlo en el panel), o null si no hay ninguno
  function efectivo(id) { try { const r = resolver(id); return `${r.nombre}/${r.model}`; } catch { return null; } }
  return { resolver, efectivo, disponible, listo, disponibles, comprobar, registrarExterno, instalados: () => ({ ...instalados }), quitarExterno: nombre => delete externos[nombre], listos: () => ({ ...listos }), reset: () => { for (const k of Object.keys(cache)) delete cache[k]; } };
}

module.exports = { crearProveedores };
