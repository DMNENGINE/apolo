---
name: video-tutorial-pc
description: Graba y monta de principio a fin un vídeo tutorial de PC para YouTube (instalar un programa, emulador, herramienta…): guion, grabación de pantalla SIN audio del escritorio, gancho de gameplay con SOLO el audio de una app, limpieza automática de tiempos muertos, desenfoque de datos privados, rótulos y capítulos, voz IA en español e inglés, miniatura, título/descripción/etiquetas analizando la competencia y publicación en el Discord. Úsala cuando pidan "hacer un tutorial", "grabar un video explicando cómo instalar…", "video para YouTube de…", "graba la pantalla", "versión en inglés del video", "carátula/miniatura del tutorial" o "título y descripción para YouTube".
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [tutorial, video tutorial, vídeo tutorial, grabar tutorial, graba la pantalla, grabar pantalla, video para youtube, youtube, explicar como instalar, cómo instalar, como instalar, gameplay, voz en off, narración, narracion, monólogo, monologo, guion, guión, miniatura, carátula, caratula, título del video, descripcion del video, versión en inglés, video en ingles]
---

# Vídeo tutorial de PC (receta probada: tutorial de Lichii, 2026-11-07)

Resultado de referencia: tutorial de 4:33 (gancho de gameplay de 30 s + 9 secciones), voz IA ES y EN, miniatura, textos de YouTube y canal de Discord. Caso completo con tiempos y decisiones en `references/caso-lichii.md`.

## Reglas que NO se negocian
- **Nunca grabar el audio del escritorio** (el usuario escucha música mientras trabajas). La pantalla se graba muda; el audio de una app concreta se graba aparte con `scripts/AppCap.exe` (loopback por proceso).
- **Primero el guion/monólogo, después la voz.** Enséñale el texto antes de generar audio.
- **No inventes ni prometas lo que el vídeo no demuestra.** Si la miniatura dice "120 FPS" y nada lo respalda, avísale (búscalo en la web: en Lichii lo publicado eran 60 FPS).
- **Nada de piratería.** Comprueba con `curl -sI` (sin descargar) cualquier enlace de descarga antes de publicarlo: si es un juego, ROM, keys o firmware, NO se publica aunque insista; ofrece publicar el resto. Keys/firmware/juegos "de tu propia consola", sin enlaces.
- **Avisos de seguridad de Windows (SmartScreen, UAC) los pulsa el usuario**, no tú: para y pídeselo; la grabación sigue y queda en el vídeo.
- **No cambies la configuración de otras apps** para grabar (activar el WebSocket de OBS fue denegado): usa ffmpeg + AppCap.
- **Privacidad:** antes de entregar, revisa la carpeta Descargas, rutas con el usuario, listas de juegos, marcadores del navegador (ocúltalos con Ctrl+Shift+B antes de grabar y restáuralos al acabar).
- Todo en español; trato directo.

## Flujo (en este orden)

### 1. Investigar y guion
- Lee la página/README/releases del programa (WebFetch). Saca: requisitos, enlace oficial (GitHub), pasos reales, avisos conocidos.
- Escribe el guion por secciones (`NN · título · lo que se ve`) y guárdalo junto al proyecto. Ritmo de la voz: ~2,5 palabras/s.
- Proyecto en FilmCraft: secuencia 1920×1080, carpetas `01 Grabaciones`, `02 Gráficos`, `03 Audio`; portada (fondo #0f1115, título blanco, subtítulo #22d3ee) + un rótulo por sección (rectángulo oscuro 640×96 abajo-izquierda + texto `NN  Título` con el número en #22d3ee) + un marcador por sección con apuntes del guion. **El GUI de FilmCraft solo abre `.fcproj`** (`filmcraft.exe --no-recover "<ruta>.fcproj"`).

### 2. Grabar la pantalla (muda)
- Monitor: pregunta cuál si hay varios (mide con `System.Windows.Forms.Screen`; la "pantalla 3" del usuario era la principal 1920×1080).
- ffmpeg, 30 fps (gdigrab no aguanta 60): `ffmpeg -f gdigrab -framerate 30 -offset_x X -offset_y Y -video_size 1920x1080 -i desktop -c:v h264_nvenc -preset p4 -cq 21 -pix_fmt yuv420p salida.mkv` en segundo plano (mkv aguanta que lo mates); al acabar `ffmpeg -i x.mkv -c copy -movflags +faststart x.mp4`.
- Manejo de la UI: `scripts/ui.ps1` (clic/doble clic/escribir con movimiento suave del ratón, `front`, captura escalada a 1280 → multiplica coordenadas ×1,5). Si `SetForegroundWindow` falla, clic en el icono de la barra de tareas. Mueve el ratón en línea recta hacia abajo antes de ir de lado en menús (si no, abres el menú vecino).
- Señala con el ratón lo importante 2-3 s (enlace, hash, botón) y verifica URLs pasando el ratón (barra de estado) antes de descargar.

### 3. Gancho de gameplay con SOLO el audio de la app
- `scripts/AppCap.exe <pid> <salida.wav> <archivo_stop>` graba solo ese proceso (crea el archivo stop para parar). Compílalo si falta: `csc /platform:x64 /out:AppCap.exe AppCap.cs` (C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe). Pruébalo antes 3 s con otra app.
- Arranca AppCap + ffmpeg a la vez, abre el juego, F11 a pantalla completa; el usuario juega (tú no tienes su mando). Mux: `ffmpeg -i video.mkv -ss <desfase> -i audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest` (desfase ≈ duración audio − duración vídeo).
- Elige ~20 s del mejor tramo con hojas de miniaturas (`fps=1/5,scale=200:-1,tile=8x6`). Escala 107 % y sube la imagen si se ve la barra de tareas. Fundido a la portada y fundido de audio. Baja el juego −10 dB mientras habla la voz (keyframes en `volume.level`).

### 4. Limpiar la línea de tiempo
- Tiempos muertos: `ffmpeg -i grab.mp4 -vf "freezedetect=n=-75dB:d=2" -map 0:v -f null - 2>&1 | grep freeze_` → pásalo a `scripts/edl.py` (deja 2,5 s por pausa, más donde haya que leer) + cortes manuales (menús abiertos por error, ventanas que se cuelan, esperas). Revisa con hojas de miniaturas y renders de los empalmes.
- Reconstruye V1 desde cero con `timeline.place` (sourceIn/duration) y recoloca rótulos/marcadores con el mapa origen→línea de tiempo que imprime `edl.py`.
- Datos privados: `effects.apply gaussian_blur` (efecto índice 0, `blurriness` 60) + máscara rectangular; si encima hay un diálogo que debe leerse, segunda máscara `mode: subtract` con el contorno exacto del diálogo; corta el clip (razor) donde aparece el diálogo.

### 5. Voz IA (ES y EN)
- Las voces de FilmCraft (`tts.*`) son solo inglés/robóticas → usa `scripts/voz.py` (edge-tts neural; si da 403, `pip install --upgrade edge-tts`). Voces: ES hombre `es-MX-JorgeNeural`, EN hombre `en-US-AndrewNeural`. Reintenta si falla una sección (NoAudioReceived).
- Escribe la pronunciación: "Líchi" (EN "Lichee"), números de usuario/repos deletreados, rutas dichas en palabras, hashes por cifras. Ajusta `rate` (+5/+10 %) para que cada sección quepa en su tramo; si sobra tiempo, mejor que falte voz a que se pise.
- Coloca cada mp3 en A2 en el inicio de su sección. Alarga la última toma si la despedida se corta + fundido a negro.
- Exporta `export.quick` preset "YouTube 1080p Full HD" (tarda >2 min: corre en segundo plano). Si el archivo anterior está abierto en el reproductor, exporta con otro nombre (`_v2`). Comprueba con ffprobe y compara el md5 del audio de un tramo para confirmar que entró el cambio.
- Versión en inglés: `file.saveAs` a `<proyecto> EN.fcproj`, cambia los clips de A2 y los textos (`graphics.setText`: portada y rótulos), exporta aparte.

### 6. Miniatura
- `scripts/thumb.py` (PIL): imagen del usuario a 1920×1080, degradados oscuros arriba/abajo/columna derecha, logo del proyecto limpio (umbral de alfa + Min/MaxFilter para quitar motas), textos estilo "Zelda" (serif Cambria Bold en mayúsculas, degradado dorado, borde marrón, bisel, sombra y resplandor). Saca `_1920.png` y `.jpg` 1280×720. Mira el resultado y corrige lo que se salga del borde.

### 7. Título, descripción, etiquetas
- WebSearch (mode extended) de vídeos del mismo tema en ES y EN: palabras que repiten, qué les falta. Prepara título recomendado + 3 alternativas, descripción con enlace (Discord si el usuario reparte ahí), capítulos con los tiempos reales del montaje (empiezan en 0:00, ≥10 s cada uno), requisitos, avisos, descargo de afiliación, 3 hashtags, etiquetas y comentario fijado. Guarda `youtube_publicacion.md` y `youtube_publish_EN.md`. Cita las fuentes.

### 8. Discord (DIGITAL VOID)
- Siempre con el bot CONTROL-COMANDER por REST desde la Pi (`ssh dmn@192.168.1.127`, token `DISCORD_BOT_TOKEN` en `~/control-commander/.env`). Plantilla: `scripts/discord_canal.py` (canal de solo lectura en una categoría copiando sus permisos + embed ES/EN con la miniatura adjunta). Pregunta el enlace del vídeo; si aún no existe, pon "Próximamente" y edita el mensaje luego.

## Entrega
Carpeta del proyecto con: guion, grabaciones, voces, `.fcproj` ES/EN, MP4 final ES/EN, miniaturas ES/EN, textos de YouTube. Ábrele el MP4 final para que lo vea y dile qué revisar (pronunciación, sincronía, zonas desenfocadas).
