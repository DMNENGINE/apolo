@echo off
rem CLI de APOLO (core\cli.js). Esta carpeta va en el PATH del usuario (instalador .exe e install.ps1).
rem  - instalacion .exe:  <inst>\resources\app.asar.unpacked\bin\apolo.cmd  ->  usa <inst>\APOLO.exe en modo node (no hace falta Node.js)
rem  - install.ps1 / git: %LOCALAPPDATA%\APOLO\bin\apolo.cmd                ->  usa el node del PATH
setlocal
if exist "%~dp0..\..\..\APOLO.exe" (
  set ELECTRON_RUN_AS_NODE=1
  "%~dp0..\..\..\APOLO.exe" "%~dp0..\core\cli.js" %*
) else (
  node "%~dp0..\core\cli.js" %*
)
