# ui.ps1 <cmd> [a1] [a2] [a3] — shot | click x y | dclick x y | rclick x y | move x y | scroll x y n | keys "^a" | type "texto" | front "titulo" | wins
# Coordenadas reales de pantalla (DPI-aware). shot guarda TEMP/apolo-video/s.png escalada a 1280 de ancho (multiplica x1,5).
param([string]$cmd, [string]$a1, [string]$a2, [string]$a3)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class U {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,int d,UIntPtr e);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[U]::SetProcessDPIAware() | Out-Null
$S = Join-Path $env:TEMP "apolo-video"; New-Item -ItemType Directory -Force $S | Out-Null
function Move-Smooth($x,$y){ $p=[System.Windows.Forms.Cursor]::Position; for($i=1;$i -le 20;$i++){ [U]::SetCursorPos([int]($p.X+($x-$p.X)*$i/20),[int]($p.Y+($y-$p.Y)*$i/20)); Start-Sleep -Milliseconds 15 } }
switch ($cmd) {
 'shot'   { & ffmpeg -hide_banner -loglevel error -y -f gdigrab -offset_x 0 -offset_y 0 -video_size 1920x1080 -i desktop -frames:v 1 -vf "scale=1280:-1" "$S\s.png" }
 'click'  { Move-Smooth ([int]$a1) ([int]$a2); Start-Sleep -Milliseconds 150; [U]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [U]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
 'dclick' { Move-Smooth ([int]$a1) ([int]$a2); Start-Sleep -Milliseconds 150; 1..2|%{[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [U]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60} }
 'rclick' { Move-Smooth ([int]$a1) ([int]$a2); Start-Sleep -Milliseconds 150; [U]::mouse_event(8,0,0,0,[UIntPtr]::Zero); [U]::mouse_event(16,0,0,0,[UIntPtr]::Zero) }
 'move'   { Move-Smooth ([int]$a1) ([int]$a2) }
 'scroll' { Move-Smooth ([int]$a1) ([int]$a2); for($i=0;$i -lt [Math]::Abs([int]$a3);$i++){ [U]::mouse_event(0x800,0,0,[Math]::Sign([int]$a3)*120,[UIntPtr]::Zero); Start-Sleep -Milliseconds 120 } }
 'keys'   { [System.Windows.Forms.SendKeys]::SendWait($a1) }
 'type'   { foreach($c in $a1.ToCharArray()){ $k="$c"; if('+^%~(){}[]'.Contains($k)){$k="{$k}"}; [System.Windows.Forms.SendKeys]::SendWait($k); Start-Sleep -Milliseconds 45 } }
 'front'  { $p = Get-Process | ? { $_.MainWindowTitle -like "*$a1*" } | select -First 1; if($p){ [U]::ShowWindow($p.MainWindowHandle,9)|Out-Null; [U]::MoveWindow($p.MainWindowHandle,0,0,1920,1040,$true)|Out-Null; [U]::ShowWindow($p.MainWindowHandle,3)|Out-Null; [U]::SetForegroundWindow($p.MainWindowHandle)|Out-Null; "ok $($p.MainWindowTitle)" } else { "notfound" } }
 'wins'   { Get-Process | ? MainWindowTitle | % { "$($_.ProcessName) | $($_.MainWindowTitle)" } }
}
