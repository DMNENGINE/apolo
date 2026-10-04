# Copia el plugin a Stream Deck y reinicia Stream Deck (Stream Deck no acepta plugins enlazados con junction).
# El plugin necesita el paquete "ws" (WebSocket; Node 20 de Stream Deck no lo trae): se copia del node_modules de la app.
$src = Join-Path $PSScriptRoot 'com.robotcompanion.sdPlugin'
$dst = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.robotcompanion.sdPlugin"
$ws = Join-Path $PSScriptRoot '..\node_modules\ws'
if (-not (Test-Path (Join-Path $ws 'package.json'))) { Write-Error "Falta node_modules\ws (ejecuta npm install en la carpeta de la app)"; exit 1 }
Get-Process StreamDeck -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
Start-Sleep -Seconds 2
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -Confirm:$false }
Copy-Item $src $dst -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $dst 'node_modules') | Out-Null
Copy-Item $ws (Join-Path $dst 'node_modules\ws') -Recurse -Force
$sd = "${env:ProgramFiles}\Elgato\StreamDeck\StreamDeck.exe"
# con "start" queda independiente: si lo lanza otro script (npm run streamdeck, un agente), no muere con él
if (Test-Path $sd) { Start-Process cmd.exe -ArgumentList '/c', "start `"`" `"$sd`"" -WindowStyle Hidden } else { Write-Warning "No encuentro StreamDeck.exe: ábrelo a mano" }
Write-Host "Plugin instalado en $dst"
