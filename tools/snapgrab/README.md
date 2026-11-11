# SnapGrab dentro de APOLO

Motor procedente de `E:\Proyectos\PC\deepseek-harness\default-workspace\snapgrab` (2026-11-10). Se incorporaron únicamente `grab.py`, `instagram.py` y `twitter.py`. No se copiaron perfiles, cookies, sesiones ni configuraciones. La aplicación original permanece intacta.

El menú **Ctrl + Alt + clic derecho → SnapGrab** no exige extensión ni un navegador concreto. Consulta la dirección accesible de la ventana del clic mediante Windows y conserva una copia visual. La extensión, si está conectada, es solo una alternativa para resolver la dirección. Nunca se elige una pestaña distinta cuando no coincide el título.

**Guardar una imagen visible** permite revisar y recortar la ventana aunque no haya dirección accesible o falle el descargador. Si Windows identifica una imagen bajo el clic, se preselecciona su área. El recorte se guarda como PNG en `Descargas\SnapGrab\foto-*`; es una copia visual, limitada a 2000 píxeles por el lado mayor. Fotos/carrusel descarga el archivo original cuando el extractor o una dirección directa de imagen lo permiten. Los dos caminos son independientes: un error al analizar la web no bloquea el recorte.

Las descargas quedan en `Descargas\SnapGrab\descarga-*`, en una carpeta por trabajo para no sobrescribir archivos anteriores. Cancelar o cerrar la ventana termina Python y sus procesos de ffmpeg; puede quedar un archivo parcial en la carpeta del trabajo. El límite por trabajo es de 30 minutos. El análisis tiene 90 segundos de límite. No se ejecuta una consola interactiva ni se leen cookies del navegador.

## Dependencias

Guardar un recorte utiliza Windows y Electron, sin Python ni extensión. Las fotos HTTP directas usan la biblioteca estándar de Python. Para los extractores de vídeo se necesita Python 3.10 o posterior, `yt-dlp[default]`, `curl_cffi` y ffmpeg. Para Instagram, el motor utiliza `instagrapi` con respaldo `instaloader`. La detección de ffmpeg conserva PATH y WinGet del original. No se instalaron paquetes en esta integración; se usan los que ya estaban disponibles en este equipo. La descarga del original sigue dependiendo de los permisos y extractores del sitio; las sesiones de la aplicación original no se migraron. Las ventanas minimizadas o que bloquean su captura pueden no ofrecer una copia visual utilizable.

## Adaptación

- `puente.py`: protocolo JSON por stdin/stdout, progreso, selección de formato y comprobación de archivos guardados. No devuelve datos internos ni URL firmadas a la interfaz.
- `grab.py`: audio usa `bestaudio/best` para admitir vídeo con sonido integrado. El puente corrige la llamada de «solo fotos», que antes también incluía vídeos.
- `twitter.py`: audio filtra las fotos. El puente pone ffmpeg en PATH para los extractores propios y verifica que el resultado de audio sea MP3.
- La integración no utiliza Tkinter ni modifica el aspecto del menú existente.
- `main/snapgrab-contexto.js` y `tools/snapgrab-contexto.ps1` consultan únicamente el HWND del clic, sin portapapeles, teclas simuladas ni perfiles. Solo se leen valores de documentos y controles de dirección, excluyendo formularios de la web. La consulta de accesibilidad tiene tres segundos de margen; si no responde se conserva la vía visual. La captura usa los píxeles de la zona visible cuando pertenece a esa ventana; en otro caso, PrintWindow. No enumera capturas del escritorio ni de otras aplicaciones.
- `fotos.py` reconoce imágenes HTTP directas por Content-Type, sin exigir un extractor de vídeo.

## Comprobación

`node tools/probar-snapgrab.cjs`: genera un vídeo ficticio con ffmpeg y lo sirve solo en localhost; abre una ventana Electron oculta con el puente real, analiza, descarga MP4, extrae MP3, comprueba cancelación y guarda capturas. No utiliza cuentas ni publicaciones del usuario. Las pruebas de `core/test/snapgrab.test.js` comprueban selección de destino, sitios protegidos, validación de resultados y cancelación del motor. No se verificó cada plataforma remota: dependen de sus extractores y permisos.

Resultado de esta integración (2026-11-10): 14 pruebas dirigidas aprobadas y prueba real de Electron/IPC/Python/MP4/MP3/cancelación aprobada, con captura del menú y de la ventana. Suite general: 553 de 554; el fallo de `rutas-fijas.test.js` procede de `core/remoto/manos/generar-manos.py` (archivo de otra sesión, no modificado aquí).

Corrección sin extensión: 17 pruebas dirigidas aprobadas. La prueba real añade una ventana ficticia fuera de pantalla (sin activación ni barra de tareas), lee su dirección con UI Automation, obtiene un PNG por PrintWindow y descarga una foto original con la extensión desconectada. También arrastra sobre el canvas, habilita Guardar recorte y guarda un PNG de 120×90 sin dirección accesible; rechaza coordenadas fuera de la imagen. Se revisaron las capturas de ambos caminos. La suite general tiene 556 aprobadas de 557; conserva el mismo fallo ajeno en `generar-manos.py`. Esto verifica la integración nativa; no equivale a haber probado todos los navegadores ni todas las plataformas remotas.

Referencias del capturador: [ValuePattern](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.valuepattern), [identificadores de propiedades de UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-control-pattern-propids) y [PrintWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-printwindow).
