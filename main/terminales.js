// Ventana de terminal de cada sesión de Claude Code (Windows Terminal, consola clásica, VS Code…) para traerla
// al frente con un clic desde la isla o el Stream Deck. La búsqueda está en tools/ventana-terminal.ps1.
const path = require('path');
const { execFile } = require('child_process');
const { fuera } = require('../core/rutas');

const SCRIPT = fuera(path.join(__dirname, '..', 'tools', 'ventana-terminal.ps1'));
const sessionWin = new Map();       // session_id -> { hwnd, name } | 'buscando'
function ps(args) {
  return new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true, timeout: 8000 },
    (err, out) => ok(err ? '' : String(out).trim())));
}
async function resolveTerminal(sid, ppid) {
  if (!ppid || sessionWin.has(sid)) return;
  sessionWin.set(sid, 'buscando');
  const out = await ps(['-File', SCRIPT, '-Proceso', String(Number(ppid))]);
  const [hwnd, name] = out.split('|');
  if (/^\d+$/.test(hwnd || '')) sessionWin.set(sid, { hwnd, name }); else sessionWin.delete(sid);
}
// Windows solo deja pasar al frente a quien recibió la última entrada: un Alt simulado lo desbloquea (truco habitual)
async function focusTerminal(sid) {
  const w = sessionWin.get(sid);
  if (!w || w === 'buscando') return false;
  const r = await ps(['-Command', `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);'; $h=[IntPtr]${Number(w.hwnd)}; if([U.W]::IsIconic($h)){[U.W]::ShowWindowAsync($h,9)|Out-Null}; [U.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [U.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [U.W]::SetForegroundWindow($h)`]);
  return r !== 'False';
}
const hwndDe = sid => { const w = sessionWin.get(sid); return w && w !== 'buscando' ? w.hwnd : null; };

module.exports = { resolveTerminal, focusTerminal, hwndDe };
