// Quita los hooks de APOLO de Claude Code (~/.claude/settings.json) y Gemini CLI (~/.gemini/settings.json),
// con copia de seguridad. Lo ejecuta el desinstalador (.exe) con APOLO.exe en modo node (ELECTRON_RUN_AS_NODE=1)
// para que Claude Code no se quede llamando a un hook.js que ya no existe. Uso: node tools/quitar-hooks.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const ES_HOOK = /(RobotCompanion|APOLO|app\.asar\.unpacked)\/hook\/hook\.(js|cmd)/i;   // igual que main.js
const esNuestro = h => typeof h?.command === 'string' && ES_HOOK.test(h.command.replace(/\\/g, '/'));

for (const f of [path.join(os.homedir(), '.claude', 'settings.json'), path.join(os.homedir(), '.gemini', 'settings.json')]) {
  let s; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  if (!s.hooks || !ES_HOOK.test(JSON.stringify(s.hooks))) continue;
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = (s.hooks[ev] || []).map(m => ({ ...m, hooks: (m.hooks || []).filter(h => !esNuestro(h)) })).filter(m => m.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  try {
    fs.copyFileSync(f, f + '.apolo-desinstalar-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.writeFileSync(f, JSON.stringify(s, null, 2));
    console.log('hooks quitados de', f);
  } catch (e) { console.error(f, e.message); }
}
