# Carcasa del ojo de escritorio — medidas y plan de modelado

Para modelar después en **Blender con el MCP** (Blender 3.6.5, como el casco y la lámpara hex) e imprimir en una
**Ender 3 (cama 220×220, PLA, boquilla 0,4)**. Todo en milímetros. Las medidas de módulos son de los módulos
genéricos de AliExpress: **mídelos con el calibre antes de imprimir** (cambian ±0,5 mm entre vendedores).

## Medidas de los componentes

| Pieza | Medidas | Notas |
|---|---|---|
| Pantalla GC9A01 (módulo) | PCB redonda Ø 38,5 + pestaña de pines 12 × 6; grosor 4,0 (vidrio + PCB) + pines 8,5 | zona visible Ø 32,4; vidrio Ø 35,6 |
| XIAO ESP32S3 | 21 × 17,8 × 3,5 (+ USB-C sobresale 1,5) | |
| XIAO Sense (con placa de cámara) | 21 × 17,8 × ~15 de alto apilada | cámara OV2640 en flex de ~25 mm; lente 8 × 8, Ø óptica 6 |
| DevKitC-1 (alternativa) | 69 × 26 × 13 (con pines) | versión de base alargada |
| INMP441 | PCB Ø 14 (redonda) × 1,6; agujero del micro abajo | necesita canal de sonido Ø 1,5–2 al exterior |
| MAX98357A | 17,8 × 19,6 × 3 (+ bornes 6) | |
| Altavoz 28 mm | Ø 28 × 5,5 | o 40 mm: Ø 40 × 5 |
| Pulsador 12×12 | 12 × 12 × 7,3 con capuchón Ø 11,5 | |
| Tornillería | M2 × 6 (×6) + insertos térmicos M2 (opcional) | |

## Forma (propuesta)

Una **cápsula-ojo** inspirada en el casco: cuerpo esférico achatado **Ø 72 × 58 de fondo**, frontal plano con bisel donde
va la pantalla, apoyado en un **pie** con inclinación de 12° hacia arriba (mira a la cara del usuario sentado).

```
        vista lateral                       vista frontal
      ___________                          .-""""""-.
     /  cámara ○ \  ← Ø 7 sobre el visor  /  (    )  \   ← ventana Ø 33 (pantalla)
    |  [pantalla] |                       |  (    )   |
    |   micro ·   |  ← canal Ø 1,8         \  · ::::  /   ← micro · rejilla altavoz
     \___________/                          '-......-'
        /_____\   ← pie 12°, USB-C atrás        [o]  ← botón arriba
```

## Piezas a imprimir (3 + 1 opcional)

| # | Pieza | Medidas aprox. | Orientación | Soportes |
|---|---|---|---|---|
| 1 | **Frontal / bisel** | Ø 72 × 10 | cara al plato | no |
| 2 | **Cuerpo trasero** (media cápsula) | Ø 72 × 48 | abierto hacia arriba | no (voladizos < 50°) |
| 3 | **Pie** con alojamiento del altavoz | 60 × 55 × 22 | base al plato | no |
| 4 | Capuchón del botón (opcional, PLA o TPU) | Ø 11 × 8 | | no |

Ajustes de impresión: capa 0,2, paredes 3 (1,2 mm), relleno 20 % giroide, PLA 205/60 °C. ~60 g, ~4 h en total.
Todo cabe en la cama de 220×220 a la vez.

### 1. Frontal / bisel
- Ventana **Ø 33,0** (zona visible 32,4 + 0,6 de margen) con chaflán 45° de 1 mm hacia fuera.
- Por detrás, cajeado para el módulo: **Ø 39,0 × 4,2** de profundidad + muesca 13 × 7 para la pestaña de pines.
- Agujero de cámara **Ø 7** a 30 mm sobre el centro de la pantalla (solo versión Sense) + cajeado 8,5 × 8,5 × 3 detrás
  para el módulo de la lente; ventanita **Ø 2** al lado para el LED (con la XIAO el LED es el de la placa: guía de luz
  de PLA transparente Ø 2 × 12 o dejar el agujero).
- Agujero del micro **Ø 1,8** a 22 mm bajo el centro; detrás, asiento Ø 14,4 × 1,8 para la PCB del INMP441 con
  **junta de espuma** (anillo Ø 14 / Ø 4) para que no capte ruido de dentro.
- 3 torretas M2 (Ø 5, agujero Ø 1,7 para autorroscante o Ø 3,2 para inserto) a 120° sobre radio 31.
- Grabado opcional del logo/nombre "APOLO" 0,4 mm abajo.

### 2. Cuerpo trasero
- Pared de 2 mm, interior libre ≈ Ø 68 × 44.
- Soporte de la XIAO: ranura 21,4 × 18,2 con topes, USB-C alineado con un hueco **12 × 7** en la parte trasera-baja
  (centro a 9 mm del borde inferior del cuerpo).
- Agujero del botón arriba **Ø 12,4** con asiento cuadrado 12,2 × 12,2 × 3 por dentro (y el 2º botón, si lo hay, a 20 mm).
- Rejilla de ventilación pequeña (6 ranuras 1,5 × 10) arriba atrás: el ESP32 con WiFi calienta ~45 °C.
- 3 agujeros pasantes Ø 2,4 avellanados para los M2 que van al frontal.
- Pasacables Ø 6 abajo hacia el pie.

### 3. Pie
- Base 60 × 55, inclinación de la cuna **12°**, cuna esférica R 36,2 (abraza el cuerpo, 0,2 de holgura).
- Alojamiento del altavoz de 28 mm boca abajo: cajeado **Ø 28,4 × 6** con rejilla de agujeros Ø 2 en patrón hexagonal
  (paso 3,2) en la cara frontal-inferior; cámara de aire detrás (mejora graves).
- Bolsillo para el MAX98357A 18,2 × 20 × 8 junto al altavoz.
- 4 huecos Ø 10 × 1 abajo para pies de goma. Peso extra opcional: hueco 30 × 20 × 8 para tuercas M8 (que no vuelque al pulsar).

## Plan de modelado en Blender (MCP)

Igual que la lámpara hex y el soporte del monitor: **un script paramétrico** (`docs/ojo/build_carcasa.py`, por hacer)
que se ejecuta con `execute_blender_code` y deja cada pieza como objeto separado, listo para exportar.

1. `limpiar escena` → unidades en mm (`scene.unit_settings.scale_length = 0.001`, longitud en milímetros).
2. Diccionario `P` con todas las medidas de arriba (cambiarlas = regenerar).
3. **Cuerpo**: UV sphere Ø 72 escalada en Y a 0,8 → corte por el plano frontal (boolean con cubo) → `Solidify` 2 mm hacia dentro →
   aplicar. Frontal = disco Ø 72 × 10 con bisel (`Bevel` 1,5 mm).
4. Huecos con **booleanos EXACT** (`use_self` y `hole_tolerant` activos, como en el casco): ventana, cajeado de pantalla,
   cámara, micro, botón, USB-C, ventilación. Torretas M2 = cilindros unidos (UNION) antes de los agujeros.
5. Pie: cubo redondeado (`Bevel` 4 mm) → boolean DIFFERENCE con esfera R 36,2 rotada 12° → altavoz + rejilla hex
   (array de cilindros Ø 2 recortados por un círculo Ø 26).
6. Comprobar: `3D Print Toolbox` (manifold, grosor mínimo 1,2, voladizos), `bpy.ops.mesh.print3d_check_all()`.
7. Exportar STL por pieza a `docs/ojo/stl/` (`ojo_frontal.stl`, `ojo_cuerpo.stl`, `ojo_pie.stl`, `ojo_capuchon.stl`),
   escala 1, +Z arriba, ya en la orientación de impresión.
8. Render rápido del conjunto (Eevee) con la hoja de gestos como textura de la pantalla para la guía / Printables.

Variantes a parametrizar: `CON_CAMARA` (Sense vs DevKit), altavoz 28/40 mm, 1 o 2 botones, inclinación del pie.
