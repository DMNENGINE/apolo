# VectorCraft — guía profesional (equivale a Illustrator)

Ilustración vectorial: logos, iconos, pósters, SVG, calcado de imágenes (Image Trace), pathfinder, 3D básico. Apache-2.0 (github.com/storytold/vectorcraft).

## Reglas de la app (verificadas)
- Coordenadas en puntos, y hacia abajo, origen arriba-izquierda del primer artboard. Documento nuevo por defecto 612×792; para web/logo usa `run_command file.new {width:512, height:512, units:"Pixels"}`.
- Lo nuevo queda seleccionado; casi todo actúa sobre la selección o sobre `ids`.
- **Cada forma nueva hereda la pintura anterior** (una estrella dibujada tras un círculo con borde salió con borde). Pasa SIEMPRE `fill` y `stroke` explícitos (`"stroke":"none"` si no lleva).
- Texto: `add_text {text, x, y, font, size, color, justify:"center"}` (es `justify`, no `align`).
- Mantén todo editable: formas vivas, efectos vivos, texto vivo. No rasterices salvo que lo pidan.
- `apply_effect {}` sin `effect` devuelve el catálogo con parámetros; `pathfinder {ids, operation:"unite|minusFront|intersect|exclude|divide|…"}`.
- Flujos oficiales en `prompts/list`: poster, icon-set, recolor, trace-and-style, export-set.

## Receta probada: logo circular
```
run_command file.new {"width":512,"height":512,"units":"Pixels"}
draw_shape {"shape":"ellipse","x":56,"y":56,"width":400,"height":400,"fill":"#0b1d3a","stroke":"#00b4d8","strokeWidth":16}
draw_shape {"shape":"star","cx":256,"cy":200,"radius1":80,"radius2":35,"points":5,"fill":"#ffd60a","stroke":"none"}
add_text {"text":"LAGC","x":256,"y":370,"font":"Impact","size":96,"color":"#ffffff","justify":"center"}
screenshot / render_preview → MIRAR
export {"path":"C:/…/logo.svg","outlineText":true}     (texto a contornos: se ve sin la fuente)
export {"path":"C:/…/logo.png"}
```

## Flujos oficiales (resumen)
- **Póster**: planifica jerarquía → formas (`draw_shape`, `draw_path` con `d` SVG o `points` con `in/out`) → `set_paint` (admite `{"gradient":…}`) → `add_text` (puntual, de área con width/height, o sobre trazado `mode:"onPath"`) → `apply_effect` → captura → exportar.
- **Set de iconos**: decide celda y separación; mismo grosor, tamaño óptico y radio de esquina; misma pintura con un acento; júzgalos como set.
- **Calcar imagen**: `open_file` la imagen → `imageTrace.make {preset, params}` (modo `logo` para logos planos; menos `paths` y más `corners` = más limpio) → `set_paint` → borrar la imagen de debajo.
- **Exportar set**: `document.formats` primero; un `export` por formato; leer los `warnings`.

## Estándares profesionales de logo
- Funciona en 1 color y a 16 px (favicon): pruébalo exportando PNG pequeño.
- Máximo 2–3 colores; versión positiva y negativa.
- Grosor de trazo coherente; convierte trazos y texto a contornos en la versión final (`outlineText`).
- Entregables: SVG (web), PDF (imprenta, `{"advanced":{"outlineText":true}}`), PNG 512/1024 con fondo transparente.
- Iconos: rejilla de 24 px, trazo 2 px, esquinas 2 px.
- Para corte láser/vinilo/CNC: exporta DXF y quita rellenos (solo contornos).

## Checklist
- [ ] Captura revisada; colores y trazos explícitos en cada forma.
- [ ] SVG con texto a contornos + PNG; `warnings` de export leídos.
