; Personalización del instalador NSIS de APOLO (electron-builder lo incluye con nsis.include).
; - Instalar: pregunta "Iniciar con Windows" (silencioso /S = sí) y lo deja en autoarranque.txt; main.js lo lee en el primer arranque.
; - Desinstalar: quita los hooks de Claude Code/Gemini CLI y pregunta si borrar también tus datos (silencioso = NO se borran).
;   En una actualización (el instalador nuevo desinstala el viejo con --updated) no se pregunta ni se toca nada.

!macro customInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "¿Iniciar APOLO automáticamente con Windows?$\r$\n(Se puede cambiar luego desde el icono de la bandeja.)" /SD IDYES IDNO apolo_sin_arranque
      FileOpen $0 "$INSTDIR\autoarranque.txt" w
      FileWrite $0 "1"
      FileClose $0
      Goto apolo_arranque_listo
    apolo_sin_arranque:
      FileOpen $0 "$INSTDIR\autoarranque.txt" w
      FileWrite $0 "0"
      FileClose $0
    apolo_arranque_listo:
  ${endIf}
  ; comando `apolo` en cualquier terminal (también al actualizar: no duplica)
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\app.asar.unpacked\tools\ruta-cli.ps1" -Agregar "$INSTDIR\resources\app.asar.unpacked\bin"'
  Pop $0
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; hooks fuera (con copia de seguridad) usando el propio APOLO.exe como node
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
    nsExec::Exec '"$INSTDIR\APOLO.exe" "$INSTDIR\resources\app.asar.unpacked\tools\quitar-hooks.js"'
    Pop $0
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", n)'
    ; comando `apolo` fuera del PATH
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\app.asar.unpacked\tools\ruta-cli.ps1" -Quitar "$INSTDIR\resources\app.asar.unpacked\bin"'
    Pop $0
    ; arranque con Windows fuera (la clave la crea app.setLoginItemSettings)
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.APOLO"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.dmnengine.apolo"
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Borrar también tus datos de APOLO?$\r$\n$\r$\n$APPDATA\robot-companion (memoria, sesiones, ajustes, claves cifradas)$\r$\n$\r$\nSi eliges No, se conservan para una futura reinstalación." /SD IDNO IDNO apolo_conservar
      RMDir /r "$APPDATA\robot-companion"
      Delete "$PROFILE\.claude\robot-companion.token"
    apolo_conservar:
  ${endIf}
!macroend
