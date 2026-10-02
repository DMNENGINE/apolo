# Escucha una frase por el micrófono con el reconocedor de Windows (es-ES, sin internet)
# e imprime JSON: {"text": "...", "conf": 0.87}  (texto vacío si no entendió nada)
param([int]$Seconds = 8)
Add-Type -AssemblyName System.Speech
$ci = New-Object System.Globalization.CultureInfo 'es-ES'
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine $ci
$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$rec.SetInputToDefaultAudioDevice()
$rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5)
$rec.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
$rec.BabbleTimeout = [TimeSpan]::FromSeconds($Seconds)
$r = $rec.Recognize([TimeSpan]::FromSeconds($Seconds))
$rec.Dispose()
$out = if ($r) { @{ text = $r.Text; conf = [math]::Round($r.Confidence, 2) } } else { @{ text = ''; conf = 0 } }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out | ConvertTo-Json -Compress
