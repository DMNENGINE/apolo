---
name: suite-craft
description: Usa las apps creativas de la suite ArtCraft instaladas en el PC (FilmCraft vídeo, EffectCraft motion graphics, PhotoCraft fotos, LightCraft revelado, VectorCraft vectores, CadCraft planos/CAD, FigCraft interfaces, DesignCraft maquetación, DeckCraft presentaciones, WordCraft textos, GridCraft hojas de cálculo, PdfCraft PDF, SoundCraft audio) en vez de describir cómo hacerlo a mano. Úsala cuando pidan editar o subtitular un vídeo/clip, hacer un TikTok/Short/Reel, retocar o recortar fotos, una miniatura, un logo o SVG, un plano o pieza en CAD/DXF, una presentación, un documento, un Excel, editar un PDF o mezclar audio.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [vídeo, video, clip, clips, subtítulos, subtitulos, subtitula, subtitular, tiktok, short, shorts, reel, reels, edita el video, edita este video, miniatura, thumbnail, foto, fotos, retoca, recorta, logo, svg, vector, plano, planos, cad, dxf, dwg, autocad, pieza, presentación, diapositivas, hoja de cálculo, excel, pdf, audio, podcast, mezcla, filmcraft, photocraft, cadcraft, lightcraft, vectorcraft, effectcraft, figcraft, designcraft, deckcraft, wordcraft, gridcraft, pdfcraft, soundcraft, artcraft]
---

# Suite ArtCraft (apps creativas del PC)

Cada app instalada es **una herramienta tuya** con su nombre: `filmcraft`, `photocraft`, `cadcraft`… Trabajan **sin ventana**: abres/creas, editas con comandos y **exportas a un archivo**; el usuario ve el resultado abriendo ese archivo. Úsalas siempre que haya que *hacer* algo de vídeo, foto, diseño, CAD, documentos o audio — no le expliques al usuario cómo hacerlo a mano.

| Pide… | App |
|---|---|
| editar/subtitular un vídeo, TikTok, Short, Reel | **`subtitular_video`** (receta completa) o `filmcraft` |
| animación, títulos animados, motion graphics | `effectcraft` |
| retocar, recortar, quitar fondo, miniatura | `photocraft` |
| ajustar color/exposición, muchas fotos a la vez | `lightcraft` |
| logo, icono, SVG | `vectorcraft` |
| plano, pieza, cotas, DXF/DWG | `cadcraft` |
| pantallas de app/web | `figcraft` |
| póster, folleto, maqueta | `designcraft` |
| presentación | `deckcraft` |
| documento de texto | `wordcraft` |
| hoja de cálculo, fórmulas, gráficos | `gridcraft` |
| leer/editar/unir/dividir PDF | `pdfcraft` |
| audio, mezcla, podcast | `soundcraft` |

## Cómo usar cualquier app
1. `{}` (sin argumentos) → lista sus herramientas y sus **instrucciones** (léelas la primera vez). Con `{"buscar": "caption"}` filtras.
2. Muchas apps funcionan con **comandos**: `list_commands`/`command_list` con `{"filter": "…"}` te da ids y parámetros; luego `command_run`/`run_command`/`execute` con `{"id": "…", "params": {…}}`. Usa `batch`/`command_batch` para varios seguidos.
3. `{"esquema": "<herramienta>"}` si no sabes qué argumentos lleva.
4. Comprueba lo que hiciste: `render_frame`/`render`/`render_preview` devuelven una imagen — **mírala antes de decir que está hecho**.
5. **Guarda y exporta** a un archivo y dile al usuario la ruta. El proceso se cierra tras 30 min sin uso y lo que no guardaste se pierde.
6. Lo que solo mira (listar, inspeccionar, render) no pide permiso; editar y exportar sí (el usuario puede darte "permitir siempre" por app).

## Subtitular un clip (TikTok / Shorts / Reels)
Usa **`subtitular_video`** — hace todo en un paso: transcribe palabra a palabra (Whisper large-v3), trocea en 1–3 palabras, subtítulos con nuestra fuente propia **Trueno** (rotulación de camión, se instala sola) y palabras clave en amarillo, gancho los primeros segundos, marca y "Sígueme" opcionales, audio a −14 LUFS y exporta MP4 + `.srt` + proyecto `.fcproj` en `<carpeta del vídeo>/editados`.
- **Estilos** (`estilo`, todos 100 % propios con la fuente Trueno): `clasico` (blanco, clave en amarillo, sin animación — por defecto) · `pop` (entra con golpe de escala) · `karaoke` (la palabra que se dice en verde) · `palabra` (una palabra gigante cada vez, rebote) · `caja` (texto oscuro en caja blanca, sube suave) · `neon` (brillo magenta, palabra activa amarilla) · `fuego` (amarillo con doble contorno negro/naranja, rebote) · `acumula` (las palabras aparecen y se quedan) · `minimal` (blanco con sombra, fundido). **Paquete 2 · color, con emojis propios**: `atardecer` (degradado amarillo→rosa) · `hielo` (blanco, borde marino y halo celeste) · `retro` (crema con sombra dura roja) · `chicle` (caja rosa) · `lima` (caja lima, karaoke morado) · `oro` (degradado dorado, para logros) · `terror` (aura roja, karaoke rojo — clips de la Llorona y fantasmas) · `arcoiris` (cada palabra de un color) · `noche` (píldora oscura, karaoke menta). Los emojis (17 dibujados por nosotros: fuego, risa, camión, saludo, corazón, brillo, dinero, fantasma, sorpresa, rayo, 100, corona, calavera, ojos, pesa, México, like) saltan solos encima del subtítulo cuando se dice una palabra que encaja; `emojis: true/false` los fuerza en cualquier estilo. Elige por el tono del clip: terror para sustos, oro para récords, arcoiris/chicle para risas. `entrada` cambia solo la animación (`pop`, `rebote`, `subir`, `fundido`, `ninguna`). Si el usuario no sabe cuál, enséñale la galería (`Desktop\Clips LAGC 2026-10-13\editados\estilos de subtitulos`) o haz una muestra con `rango: [desde, hasta]` (≈10 s) antes del vídeo entero.
- **Paquete 3 · efectos**: `impacto` (texto con zoom + golpe de zoom y destello) · `glitch` (texto verde que falla + vídeo RGB/bloques) · `terremoto` (texto que se sacude + cámara que tiembla) · `cascada` (texto que cae + barrido) · `tornado` (texto girando, karaoke naranja) · `flecha` (rótulo cian que entra deslizando).
- **Efectos de vídeo** (`efectos`): golpes en los momentos fuertes (las palabras de los emojis y los ¡gritos!), uno cada 3,5 s como mucho: `zoom`, `temblor`, `destello`, `rgb`, `glitch`, `barrido`. `"auto"` = cada momento trae el suyo (rayo → barrido+zoom, fantasma → glitch+rgb, risa → temblor, fuego → destello+zoom…); una lista = esos golpes en todos los momentos; `"no"` = ninguno. Vienen en `pop`, `palabra`, `fuego` y en los paquetes 2 y 3.
- **Animación del texto** (`entrada`): pop, rebote, subir, fundido, caida, deslizar, giro, zoom, glitch, sacudida, ninguna.
- **Look de color** (`look`): vivo, calido, frio, cine, terror, retro, bn (terror y retro lo traen sus estilos; `look: false` lo quita). Úsalo con cabeza: cambia el color de todo el vídeo.
- **Cambios de escena**: `escenas: "auto"` elige 2–3 frases fuertes, el tipo según el tono y detecta la cara sola (detector YuNet). A mano con `enfoques: [{tipo, desde, hasta, zona, hacia}]` (frase COMPLETA; tiempos con `soloTranscribir`). Tipos: `acercar` (zoom suave), `escalones` (3 golpes secos, cómico), `corte` (salto con fogonazo), `lento` (se sigue acercando, serio), `giro` (plano inclinado, loco), `recorrido` (cara → `hacia` la cabina), `drama` (lento + blanco y negro, triste), `temblor` (cámara temblando, gritos). 1–3 por clip y separadas; no las pongas en los 3 primeros segundos (gancho) ni en los 5 últimos.
- **Perfil** `perfil: "lagctrucks"`: subtítulos en los pedales, marca, "Sígueme para más", contexto para Whisper y zonas `cara`, `cabina`, `pedales`. Úsalo siempre en los clips de LAGCTRUCKS.
- Si el audio es ruidoso (juego de fondo, música) o hay nombres raros: primero `soloTranscribir: true`, corrige los textos (y quita lo que no se entiende — mejor sin subtítulo que inventado), y llama otra vez con `subtitulos`.
- Pasa en `contexto` nombres y jerga que ayuden a Whisper.
- Para varios clips: uno detrás de otro (FilmCraft es un proceso), avisando al acabar cada uno.
- Al terminar, enseña la vista previa y lista las líneas dudosas que devuelve la herramienta.

### Perfil LAGCTRUCKS (streams verticales del usuario)
Vídeo 1080×1920 con 3 cámaras apiladas: barra negra 0–97 px, cara 97–705, cabina 705–1313, pedales 1313–1920 (con la barra de suscriptores arriba). Cámara del streamer para `enfoques`: `zona: [0, 97, 1080, 705]`; la cara suele estar en `x` ≈ 300–420, `y` ≈ 320. Usa `y: 0.78` (subtítulos en la zona de los pedales: no tapan la cara y quedan por encima de los botones de TikTok), `marca: "LAGCTRUCKS"`, `cta: "Sígueme para más"`. El acento es caribeño/mexicano y hay saludos a gente del chat: cuidado con los nombres.

## FilmCraft a mano (cuando no basta subtitular_video)
- Tiempo en *ticks*: 254016000000 por segundo (los comandos aceptan también `seconds`).
- Flujo: `file.newProject` → `media_import {paths}` → `file.newSequenceFromClip {items}` → editar → `file.saveAs {path: ….fcproj}` → `file.exportMedia {path, format: "h264", crf: 18, loudnessLufs: -14, wait: true}`.
- Texto: `graphics.newText {text, position:[x,y] (línea base), size, font, seconds, time, track, newClip:true}` → `graphics.set {clip, layer, props:{align, fill_color, stroke, stroke_width, stroke_color, shadow}}`; color por palabra con `graphics.setCharStyle {clip, layer, start, end, style:{color}}`; mide con `graphics.list` (localBounds).
- Cortes: `timeline.razor {seconds}`, `transcript.removePauses`, `transcript.removeFillers`.

## CadCraft
`script` con texto estilo AutoCAD `.scr` (una entrada por línea, línea vacía = Enter), p. ej. `RECTANG\n0,0\n100,60\nCIRCLE\n50,30\n12\n`; `render` para verlo; `save {path: ….dxf|.dwg|.pdf|.png}`.
