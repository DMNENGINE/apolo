# Menú de APOLO: gancho global de ratón. Ctrl + Alt + clic derecho en cualquier sitio -> se "come" ese clic (no sale el menú
# del programa) y escribe por stdout UNA línea JSON con dónde fue y el contexto (Explorador: carpeta y selección).
# Lo arranca main/menu-apolo.js; si muere, lo relanza. Sin otros efectos: no toca ningún otro clic ni tecla.
# Guardado con BOM (PowerShell 5.1 lee los .ps1 sin BOM como ANSI).
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class GanchoMenu {
  delegate IntPtr Proc(int code, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] struct PT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct MSLL { public PT pt; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint m; public IntPtr w, l; public uint t; public PT p; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint hilo);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(PT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  public static BlockingCollection<string> Cola = new BlockingCollection<string>();
  static Proc proc; static bool comido;

  static bool Pulsada(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static IntPtr Raton(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      int msg = w.ToInt32();
      if (msg == 0x0204 && Pulsada(0x11) && Pulsada(0x12) && !Pulsada(0x10)) {          // WM_RBUTTONDOWN con Ctrl+Alt (sin Mayús)
        comido = true; return (IntPtr)1;
      }
      if (msg == 0x0205 && comido) {                                                      // WM_RBUTTONUP del mismo clic
        comido = false;
        MSLL d = (MSLL)Marshal.PtrToStructure(l, typeof(MSLL));
        IntPtr raiz = GetAncestor(WindowFromPoint(d.pt), 2);                               // GA_ROOT
        Cola.Add(d.pt.x + "," + d.pt.y + "," + raiz.ToInt64());
        return (IntPtr)1;
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, w, l);
  }
  public static void Iniciar() {
    var t = new Thread(() => {
      SetProcessDPIAware();
      proc = Raton;
      SetWindowsHookEx(14, proc, GetModuleHandle(null), 0);                                // WH_MOUSE_LL
      MSG m; while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
    });
    t.IsBackground = true; t.Start();
  }
}
"@
[GanchoMenu]::Iniciar()
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Write-Output '{"evento":"listo"}'; [Console]::Out.Flush()
$shell = New-Object -ComObject Shell.Application
while ($true) {
  $l = [GanchoMenu]::Cola.Take()
  $x, $y, $h = $l.Split(',')
  $hwnd = [IntPtr][long]$h
  $cls = New-Object Text.StringBuilder 256; [void][GanchoMenu]::GetClassName($hwnd, $cls, 256)
  $tit = New-Object Text.StringBuilder 512; [void][GanchoMenu]::GetWindowText($hwnd, $tit, 512)
  $procId = 0; [void][GanchoMenu]::GetWindowThreadProcessId($hwnd, [ref]$procId)
  $app = ''; try { $app = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { }
  $carpeta = $null; $sel = @()
  $clase = $cls.ToString()
  try {
    if ($clase -eq 'CabinetWClass') {
      foreach ($w in $shell.Windows()) {
        if ([long]$w.HWND -eq [long]$h) {
          $carpeta = $w.Document.Folder.Self.Path
          $sel = @($w.Document.SelectedItems() | ForEach-Object { $_.Path })
          break
        }
      }
    } elseif ($clase -eq 'Progman' -or $clase -eq 'WorkerW') {
      $carpeta = [Environment]::GetFolderPath('Desktop')
    }
  } catch { }
  $o = [ordered]@{ evento = 'menu'; x = [int]$x; y = [int]$y; app = $app; clase = $clase; titulo = $tit.ToString(); carpeta = $carpeta; seleccion = $sel }
  Write-Output ($o | ConvertTo-Json -Compress -Depth 3)
  [Console]::Out.Flush()
}
