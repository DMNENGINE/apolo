# EffectCraft — guía profesional (equivale a After Effects)

Motion graphics y composición: títulos animados, intros, lower thirds, keying de croma, tracking, partículas 3D, expresiones. Apache-2.0 (github.com/storytold/effectcraft).

## Reglas de la app (verificadas)
- Todo es un comando: `list_commands {filter}` → `describe_command {command}` (parámetros + JSON Schema) → `execute_command {command, params}`.
- **Nombra las capas al crearlas** (`name`) y luego refiérete a ellas por nombre: `"layer": "Titulo"`.
- Propiedades por ruta: `transform/position`, `transform/scale`, `transform/opacity`, `effects/#1/blurriness`. `get_layer {layer, flat:true}` lista todas las rutas.
- **Tiempo de capa vs de composición**: `add_keyframe`/`set_property` usan tiempo de capa; `render_frame`/`get_property` tiempo de comp. En capas desplazadas pasa `timeBase:"comp"`.
- Escala en %: `[100,100]`. Colores `"#rrggbb"`.
- Sin ventana el proyecto vive en memoria: `save_project` tras cada hito.
- `batch {steps}` = un solo paso de deshacer y admite referencias `"$1.layer"`.

## Receta probada: intro vertical animada
```
execute_command comp.new {"name":"Intro","width":1080,"height":1920,"frameRate":30,"duration":3}
execute_command layer.newSolid {"name":"Fondo","color":"#0b1d3a"}
execute_command layer.newText {"name":"Titulo","text":"LAGCTRUCKS","size":150,"fill":"#ffd60a"}
add_keyframe {"layer":"Titulo","path":"transform/scale","keys":[{"time":0,"value":[0,0]},{"time":0.5,"value":[110,110]},{"time":0.7,"value":[100,100]}],"interpolation":"easyEase"}
add_effect {"layer":"Titulo","effect":"Glow","values":{"radius":30}}
render_frame {"time":1,"max_side":640}            → MIRAR
execute_command renderQueue.add {"comp":"Intro","format":"h264","output":"C:/…/intro.mp4"}
execute_command renderQueue.render {"wait":true}
save_project {"path":"C:/…/intro.ecproj"}
```

## Recetas útiles
- **Croma verde**: `add_effect Keylight (1.2)` → `execute_command effect.pickColor {layer, effect:1, param:"screenColour", x, y, average:true}` → `set_property effects/#1/screenMatte/clipBlack 10` → `render_frame {transparent:true}`.
- **Expresión**: `set_property {layer, path:"transform/rotation", expression:"time*90"}`; `wiggle(3,20)` para temblor de cámara.
- **Máscara**: `layer.addMask {layer, shape:"rect"|"ellipse", rect}` → `layer.mask.set {field:"feather", value}`.
- **Lower third reutilizable**: Essential Graphics → `essential.set {layer, control:"Title", value}`; plantilla `.ectemplate` renderizable con valores.
- **Escalonar capas**: `layer.quickOffset {delta, layers}`.
- **Easing fino**: `keys.select` + `keys.velocity {outSpeed:0, outInfluence:33.33}`.
- **Vídeo con alfa** (para superponer en FilmCraft): `renderQueue.add {format:"prores", proresProfile:4444, channels:"rgba"}`.
- Efectos disponibles: `list_effects {filter}`; fuentes: `list_fonts {query}`.

## Principios de animación (profesional)
- Nunca lineal: `easyEase` o curvas de velocidad. Entradas rápidas (0,3–0,5 s), salidas más rápidas aún.
- Overshoot (110 % → 100 %) da energía; anticipación antes de un gran movimiento.
- Escalona elementos 2–4 fotogramas (`quickOffset`), no todos a la vez.
- Textos en pantalla ≥ 1,5 s por línea leída; títulos de 3–5 palabras.
- 30 fps para redes; 24 fps look cine; mismo fps que el vídeo donde se va a montar.
- Zona segura vertical: margen de 90 px a los lados, 250 px arriba, 400 px abajo.

## Checklist
- [ ] `render_frame` en el inicio, el pico de la animación y el final.
- [ ] Render terminado (`renderQueue.render {wait:true}` sin `failed`) y `.ecproj` guardado.
