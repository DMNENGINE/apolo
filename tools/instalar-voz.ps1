# APOLO - voz neural y microfono (opcional). Lo lanza la bandeja: "Instalar voz y microfono (Python + Whisper)".
# Instala Python 3.12 (winget) si falta y luego edge-tts (voz neural) + faster-whisper (reconocimiento local, CPU).
# Sin esto APOLO usa la voz de Windows y el reconocedor de Windows (System.Speech).
$ErrorActionPreference = 'Stop'
function Tiene($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
Write-Host "`n   APOLO - instalando voz y microfono`n" -ForegroundColor Green
try {
  $py = $null
  foreach ($c in 'python', 'py') { if (Tiene $c) { $out = & $c --version 2>&1; if ("$out" -match 'Python 3') { $py = $c; break } } }
  if (-not $py) {
    if (-not (Tiene 'winget')) { throw "Falta Python y no hay winget. Instala Python 3.12 desde https://python.org (marca 'Add to PATH') y repite." }
    Write-Host '==> Instalando Python 3.12 (winget)...' -ForegroundColor Green
    winget install --id Python.Python.3.12 -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    if (Tiene 'python') { $py = 'python' } else { throw 'Python no quedo en el PATH: cierra sesion y vuelve a intentarlo.' }
  }
  Write-Host '==> Instalando edge-tts y faster-whisper (1-3 min, ~300 MB)...' -ForegroundColor Green
  & $py -m pip install --disable-pip-version-check --user edge-tts faster-whisper
  if ($LASTEXITCODE -ne 0) { throw "pip termino con codigo $LASTEXITCODE" }
  Write-Host "`n   Listo. Reinicia APOLO (bandeja -> Salir y abrelo de nuevo) para usar la voz neural y el microfono." -ForegroundColor Green
} catch {
  Write-Host "`n   ! $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host '   APOLO funciona igual con la voz de Windows.' -ForegroundColor Gray
}
Read-Host "`nPulsa Enter para cerrar"
