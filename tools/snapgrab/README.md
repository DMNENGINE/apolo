# SnapGrab dentro de APOLO

Motor procedente de `E:\Proyectos\PC\deepseek-harness\default-workspace\snapgrab` (2026-11-10). Se incorporaron únicamente `grab.py`, `instagram.py` y `twitter.py`. No se copiaron perfiles, cookies, sesiones ni configuraciones. La aplicación original permanece intacta.

El menú **Ctrl + Alt + clic derecho → SnapGrab** identifica la página de la ventana del clic mediante la extensión conectada de APOLO. Abre una ventana propia con la estética del menú; analiza primero y descarga cuando se pulsa Vídeo, Fotos, Audio o Todo. El objetivo permanece fijado aunque después se cambie de pestaña. Ante títulos ambiguos o sitios protegidos se informa del problema y no se elige otra página.

Las descargas quedan en `Descargas\SnapGrab\descarga-*`, en una carpeta por trabajo para no sobrescribir archivos anteriores. Cancelar o cerrar la ventana termina Python y sus procesos de ffmpeg; puede quedar un archivo parcial en la carpeta del trabajo. El límite por trabajo es de 30 minutos. El análisis tiene 90 segundos de límite. No se ejecuta una consola interactiva ni se leen cookies del navegador.

## Dependencias

Python 3.10 o posterior, `yt-dlp[default]`, `curl_cffi` y ffmpeg. Para Instagram, el motor utiliza `instagrapi` con respaldo `instaloader`. La detección de ffmpeg conserva PATH y WinGet del original. No se instalaron paquetes en esta integración; se usan los que ya estaban disponibles en este equipo. El contenido que exija autenticación puede fallar: las sesiones de la aplicación original no se migraron.

## Adaptación

- `puente.py`: protocolo JSON por stdin/stdout, progreso, selección de formato y comprobación de archivos guardados. No devuelve datos internos ni URL firmadas a la interfaz.
- `grab.py`: audio usa `bestaudio/best` para admitir vídeo con sonido integrado. El puente corrige la llamada de «solo fotos», que antes también incluía vídeos.
- `twitter.py`: audio filtra las fotos. El puente pone ffmpeg en PATH para los extractores propios y verifica que el resultado de audio sea MP3.
- La integración no utiliza Tkinter ni modifica el aspecto del menú existente.

## Comprobación

`node tools/probar-snapgrab.cjs`: genera un vídeo ficticio con ffmpeg y lo sirve solo en localhost; abre una ventana Electron oculta con el puente real, analiza, descarga MP4, extrae MP3, comprueba cancelación y guarda capturas. No utiliza cuentas ni publicaciones del usuario. Las pruebas de `core/test/snapgrab.test.js` comprueban selección de destino, sitios protegidos, validación de resultados y cancelación del motor. No se verificó cada plataforma remota: dependen de sus extractores y permisos.

Resultado de esta integración (2026-11-10): 14 pruebas dirigidas aprobadas y prueba real de Electron/IPC/Python/MP4/MP3/cancelación aprobada, con captura del menú y de la ventana. Suite general: 553 de 554; el fallo de `rutas-fijas.test.js` procede de `core/remoto/manos/generar-manos.py` (archivo de otra sesión, no modificado aquí).
