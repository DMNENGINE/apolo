# LightCraft — guía profesional (equivale a Lightroom Classic)

Biblioteca y revelado no destructivo: importar, catalogar, revelar RAW/JPG, máscaras IA (sujeto/cielo), reducción de ruido, lotes, exportar. Apache-2.0 (github.com/storytold/lightcraft).

## Reglas de la app (verificadas)
- Las fotos tienen id entero. `import {paths:[…]}` → `{imported:[ids]}`; `query_photos {filter, sort}` para buscarlas.
- Pasa SIEMPRE `id` en `set_develop`, `crop` y `export` (si no, actúa sobre la foto activa, que puede no ser la que crees).
- Ajustes por id de control: `set_develop {id, values:{"light.exposure":0.4, …}}`. `list_controls {section}` da rangos y valores actuales. Coordenadas de máscaras y recortes normalizadas 0..1 desde arriba-izquierda.
- **Export con `path` SOBRESCRIBE** el archivo si ya existe (cambió en v0.19, comprobado 2026-11-07; nunca toca originales del catálogo). Con `dir` (lote) los choques se resuelven con `conflict` (por defecto `unique`: -2, -3…). Lee siempre la ruta real en el resultado (`files[].path`).
- Las 330 herramientas `cmd_*` son los comandos uno a uno; `command_list {filter}` + `command_run {id, params}` es más cómodo.
- `render_preview` / `render_photo` para mirar antes de exportar.

## Controles principales (ids)
- Balance: `wb.temp`, `wb.tint`. Luz: `light.exposure` (−5..5 EV), `light.contrast`, `light.highlights`, `light.shadows`, `light.whites`, `light.blacks`.
- Presencia: `effects.texture`, `effects.clarity`, `effects.dehaze`, `color.vibrance`, `color.saturation`.
- Mezclador HSL: `mixer.<color>.hue|sat|lum` (red, orange, yellow, green, aqua, blue, purple, magenta). B/N: `bw.<color>`.
- Gradación: `grading.shadows|midtones|highlights|global.hue|sat|lum`, `grading.balance`.
- Detalle: `detail.sharpenAmount/Radius/Detail/Masking`, ruido `detail.nrLuminance`, `detail.nrColor`; IA `enhance.denoise`.
- Óptica: `optics.profileDistortion`, `optics.defringePurple`; geometría `geometry.vertical/horizontal/rotate`.
- Efectos: `vignette.amount`, `grain.amount`.

## Flujo profesional
1. `import {paths}` (carpetas enteras valen).
2. Selección: `cmd_photo_rate`, `cmd_photo_flag` (pick/reject) para quedarte con las buenas.
3. Base: `cmd_develop_auto {}` como punto de partida, luego ajusta a mano.
4. Orden de revelado: perfil/óptica → balance de blancos → exposición → altas/sombras/blancos/negros → contraste → presencia → HSL → gradación → máscaras locales → detalle/ruido → recorte.
5. Locales: `cmd_mask_add {kind:"subject"|"sky"|"background"|"radial"|"linear"}` y luego ajustes de la máscara (`cmd_mask_adjust`).
6. Recorte: `crop {id, rect:[x0,y0,x1,y1]}`, `cmd_crop_autoStraighten {}`, `cmd_crop_aspect`.
7. Lotes: revela una, selecciona todas (`select_photos {ids}`) y `cmd_develop_sync {}`; o guarda preset (`cmd_preset_create`) y `apply_preset {ids, preset}`.
8. `export {id|ids, dir, format:"jpeg", quality:90, longEdge:2048, sharpen:"screen"}`.

## Receta probada
```
import {"paths":["C:/…/foto.jpg"]}                    → id 1
set_develop {"id":1,"values":{"light.exposure":0.4,"light.contrast":20,"light.shadows":30}}
render_preview {"id":1}  → MIRAR
export {"id":1,"dir":"C:/…/salida","format":"jpeg","quality":90,"longEdge":1080}
```

## Estándares profesionales
- Revelado natural: highlights −, shadows +, whites/blacks hasta casi recortar; contraste moderado. No pases de +40 de clarity ni +30 de saturation (mejor vibrance).
- Retratos: piel en el mezclador naranja (sat −5..−15, lum +5..+10); clarity negativa suave en la máscara de sujeto.
- Paisajes/camiones: dehaze +10..+25, cielo con máscara `sky` (exposición −0,3, saturación azul +).
- Ruido: ISO alto → `enhance.denoise` antes que enfocar.
- Exportar: web/redes JPG sRGB calidad 85–90, lado largo 2048 (Instagram 1080×1350); impresión TIFF 16 bits o JPG 100 a 300 ppp.
- Consistencia en series: mismo balance y preset para todas.

## Novedades (noviembre 2026)
Versión v0.19 (todo instalado y al día 2026-11-07). ✔ = probado de verdad por MCP; lo demás sale del catálogo de comandos.
- ✔ **Pase de diapositivas a vídeo/PDF**: selecciona (`cmd_library_selectAll`) → `cmd_slideshow_export {format:"video"|"pdf"|"jpeg", path, size:"720p"|"1080p", fps, container: mp4|webm}`. Va en segundo plano: consulta `cmd_slideshow_exportStatus` hasta `done == total` (probado: 3 fotos → MP4 12 s 1280×720, **códec AV1**: si el usuario lo va a subir o abrir en un reproductor viejo, pásalo por FilmCraft/ffmpeg a H.264). Ajustes: `cmd_slideshow_playback` (duración, fundidos), `_layout`, `_overlays` (marca), `_titles`, plantillas `cmd_slideshow_templates_*`.
- ⚠ Sin ventana, **la biblioteca empieza vacía en cada arranque**: importa en la misma sesión en la que trabajas (el proceso vive 30 min sin uso).
- **Imprimir / hojas de contacto**: `cmd_print_set {layout:{style: singleImage|contactSheet|picturePackage|customPackage, page…}}` → `cmd_print_exportPdf {path}`; celdas `cmd_print_cell_*`, plantillas `cmd_print_template_*`.
- **Efectos de máscara** (presets locales): `cmd_mask_effects`, `cmd_mask_applyEffect {name, all, photos:"selected"}`, `cmd_mask_saveEffect`; importa presets de Lightroom/Camera Raw con `cmd_mask_importEffects`.
- `cmd_merge_hdrBatch` (un HDR por cada horquillado), corrección de lente con la base de lensfun (`cmd_lens_downloadDatabase`), puntos de enfoque de la cámara (`cmd_photo_readFocusPoints`), caras en GPU (`cmd_faces_gpu`, `cmd_faces_renamePerson`).
- ✔ `export` acepta `destinationMode` y `fit`, y ahora **sustituye** un archivo existente en `path` (probado; en lote con `dir` añade -2, -3).
## Checklist
- [ ] Vista previa revisada de al menos una foto del lote.
- [ ] Rutas reales de exportación (con sufijo `-n` si ya existían) dichas al usuario.
