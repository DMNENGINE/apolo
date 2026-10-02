# Vigila si la ventana activa está a PANTALLA COMPLETA (juegos, vídeo en F11…) y en qué monitor.
# Escribe una línea JSON solo cuando cambia: {"completa":true,"x":..,"y":..,"ancho":..,"alto":..,"proceso":"..."} | {"completa":false}
# La usa main.js para que la isla se vaya rodando a otro monitor mientras juegas y vuelva al terminar.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class PC {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
}
'@
[PC]::SetProcessDPIAware() | Out-Null
$ultimo = ''
$ignorar = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow')
while ($true) {
  $res = '{"completa":false}'
  $h = [PC]::GetForegroundWindow()
  if ($h -ne [IntPtr]::Zero) {
    $cls = New-Object Text.StringBuilder 256; [PC]::GetClassName($h, $cls, 256) | Out-Null
    $procId = 0; [PC]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
    $proc = (Get-Process -Id $procId).ProcessName
    if ($ignorar -notcontains $cls.ToString() -and $proc -ne 'electron' -and $procId -ne $PID) {
      $r = New-Object PC+RECT; [PC]::GetWindowRect($h, [ref]$r) | Out-Null
      $mi = New-Object PC+MONITORINFO; $mi.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($mi)
      [PC]::GetMonitorInfo([PC]::MonitorFromWindow($h, 2), [ref]$mi) | Out-Null
      $m = $mi.rcMonitor
      $cubre = $r.L -le $m.L -and $r.T -le $m.T -and $r.R -ge $m.R -and $r.B -ge $m.B
      $sinTitulo = ([PC]::GetWindowLong($h, -16) -band 0x00C00000) -ne 0x00C00000      # WS_CAPTION
      if ($cubre -and $sinTitulo) { $res = '{"completa":true,"x":' + $m.L + ',"y":' + $m.T + ',"ancho":' + ($m.R - $m.L) + ',"alto":' + ($m.B - $m.T) + ',"proceso":"' + ($proc -replace '[^\w .-]', '') + '"}' }
    }
  }
  if ($res -ne $ultimo) { [Console]::Out.WriteLine($res); [Console]::Out.Flush(); $ultimo = $res }
  Start-Sleep -Milliseconds 1000
}
