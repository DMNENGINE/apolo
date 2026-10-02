// Traductores de "motores" (CLIs de agentes) al formato de eventos de Claude Code, que es el que entiende el robot.
// Así la isla, Discord, el Stream Deck, las reglas "Permitir siempre" y los avisos de peligro sirven para todos.
//
// Gemini CLI (hooks en ~/.gemini/settings.json, timeout en ms):
//   SessionStart/SessionEnd → igual · BeforeAgent → UserPromptSubmit · AfterAgent → Stop
//   BeforeTool → PreToolUse (+ PermissionRequest si la herramienta escribe/ejecuta) · AfterTool → PostToolUse
//   Notification → Notification
//   Respuesta a BeforeTool: {"decision":"allow"} se salta la confirmación; {"decision":"deny","reason"} la bloquea;
//   sin salida → Gemini pregunta en su terminal como siempre.

const GEMINI_HERR = {
  run_shell_command: i => ['Bash', { command: i.command, description: i.description }],
  write_file: i => ['Write', { file_path: i.file_path || i.absolute_path, content: i.content }],
  replace: i => ['Edit', { file_path: i.file_path || i.absolute_path, old_string: i.old_string, new_string: i.new_string }],
  read_file: i => ['Read', { file_path: i.absolute_path || i.file_path }],
  read_many_files: i => ['Read', { file_path: (i.paths || i.include || []).join(', ') }],
  list_directory: i => ['Glob', { pattern: i.path || i.dir_path || '.' }],
  glob: i => ['Glob', { pattern: i.pattern }],
  search_file_content: i => ['Grep', { pattern: i.pattern }],
  web_fetch: i => ['WebFetch', { url: (String(i.prompt || '').match(/https?:\/\/\S+/) || [i.url || ''])[0] }],
  google_web_search: i => ['WebSearch', { query: i.query }],
  save_memory: i => ['Memoria', { fact: i.fact }],
};
const GEMINI_PIDE_PERMISO = /^(run_shell_command|write_file|replace|mcp_.+)$/;

function herramientaGemini(nombre, entrada = {}) {
  const f = GEMINI_HERR[nombre];
  if (f) return f(entrada);
  if (/^mcp_/.test(nombre)) return [`mcp__${nombre.slice(4).replace(/_/, '__')}`, entrada];
  return [nombre, entrada];
}

// devuelve la lista de eventos (formato Claude Code) a mandar al robot; el último puede esperar decisión
function traducirGemini(d) {
  const base = { session_id: `gemini:${d.session_id || '?'}`, cwd: d.cwd, transcript_path: d.transcript_path, _motor: 'gemini' };
  switch (d.hook_event_name) {
    case 'SessionStart': case 'SessionEnd': return [{ ...base, hook_event_name: d.hook_event_name }];
    case 'BeforeAgent': return [{ ...base, hook_event_name: 'UserPromptSubmit', prompt: d.prompt }];
    case 'AfterAgent': return [{ ...base, hook_event_name: 'Stop', last_assistant_message: d.prompt_response }];
    case 'Notification': return [{ ...base, hook_event_name: 'Notification', message: d.message }];
    case 'AfterTool': { const [tool_name, tool_input] = herramientaGemini(d.tool_name, d.tool_input); return [{ ...base, hook_event_name: 'PostToolUse', tool_name, tool_input }]; }
    case 'BeforeTool': {
      const [tool_name, tool_input] = herramientaGemini(d.tool_name, d.tool_input);
      const ev = [{ ...base, hook_event_name: 'PreToolUse', tool_name, tool_input }];
      if (GEMINI_PIDE_PERMISO.test(d.tool_name || '')) ev.push({ ...base, hook_event_name: 'PermissionRequest', tool_name, tool_input });
      return ev;
    }
    default: return [];
  }
}
// respuesta del robot (formato Claude Code) → salida para Gemini
function salidaGemini(respuestaClaude) {
  let j; try { j = JSON.parse(respuestaClaude); } catch { return ''; }
  const d = j?.hookSpecificOutput?.decision;
  if (!d) return '';
  return JSON.stringify(d.behavior === 'allow' ? { decision: 'allow' } : { decision: 'deny', reason: d.message || 'Denegado desde el robot' });
}

module.exports = { traducirGemini, salidaGemini, herramientaGemini };
