@echo off
rem Hook de APOLO para PCs SIN Node.js (instalacion .exe): ejecuta hook.js con el propio APOLO.exe en modo node.
rem Ruta: <instalacion>\resources\app.asar.unpacked\hook\hook.cmd  ->  <instalacion>\APOLO.exe
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\..\APOLO.exe" "%~dp0hook.js" %*
