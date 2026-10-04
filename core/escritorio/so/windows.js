// Implementación Windows (la de siempre): PowerShell + .NET (System.Drawing, UI Automation, SendInput, System.Speech) y wt.exe.
const path = require('path');
const { execFile, spawn } = require('child_process');
const { fuera } = require('../../rutas');

const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'];
const script = n => fuera(path.join(__dirname, '..', n));               // core/escritorio/<n>.ps1 (desempaquetado en el .exe)
const raiz = n => fuera(path.join(__dirname, '..', '..', '..', n));    // archivos de la app (tools/…)

function ejecutarPantalla(args, { timeout = 20_000 } = {}) {
  return new Promise((ok, mal) => {
    execFile('powershell.exe', [...PS, script('pantalla.ps1'), ...args],
      { windowsHide: true, timeout, maxBuffer: 8 << 20, encoding: 'utf8' }, (err, out, errOut) => {
        if (err) return mal(new Error((errOut || err.message).trim().split('\n')[0]));
        try { ok(JSON.parse(out.trim().replace(/^﻿/, ''))); } catch { mal(new Error('salida no válida del capturador')); }
      });
  });
}

const lanzarManos = () => spawn('powershell.exe', [...PS, script('manos.ps1')], { windowsHide: true });
// grabadora de reuniones (grabar.ps1): WASAPI micrófono + loopback del sistema en trozos WAV 16 kHz; mismo protocolo JSON por líneas
// escritorio remoto (flujo.ps1): captura continua con tapado de ventanas protegidas; binario por stdout, JSON por stdin
const lanzarFlujo = (args = []) => spawn('powershell.exe', [...PS, script('flujo.ps1'), ...args], { windowsHide: true });
const lanzarGrabadora = () => spawn('powershell.exe', [...PS, script('grabar.ps1')], { windowsHide: true });

// ---------- terminales de Claude Code: destino = { hwnd, nombre } ----------
const psT = (args, timeout = 8000) => new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
  { windowsHide: true, timeout }, (err, out) => ok(err ? '' : String(out).trim())));
// ev = evento del hook: _ppid es claude.exe (CLAUDE_PID). tools/ventana-terminal.ps1: consola → dueño (Windows Terminal) o padres con ventana
async function localizarTerminal(ev) {
  if (!ev || !ev._ppid) return null;
  const [hwnd, nombre] = (await psT(['-File', raiz('tools/ventana-terminal.ps1'), '-Proceso', String(Number(ev._ppid))])).split('|');
  return /^\d+$/.test(hwnd || '') ? { hwnd, nombre } : null;
}
// Windows solo deja pasar al frente a quien recibió la última entrada: un Alt simulado lo desbloquea (truco habitual)
async function enfocarTerminal(destino) {
  const h = Number(destino && destino.hwnd); if (!h) return false;
  const r = await psT(['-Command', `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);'; $h=[IntPtr]${h}; if([U.W]::IsIconic($h)){[U.W]::ShowWindowAsync($h,9)|Out-Null}; [U.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [U.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [U.W]::SetForegroundWindow($h)`]);
  return r !== 'False';
}
// → texto de escribir.ps1 (contiene "OK" si se escribió)
function escribirEnTerminal({ destino, hwnd, archivo, timeout = 15_000 }) {
  const h = (destino && destino.hwnd) || hwnd;
  return new Promise((ok, mal) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', raiz('tools/escribir.ps1'), '-Hwnd', String(h), '-File', archivo],
    { windowsHide: true, timeout }, (e, out) => (e ? mal(e) : ok(String(out || '').trim()))));
}
// wt.exe usa ";" para separar comandos y las comillas rompen el argumento: se suavizan solo aquí
const abrirTerminal = (dir, args = []) => execFile('wt.exe', ['-w', 'new', '-d', dir, ...args.map((a, i) => (i ? String(a).replace(/;/g, ',').replace(/"/g, "'") : a))], { windowsHide: false }, () => { });

const voz = {
  // reserva sin Python: System.Speech (listen.ps1). hablar: la voz de Windows la gestiona hoy la isla (speechSynthesis).
  escuchar: (timeout = 15_000) => new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', raiz('tools/listen.ps1')],
    { windowsHide: true, timeout, encoding: 'utf8' }, (e, out) => ok(e ? '' : String(out || '').trim()))),
  hablar: null,
};

// ---------- Modo Gamer (core/gamer): cada cambio real del PC pasa por aquí, para poder probarlo con un `so` falso ----------
// Sin admin: powercfg /setactive, prioridad, suspender procesos del propio usuario y HKCU funcionan; HKLM solo se LEE.
const run = (bin, args, { timeout = 15_000 } = {}) => new Promise((ok, mal) => execFile(bin, args, { windowsHide: true, timeout, maxBuffer: 4 << 20, encoding: 'utf8' },
  (e, out, err) => (e ? mal(new Error(String(err || e.message).trim().split('\n')[0])) : ok(String(out || '')))));
const ps = (cmd, o) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], o);
const entero = n => { const v = parseInt(n, 10); if (!Number.isInteger(v) || v <= 0) throw new Error('pid no válido'); return v; };
const CLASES = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];              // RealTime NUNCA
const NT = 'Add-Type -Name N -Namespace A -MemberDefinition \'[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h); [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);\'; ';
const TOAST = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';

async function gamerPlanes() {                                     // [{guid, nombre, activo}]
  const out = await run('powercfg', ['/list']);
  return [...out.matchAll(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\((.+?)\)\s*(\*)?/gi)].map(m => ({ guid: m[1].toLowerCase(), nombre: m[2], activo: !!m[3] }));
}
const gamerPonerPlan = async guid => { if (!/^[0-9a-f-]{36}$/i.test(guid)) throw new Error('GUID no válido'); return run('powercfg', ['/setactive', guid]); };
async function gamerProcesos() {                                   // [{nombre, pid}] (tasklist, sin admin)
  const out = await run('tasklist', ['/fo', 'csv', '/nh']);
  return out.split(/\r?\n/).map(l => l.match(/^"([^"]+)","(\d+)"/)).filter(Boolean).map(m => ({ nombre: m[1], pid: +m[2] }));
}
const gamerSuspender = async pid => ps(`${NT}$p = Get-Process -Id ${entero(pid)}; [void][A.N]::NtSuspendProcess($p.Handle)`);
const gamerReanudar = async pid => ps(`${NT}$p = Get-Process -Id ${entero(pid)}; [void][A.N]::NtResumeProcess($p.Handle)`);
const gamerCerrar = async pid => run('taskkill', ['/pid', String(entero(pid))]);          // cierre amable (sin /f)
const gamerPrioridad = async pid => (await ps(`(Get-Process -Id ${entero(pid)}).PriorityClass.ToString()`)).trim();
const gamerPonerPrioridad = async (pid, clase) => { if (!CLASES.includes(clase)) throw new Error(`prioridad no permitida: ${clase}`); return ps(`(Get-Process -Id ${entero(pid)}).PriorityClass = '${clase}'`); };
async function gamerLeerRegistro(clave, valor) {                   // SOLO lectura: número (REG_DWORD) | texto | null si no existe
  try {
    const out = await run('reg', ['query', clave, '/v', valor]);
    const m = out.match(new RegExp(`${valor}\\s+(REG_\\w+)\\s+(.*)`, 'i')); if (!m) return null;
    return m[1].toUpperCase() === 'REG_DWORD' ? parseInt(m[2], 16) : m[2].trim();
  } catch { return null; }
}
// "No molestar" sin admin: HKCU PushNotifications ToastEnabled (0 = notificaciones en silencio). null = el valor no existía → se borra al deshacer
const gamerNoMolestar = () => gamerLeerRegistro(TOAST, 'ToastEnabled');
const gamerPonerNoMolestar = v => (v === null || v === undefined
  ? run('reg', ['delete', TOAST, '/v', 'ToastEnabled', '/f']).catch(() => '')
  : run('reg', ['add', TOAST, '/v', 'ToastEnabled', '/t', 'REG_DWORD', '/d', String(v ? 1 : 0), '/f']));
async function gamerMonitores() {                                  // [{nombre, ancho, alto, actualHz, maxHz, principal}]
  const out = await run('powershell.exe', [...PS, fuera(path.join(__dirname, '..', '..', 'gamer', 'monitores.ps1'))], { timeout: 30_000 });
  const v = JSON.parse(out.trim().replace(/^﻿/, '') || '[]'); return Array.isArray(v) ? v : [v];
}
async function gamerInicio() {                                     // SOLO listar: Run de HKCU/HKLM + carpetas Inicio
  const out = await ps(`$r=@(); foreach($k in 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'){ $p=Get-ItemProperty -Path $k -ErrorAction SilentlyContinue; if($p){ $p.PSObject.Properties | ? { $_.Name -notlike 'PS*' } | % { $r+=[pscustomobject]@{nombre=$_.Name;comando=[string]$_.Value;origen=($k -replace ':.*','')} } } }; foreach($d in [Environment]::GetFolderPath('Startup'),[Environment]::GetFolderPath('CommonStartup')){ Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue | % { $r+=[pscustomobject]@{nombre=$_.BaseName;comando=$_.FullName;origen='carpeta Inicio'} } }; ConvertTo-Json -InputObject @($r) -Compress`, { timeout: 30_000 });
  const v = JSON.parse(out.trim() || '[]'); return Array.isArray(v) ? v : [v];
}
const gamer = { gamerPlanes, gamerPonerPlan, gamerProcesos, gamerSuspender, gamerReanudar, gamerCerrar, gamerPrioridad, gamerPonerPrioridad, gamerLeerRegistro, gamerNoMolestar, gamerPonerNoMolestar, gamerMonitores, gamerInicio };

module.exports = { nombre: 'windows', soportado: true, terminal: true, ejecutarPantalla, lanzarManos, lanzarFlujo, lanzarGrabadora, localizarTerminal, enfocarTerminal, escribirEnTerminal, abrirTerminal, voz, ...gamer };
