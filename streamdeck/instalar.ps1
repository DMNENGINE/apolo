# Copia el plugin a Stream Deck y reinicia Stream Deck (Stream Deck no acepta plugins enlazados con junction).
$src = Join-Path $PSScriptRoot 'com.robotcompanion.sdPlugin'
$dst = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.robotcompanion.sdPlugin"
Get-Process StreamDeck -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
Start-Sleep -Seconds 2
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -Confirm:$false }
Copy-Item $src $dst -Recurse -Force
Start-Process "C:\Program Files\Elgato\StreamDeck\StreamDeck.exe"
Write-Host "Plugin instalado en $dst"
