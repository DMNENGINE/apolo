# DeckCraft — guía profesional (equivale a PowerPoint)

Presentaciones: diapositivas por diseño, temas, gráficos, tablas, animaciones, transiciones; guarda `.deckcraft`/`.pptx` y exporta PDF, PNG o GIF. Apache-2.0 (github.com/storytold/deckcraft).

## Reglas de la app (verificadas)
- Diapositiva 16:9 por defecto: 960×540 pt, y hacia abajo.
- **`new_presentation` ya trae una diapositiva vacía (índice 0)**. Rellénala (`go_to_slide 0` + `set_text`) o bórrala (`run_command slide.delete`) para no entregar una portada en blanco.
- `add_slide {layout, title, body}` — layouts: title, titleAndContent, sectionHeader, twoContent, comparison, titleOnly, blank, contentWithCaption, pictureWithCaption. En `body`, `\n` separa viñetas.
- Índices de diapositiva 0-based en `export {slide}`.
- Temas: `run_command design.themes {}` lista temas (DeckCraft, Harbor, Ember, Meadow, Nocturne, Paper, Coral Reef, Slate, Ocean, Sunset, Forest, Berry…) y esquemas de fuentes; aplica con `design.theme {name}`. Sin tema queda blanco y negro plano: aplica uno siempre.
- Formas: `add_shape {preset, x, y, w, h, fill, text}`; texto libre `add_text_box`; imágenes `insert_picture {path, x, y, w, h}` (se copian dentro del archivo).
- `render_slide {slide}` para mirar cada diapositiva.

## Receta probada
```
new_presentation {}
run_command design.theme {"name":"Nocturne"}
add_slide {"layout":"title","title":"LAGCTRUCKS 2026","body":"Resumen del año"}
add_slide {"layout":"titleAndContent","title":"Crecimiento","body":"TikTok x3\nYouTube +40%\nComunidad activa"}
add_slide {"layout":"titleOnly","title":"Vistas por mes"}
insert_chart {"type":"column","title":"Vistas","categories":["Jul","Ago","Sep"],"series":[{"name":"Vistas","values":[120,340,610]}]}
run_command slide.delete … (la vacía del principio)
render_slide → MIRAR cada una
save_presentation {"path":"C:/…/deck.pptx"}   export {"path":"C:/…/deck.pdf"}
```

## Más comandos
- `transition.set` (fade/push, 0,3–0,5 s), `animation.set` (aparecer por viñeta), `shape.connect` (diagramas), `shape.merge`, `table.*`, `chart.*`, notas del orador en `inspect_slide`.
- Export: PDF `{layout:"slides|notes|handouts", perPage}`, PNG por diapositiva `{slide}` o `{all:true}`, GIF animado `{width, secondsPerSlide, loop}`.

## Estándares profesionales
- Una idea por diapositiva; título = la conclusión ("Las vistas se quintuplicaron"), no el tema ("Vistas").
- Máx. 6 viñetas de ≤ 6 palabras; mejor un gráfico o imagen grande.
- Tipografía: títulos ≥ 32 pt, cuerpo ≥ 20 pt; contraste alto; 1 color de acento.
- Gráficos: el tipo según la pregunta (barras para comparar, línea para tendencia); quita lo que no aporta; resalta el dato clave.
- Estructura: portada → problema/contexto → 3 puntos clave → datos → cierre con llamada a la acción.
- Transiciones sobrias e iguales en todo el deck.

## Checklist
- [ ] Sin diapositiva vacía al principio; tema aplicado.
- [ ] Todas renderizadas y revisadas; PPTX + PDF entregados.
