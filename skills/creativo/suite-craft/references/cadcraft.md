# CadCraft — guía profesional (equivale a AutoCAD)

Dibujo técnico 2D/3D: planos, piezas para impresión 3D / láser / CNC, cotas, capas, bloques, DXF/DWG/PDF. Apache-2.0 (github.com/storytold/cadcraft).

## Reglas de la app (verificadas)
- La forma más rápida: `command_line {text}` con sintaxis AutoCAD; los espacios hacen de Enter. `script {text}` para varias líneas (.scr). `execute {command, params}` para JSON sin diálogos.
- Unidades del dibujo = milímetros si creas con `new_drawing {metric:true}` (hazlo siempre para piezas).
- **Un comando a medias se come lo siguiente**: si una respuesta trae `"running": "<cmd>"` y un prompt pidiendo selección, el comando sigue abierto; lo que mandes después se interpreta como respuesta a él. Termínalo o usa `cancel` antes de seguir. Comprueba `running: null`.
- Mejor dar todos los datos en una línea: `rectang f 6 0,0 100,60` (rectángulo con esquinas redondeadas de 6) en vez de FILLET con selección por clic.
- Coordenadas: absolutas `x,y`, relativas `@dx,dy`, polares `@dist<ángulo`.
- Verifica con `inspect_drawing` / `query_entities` y MIRA con `render {window}`.
- `save {path}`: `.dxf`/`.dwg` guarda; `.svg`/`.png`/`.pdf` exporta (el dibujo conserva su nombre).

## Receta probada: placa con dos taladros
```
new_drawing {"metric":true}
command_line {"text":"rectang f 6 0,0 100,60"}
command_line {"text":"circle 20,30 5"}
command_line {"text":"circle 80,30 5"}
command_line {"text":"dimlinear 0,0 100,0 50,-10"}
command_line {"text":"zoom e"}
render {} → MIRAR
save {"path":"C:/…/placa.dxf"}  y  save {"path":"C:/…/placa.pdf"}
```

## Comandos clave
- Dibujo: `line`, `pline`, `rectang`, `circle` (centro radio | `2p` | `3p`), `arc`, `ellipse`, `polygon`, `spline`, `hatch`.
- Edición: `move`, `copy`, `rotate`, `scale`, `mirror`, `offset`, `trim`, `extend`, `fillet` (r=radio), `chamfer`, `array` (rectangular/polar), `explode`, `join`.
- Cotas: `dimlinear`, `dimaligned`, `dimradius`, `dimdiameter`, `dimangular`; estilo `ISO-25`.
- Organización: `layer` (capas por tipo: CONTORNO, TALADROS, COTAS, TEXTO), `block`/`insert`, `mtext`.
- 3D: `extrude`, `revolve`, `union`, `subtract` (ver `list_commands {filter:"3d"}`).

## Estándares profesionales
- Dibuja a escala 1:1 en mm; la escala solo se aplica al imprimir.
- Capas con color por función; cotas y texto en su propia capa.
- Taladros para tornillos (holgura de impresión 3D): M3 → Ø3,4, M4 → Ø4,5, M5 → Ø5,5; insertos térmicos M3 → Ø4,0–4,2.
- Impresión 3D (Ender-3 del usuario): tolerancia de encaje 0,2–0,3 mm, paredes ≥ 1,2 mm (3 perímetros de 0,4), radios en esquinas internas.
- Láser/CNC: contornos cerrados (`pline` cerrada), sin líneas duplicadas, cada operación en su capa; DXF R2018.
- Cotas: las imprescindibles para fabricar, sin duplicar; referencias desde una arista base.

## Checklist
- [ ] `running: null` al final y `inspect_drawing` con los conteos esperados.
- [ ] Render revisado; DXF + PDF/PNG guardados.
