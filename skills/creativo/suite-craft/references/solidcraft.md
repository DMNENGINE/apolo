# SolidCraft — guía profesional (equivale a SolidWorks / Fusion 360)

CAD 3D paramétrico: bocetos con cotas, extrusiones, vaciados, taladros, redondeos, ensamblajes; exporta STEP, STL, 3MF, OBJ y URDF (robots). Apache-2.0 (Tangency Labs, github.com/tangency-labs/solidcraft). v0.30.1. Para planos 2D/DXF sigue siendo `cadcraft`; para **piezas 3D que se van a imprimir o mecanizar, SolidCraft**.

## Reglas de la app (verificadas 2026-11-07)
- **Antes de cualquier pieza que no sea una caja, lee `skill_reference {"skill":"solidcraft-modeling"}`**: trae los comandos exactos, los planos de boceto, los ids y las trampas de esta versión.
- Milímetros y grados; **Z hacia arriba**. Acepta unidades (`"16 in"`, `"30 deg"`) y expresiones con parámetros (`"w/2 - wall"`; `set_parameter`).
- Rutas absolutas dentro de `C:\Users\yosoy` (p. ej. `C:/Users/yosoy/Desktop/pieza.sc`).
- Todo va por `execute {command, params}` (o `batch`): `solid.box`, `solid.cylinder`, `sketch.create`, `sketch.rectangle.*`, `sketch.circle.center`, `sketch.dimension`, `solid.extrude`, `solid.hole`, `solid.fillet`…
- ⚠ `solid.box` va **con la esquina en el origen** salvo que pases `center:[x,y,z]`. Calcula las coordenadas de los taladros sobre eso (la primera prueba dejó un taladro a medias en el borde).
- Pasa **`expect: {volume_mm3, bbox}`** en `execute` con lo que calculaste: si no cuadra, la herramienta da error y dice cuánto se desvía. Úsalo siempre en piezas con medidas.
- Un corte que no toca nada "sale bien": comprueba con `measure {summary:true}` (volumen, bbox) y MIRA con `screenshot {}`.

## Receta probada: placa con taladro pasante
```
new_design {"name":"placa"}
execute {"command":"solid.box","params":{"length":80,"width":50,"height":10,"center":[0,0,5]}}
execute {"command":"solid.cylinder","params":{"diameter":8,"height":20,"base":[20,0,-5],"operation":"cut"},
         "expect":{"volume_mm3":39497.3}}
screenshot {}                                                → MÍRALA
save   {"path":"C:/Users/yosoy/Desktop/prueba-craft/placa.sc"}
export {"path":"C:/Users/yosoy/Desktop/prueba-craft/placa.stl"}    (impresión 3D)
export {"path":"C:/Users/yosoy/Desktop/prueba-craft/placa.step"}   (para otro CAD / CNC)
```

## Estándares profesionales (impresión en la Ender-3 V2 del usuario)
- Paredes ≥ 1,2 mm (3 perímetros de 0,4); detalles ≥ 0,8 mm.
- Holguras: encaje deslizante 0,3–0,4 mm por lado, a presión 0,1–0,15 mm; taladros +0,2 mm sobre el nominal (M3 → 3,2–3,4 mm).
- Voladizos ≤ 45° sin soportes; chaflán de 0,5 mm en la base contra la "pata de elefante".
- Volumen de impresión 220×220×250 mm: si no cabe, divide la pieza con encajes.
- STL para imprimir, STEP para compartir o mecanizar, URDF para el simulador del robot.

## Checklist de entrega
`measure` cuadra con lo calculado · body `closed: true` · screenshot mirado · `.sc` guardado · STL/STEP exportados · ruta dicha al usuario.
