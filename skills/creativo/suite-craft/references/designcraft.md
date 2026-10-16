# DesignCraft — guía profesional (equivale a InDesign)

Maquetación: pósters, folletos, revistas, libros, catálogos, tarjetas; marcos de texto e imagen, estilos, combinación de datos (CSV → muchas tarjetas), PDF de imprenta. Apache-2.0 (github.com/storytold/designcraft).

## Reglas de la app (verificadas)
- Coordenadas en puntos (1 pt = 0,3528 mm), y hacia abajo; página Letter = 612×792, A4 = 595×842. Rectángulos `[x0, y0, x1, y1]`.
- **Páginas 0-based** en `export_png {page}` / `render_page {page}`.
- **Usa los ids que devuelven los comandos** (`frame.create` → `{id, story}`): no los adivines. En `batch {script}` puedes referirte a ellos: `"$0.id"`, `"$5.story"` (N = índice del paso, 0-based) y `$last`.
- Imagen en un marco: `place.load {path}` → `place.drop {x, y, frame:<id>}` → `object.fit {mode:"fillProportionally", ids:[id]}` (o fitProportionally / centerContent).
- **Color de texto = nombre de muestra**: primero `swatch.create {name:"Marino", color:"#0b1d3a"}` y luego `type.char {attrs:{fill:"Marino"}}` (un hex directo da error).
- Formato de texto: `text.select {story, anchor, focus}` (offsets en BYTES UTF-8: á = 2) → `type.char {attrs:{fontFamily, fontStyle, size, leading, tracking, fill}}` y `type.para {attrs:{align, spaceBefore, spaceAfter}}`.
- Estilos: `style.paragraph.create {name, chars, para}` → `style.paragraph.apply {name}` (mejor que formato suelto).

## Receta probada: póster
```
new_document {"preset":"Letter","bleed":9}
batch {"script":
  frame.create {"rect":[-9,-9,621,330],"content":"graphic"}
  place.load {"path":"C:/…/foto.jpg"}
  place.drop {"x":0,"y":0,"frame":"$0.id"}
  object.fit {"mode":"fillProportionally","ids":["$0.id"]}
  swatch.create {"name":"Marino","color":"#0b1d3a"}
  frame.create {"rect":[48,360,564,470],"content":"text","text":"GRAN EXPO DE CAMIONES"}
  text.select {"story":"$5.story","anchor":0,"focus":21}
  type.char {"attrs":{"fontFamily":"Impact","size":44,"fill":"Marino"}}
  type.para {"attrs":{"align":"center"}} }
export_png {"page":0,"path":"C:/…/poster.png"} → MIRAR
save_document {"path":"C:/…/poster.pdf"}   (y .designcraft para editar)
```

## Combinación de datos (tarjetas, diplomas, credenciales)
`data.source.select {path:"lista.csv"}` → `data.placeholder.add {field, role:"text"|"image"|"qr"}` → `data.merge {records:"all"}` (crea un documento NUEVO) → exportar PDF.

## Estándares profesionales de maquetación
- Imprenta: sangrado 3 mm (≈ 9 pt) con las imágenes de fondo llegando hasta el sangrado; margen de seguridad 5 mm; imágenes ≥ 300 ppp; colores CMYK (`swatch.create {color:{c,m,y,k}}`); PDF con marcas de corte.
- Rejilla de columnas y márgenes coherentes; alinea todo a la rejilla.
- Jerarquía: 1 titular grande, 1 subtítulo, cuerpo; máx. 2 familias tipográficas.
- Cuerpo de texto 9–12 pt con interlineado 120–145 %; sin viudas ni huérfanas.
- Póster: legible a 3 m → titular ≥ 72 pt en A3; fecha/lugar/llamada a la acción claros.
- Tamaños: A4 210×297 mm, A3 297×420, tarjeta de visita 85×55, flyer A5 148×210.

## Checklist
- [ ] Sin texto desbordado (`inspect_document` → stories con overset); páginas renderizadas.
- [ ] PDF exportado (+ archivo editable); rutas dichas.
