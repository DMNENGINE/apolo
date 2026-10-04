# Ventana de la terminal de un proceso (la sesion de Claude Code): imprime "hwnd|proceso" o nada.
# 1) Su consola: con Windows Terminal la ventana de la consola es un pseudo-ventana cuyo DUENO es la ventana de la terminal
#    (Windows Terminal no esta en la cadena de padres); con la consola clasica es la propia ventana visible.
# 2) Si no (VS Code y otros que usan ConPTY sin dueno): sube por los padres hasta uno con ventana, sin contar el Explorador.
param([int]$Proceso)
Add-Type -Name K -Namespace U -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern bool FreeConsole();
[DllImport("kernel32.dll")] public static extern bool AttachConsole(uint pid);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
'@
function Nombre($h) { $p = 0; [U.K]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null; (Get-Process -Id $p -EA SilentlyContinue).ProcessName }

[U.K]::FreeConsole() | Out-Null
if ([U.K]::AttachConsole([uint32]$Proceso)) {
  $h = [U.K]::GetConsoleWindow()
  $dueno = [U.K]::GetWindow($h, 4)                       # GW_OWNER
  [U.K]::FreeConsole() | Out-Null
  if ($dueno -ne [IntPtr]::Zero -and [U.K]::IsWindowVisible($dueno)) { "$dueno|$(Nombre $dueno)"; exit }
  if ($h -ne [IntPtr]::Zero -and [U.K]::IsWindowVisible($h) -and (Nombre $h) -match '^(conhost|OpenConsole)$') { "$h|consola"; exit }
}
$p = $Proceso
for ($i = 0; $i -lt 15 -and $p; $i++) {
  $c = Get-CimInstance Win32_Process -Filter "ProcessId=$p"
  if (-not $c) { break }
  if ($c.Name -ne 'explorer.exe') {
    $pr = Get-Process -Id $p -EA SilentlyContinue
    if ($pr -and $pr.MainWindowHandle -ne 0) { "$($pr.MainWindowHandle)|$($pr.ProcessName)"; exit }
  }
  $p = $c.ParentProcessId
}
