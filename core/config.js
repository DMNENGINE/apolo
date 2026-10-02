// Configuración del núcleo: carpeta de datos, config.json y claves (también desde variables de entorno).
const fs = require('fs');
const path = require('path');
const os = require('os');

function carpetaDatos() {
  if (process.env.NUCLEO_HOME) return process.env.NUCLEO_HOME;
  const base = process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'robot-companion', 'nucleo');
}

const POR_DEFECTO = {
  modeloPorDefecto: 'ollama/qwen3.6',
  proveedores: {
    // tipo openai = cualquier API compatible con Chat Completions
    openai: { tipo: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', env: 'OPENAI_API_KEY' },
    anthropic: { tipo: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '', env: 'ANTHROPIC_API_KEY' },
    gemini: { tipo: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: '', env: 'GEMINI_API_KEY' },
    openrouter: { tipo: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', env: 'OPENROUTER_API_KEY' },
    ollama: { tipo: 'openai', baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama', local: true },
    claudecode: { tipo: 'claude-cli' },   // usa la CLI `claude` que el usuario ya tenga instalada
    chatgpt: { tipo: 'codex-cli' },       // Codex CLI con la cuenta de ChatGPT (Plus/Pro): sin API key
    // más proveedores con API compatible con OpenAI: solo falta pegar la clave. Modelo "auto" = su modelo principal (preferido)
    deepseek: { tipo: 'openai', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', env: 'DEEPSEEK_API_KEY', preferido: ['deepseek-chat'] },
    xai: { tipo: 'openai', baseUrl: 'https://api.x.ai/v1', apiKey: '', env: 'XAI_API_KEY', preferido: ['^grok-\\d+(\\.\\d+)?$', '^grok-\\d+(?!.*(image|mini|vision))'] },
    groq: { tipo: 'openai', baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', env: 'GROQ_API_KEY', preferido: ['llama-3\\.3-70b', 'llama.*70b', 'gpt-oss-120b'] },
    mistral: { tipo: 'openai', baseUrl: 'https://api.mistral.ai/v1', apiKey: '', env: 'MISTRAL_API_KEY', preferido: ['mistral-large-latest', 'mistral-medium-latest'] },
    together: { tipo: 'openai', baseUrl: 'https://api.together.xyz/v1', apiKey: '', env: 'TOGETHER_API_KEY', preferido: ['llama.*70b.*instruct', 'qwen.*instruct'] },
    perplexity: { tipo: 'openai', baseUrl: 'https://api.perplexity.ai', apiKey: '', env: 'PERPLEXITY_API_KEY', preferido: ['^sonar-pro$', '^sonar$'] },
    cerebras: { tipo: 'openai', baseUrl: 'https://api.cerebras.ai/v1', apiKey: '', env: 'CEREBRAS_API_KEY', preferido: ['llama.*70b', 'qwen', 'gpt-oss'] },
    fireworks: { tipo: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', apiKey: '', env: 'FIREWORKS_API_KEY', preferido: ['llama.*70b', 'deepseek', 'qwen'] },
    moonshot: { tipo: 'openai', baseUrl: 'https://api.moonshot.ai/v1', apiKey: '', env: 'MOONSHOT_API_KEY', preferido: ['kimi-k\\d', 'kimi', 'moonshot'] },
    zai: { tipo: 'openai', baseUrl: 'https://api.z.ai/api/paas/v4', apiKey: '', env: 'ZAI_API_KEY', preferido: ['^glm-\\d(\\.\\d)?$', 'glm'] },
    qwen: { tipo: 'openai', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', apiKey: '', env: 'DASHSCOPE_API_KEY', preferido: ['^qwen-max', '^qwen-plus', 'qwen'] },
    nvidia: { tipo: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: '', env: 'NVIDIA_API_KEY', preferido: ['llama.*70b.*instruct', 'nemotron'] },
    huggingface: { tipo: 'openai', baseUrl: 'https://router.huggingface.co/v1', apiKey: '', env: 'HF_TOKEN', preferido: ['llama.*70b', 'qwen.*instruct', 'deepseek'] },
    cohere: { tipo: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', apiKey: '', env: 'COHERE_API_KEY', preferido: ['command-a', 'command-r-plus', 'command'] },
    lmstudio: { tipo: 'openai', baseUrl: 'http://localhost:1234/v1', apiKey: 'lm-studio', local: true },
  },
  // atajos: "qwen: haz X" desde la isla, Discord o voz
  alias: {
    qwen: 'ollama/qwen3.6', gemma: 'ollama/gemma4:31b-cloud', haiku: 'claudecode/haiku', sonnet: 'claudecode/sonnet',
    gpt: 'openai/gpt-4.1-mini', gemini: 'gemini/gemini-3.8-flash', google: 'gemini/gemini-3.8-flash',
    chatgpt: 'chatgpt/default', codex: 'chatgpt/default',
    deepseek: 'deepseek/auto', grok: 'xai/auto', groq: 'groq/auto', mistral: 'mistral/auto', kimi: 'moonshot/auto', glm: 'zai/auto',
    perplexity: 'perplexity/auto', cerebras: 'cerebras/auto', cohere: 'cohere/auto', lmstudio: 'lmstudio/auto',
    flash: 'gemini/gemini-3.8-flash', flashlite: 'gemini/gemini-3.1-flash-lite',
  },
  permisos: { modo: 'preguntar' },        // preguntar | auto | solo-lectura
  // memoria semántica: 'proveedor/modelo' de embeddings (API compatible OpenAI) o null = solo búsqueda por palabras
  memoria: { embeddings: 'ollama/embeddinggemma' },
  // conversaciones largas: a partir de `umbral` tokens (aprox.) se resume lo antiguo y lo duradero va a la memoria.
  // modelo null = resume el mismo modelo de la sesión; porModelo: { 'ollama/qwen3.6': 8000 } para modelos de contexto corto
  compactar: { umbral: 24000, conservar: 6000, modelo: null, porModelo: {} },
  maxPasos: 25,
  puerto: 47900,
  // red: por defecto solo este equipo. permitidos = IPs de la LAN que pueden entrar (con token), ej. la Pi
  red: { permitidos: [] },
};

function cargarConfig(dir = carpetaDatos()) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'config.json');
  let guardada = {};
  try { guardada = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }
  const cfg = { ...POR_DEFECTO, ...guardada, permisos: { ...POR_DEFECTO.permisos, ...guardada.permisos }, alias: { ...POR_DEFECTO.alias, ...guardada.alias }, memoria: { ...POR_DEFECTO.memoria, ...guardada.memoria }, compactar: { ...POR_DEFECTO.compactar, ...guardada.compactar }, proveedores: { ...POR_DEFECTO.proveedores } };
  for (const [k, v] of Object.entries(guardada.proveedores || {})) cfg.proveedores[k] = { ...POR_DEFECTO.proveedores[k], ...v };
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(POR_DEFECTO, null, 2));
  for (const p of Object.values(cfg.proveedores)) if (!p.apiKey && p.env && process.env[p.env]) p.apiKey = process.env[p.env];
  cfg.dir = dir;
  return cfg;
}

module.exports = { cargarConfig, carpetaDatos };
