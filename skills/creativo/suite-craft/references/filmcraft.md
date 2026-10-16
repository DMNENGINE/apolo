# FilmCraft — guía profesional (equivale a Premiere Pro)

Editor de vídeo no lineal: montaje multipista, recortes, títulos, subtítulos, color Lumetri, audio, exportación. Apache-2.0 (github.com/storytold/filmcraft). Para clips verticales con subtítulos usa SIEMPRE primero la herramienta `subtitular_video` (hace todo esto bien); esta guía es para montar a mano.

## Reglas de la app (verificadas en docs/agents.md)
- Tiempo en *ticks*: 254 016 000 000 por segundo. Los comandos aceptan también `seconds`, `frame` o `timecode`.
- Pistas por nombre (`"V1"`, `"A2"`) o id; una pista que no existe es error (no cae en otra).
- Ciclo: `project_inspect` / `sequence_inspect` → ids → `command_run` → `render_frame {seconds}` → MIRAR → `edit.undo` si está mal.
- Comandos sobre la selección se habilitan nombrando el objetivo: `clips:[id]` (línea de tiempo) o `items:[id]` (proyecto).
- `timeline.move` arrastra el audio enlazado (pasa `"linked": false` para mover solo uno).
- Un clip de texto ocupa su pista: dos textos que se pisan en la misma pista dan "V2 is not free". Cuadra tiempos a fotogramas.
- Medios desconectados se exportan como "media not found": comprueba con `media.status` antes y lee `offlineMedia` del resultado.
- Sin ventana el proyecto vive en memoria: **guarda `.fcproj`** tras cada hito.

## Flujo profesional
1. `file.newProject` → `media_import {paths:[…]}` (rutas absolutas).
2. `file.newSequenceFromClip {items:[id]}` (hereda resolución y fps del material — así no se reescala).
3. Montaje: `timeline.place {item, seconds, track}`, `timeline.razor {seconds}`, `timeline.move`, `trim.*`, quitar silencios con `transcript.removePauses` y muletillas con `transcript.removeFillers`.
4. Títulos: `graphics.newText {text, position:[x,y] (línea base), size, font, seconds, time, track, newClip:true}` → `graphics.set {clip, layer, props:{align, fill_color, stroke, stroke_width, stroke_color, shadow}}`; color por palabra `graphics.setCharStyle`; medir con `graphics.list`.
5. Efectos: `effects.apply {effect}` y `effects.setParam` (referir el efecto por NOMBRE: el índice cambia). Keyframes con `motion` scale/position y `opacity`.
6. Color: `lumetri.*` (temperatura, exposición, contraste, saturación) — corrige primero (balance/exposición), luego estiliza.
7. Audio: ganancia por clip, `essentialSound.*`; normaliza al exportar con `loudnessLufs`.
8. `file.saveAs {path:"….fcproj"}` → `file.exportMedia {path, format:"h264", crf:18, loudnessLufs:-14, wait:true}`.
- Presets de exportación: `filmcraft-cli export --list-presets` (p. ej. "YouTube 1080p Full HD").

## Estándares profesionales
- **TikTok/Reels/Shorts**: 1080×1920, 30 o 60 fps, H.264, −14 LUFS, pico ≤ −1 dBTP. Gancho en los 2 primeros segundos; subtítulos fuera de la zona inferior (~400 px) y de la columna derecha (botones).
- **YouTube horizontal**: 1920×1080 o 3840×2160, mismo fps que la grabación, −14 LUFS.
- CRF 18 = calidad casi sin pérdidas para subir; no recomprimas varias veces.
- Cortes en la acción o en la consonante; J-cuts/L-cuts (audio que entra antes/sale después) para que fluya.
- Ritmo vertical: un cambio visual (corte, zoom, texto, emoji) cada 2–4 s.
- Nunca subtítulos inventados: si no se entiende, mejor sin subtítulo.

## Checklist
- [ ] `render_frame` en inicio, mitad y final revisados.
- [ ] `offlineMedia` vacío; duración y resolución correctas (`sequence_inspect`).
- [ ] `.fcproj` guardado + MP4 exportado; ruta dicha al usuario.
