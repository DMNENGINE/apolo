// Instalar / quitar nuestros hooks en ~/.claude/settings.json (Claude Code) y ~/.gemini/settings.json (Gemini CLI,
// traducidos por hook/motores.js). Siempre con copia de seguridad antes de escribir.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fuera } = require('../core/rutas');                 // app instalada: lo que usan procesos externos está en app.asar.unpacked

const HOOK_JS = fuera(path.join(__dirname, '..', 'hook', 'hook.js')).replace(/\\/g, '/');
const ES_HOOK = /(RobotCompanion|APOLO|app\.asar\.unpacked)\/hook\/hook\.(js|cmd)/i;   // copia de desarrollo, one-liner o .exe
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const GEMINI_SETTINGS = path.join(os.homedir(), '.gemini', 'settings.json');
const HOOK_EVENTS = [
  ['SessionStart', 10], ['SessionEnd', 10], ['UserPromptSubmit', 10], ['PreToolUse', 10], ['PostToolUse', 10],
  ['PostToolUseFailure', 10], ['PermissionRequest', 120], ['Notification', 10], ['Stop', 10], ['StopFailure', 10],
  ['SubagentStart', 10], ['SubagentStop', 10],
];
const GEMINI_EVENTS = [['SessionStart', 10000], ['SessionEnd', 10000], ['BeforeAgent', 10000], ['AfterAgent', 10000], ['BeforeTool', 120000], ['AfterTool', 10000], ['Notification', 10000]];   // ms

const tieneCLI = n => { try { require('child_process').execSync(`where ${n}`, { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; } };
const leerJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const isOurs = h => typeof h.command === 'string' && ES_HOOK.test(h.command);
function copia(f) {
  if (!fs.existsSync(f)) return null;
  const b = f + '.robot-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(f, b); return b;
}
function stripOurs(s) {
  if (!s.hooks) return s;
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] || []).map(m => ({ ...m, hooks: (m.hooks || []).filter(h => !isOurs(h)) })).filter(m => m.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}

// empaquetado: app.isPackaged; mensaje({message, detail}) = dialog.showMessageBox; tr = traducción
function crearHooksConfig({ empaquetado, mensaje, tr }) {
  // sin Node.js en el PATH (instalación .exe) el hook corre con el propio APOLO.exe en modo node (hook/hook.cmd)
  const HOOK_EJEC = () => (empaquetado() && !tieneCLI('node') ? `"${HOOK_JS.replace(/hook\.js$/, 'hook.cmd')}"` : `node "${HOOK_JS}"`);
  function instalar() {
    const s = stripOurs(leerJSON(SETTINGS));
    s.hooks = s.hooks || {};
    for (const [ev, timeout] of HOOK_EVENTS) {
      (s.hooks[ev] = s.hooks[ev] || []).push({ hooks: [{ type: 'command', command: `${HOOK_EJEC()} ${ev}`, timeout }] });
    }
    const b = copia(SETTINGS);
    fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
    mensaje({ message: tr('Hooks instalados.'), detail: `${tr('Copia de seguridad:')} ${b || tr('(no había settings.json)')}\n${tr('Abre una sesión nueva de Claude Code para que los use.')}` });
  }
  function quitar() {
    const b = copia(SETTINGS);
    fs.writeFileSync(SETTINGS, JSON.stringify(stripOurs(leerJSON(SETTINGS)), null, 2));
    mensaje({ message: tr('Hooks quitados.'), detail: `${tr('Copia de seguridad:')} ${b}` });
  }
  function gemini(instalar) {
    const s = stripOurs(leerJSON(GEMINI_SETTINGS));
    if (instalar) {
      s.hooks = s.hooks || {};
      for (const [ev, timeout] of GEMINI_EVENTS) (s.hooks[ev] = s.hooks[ev] || []).push({ ...(ev.includes('Tool') ? { matcher: '.*' } : {}), hooks: [{ name: 'robot-companion', type: 'command', command: `${HOOK_EJEC()} ${ev} --motor=gemini`, timeout }] });
    }
    const b = copia(GEMINI_SETTINGS);
    fs.mkdirSync(path.dirname(GEMINI_SETTINGS), { recursive: true });
    fs.writeFileSync(GEMINI_SETTINGS, JSON.stringify(s, null, 2));
    mensaje({ message: tr(instalar ? 'Hooks de Gemini CLI instalados.' : 'Hooks de Gemini CLI quitados.'), detail: `${tr('Copia de seguridad:')} ${b || tr('(no había settings.json)')}${instalar ? '\n' + tr('Abre una sesión nueva de Gemini CLI. Puedes comprobarlos con /hooks.') : ''}` });
  }
  return {
    instalar, quitar, gemini,
    instalados: () => ES_HOOK.test(JSON.stringify(leerJSON(SETTINGS))),
    geminiInstalados: () => ES_HOOK.test(JSON.stringify(leerJSON(GEMINI_SETTINGS))),
  };
}

module.exports = { crearHooksConfig, tieneCLI, CLAUDE_DIR };
