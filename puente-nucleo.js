// Puente entre el robot (isla / Discord / voz / Stream Deck) y el núcleo multi-modelo (core/).
// - Decide si un texto va al núcleo:
//     "qwen: haz X"                        alias de config (o "proveedor/modelo: X")
//     "usa qwen"                           a partir de ahora todo va a ese modelo
//     "usa claude code"                    todo a Claude Code (fijo)
//     "usa auto"                           modo automático (por defecto en la isla): el enrutador elige destino por mensaje
//     "claude: haz X"                      ese mensaje a Claude Code
//     "/nueva" o "nueva conversación"      conversación nueva con el núcleo
// - Traduce los eventos del núcleo a eventos tipo hook: la isla los pinta como otra sesión más.
// - Los permisos del núcleo salen como PermissionRequest (mismos botones en isla, Discord y Stream Deck).
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERR = {        // herramienta del núcleo -> nombre/forma de Claude Code (lo que entiende la isla)
  shell: a => ['Bash', { command: a.comando }],
  leer_archivo: a => ['Read', { file_path: a.ruta }],
  escribir_archivo: a => ['Write', { file_path: a.ruta, content: a.contenido }],
  editar_archivo: a => ['Edit', { file_path: a.ruta, old_string: a.buscar, new_string: a.reemplazar }],
  listar: a => ['Glob', { pattern: a.ruta || '.' }],
  web: a => ['WebFetch', { url: a.url }],
};
const comoHook = (nombre, args = {}) => (HERR[nombre] ? HERR[nombre](args) : [nombre, args]);

// ---------- enrutador automático: qué destino según lo que pides ----------
// rutas: programar → Claude Code; navegador / pc / general → modelo del núcleo (configurable en config.json → enrutador)
const CC = '@claude-code';
const RUTAS_DEF = { programar: CC, navegador: 'ollama/gemma4:31b-cloud', pc: 'ollama/gemma4:31b-cloud', general: 'ollama/gemma4:31b-cloud' };
const PISTAS = [                                  // atajos sin llamar al modelo (lo obvio, al instante)
  ['navegador', /\b(gemini|google flow|flow|youtube|navegador|chrome|edge|p[aá]gina web|sitio web|https?:\/\/|www\.|\.com\b|\.org\b|desc[aá]rga(?:la|lo|r)?|s[uú]be(?:la|lo)?\s+a)\b/i],
  ['programar', /\b(c[oó]digo|bug|commit|git\b|refactor|compila|deploy|despliega|pull request|\bpr\b|tests?\b|funci[oó]n|variable|endpoint|archivo\s+\S+\.(?:js|ts|py|cs|json|html|css))/i],
  ['pc', /\b(mi pantalla|la pantalla|rat[oó]n|teclado|abre (?:el )?(?:programa|explorador|bloc de notas|carpeta)|toma el control)\b/i],
];
const ESQUEMA_RUTA = { type: 'object', properties: { ruta: { type: 'string', enum: ['programar', 'navegador', 'pc', 'general'] }, motivo: { type: 'string' } }, required: ['ruta'] };
const SISTEMA_RUTA = 'Eres el enrutador de un asistente. Clasifica el mensaje del usuario en UNA ruta:\n' +
  '- programar: escribir/cambiar/revisar código o archivos de un proyecto de software, git, compilar, depurar, desplegar.\n' +
  '- navegador: usar páginas web (Gemini, Flow, YouTube, buscar en internet, descargar o subir cosas en una web, formularios).\n' +
  '- pc: controlar la PC del usuario (ver la pantalla, ratón/teclado, abrir programas).\n' +
  '- general: charla, preguntas, recordatorios y tareas programadas, recordar datos, lo demás.\n' +
  'Si el mensaje continúa la conversación anterior (p. ej. "y ahora descárgala", "otra vez", "sí"), mantén la ruta anterior. Responde solo JSON.';

function createPuente({ nucleo, dataDir, toIsland, onPermiso, reply }) {
  const fDest = path.join(dataDir, 'destino.json');
  let st = { destino: {}, sesion: {} };       // por canal: modelo elegido ("usa X") y sesión del núcleo
  try { st = { ...st, ...JSON.parse(fs.readFileSync(fDest, 'utf8')) }; } catch { }
  const guardar = () => fs.writeFileSync(fDest, JSON.stringify(st, null, 2));
  const canal = origin => (origin === 'discord' ? 'discord' : 'isla');      // voz comparte con la isla
  const sid = s => `nucleo:${s.id}`;
  const origen = new Map();                                                 // sesión del núcleo -> origin del último mensaje

  function modeloDe(nombre) {
    const n = String(nombre || '').trim();
    const a = nucleo.cfg.alias[n.toLowerCase()];
    if (a) return a;
    if (/^[\w.-]+\/\S+$/.test(n) && nucleo.cfg.proveedores[n.split('/')[0]]) return n;
    return null;
  }

  // ---- eventos del núcleo -> isla + respuesta al canal ----
  nucleo.bus.on('evento', e => {
    const s = nucleo.sesiones.obtener(e.sesion); if (!s) return;
    const base = { session_id: sid(s), cwd: s.cwd, _nucleo: s.modelo };
    if (e.tipo === 'inicio') toIsland({ ...base, hook_event_name: 'UserPromptSubmit', prompt: s.mensajes.at(-1)?.content || '' });
    else if (e.tipo === 'herramienta') { const [tool_name, tool_input] = comoHook(e.nombre, e.args); toIsland({ ...base, hook_event_name: 'PreToolUse', tool_name, tool_input }); }
    else if (e.tipo === 'resultado') toIsland({ ...base, hook_event_name: /^(error|DENEGADO)/.test(e.resultado) ? 'PostToolUseFailure' : 'PostToolUse', tool_name: comoHook(e.nombre)[0] });
    else if (e.tipo === 'fin' || e.tipo === 'error') {
      toIsland({ ...base, hook_event_name: e.tipo === 'fin' ? 'Stop' : 'StopFailure' });
      if (s.tarea || s.padre) return;                        // las tareas responden por el evento 'tarea'; los subagentes, a su agente
      const o = origen.get(s.id) || 'isla';
      reply(o, e.tipo === 'fin' ? (e.texto || '(sin respuesta)') : `❌ ${e.error}`, s.modelo);
    }
  });

  // tareas programadas: avisos, resultados y errores van al canal donde se crearon
  nucleo.bus.on('tarea', e => {
    const titulo = e.tipo === 'aviso' ? `⏰ Recordatorio` : e.tipo === 'error' ? `⏰ ${e.tarea.nombre} (error)` : `⏰ ${e.tarea.nombre}`;
    reply(e.tarea.canal || 'isla', e.tipo === 'error' ? `❌ ${e.texto}` : e.texto, titulo, { tarea: true });
  });

  nucleo.bus.on('permiso', req => {
    const s = req.sesion && nucleo.sesiones.obtener(req.sesion);
    const [tool_name, tool_input] = req.herramienta === 'externo' ? [`Agente ${req.origen}`, { command: req.resumen }] : comoHook(req.herramienta, req.args);
    onPermiso(req.id, { hook_event_name: 'PermissionRequest', session_id: s ? sid(s) : `externo:${req.origen || 'mcp'}`, cwd: s ? s.cwd : os.homedir(), tool_name, tool_input, _peligro: req.peligro || '', _nucleo: s && s.modelo });
  });

  function sesionPara(c, modelo) {
    let s = st.sesion[c] && nucleo.sesiones.obtener(st.sesion[c]);
    if (!s || s.modelo !== modelo) {
      s = nucleo.sesiones.crear({ modelo, cwd: nucleo.cfg.carpeta || os.homedir(), canal: c });
      st.sesion[c] = s.id; guardar();
    }
    return s;
  }

  // motores externos con puente (Antigravity): el encargo sale por el evento 'motor'; la respuesta vuelve por MCP
  function aMotor(motor, texto, origin) {
    if (!nucleo.motores?.[motor]) return { ok: false, msg: `❌ ${motor} no está conectado. En Antigravity pídele al agente: "arranca el puente del robot" (comando en el panel → Canales).` };
    nucleo.bus.emit('motor', { motor, texto, origen: origin === 'discord' ? 'Discord' : origin === 'voz' ? 'voz' : 'la isla', t: Date.now() });
    nucleo.registro.add('info', motor, `encargo: ${texto.slice(0, 120)}`);
    return { ok: true, msg: `📨 Encargado a **${motor}**. Te aviso cuando termine.` };
  }

  // devuelve null si el texto NO es para el núcleo (sigue el camino de Claude Code)
  const rutas = () => ({ ...RUTAS_DEF, ...(nucleo.cfg.enrutador?.rutas || {}) });
  async function enrutar(t, c) {
    const previo = st.ultimo?.[c];
    const reciente = previo && Date.now() - previo.t < 10 * 60_000;
    for (const [ruta, re] of PISTAS) if (re.test(t)) return { ruta, por: 'pista' };
    if (reciente && t.length < 40 && /^(s[ií]|no|ok|vale|dale|otra vez|repite|sigue|contin[uú]a|y (ahora|luego)|ahora)\b/i.test(t)) return { ruta: previo.ruta, por: 'seguimiento' };
    try {
      const { datos } = await nucleo.generarJSON({
        modelo: nucleo.cfg.enrutador?.modelo || RUTAS_DEF.general, system: SISTEMA_RUTA, schema: ESQUEMA_RUTA,
        prompt: `${reciente ? `Mensaje anterior (ruta ${previo.ruta}): ${previo.texto}\n` : ''}Mensaje: ${t}`, signal: AbortSignal.timeout(10_000),
      });
      if (datos && rutas()[datos.ruta]) return { ruta: datos.ruta, por: 'modelo' };
    } catch { }
    return { ruta: 'general', por: 'por defecto' };
  }

  // devuelve null si el texto va a Claude Code; { ok, msg } si lo atiende el núcleo / un motor
  async function handle(text, origin) {
    const t = String(text || '').trim(), c = canal(origin);
    let m;
    if ((m = t.match(/^(?:claude(?:\s*code)?|cc)\s*:\s*([\s\S]+)$/i))) return { claude: m[1].trim() };
    if (/^usa(?:r)?\s+auto(?:m[aá]tico)?$/i.test(t)) { st.destino[c] = '@auto'; guardar(); return { ok: true, msg: '🧭 Modo automático: elijo el destino según lo que me pidas (código → Claude Code; web, PC y lo demás → núcleo).' }; }
    if ((m = t.match(/^(antigravity|ag)\s*:\s*([\s\S]+)$/i))) return aMotor('antigravity', m[2].trim(), origin);
    if (st.destino[c] === '@antigravity' && !/^usa(?:r)?\s/i.test(t)) return aMotor('antigravity', t, origin);
    if ((m = t.match(/^usa(?:r)?\s+(.+)$/i))) {
      if (/^claude\s*code$/i.test(m[1].trim())) { st.destino[c] = CC; guardar(); return { ok: true, msg: '↩️ Todo a Claude Code. ("usa auto" para el modo automático)' }; }
      if (/^antigravity$/i.test(m[1].trim())) { st.destino[c] = '@antigravity'; guardar(); return { ok: true, msg: '🛰️ Ahora tus mensajes van a **Antigravity**. ("usa claude code" para volver)' }; }
      const mod = modeloDe(m[1]);
      if (!mod) return { ok: false, msg: `No conozco el modelo "${m[1]}". Alias: ${Object.keys(nucleo.cfg.alias).join(', ')}` };
      st.destino[c] = mod; guardar();
      return { ok: true, msg: `🤖 Ahora hablo con **${mod}**. ("usa claude code" para volver)` };
    }
    if (/^(\/nueva|nueva conversaci[oó]n)$/i.test(t)) { delete st.sesion[c]; guardar(); return { ok: true, msg: '🆕 Conversación nueva.' }; }

    let modelo = null, msg = t, nota = '';
    if ((m = t.match(/^([\w.-]+(?:\/[\w.:-]+)?)\s*:\s*([\s\S]+)$/)) && (modelo = modeloDe(m[1]))) msg = m[2].trim();
    else {
      const d = st.destino[c] || '@auto';                                // isla, voz y Discord van en automático salvo que elijas otra cosa
      if (d === '@auto') {
        const r = await enrutar(t, c);
        st.ultimo = { ...(st.ultimo || {}), [c]: { ruta: r.ruta, texto: t.slice(0, 300), t: Date.now() } }; guardar();
        modelo = rutas()[r.ruta]; nota = ` · ${r.ruta}`;
        // sin Claude Code en este PC (p. ej. solo ChatGPT): programar también lo hace el núcleo
        if (modelo === CC && nucleo.proveedores.listos?.().claudecode === false) modelo = nucleo.cfg.modeloPorDefecto;
        nucleo.registro?.add?.('info', 'enrutador', `${r.ruta} (${r.por}) → ${modelo}: ${t.slice(0, 80)}`);
      } else modelo = d;
    }
    if (!modelo || modelo === CC) return null;

    try { nucleo.proveedores.resolver(modelo); } catch (e) { return { ok: false, msg: `❌ ${e.message}` }; }
    const s = sesionPara(c, modelo);
    if (nucleo.agente.ocupada(s.id)) return { ok: false, msg: `⏳ ${modelo} sigue trabajando; espera a que termine.` };
    origen.set(s.id, origin);
    nucleo.enviar(s, msg).catch(() => { });                 // la respuesta llega por el evento 'fin'
    return { ok: true, msg: `📨 Enviado a **${modelo}**${nota}.` };
  }

  const nombreDestino = d => (d === '@auto' ? 'automático' : d === CC ? 'Claude Code' : d);
  return { handle, destino: c => nombreDestino(st.destino[canal(c)] || '@auto') };
}

module.exports = { createPuente };
