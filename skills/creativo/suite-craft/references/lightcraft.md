# LightCraft — guía profesional (equivale a Lightroom Classic)

Biblioteca y revelado no destructivo: importar, catalogar, revelar RAW/JPG, máscaras IA (sujeto/cielo), reducción de ruido, lotes, exportar. Apache-2.0 (github.com/storytold/lightcraft).

## Reglas de la app (verificadas)
- Las fotos tienen id entero. `import {paths:[…]}` → `{imported:[ids]}`; `query_photos {filter, sort}` para buscarlas.
- Pasa SIEMPRE `id` en `set_develop`, `crop` y `export` (si no, actúa sobre la foto activa, que puede no ser la que crees).
- Ajustes por id de control: `set_develop {id, values:{"light.exposure":0.4, …}}`. `list_controls {section}` da rangos y valores actuales. Coordenadas de máscaras y recortes normalizadas 0..1 desde arriba-izquierda.
- **Export no sobrescribe**: si `foto.jpg` existe crea `foto-2.jpg`, `foto-3.jpg`… Lee la ruta real en el resultado (`files[].path`).
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

## Checklist
- [ ] Vista previa revisada de al menos una foto del lote.
- [ ] Rutas reales de exportación (con sufijo `-n` si ya existían) dichas al usuario.
