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

## Galería y reconocimiento (2026-11-11)

La ventana destaca **Guardar esta foto visible** cuando Windows identifica una imagen bajo el clic. Si el análisis reconoce únicamente vídeo, destaca Vídeo/Reel y explica la opción de audio. No deduce por la apariencia qué archivo original corresponde a un recorte.

**Ver fotos de esta página** obtiene hasta 24 imágenes del HTML público: `img`, carga diferida con `data-src`, candidatos de `srcset` y metadatos Open Graph/Twitter. Resuelve rutas relativas, evita duplicados y descarta píxeles de seguimiento con dimensiones explícitas menores de 24 píxeles. Conserva la dirección de la página aunque el clic apunte al original de una foto. La foto señalada se pone primero y se marca por defecto cuando se dispone de su dirección.

Las miniaturas se descargan fuera del renderer con cuatro conexiones como máximo, límite de lectura de 2 MB por imagen y 24 KB por miniatura. Pillow, si está disponible, reduce cada vista a 200×140; no se instalaron bibliotecas nuevas. Una miniatura bloqueada aparece como marcador y no impide intentar guardar su original. El renderer solo recibe identificadores y miniaturas, no decide las URL que el motor descarga. Cada actualización invalida la selección anterior.

Se pueden marcar todas, desmarcar o elegir fotos individuales. **Guardar selección** crea archivos separados por foto y conserva los originales. Si falla parte de la selección, se informa cuántas fotos no se guardaron. El acceso no utiliza cookies de otro navegador ni depende de una extensión; fotos que solo aparecen mediante JavaScript o dentro de una sesión pueden no figurar en el HTML público. El recorte visible sigue disponible.

Verificación: 19 pruebas dirigidas y 559 pruebas generales aprobadas. El ensayo real de Electron/Python, sin extensión, incluye tres fotos con miniaturas, reconocimiento de la foto señalada, selección de dos originales comprobados byte a byte, rechazo de una revisión antigua y descarga parcial con aviso. También mantiene MP4, MP3, cancelación y recorte con el ratón. Captura revisada: `repair-backups/snapgrab-galeria/snapgrab-galeria.png`.

## Spotify externo incorporado (2026-11-11)

Se incorporó `spotify.py` del SnapGrab externo y sus rutas de análisis/descarga en `grab.py`, manteniendo la corrección de audio `bestaudio/best`, la galería y el recorte de APOLO. No se copiaron configuraciones, sesiones ni cookies. El proyecto externo sigue intacto.

Reconoce canciones, álbumes y listas de `open.spotify.com`, incluidas rutas `intl-*`, enlaces embed y referencias `spotify:track:ID`, `spotify:album:ID` y `spotify:playlist:ID` normalizadas a HTTPS. Los perfiles de artista no se enumeran. La comprobación del dominio evita interpretar como Spotify una página ajena que solo lo mencione en una consulta.

El motor obtiene metadatos públicos de Spotify y busca coincidencias en YouTube para convertirlas a MP3. **No extrae el audio original de Spotify** ni garantiza la misma grabación o versión. Esto se explica en la ventana antes de descargar. Se muestran los títulos y el botón Guardar MP3; para álbumes/listas se procesan hasta 20 pistas accesibles por trabajo, con progreso por pista. Cada una tiene su carpeta para evitar sobrescrituras cuando dos búsquedas devuelven el mismo título. Se informa de fallos parciales y del límite aplicado. Para canciones se añade el intérprete del embed a la búsqueda si está disponible.

Se verificaron metadatos públicos reales de una canción (título e intérprete), un álbum de diez pistas y una lista de cincuenta pistas. Referencia de la API pública utilizada: [Spotify oEmbed](https://developer.spotify.com/documentation/embeds/reference/oembed). La extracción de listas desde HTML embed procede del módulo externo y depende de la estructura que Spotify exponga; las listas privadas o no disponibles pueden fallar.

Validación: 20 pruebas dirigidas y 560 generales aprobadas. El ensayo Electron usa metadatos ficticios de canción, álbum y lista, y redirige las búsquedas a un vídeo sintético servido en localhost; yt-dlp y ffmpeg generan MP3 reales y se comprueban nombres separados y un fallo parcial. El desvío solo vive en `tools/probar-spotify-puente.py`, no se instala en APOLO. Además se verificó una búsqueda real de título/intérprete: YouTube devolvió el vídeo oficial y 48 formatos, sin descargar la canción. La conversión MP3 se probó con el vídeo sintético. Captura: `repair-backups/snapgrab-spotify/snapgrab-spotify.png`.

## Pegar un enlace (2026-11-11)

El menú Ctrl+Alt+clic derecho muestra un campo independiente **Enlace para SnapGrab** con botón **Abrir**. Admite pegar con Ctrl+V y enviar con Enter, sin pasar por el prompt libre de APOLO. No hace falta que la ventana del clic sea un navegador ni que exponga una dirección. Un enlace inválido mantiene el menú abierto y muestra el motivo.

La propia ventana de SnapGrab incorpora arriba otro campo con **Analizar**. Cambiar el enlace limpia la captura, las fotos seleccionadas y los resultados de la página anterior. Durante una operación es necesario terminarla o cancelarla antes de cambiar de enlace. Se conserva la detección automática del contexto como opción independiente. No se lee automáticamente el portapapeles.

Validación: 22 pruebas dirigidas y 562 generales aprobadas. El ensayo real pega un enlace en el menú y pulsa Enter mediante CDP; después cambia desde Spotify a una foto usando el formulario de SnapGrab y comprueba que desaparezcan los datos anteriores. Capturas revisadas: `repair-backups/snapgrab-enlace/menu-enlace.png` y `snapgrab-enlace.png`.
