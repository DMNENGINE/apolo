# Escribe un mensaje en la ventana de terminal de una sesión de Claude Code y pulsa Enter.
# Uso: escribir.ps1 -Hwnd <handle> -File <archivo utf8 con el texto>
# Guarda y restaura el portapapeles. Usa el truco de la tecla Alt para poder traer la ventana al frente.
param([Parameter(Mandatory)] [long]$Hwnd, [Parameter(Mandatory)] [string]$File)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Name W -Namespace U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
'@
$text = (Get-Content -Raw -Encoding UTF8 $File) -replace "[\r\n]+", ' '
$h = [IntPtr]$Hwnd
$old = $null; try { $old = Get-Clipboard -Raw } catch { }
if ([U.W]::IsIconic($h)) { [U.W]::ShowWindowAsync($h, 9) | Out-Null }
[U.W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [U.W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)   # Alt: permite robar el foco
[U.W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 350
if ([U.W]::GetForegroundWindow() -ne $h) { Write-Output 'NOFOCUS'; exit 1 }
Set-Clipboard -Value $text
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 250
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds 200
if ($null -ne $old) { Set-Clipboard -Value $old }
Write-Output 'OK'
