// Ventana de terminal de cada sesión de Claude Code: sube por los procesos padre hasta una con ventana
// (Windows Terminal, VS Code, consola…) para traerla al frente con un clic desde la isla.
const { execFile } = require('child_process');

const sessionWin = new Map();       // session_id -> { hwnd, name } | 'buscando'
function ps(script) {
  return new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000 },
    (err, out) => ok(err ? '' : String(out).trim())));
}
async function resolveTerminal(sid, ppid) {
  if (!ppid || sessionWin.has(sid)) return;
  sessionWin.set(sid, 'buscando');
  const out = await ps(`$p=${Number(ppid)}; for($i=0;$i -lt 15 -and $p;$i++){ $pr=Get-Process -Id $p -EA SilentlyContinue; if($pr -and $pr.MainWindowHandle -ne 0){ "$($pr.MainWindowHandle)|$($pr.ProcessName)"; break }; $p=(Get-CimInstance Win32_Process -Filter "ProcessId=$p").ParentProcessId }`);
  const [hwnd, name] = out.split('|');
  if (hwnd) sessionWin.set(sid, { hwnd, name }); else sessionWin.delete(sid);
}
async function focusTerminal(sid) {
  const w = sessionWin.get(sid);
  if (!w || w === 'buscando') return false;
  await ps(`Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);'; $h=[IntPtr]${w.hwnd}; if([U.W]::IsIconic($h)){[U.W]::ShowWindowAsync($h,9)|Out-Null}; [U.W]::SetForegroundWindow($h)|Out-Null`);
  return true;
}
const hwndDe = sid => { const w = sessionWin.get(sid); return w && w !== 'buscando' ? w.hwnd : null; };

module.exports = { resolveTerminal, focusTerminal, hwndDe };
