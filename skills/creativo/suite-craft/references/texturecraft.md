# TextureCraft — guía profesional (equivale a Substance Painter)

Pintura de texturas 3D sobre una malla: capas, rellenos, materiales inteligentes, bake de mapas (AO, curvatura, grosor), render y exportación PBR. Apache-2.0 (github.com/storytold/texturecraft). v0.4.0.

## Reglas de la app (verificadas 2026-11-07)
- Rutas **relativas a la carpeta del usuario** y con barras `/`: `Desktop/proyecto/caja.tcraft`. Fuera de `C:\Users\yosoy` no lee ni escribe (copia desde D:\ antes).
- `project_new {mesh, resolution}`: mallas de serie `material_ball` (por defecto), `sphere`, `cube`, `rounded_cube`, `cylinder`, `torus`, `plane`, `crate`. Una malla propia: `mesh_import` (obj/fbx/glb).
- **Haz `bake {}` antes de usar materiales inteligentes o generadores**: sin los mapas de malla (AO, curvatura) salen planos. Usa la RTX (~1 s).
- Los materiales de archivo entran con la herramienta **`material_load {path}`**, NO con `command_run material.load` (bloqueado en automatización con rutas).
- ⚠ `.mcmat` de MaterialCraft 0.2 **no carga** ("material version 2, this version reads up to 1"). Hasta que actualicen TextureCraft: exporta los PNG en MaterialCraft (`outputs_export`) y mételos con `resource_import` + `command_run layer.add.image {name}`.
- Mira siempre con `viewport_render {width, height}` (yaw/pitch opcionales; `samples: 256` = path tracing de calidad).
- Todo lo demás son comandos: `command_list {filter}` → `command_run {id, params}`. Deshacer: `command_run edit.undo`.

## Receta probada: caja texturizada lista para juego
```
project_new {"mesh":"crate","resolution":1024}
bake {}
material_load {"path":"Desktop/mats/oxido.tcmat"}          (o capas/rellenos con command_run)
viewport_render {"width":768,"height":768}                 → MÍRALA
project_save {"path":"Desktop/prueba-craft/caja.tcraft"}
textures_export {"dir":"Desktop/prueba-craft/caja-tex","preset":"glTF PBR Metal Roughness","size":2048}
mesh_export {"path":"Desktop/prueba-craft/caja.glb"}       (glb con texturas dentro)
```
Salida verificada: por cada conjunto de texturas (Crate, Lid, Handle…) `_BaseColor`, `_Normal`, `_OcclusionRoughnessMetallic` + `caja.glb`.

## Estándares profesionales
- Resolución: 2048 para props protagonistas, 1024 para props normales, 512 para relleno; potencia de dos siempre.
- Preset según el destino: glTF/Web/Blender → "glTF PBR Metal Roughness"; Unreal → preset de Unreal (ORM empaquetado, normal DirectX); Unity → Metallic/Smoothness. Lista: `command_run export.presets`.
- Padding `dilation` (por defecto) para que no se vean costuras con los mipmaps.
- El desgaste (bordes gastados, suciedad en huecos) sale de la curvatura y el AO horneados: no lo pintes a mano si un generador lo hace.

## Checklist de entrega
Bake hecho · render mirado desde 2 ángulos · `.tcraft` guardado · texturas exportadas con el preset del motor de destino · ruta de la carpeta dicha al usuario.
