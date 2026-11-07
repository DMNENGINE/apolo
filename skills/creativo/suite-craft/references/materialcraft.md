# MaterialCraft — guía profesional (equivale a Substance Designer)

Materiales procedurales por nodos: un paquete `.sbs` con grafos; las salidas (baseColor, normal, roughness, metallic, height, ambientOcclusion) forman un material PBR que se repite sin costuras. Apache-2.0 (github.com/storytold/materialcraft). v0.2.0.

## Reglas de la app (verificadas 2026-11-07)
- Rutas **relativas a la carpeta del usuario**, con `/`: `Desktop/mats/madera.sbs`. Para `material_export` la carpeta ya debe existir.
- El paquete nuevo ya trae un grafo 0: `graph_new` crea el **grafo 1** (y lo abre). Plantillas: `pbr` (las 6 salidas, lo normal), `empty`, `atomics`.
- Construye con `library_list {filter}` (nodos disponibles) → `node_add` → `node_connect` → `node_param`; o `command_run`/`command_batch` (`command_list` para ids). Revisa con `session_inspect`.
- Mira con `view_render {width, height}` (3D en la escena; `hq:true, full:true` = desplazamiento real + sombras) o `view: "2d", node: <id>` para ver un solo nodo.
- Guardar: `package_save {path: ….sbs}` (SBS nativo, el formato de Substance).
- Exportar: `outputs_export {dir, format, depth, size}` (un PNG por salida) o `material_export {path: ….mcmat}`.
- ⚠ El `.mcmat` (versión 2) **todavía no lo lee TextureCraft 0.4**: para llevarlo a TextureCraft usa los PNG de `outputs_export`.

## Receta probada
```
graph_new {"template":"pbr","name":"madera","size":1024}
library_list {"filter":"noise"}  →  node_add / node_connect / node_param …
view_render {"width":512,"height":512}                       → MÍRALA
outputs_export {"dir":"Desktop/prueba-craft/mat"}             → madera_basecolor/normal/roughness/metallic/height/ambientocclusion.png
package_save {"path":"Desktop/prueba-craft/madera.sbs"}
```

## Estándares profesionales
- Tileable SIEMPRE: compruébalo en `view_render`; nada de bordes ni manchas que se repitan a la vista.
- Altura en 16 bits (`depth: 16`) para que el desplazamiento no haga escalones; color en 8 bits sRGB, el resto lineal.
- Rugosidad nunca plana: un poco de variación (ruido suave) hace que parezca real.
- Expón 2–4 parámetros útiles (desgaste, escala, color) para reutilizar el material.

## Checklist de entrega
Render 3D mirado · tileable comprobado · `.sbs` guardado · PNG exportados (los que pida el motor) · ruta dicha al usuario.
