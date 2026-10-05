# Pone o quita una carpeta del PATH del usuario (para el comando `apolo`).
#   powershell -NoProfile -ExecutionPolicy Bypass -File ruta-cli.ps1 -Agregar <carpeta>
#   powershell -NoProfile -ExecutionPolicy Bypass -File ruta-cli.ps1 -Quitar <carpeta>
# Lee y escribe el registro tal cual (REG_EXPAND_SZ, sin expandir %USERPROFILE%...): [Environment]::SetEnvironmentVariable
# lo guardaria como REG_SZ y romperia las entradas con variables.
param([string]$Agregar, [string]$Quitar)
$clave = 'HKCU:\Environment'
$reg = Get-Item $clave
$actual = $reg.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$partes = @($actual -split ';')                       # se conservan tal cual (también los huecos ';;')
$norm = { param($p) $p.TrimEnd('\').ToLowerInvariant() }
if ($Agregar) {
  if ($partes | Where-Object { $_ -and (& $norm $_) -eq (& $norm $Agregar) }) { exit 0 }
  $nuevo = if ($actual -eq '') { $Agregar } elseif ($actual.EndsWith(';')) { $actual + $Agregar + ';' } else { $actual + ';' + $Agregar }
} elseif ($Quitar) {
  $nuevo = (@($partes | Where-Object { -not $_ -or (& $norm $_) -ne (& $norm $Quitar) })) -join ';'
  if ($nuevo -eq $actual) { exit 0 }
} else { exit 1 }
Set-ItemProperty -Path $clave -Name Path -Value $nuevo -Type ExpandString
# avisa a Windows (WM_SETTINGCHANGE) para que las terminales nuevas vean el PATH nuevo
[Environment]::SetEnvironmentVariable('APOLO_RUTA_TMP', '1', 'User')
[Environment]::SetEnvironmentVariable('APOLO_RUTA_TMP', $null, 'User')
