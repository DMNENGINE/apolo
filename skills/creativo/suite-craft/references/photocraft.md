# PhotoCraft — guía profesional (equivale a Photoshop)

Editor de imagen por capas: retoque, composición, miniaturas, quitar fondos, texto con estilos. Licencia Apache-2.0 (github.com/storytold/photocraft). Versión alpha: comprueba siempre con `render_preview`.

## Reglas de la app (verificadas)
- **Archivos**: APOLO la arranca con la carpeta del usuario (`C:\Users\<usuario>`) como raíz de lectura y escritura. Solo puede abrir/guardar DENTRO de esa carpeta (Escritorio, Descargas, Documentos…). Si el archivo está en `D:\`, cópialo primero al Escritorio. Fuera de la raíz da `automation path rejected`.
- Coordenadas en píxeles, origen arriba-izquierda. Tamaño de texto en **puntos** (a 72 ppp, 160 pt ≈ 134 px de altura de mayúscula).
- Cada `command_run` es un paso de historial; `edit.undo` lo deshace. Antes de experimentar: `image.duplicate {}` o `history.newDocument {}` y trabaja en la copia.
- `doc_save` a `.png/.jpg/.webp` **aplana** (avisa "layers flattened"). Guarda también `.pcraft` (nativo, con capas) o `.psd` si el usuario querrá retocar después.
- Los ids de capa los devuelve cada comando (`{"layer": 4}`): úsalos, no los adivines.
- `doc_place {center}` es un punto `[x, y]` (no `true`). `select.rect {feather}` NO difumina: haz `select.rect` y luego `select.modify.feather {radius}`. Un relleno (`layer.newFillLayer.solidColor`) con selección activa la usa de máscara; su opacidad con `layer.setProps {layer, opacity: 0..1}`.
- `layer.layerStyle.replace` va así: `{layer, effects: [{kind: "stroke", params: {…}}, {kind: "dropShadow", params: {…}}]}`.
- `type.create` devuelve `bounds` [x0, y0, x1, y1]: si el texto no cabe, `edit.transform {layer, scaleX, scaleY}` (en %, alrededor de su centro).
- Para portadas/miniaturas usa la receta fija `hacer_miniatura` (todo esto ya resuelto).

## Flujo profesional
1. `doc_new {width, height}` o `doc_open {path}`.
2. Fondo: `layer.newFillLayer.gradient {from, to, angle}` o `layer.newFillLayer.solidColor {color}`; imagen: `doc_place {path, fit, center}` (Smart Object, no destructivo).
3. Retoque no destructivo: capas de ajuste y `layer.setAdjustment`; ajustes directos en `image.adjustments.*` (levels, curves, exposure, vibrance, hueSaturation, colorBalance, blackWhite, photoFilter).
4. Recorte/sujeto: `select.subject`, `select.sky`, `layer.removeBackground {refine:true}` (crea máscara, no borra píxeles).
5. Texto: `type.create {x, y (línea base), text, font, size, color, align}`; `box:[x,y,w,h]` para texto de párrafo.
6. Estilos de capa: `layer.layerStyle.stroke {size, position:"outside", color}`, `.dropShadow {distance, size, opacity, color}`, `.outerGlow`, `.gradientOverlay`, `.bevelEmboss`. Varios a la vez: `layer.layerStyle.replace`.
7. Alinear: `layer.align.horizontalCenters {to:"canvas"}` (y `verticalCenters`, `leftEdges`…).
8. Nitidez final (solo al exportar): `filter.sharpen.unsharpMask {amount:80, radius:1, threshold:2}`.
9. `render_preview` → MÍRALO → corrige → `doc_save {path:"…/x.pcraft"}` + `doc_save {path:"…/x.png"}` (o `.jpg` con `quality`).

## Receta probada: miniatura de YouTube 1280×720
```
doc_new {"width":1280,"height":720}
command_run layer.newFillLayer.gradient {"from":"#0b1d3a","to":"#00b4d8","angle":45}
doc_place {"path":"C:/Users/<u>/Desktop/captura.png","fit":true}          (foto del streamer/camión)
command_run layer.removeBackground {"refine":true}                      (si hay que recortar al sujeto)
command_run type.create {"x":80,"y":420,"text":"¡RÉCORD!","font":"Impact","size":160,"color":"#ffd60a","name":"Titulo"}
command_run layer.layerStyle.stroke {"size":10,"position":"outside","color":"#000000"}
command_run layer.layerStyle.dropShadow {"distance":12,"size":10,"opacity":80,"color":"#000000"}
render_preview {} → revisar → doc_save {"path":".../miniatura.png"}
```

## Estándares profesionales
- **Miniatura YouTube**: 1280×720 (16:9), <2 MB, JPG/PNG. Máx. 3–5 palabras, texto ≥ 1/4 de la altura, contorno negro grueso + sombra, cara con emoción, alto contraste, nada importante en la esquina inferior derecha (ahí va la duración).
- **Portada TikTok/Reels**: 1080×1920; deja libres ~250 px arriba y ~400 px abajo (interfaz de la app).
- **Instagram post**: 1080×1350 (4:5). **Banner YouTube**: 2560×1440, zona segura central 1546×423.
- **Impresión**: 300 ppp, `file.new {mode:"cmyk"}`, 3 mm de sangrado (`image.canvasSize`). Para pantalla: RGB 8 bits, sRGB.
- Retoque de piel/objetos: trabaja en capa duplicada (`layer.duplicate`), nunca sobre el original.
- Ajusta el color antes que la nitidez; aplica la nitidez al tamaño final.
- Fuentes: Impact o la fuente propia **Trueno** para miniaturas de camiones; máximo 2 familias por pieza.

## Checklist antes de entregar
- [ ] `render_preview` revisado (texto legible en miniatura pequeña, a 320 px de ancho).
- [ ] Nada importante en los bordes ni tapado por la interfaz.
- [ ] Guardado `.pcraft` + exportación final, y la ruta dicha al usuario.
