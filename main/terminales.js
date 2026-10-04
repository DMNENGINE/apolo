// Terminal de cada sesión de Claude Code para traerla al frente (isla, Stream Deck) y escribirle (hablar.js).
// La parte del sistema operativo está en core/escritorio/so: Windows busca la ventana (tools/ventana-terminal.ps1),
// Linux usa el panel de tmux o la ventana X11 que manda el hook.
const so = require('../core/escritorio/so');

const sesiones = new Map();       // session_id -> destino ({hwnd} en Windows, {tmux, x11} en Linux) | 'buscando'
// ev = evento del hook (_ppid = claude.exe, _term = TMUX_PANE/TMUX/WINDOWID)
async function resolveTerminal(sid, ev) {
  if (!sid || !ev || sesiones.has(sid)) return;
  sesiones.set(sid, 'buscando');
  let d = null; try { d = await so.localizarTerminal(ev); } catch { }
  if (d) sesiones.set(sid, d); else sesiones.delete(sid);
}
async function focusTerminal(sid) {
  const d = sesiones.get(sid);
  if (!d || d === 'buscando') return false;
  try { return await so.enfocarTerminal(d); } catch { return false; }
}
// destino para escribirle (hablar.js); null si todavía no se sabe
const hwndDe = sid => { const d = sesiones.get(sid); return d && d !== 'buscando' ? d : null; };

module.exports = { resolveTerminal, focusTerminal, hwndDe };
