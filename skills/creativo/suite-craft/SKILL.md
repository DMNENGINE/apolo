---
name: suite-craft
description: Usa las apps creativas de la suite ArtCraft instaladas en el PC (FilmCraft vídeo, EffectCraft motion graphics, PhotoCraft fotos, LightCraft revelado, VectorCraft vectores, CadCraft planos/CAD, FigCraft interfaces, DesignCraft maquetación, DeckCraft presentaciones, WordCraft textos, GridCraft hojas de cálculo, PdfCraft PDF, SoundCraft audio) en vez de describir cómo hacerlo a mano. Úsala cuando pidan editar o subtitular un vídeo/clip, hacer un TikTok/Short/Reel, retocar o recortar fotos, una miniatura, un logo o SVG, un plano o pieza en CAD/DXF, una presentación, un documento, un Excel, editar un PDF o mezclar audio.
license: MIT
metadata:
  apolo:
    version: 1.2.0
    autor: DMN / APOLO
    disparadores: [vídeo, video, clip, clips, subtítulos, subtitulos, subtitula, subtitular, tiktok, short, shorts, reel, reels, edita el video, edita este video, miniatura, thumbnail, portada, foto, fotos, retoca, recorta, logo, svg, vector, plano, planos, cad, dxf, dwg, autocad, pieza, presentación, diapositivas, hoja de cálculo, excel, pdf, audio, podcast, mezcla, masteriza, lufs, rótulo, rotulo, lower third, título animado, marca, kit de marca, colores de la marca, calidad, filmcraft, photocraft, cadcraft, lightcraft, vectorcraft, effectcraft, figcraft, designcraft, deckcraft, wordcraft, gridcraft, pdfcraft, soundcraft, artcraft]
---

# Suite ArtCraft (apps creativas del PC)

Cada app instalada es **una herramienta tuya** con su nombre: `filmcraft`, `photocraft`, `cadcraft`… Trabajan **sin ventana**: abres/creas, editas con comandos y **exportas a un archivo**; el usuario ve el resultado abriendo ese archivo. Úsalas siempre que haya que *hacer* algo de vídeo, foto, diseño, CAD, documentos o audio — no le expliques al usuario cómo hacerlo a mano.

## Nivel profesional: primero las RECETAS FIJAS
Para lo que se repite hay herramientas con la receta ya probada con las apps reales: salen igual cada vez, más rápido y sin errores a mitad. **Úsalas antes que montar comandos a mano**; la app suelta solo para lo que no cubren.

| Pide… | Receta fija |
|---|---|
| colores, fuente, letrero, hashtags, llamada a seguir de un canal | **`kit_marca`** — léelo SIEMPRE antes de diseñar cualquier pieza y usa SOLO sus colores y su fuente |
| vídeo/clip para TikTok, Short, Reel | **`subtitular_video`** (con `perfil` = kit: marca, zona segura, audio de estudio y control de calidad incluidos) |
| miniatura, portada | **`hacer_miniatura`** (PhotoCraft: franja difuminada, título del kit con contorno y sombra, letrero; con un vídeo elige solo las caras más expresivas) |
| limpiar/masterizar audio, voz, podcast, música de fondo | **`masterizar_audio`** (SoundCraft: cadena de voz + máster a −14 LUFS / −1 dBTP; con `musica`, ducking automático bajo la voz) |
| rótulo con un nombre, lower third | **`rotulo_animado`** (EffectCraft, WebM con transparencia) |
| título animado de entrada | **`titulo_animado`** (EffectCraft, WebM con transparencia) |
| ¿está bien el vídeo/audio? | **`revisar_calidad`** — pásalo SIEMPRE antes de dar por terminado un vídeo o audio hecho a mano |

**Control de calidad (obligatorio al entregar):** sonoridad −14 LUFS ±0,5 (podcast −16) y pico real ≤ −1 dBTP; nada importante fuera de la zona segura de las apps verticales (lados 4 %, arriba 6 %, abajo 12 %, y la columna de botones a la derecha entre el 42 % y el 88 % de la altura); nada que se pise; subtítulos que dé tiempo a leer (≤ 21 letras/s); sin negros, congelados ni silencios largos. Si `revisar_calidad` o el resultado de `subtitular_video` dicen errores, ARRÉGLALOS antes de entregar (o díselo claramente al usuario).

| Pide… | App |
|---|---|
| editar/subtitular un vídeo, TikTok, Short, Reel | **`subtitular_video`** (receta completa) o `filmcraft` |
| animación, títulos animados, motion graphics | `rotulo_animado` / `titulo_animado`, o `effectcraft` |
| retocar, recortar, quitar fondo, miniatura | `hacer_miniatura` o `photocraft` |
| ajustar color/exposición, muchas fotos a la vez | `lightcraft` |
| logo, icono, SVG | `vectorcraft` |
| plano, pieza, cotas, DXF/DWG | `cadcraft` |
| pantallas de app/web | `figcraft` |
| póster, folleto, maqueta | `designcraft` |
| presentación | `deckcraft` |
| documento de texto | `wordcraft` |
| hoja de cálculo, fórmulas, gráficos | `gridcraft` |
| leer/editar/unir/dividir PDF | `pdfcraft` |
| audio, mezcla, podcast | `masterizar_audio` o `soundcraft` |

## Guías profesionales (LÉELAS)
Cada app tiene su guía en `references/<app>.md` (p. ej. `references/photocraft.md`): reglas verificadas de la app, una receta probada de principio a fin, los comandos clave y los **estándares profesionales** del oficio (tamaños, LUFS, sangrados, rejillas, tipografía) + checklist de entrega. **Antes de la primera tarea con una app en una conversación, léela con `leer_recurso_skill {"nombre":"suite-craft","ruta":"references/<app>.md"}`** y trabaja con ese nivel: no entregues nada sin pasar su checklist.

Trampas ya comprobadas (resumen): PhotoCraft solo abre/guarda dentro de la carpeta del usuario (copia desde D:\ al Escritorio) · VectorCraft: cada forma hereda la pintura anterior, pasa `fill` y `stroke` siempre · DeckCraft nace con una diapositiva vacía · WordCraft necesita `paragraphs:true` para varios párrafos · DesignCraft: páginas 0-based y el color del texto es una muestra (`swatch.create`) · CadCraft: un comando a medias se come lo siguiente (mira `running`) · SoundCraft: sesión sin pistas ni master, créalos · LightCraft no sobrescribe al exportar (añade `-2`) · FigCraft: marcos nuevos con alto fijo, usa `sizingV:"hug"`.

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
- **Perfil = kit de marca** `perfil: "lagctrucks"`: subtítulos en los pedales, letrero, "Sígueme para más", contexto para Whisper, zonas `cara`, `cabina`, `pedales`, colores del título animado, zona segura (los textos no se meten bajo los botones) y **audio de estudio** con SoundCraft. Úsalo siempre en los clips de LAGCTRUCKS. Para otro canal, crea su kit con `kit_marca` (`guardar`).
- **Rótulos** `rotulos: [{t, nombre, sub}]`: lower third animado con el nombre (p. ej. cuando saluda a alguien del chat). Si no cabe en ese momento (se pisaría con otra cosa) se salta y lo avisa.
- **Correcciones** `correcciones: [{t, mal, bien}]`: arregla palabras de Whisper sin volver a transcribir. `sinEfectos: [[desde, hasta]]` y `quitarEmojis: [t]` quitan golpes o emojis concretos.
- **Control de calidad**: al acabar mide el archivo real y la colocación de todo; corrige solo el volumen y devuelve una línea "Calidad: …". Si dice errores, díselo al usuario o arréglalo.
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
