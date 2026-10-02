# APOLO - instalador de una linea para Windows 10/11
#   irm https://raw.githubusercontent.com/DMNENGINE/apolo/main/install.ps1 | iex
# Instala lo que falte (Node.js LTS, Python + voz), descarga APOLO en %LOCALAPPDATA%\APOLO,
# instala dependencias (Electron incluido), crea accesos directos y lo arranca.
# Volver a ejecutarlo = actualizar (tus datos viven en %APPDATA%\robot-companion y no se tocan).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'          # Invoke-WebRequest es 10x mas rapido sin barra
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'DMNENGINE/apolo'
$Rama = 'main'
$Dir  = Join-Path $env:LOCALAPPDATA 'APOLO'

function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Green }
function Info($t) { Write-Host "    $t" -ForegroundColor Gray }
function Aviso($t) { Write-Host "    ! $t" -ForegroundColor Yellow }
function RefrescarPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Tiene($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget($id) {
  if (-not (Tiene 'winget')) { throw "No encuentro winget. Instala 'App Installer' desde Microsoft Store y vuelve a intentarlo." }
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
  RefrescarPath
}

Write-Host ''
Write-Host '   APOLO - AI desktop companion' -ForegroundColor Green
Write-Host '   github.com/DMNENGINE/apolo' -ForegroundColor DarkGray

# ---------- 1. Node.js (>= 20) ----------
Paso 'Node.js'
$nodeOk = $false
if (Tiene 'node') { $v = (& node -v) -replace '^v', ''; $nodeOk = ([int]($v.Split('.')[0]) -ge 20); Info "encontrado v$v" }
if (-not $nodeOk) {
  Info 'instalando Node.js LTS (winget)...'
  Winget 'OpenJS.NodeJS.LTS'
  if (-not (Tiene 'node')) { $env:Path += ';' + (Join-Path $env:ProgramFiles 'nodejs') }
  if (-not (Tiene 'node')) { throw 'Node.js no quedo instalado. Instalalo desde https://nodejs.org y vuelve a ejecutar.' }
  Info ('instalado ' + (& node -v))
}
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source       # npm.cmd: npm.ps1 lo bloquea la ExecutionPolicy
if (-not $npm) { $npm = Join-Path (Split-Path (Get-Command node).Source) 'npm.cmd' }

# ---------- 2. Descargar APOLO ----------
Paso "Descargando APOLO en $Dir"
$tmp = Join-Path $env:TEMP ('apolo-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'apolo.zip'
# version exacta (commit) para que APOLO sepa cuando hay una actualizacion
$sha = $null
try { $sha = (Invoke-RestMethod "https://api.github.com/repos/$Repo/commits/$Rama" -Headers @{ 'User-Agent' = 'APOLO-instalador' }).sha } catch { Aviso 'no pude leer la version de GitHub (los avisos de actualizacion no funcionaran)' }
$ref = if ($sha) { $sha } else { "refs/heads/$Rama" }
Invoke-WebRequest "https://codeload.github.com/$Repo/zip/$ref" -OutFile $zip -UseBasicParsing
Expand-Archive $zip -DestinationPath $tmp -Force
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1
# si APOLO esta abierto, cerrarlo antes de reemplazar archivos
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$Dir*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force $Dir | Out-Null
# copia el codigo nuevo; conserva node_modules para que actualizar sea rapido
Get-ChildItem $Dir -Force | Where-Object { $_.Name -ne 'node_modules' } | Remove-Item -Recurse -Force
Copy-Item (Join-Path $src.FullName '*') $Dir -Recurse -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($sha) {
  $json = '{"sha":"' + $sha + '","instalado":"' + (Get-Date).ToString('s') + '"}'
  [IO.File]::WriteAllText((Join-Path $Dir 'instalado.json'), $json)
  Info ('version ' + $sha.Substring(0, 7))
}
Info 'listo'

# ---------- 3. Dependencias (Electron incluido) ----------
Paso 'Instalando dependencias (Electron, three.js, discord.js...) - puede tardar 1-3 min'
Push-Location $Dir
try {
  $env:NODE_ENV = ''                                   # que no se salte nada
  & $npm install --no-audit --no-fund --loglevel=error
  if ($LASTEXITCODE -ne 0) { throw "npm install fallo (codigo $LASTEXITCODE)" }
  $electron = Join-Path $Dir 'node_modules\electron\dist\electron.exe'
  if (-not (Test-Path $electron)) {                     # a veces la descarga del binario falla: reintentar
    Aviso 'el binario de Electron no se descargo, reintentando...'
    & node (Join-Path $Dir 'node_modules\electron\install.js')
  }
  if (-not (Test-Path $electron)) { throw 'No se pudo descargar Electron. Revisa tu conexion o antivirus y vuelve a ejecutar.' }
  Info 'Electron OK'
} finally { Pop-Location }

# ---------- 4. Voz (opcional): Python + edge-tts + faster-whisper ----------
Paso 'Voz neural y microfono (opcional)'
try {
  $py = $null
  foreach ($c in 'python', 'py') { if (Tiene $c) { $out = & $c --version 2>&1; if ("$out" -match 'Python 3') { $py = $c; break } } }
  if (-not $py) {
    Info 'instalando Python 3.12 (winget)...'
    Winget 'Python.Python.3.12'
    if (Tiene 'python') { $py = 'python' }
  }
  if ($py) {
    & $py -m pip install --quiet --disable-pip-version-check --user edge-tts faster-whisper 2>&1 | Out-Null
    Info 'voz neural y reconocimiento de voz instalados'
  } else { Aviso 'sin Python: APOLO usara la voz de Windows y no tendra microfono' }
} catch { Aviso "la voz no se pudo instalar ($($_.Exception.Message)). APOLO funciona igual con la voz de Windows." }

# ---------- 5. Accesos directos ----------
Paso 'Accesos directos'
$ws = New-Object -ComObject WScript.Shell
$destinos = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'APOLO.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'APOLO.lnk')
)
foreach ($l in $destinos) {
  $s = $ws.CreateShortcut($l)
  $s.TargetPath = $electron
  $s.Arguments = '"' + $Dir + '"'
  $s.WorkingDirectory = $Dir
  $s.Description = 'APOLO - AI desktop companion'
  $ico = Join-Path $Dir 'app\icono.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }
  $s.Save()
}
Info 'Menu Inicio y Escritorio'

# ---------- 6. Arrancar ----------
Paso 'Arrancando APOLO'
# a traves del acceso directo con explorer: APOLO queda independiente y NO se cierra al cerrar PowerShell.
# La primera vez APOLO activa solo "Iniciar con Windows" (se puede quitar desde la bandeja).
Start-Process explorer.exe -ArgumentList ('"' + $destinos[0] + '"')
Write-Host ''
Write-Host '   APOLO esta en marcha: busca el robot arriba de tu pantalla y su icono en la bandeja.' -ForegroundColor Green
Write-Host '   Desde la bandeja: "Instalar hooks" (Claude Code) y "Abrir panel de control".' -ForegroundColor Gray
Write-Host '   Arranca solo con Windows. Ya puedes cerrar esta ventana.' -ForegroundColor Gray
Write-Host '   Para actualizar, vuelve a ejecutar el mismo comando.' -ForegroundColor Gray
Write-Host ''
