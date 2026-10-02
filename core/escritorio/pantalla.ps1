# Ojos del robot (Windows, sin dependencias): captura de un monitor + elementos de la ventana activa (UI Automation).
# Uso: pantalla.ps1 -Salida <archivo.jpg> [-Monitor 0|1..N] [-Ancho 1280] [-Elementos 1] [-MaxElementos 120] [-SinImagen]
#   -Monitor 0 = el monitor de la ventana activa. Devuelve JSON por stdout:
#   { monitores:[{n,x,y,ancho,alto,primario}], monitor:n, escala, imagen:{ruta,ancho,alto}, ventana:{titulo,proceso,x,y,ancho,alto}, elementos:[{id,tipo,nombre,valor,x,y,ancho,alto,activo}] }
#   Las coordenadas de los elementos son de PANTALLA (píxeles reales); x,y de la imagen = (pantalla - origen del monitor) / escala.
param([string]$Salida, [int]$Monitor = 0, [int]$Ancho = 1280, [int]$Elementos = 1, [int]$MaxElementos = 120, [switch]$SinImagen)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
'@
[W32]::SetProcessDPIAware() | Out-Null

$pantallas = [System.Windows.Forms.Screen]::AllScreens
$monitores = for ($i = 0; $i -lt $pantallas.Count; $i++) { $b = $pantallas[$i].Bounds; [ordered]@{ n = $i + 1; x = $b.X; y = $b.Y; ancho = $b.Width; alto = $b.Height; primario = $pantallas[$i].Primary } }

# ventana activa
$h = [W32]::GetForegroundWindow()
$sb = New-Object Text.StringBuilder 512; [W32]::GetWindowText($h, $sb, 512) | Out-Null
$procId = 0; [W32]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
$proc = try { (Get-Process -Id $procId).ProcessName } catch { '' }
$r = New-Object W32+RECT; [W32]::GetWindowRect($h, [ref]$r) | Out-Null
$ventana = [ordered]@{ titulo = $sb.ToString(); proceso = $proc; x = $r.L; y = $r.T; ancho = $r.R - $r.L; alto = $r.B - $r.T }

if ($Monitor -lt 1 -or $Monitor -gt $pantallas.Count) { $scr = [System.Windows.Forms.Screen]::FromHandle($h); $Monitor = [Array]::IndexOf($pantallas, $scr) + 1 }
$b = $pantallas[$Monitor - 1].Bounds
$escala = [Math]::Max(1.0, $b.Width / [double]$Ancho)
$res = [ordered]@{ monitores = @($monitores); monitor = $Monitor; escala = [Math]::Round($escala, 4); ventana = $ventana; imagen = $null; elementos = @() }

if (-not $SinImagen) {
  $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
  $g = [Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size); $g.Dispose()
  $w = [int][Math]::Round($b.Width / $escala); $hh = [int][Math]::Round($b.Height / $escala)
  $peq = New-Object Drawing.Bitmap $w, $hh
  $g = [Drawing.Graphics]::FromImage($peq); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($bmp, 0, 0, $w, $hh); $g.Dispose(); $bmp.Dispose()
  $enc = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $par = New-Object Drawing.Imaging.EncoderParameters 1
  $par.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), ([long]72)
  $peq.Save($Salida, $enc, $par); $peq.Dispose()
  $res.imagen = [ordered]@{ ruta = $Salida; ancho = $w; alto = $hh }
}

if ($Elementos -and $h -ne [IntPtr]::Zero) {
  try {
    $A = [Windows.Automation.AutomationElement]
    $raiz = $A::FromHandle($h)
    $tipos = @('Button','Edit','ComboBox','CheckBox','RadioButton','MenuItem','Hyperlink','ListItem','TabItem','TreeItem','Document','Slider','SplitButton','MenuBar','Menu','DataItem','Spinner','Text','Image')
    $interes = $tipos | ForEach-Object { New-Object Windows.Automation.PropertyCondition ($A::ControlTypeProperty), ([Windows.Automation.ControlType]::$_) }
    $cond = New-Object Windows.Automation.AndCondition @(
      (New-Object Windows.Automation.PropertyCondition ($A::IsOffscreenProperty), $false),
      (New-Object Windows.Automation.OrCondition $interes))
    $todos = $raiz.FindAll([Windows.Automation.TreeScope]::Descendants, $cond)
    $lista = New-Object Collections.ArrayList
    foreach ($e in $todos) {
      if ($lista.Count -ge $MaxElementos) { break }
      $c = $e.Current; $rc = $c.BoundingRectangle
      if ($rc.IsEmpty -or $rc.Width -lt 2 -or $rc.Height -lt 2) { continue }
      $tipo = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
      $nombre = ($c.Name -replace '\s+', ' ').Trim()
      if ($tipo -in @('Text','Image') -and -not $nombre) { continue }
      $valor = ''
      if ($tipo -eq 'Edit' -and -not $c.IsPassword) { try { $valor = $e.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { } }
      if ($c.IsPassword) { $valor = '[contraseña]' }
      if ($valor.Length -gt 120) { $valor = $valor.Substring(0, 120) + '…' }
      if ($nombre.Length -gt 100) { $nombre = $nombre.Substring(0, 100) + '…' }
      [void]$lista.Add([ordered]@{ id = $lista.Count + 1; tipo = $tipo; nombre = $nombre; valor = $valor; x = [int]$rc.X; y = [int]$rc.Y; ancho = [int]$rc.Width; alto = [int]$rc.Height; activo = $c.IsEnabled; foco = $c.HasKeyboardFocus; password = $c.IsPassword })
    }
    $res.elementos = @($lista)
  } catch { $res.errorElementos = $_.Exception.Message }
}
$res | ConvertTo-Json -Depth 5 -Compress
