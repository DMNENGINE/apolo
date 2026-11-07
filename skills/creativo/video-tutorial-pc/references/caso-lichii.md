# Caso real: tutorial "Cómo instalar Lichii" (2026-11-07)

Carpeta: `C:\Users\yosoy\Videos\Tutorial Lichii\` (guion `monologo.md`, `Grabaciones OBS\`, `Voz\`, `Voz_EN\`, `.fcproj` ES/EN, MP4 finales, miniaturas, textos de YouTube).

## Estructura final (4:33)
| Tiempo | Sección | Qué se ve |
|---|---|---|
| 0:00 | 00 Gancho | doble clic en el juego en Lichii → "Launching…" → título → 21 s en Hyrule Field (audio SOLO de lichii.exe, −10 dB bajo la voz) |
| 0:30 | 01 Portada | "LICHII" + "Emulador de Switch 2 en PC · Guía de instalación" |
| 0:40 | 02 El repositorio oficial | GitHub del proyecto, README |
| 0:57 | 03 Descargar de GitHub | Releases → build 95 → Downloads and installation → Windows ZIP → Assets con SHA-256 |
| 2:03 | 04 Verificar el SHA-256 | PowerShell `Get-FileHash` = digest de GitHub |
| 2:22 | 05 Extraer y abrir | Descargas (DESENFOCADA salvo el zip y el diálogo) → Extraer todo → `C:\Emuladores\Lichii` → SmartScreen (lo pulsó el usuario) |
| 3:13 | 06 Keys y firmware | File → Open Lichii Folders → Root Data Folder (`%APPDATA%\eden\keys`); Tools → Install Decryption Keys / Install Firmware (From Folder / From ZIP) — sin abrir las keys |
| 3:45 | 07+08 Juegos y configuración | Add New Game Directory; Emulation → Configure → Graphics (Vulkan, GPU) y Controls; Cancel |
| 4:19 | 09 Cierre | Issues de GitHub; "pásate por el Discord"; fundido a negro |

## Lo que salió mal y cómo se arregló
- 12:55 de grabación bruta → 4:33: casi todo eran pausas mientras el agente pensaba entre acciones. Ahora: `freezedetect` + `edl.py` dejando 2,5 s por pausa.
- Menú equivocado al mover el ratón en diagonal (Emulation en vez de File, Multiplayer en vez de Tools) → cortados. Mueve primero en vertical dentro del menú.
- Chrome se ponía delante al fallar `SetForegroundWindow` → cortado; usa la barra de tareas.
- La barra de tareas se veía sobre el juego a pantalla completa → zoom 107 % y posición (960, 578.6).
- El usuario pidió quitar la lectura de la URL de GitHub en la voz: el enlace se reparte por su Discord. La voz dice "el enlace te lo dejo en mi Discord".
- Miniatura con "120 FPS": lo publicado sobre Lichii era 60 FPS → se le avisó.
- El usuario pidió publicar en Discord un enlace de buzzheavier: era el juego completo (.nup 25.6 GB) → no se publicó; canal creado sin él.
- Activar el WebSocket de OBS fue denegado → AppCap propio (loopback por proceso) para el audio de la app.

## Voces
- ES: `es-MX-JorgeNeural`, secciones 02 y 03 a +5 % / +10 % para caber. Pronunciación: "Líchi", "zortos dos nueve tres", hash "uno, cinco, seis, cero, B, nueve…".
- EN: `en-US-AndrewNeural` (más corta que la ES; cabe todo a +0 %). Pronunciación "Lichee".

## Publicación
- Título ES: "Zelda Ocarina of Time REMAKE en PC 🔥 Instala Lichii (Emulador Switch 2)". EN: "Zelda Ocarina of Time REMAKE on PC 🔥 How to Install Lichii (Switch 2 Emulator)".
- Discord: canal `🍒│𝐋𝐈𝐂𝐇𝐈𝐈-𝐒𝐖𝐈𝐓𝐂𝐇-𝟐` (1568716866191360110) en TOOLS de DIGITAL VOID, solo lectura, embed ES+EN (mensaje 1568716869333033181) con "Próximamente" hasta tener el link de YouTube.
