# FigCraft — guía profesional (equivale a Figma)

Diseño de interfaces: pantallas móvil/web, auto layout, componentes y variantes, variables (modo claro/oscuro), prototipos clicables, exportar PNG/SVG/PDF. Apache-2.0 (github.com/storytold/figcraft).

## Reglas de la app (verificadas)
- Coordenadas en px, y hacia abajo. `x/y` de `create_node`/`set_properties` son RELATIVOS AL PADRE (la página si no hay padre).
- Usa los ids numéricos que devuelve cada llamada (`{"id": 2}`); `"$last"` NO vale en `set_properties`.
- Hijos de un marco con auto layout se colocan solos: usa `layout`, `gap`, `padding [arriba, derecha, abajo, izquierda]`, `mainAlign`, `crossAlign`, `sizingH/sizingV` (`fixed|hug|fill`).
- **Un marco creado con `create_node` nace con alto fijo (100)**: pon `sizingV:"hug"` a botones/tarjetas para que se ajusten al contenido.
- Colores `"#RRGGBB"` o `"#RRGGBBAA"`. Texto: `create_node {type:"text", text, props:{fontSize, fontStyle:"Bold", fill}}` (fuente por defecto Inter).
- Presets de marco: `frame.create {preset:"iPhone 16"}` (393×852); `run_command frame.presets` lista todos.
- Verifica con `inspect_document` / `get_node` (tamaños, rellenos, layout) y `screenshot`.
- Flujos oficiales en `prompts/list`: mobile_screen, landing_page, design_system, prototype_flow.

## Receta probada: pantalla de login
```
run_command frame.create {"preset":"iPhone 16","x":0,"y":0,"name":"login"}        → id 2
set_properties {"ids":[2],"props":{"fill":"#FFFFFF","layout":"vertical","padding":[64,24,32,24],"gap":16}}
create_node {"type":"text","parent":2,"text":"Bienvenido","props":{"fontSize":28,"fontStyle":"Bold"}}
create_node {"type":"frame","parent":2,"name":"Boton","props":{"layout":"horizontal","mainAlign":"center","padding":[14,24,14,24],"cornerRadius":12,"fill":"#3B5BDB","sizingH":"fill","sizingV":"hug"}}   → id 4
create_node {"type":"text","parent":4,"text":"Entrar","props":{"fontSize":16,"fontStyle":"Bold","fill":"#FFFFFF"}}
screenshot {"ids":[2]} → MIRAR
export {"ids":[2],"format":"png","scale":2,"path":"C:/…/login.png"}
save_file {"path":"C:/…/login.figcraft"}
```

## Flujos oficiales (resumen)
- **Landing**: marco 1440 de ancho, vertical gap 0; secciones hijas con `sizingH:"fill"`: Nav (horizontal, spaceBetween, padding [20,80,20,80]) → Hero (titular 64 Bold, subtítulo 20, botón CTA) → Features (3 tarjetas, radio 16, padding 32, sombra suave) → banda CTA → Footer; al final `sizingV:"hug"` en la página.
- **Design system**: `variable.createCollection {name, modes:["Light","Dark"]}` → `variable.create` (color/bg, color/fg, color/primary) → estilos `style.create {type:"paint"|"text"}` → componente botón `component.create` + variantes `component.combineVariants` → `variable.bind {ids, field:"fill", variable}`.
- **Prototipo**: `proto.interaction.add {id:<botón>, trigger:{type:"onClick"}, action:{type:"navigate", dest:<marco>}, transition:{type:"smartAnimate"}, durationMs:300}` → `proto.flow.add {start, name}`.

## Estándares profesionales de UI
- Rejilla de 8 pt para espacios y tamaños; márgenes laterales móvil 16–24.
- Objetivos táctiles ≥ 44×44 (iOS) / 48×48 (Android).
- Texto: cuerpo 16, secundario 14, títulos 24–32; contraste WCAG ≥ 4,5:1.
- Un botón primario por pantalla; estados (normal, pulsado, deshabilitado, error, vacío, cargando).
- Componentes para todo lo que se repite; variables de color para claro/oscuro.
- Para guías más profundas usa las skills de diseño (fundamentos, accesibilidad, formularios-acceso, onboarding…).

## Checklist
- [ ] `inspect_document` sin marcos con alto fijo raro; captura revisada.
- [ ] PNG @2x exportado + archivo editable guardado.
