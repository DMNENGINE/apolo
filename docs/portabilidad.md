# Portabilidad: macOS y Linux

Estado (2026-10-05): **Linux fase 1 hecha** (APOLO útil con Claude Code: terminales, hooks, autoarranque, `install.sh`; probado en Debian 13 ARM64). Ver la pantalla y las manos siguen siendo solo Windows; macOS sin empezar. El **núcleo** (`core/`: agente, modelos, memoria, tareas, skills, panel web, API) es Node puro y sus tests corren en Linux en la CI. Este documento inventaría todo lo que depende de Windows y el plan por módulo.

## Capa de SO del escritorio

`core/escritorio/so/` es la frontera: `index.js` elige `windows.js`, `mac.js` o `linux.js` por `process.platform`, todos con la misma interfaz:

| Función | Windows (hoy) | Uso |
|---|---|---|
| `ejecutarPantalla(args)` | `pantalla.ps1` (System.Drawing + UI Automation) | ver pantalla, comprobar tras cada acción |
| `lanzarManos()` | `manos.ps1` (SendInput, hooks de ratón/teclado para el pánico) | control del PC, demostraciones |
| `escribirEnTerminal({hwnd, archivo})` | `tools/escribir.ps1` | hablar con una sesión de Claude Code |
| `abrirTerminal(dir, args)` | `wt.exe` | nueva sesión de Claude Code |
| `voz.escuchar()` | `tools/listen.ps1` (System.Speech) | reserva sin Whisper |

`mac.js` y `linux.js` son *stubs*: devuelven `soportado: false` y cada función falla con el mensaje "… aún no está disponible en mac/linux (solo Windows por ahora)" (`codigo: 'SO_NO_SOPORTADO'`). Para portar un módulo basta con implementar sus funciones en el archivo del SO; el resto del código no cambia.

Ya pasan por la capa: `core/escritorio/index.js` (captura) y `core/escritorio/control.js` (manos). Pendiente de mover: `hablar.js` (escribir/wt), `main.js` (listen.ps1, foco de terminal, pantalla completa).

## Inventario de lo Windows-only

| Módulo | Qué usa | macOS | Linux | Prioridad |
|---|---|---|---|---|
| `core/escritorio/pantalla.ps1` | System.Drawing, UI Automation | `screencapture` + ayudante Swift con la API de Accesibilidad (AXUIElement); permisos de Grabación de pantalla y Accesibilidad | `grim` (Wayland) / `import`/`xwd` (X11) + AT-SPI (`python3-pyatspi`) | Media |
| `core/escritorio/manos.ps1` | SendInput, low-level hooks (pánico) | ayudante Swift: CGEvent + CGEventTap | `ydotool` (Wayland, requiere uinput) / `xdotool` (X11); pánico con libinput/evdev | Media |
| `core/escritorio/demo.js` | grabación de macros (manos.ps1) | igual que manos | igual que manos | Baja |
| `tools/escribir.ps1` (`hablar.js`) | escribir en la ventana de la terminal por HWND | AppleScript (`osascript`) a Terminal/iTerm | ✅ `so/linux.js`: tmux (`load-buffer` + `paste-buffer -p` + Enter; el hook manda `TMUX_PANE`/`TMUX`), si no X11 + `xdotool` con `WINDOWID`; si no, sesión nueva | Hecho (Linux) |
| `wt.exe` (`hablar.js`) | abrir Windows Terminal | `osascript -e 'tell app "Terminal" to do script …'` | ✅ el emulador que haya (x-terminal-emulator, gnome-terminal, konsole, xfce4, kitty, alacritty, wezterm, foot, xterm) ejecutando `tmux new-session -c dir -- claude …` | Hecho (Linux) |
| `main.js` focusTerminal | `tools/ventana-terminal.ps1` (consola → dueño) | `osascript` activate de la app padre | ✅ X11: `xdotool windowactivate` / `wmctrl -ia`; tmux: selecciona el panel; Wayland: no hay API estándar | Hecho (Linux X11) |
| `tools/pantalla-completa.ps1` (`main.js`) | ¿hay app a pantalla completa? (no molestar) | `CGWindowListCopyWindowInfo` | `_NET_WM_STATE_FULLSCREEN` (X11) | Baja |
| `tools/listen.ps1` | System.Speech (STT de reserva) | `SFSpeechRecognizer` o directamente Whisper | Whisper (no hay STT de sistema) | Baja |
| TTS de reserva | voz de Windows (speechSynthesis de Chromium) | funciona igual (`say` como extra) | speechSynthesis necesita `speech-dispatcher` | Baja |
| `tools/dms_reader.py` | `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db` | NotificationCenter `db2` (SQLite, protegido por TCC) | D-Bus `org.freedesktop.Notifications` (monitor) | Baja |
| `core/boveda.js` | DPAPI vía PowerShell | Keychain (safeStorage de Electron; ya soportado) | libsecret / kwallet (safeStorage; ya soportado) | Hecho |
| `conectores/almacen.js` | safeStorage (DPAPI) | Keychain | libsecret | Hecho |
| `core/herramientas.js` shell | `powershell.exe` | ya usa `bash` fuera de Windows | ya usa `bash` | Hecho |
| `core/skills/instalar.js`, `taller.js` | `tar.exe` / Expand-Archive | `tar`/`unzip` del sistema | `tar`/`unzip` | Revisar exportar zip |
| `core/turno-video.js`, `core/wrapped.js` | rutas de Edge/Chrome en `C:/Program Files` | `/Applications/Google Chrome.app/…` | `google-chrome`, `chromium` en PATH | Media |
| `shared/peligro.js` | patrones de comandos de Windows | añadir patrones bash/zsh (ya hay muchos) | ídem | Media |
| `main.js` autoarranque | `app.setLoginItemSettings` | soportado por Electron | ✅ `~/.config/autostart/apolo.desktop` | Hecho (Linux) |
| `main.js` hooks | `node "<ruta>"` o `hook.cmd` | `node` o el binario de la app con `ELECTRON_RUN_AS_NODE=1` | ✅ `node`, el Node propio de `install.sh` (`.node/bin/node`) o el AppImage con `ELECTRON_RUN_AS_NODE=1` sobre una copia del hook en los datos (la ruta interna del AppImage cambia en cada arranque) | Hecho (Linux) |
| `install.ps1`, `tools/instalar-voz.ps1`, `streamdeck/instalar.ps1` | PowerShell, winget | `install.sh` con Homebrew | ✅ `install.sh` (Node 22 propio sin sudo si falta, sandbox de Chromium en Ubuntu 23.10+, `.desktop`, voz con pip); bandeja → voz en una terminal; Stream Deck no existe en Linux | Hecho (Linux) |
| `actualizador.js` (one-liner) | relanza `install.ps1` | `install.sh` | ✅ `curl … install.sh \| bash` en una terminal; AppImage: electron-updater | Hecho (Linux) |
| `streamdeck/` | plugin Elgato | Stream Deck existe en macOS (mismo plugin) | no hay app oficial (OpenDeck) | Baja |
| Rutas | `%APPDATA%`, `%LOCALAPPDATA%` | `core/config.js` ya usa `~/Library/Application Support` | ya usa `$XDG_CONFIG_HOME` | Hecho |

## Empaquetado

`package.json` → `build` ya define `mac` (dmg, `build/icon.png`) y `linux` (AppImage). No se construyen en la CI salvo que la variable del repositorio `APOLO_BUILD_MAC_LINUX` sea `true` (`.github/workflows/release.yml`). Para macOS hará falta además: certificado Developer ID + notarización (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) y `entitlements` para micrófono, Accesibilidad y Grabación de pantalla.

## Orden propuesto

1. ✅ (Linux) Hooks + `hablar.js` (escribir/abrir terminal) + autoarranque → APOLO útil con Claude Code sin control del PC.
   Pendiente de probar en un escritorio real: la isla (transparencia, clic a través; en Wayland Electron corre en XWayland y la posición global del ratón puede no llegar), la bandeja y abrir terminales.
2. `install.sh` (one-liner) y build de AppImage/dmg en CI.
3. Captura de pantalla + elementos (ver la pantalla).
4. Manos + pánico (lo más delicado: permisos del SO y Wayland).
5. Extras: notificaciones de DMs, pantalla completa, foco de terminal.
