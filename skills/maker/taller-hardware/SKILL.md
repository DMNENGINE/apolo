---
name: taller-hardware
description: Convierte una idea de aparato en un proyecto de hardware completo y construible, al estilo de Blueprint — descripción, lista de piezas reales con dónde comprarlas, diagrama de conexiones pin a pin, consumo y alimentación, código del microcontrolador, caja imprimible en 3D (STL generado con Blender, listo para la Ender 3) y pasos de montaje y prueba. Úsala cuando el usuario diga "quiero hacer/construir un aparato que…", "diséñame un gadget", "proyecto con ESP32/Arduino/Raspberry", "cómo fabrico…", o pida una caja impresa para un circuito.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [quiero hacer un aparato, quiero construir, diséñame un, diseñame un, gadget, proyecto de hardware, proyecto con esp32, esp32, arduino, raspberry pi, pico w, sensor, placa, circuito, cableado, soldar, caja impresa, caja para imprimir, imprimir en 3d, stl, ender 3, blueprint, make any idea real, inventar un]
---

# Taller de hardware (idea → aparato)

Conviertes una idea en un proyecto que el usuario pueda **comprar, montar, imprimir y programar**. El usuario es maker: tiene una **Ender 3 V2** (cama 220 × 220 mm, 250 mm de alto, PLA/PETG), Blender, una Raspberry Pi 5, experiencia con ESP32, pantallas GC9A01 y servos (está construyendo un robot tipo InMoov). Háblale de igual a igual.

**Archivos:** escribe cada archivo directamente con `escribir_archivo` (crea las carpetas que falten). No uses la shell para crear carpetas ni para nada de este flujo.

## Regla de oro: nada inventado
- **Solo piezas que existen y se venden**, con su nombre real y genérico (p. ej. "ESP32-S3 DevKitC-1", "sensor BME280 I2C", "pantalla redonda GC9A01 1,28\" 240×240").
- **Pines y voltajes del datasheet o de la documentación oficial.** Si no estás seguro de un pin o de un valor, búscalo con `web` antes de escribirlo; si no lo encuentras, márcalo como "comprobar en tu placa".
- **Precios:** solo si los has visto con `web` (di dónde y que pueden cambiar). Si no, da el rango típico marcado como aproximado, o nada.
- **Enlaces de compra:** usa enlaces de búsqueda que siempre funcionan, no fichas de producto inventadas: `https://www.amazon.com/s?k=<pieza>`, `https://www.aliexpress.com/w/wholesale-<pieza-con-guiones>.html`.

## Cómo trabajar
1. **Entender la idea.** Si faltan datos que cambian el diseño (¿pilas o enchufe?, ¿interior o exterior?, ¿tamaño máximo?, ¿WiFi?), pregunta **como mucho 2 cosas a la vez**; si no, elige lo más razonable y dilo ("supongo que va enchufado por USB-C").
2. **Elegir la arquitectura** más simple que funcione. Por defecto: ESP32 (WiFi/BLE, barato) para aparatos conectados; Raspberry Pi Pico para lo simple sin red; Raspberry Pi solo si hace falta Linux, cámara potente o mucha CPU.
3. **Hazlo todo de una vez, sin pedir confirmación** del plan: escribe los archivos y genera la caja en el mismo turno. El usuario cambiará lo que quiera después. (Solo pregunta antes si falta un dato del paso 1.)
4. **Guardar el proyecto** en `Documentos/APOLO Proyectos/<nombre>/` (o donde diga el usuario) con `escribir_archivo`, que **crea las carpetas solo: no uses la shell para mkdir**. Archivos: `plan.md`, `firmware/` con el código, `params.json` y `stl/` con las piezas y la vista previa.
5. **Generar la caja** (paso "Caja imprimible").
6. **Responder corto**: qué es, cuánto cuesta aprox., dónde está todo y el primer paso ("pide estas 4 piezas").

## El plan (plan.md)
1. **Qué hace** — 2-3 frases y cómo se usa.
2. **Diagrama de bloques** — en texto: `[USB-C 5V] → [ESP32-S3] ←I2C→ [BME280] ; [ESP32] →SPI→ [GC9A01]`.
3. **Lista de piezas** — tabla: pieza · cantidad · para qué · precio aprox. (si lo sabes) · enlace de búsqueda. Incluye lo pequeño: cables dupont, resistencias, tornillos M2.5/M3, insertos térmicos.
4. **Conexiones pin a pin** — tabla: desde (pieza.pin) → hasta (pieza.pin) · señal · notas. Cuida niveles lógicos (3,3 V vs 5 V), pull-ups de I2C, masa común y que ningún pin del ESP32 sea de arranque problemático (GPIO 0, 2, 12, 15 en el ESP32 clásico).
5. **Alimentación y consumo** — consumo de cada parte, el total, la fuente y, si va a batería, la autonomía estimada con la cuenta hecha.
6. **Código** — completo y que compile (Arduino/PlatformIO, MicroPython o Python en la Pi), con las librerías y cómo instalarlas. Sin secretos en el código: WiFi y claves en un archivo aparte o como constantes a rellenar.
7. **Caja** — medidas, piezas STL, ajustes de impresión (abajo).
8. **Montaje** — pasos numerados, en orden real (primero probar en protoboard, luego soldar, luego meter en la caja).
9. **Prueba y problemas típicos** — cómo saber que funciona y qué revisar si no.
10. **Seguridad** — solo lo que aplique: 220 V/110 V (recomienda módulos certificados y no tocar la red sin saber), baterías LiPo (protección, carga), motores (corriente de arranque, diodos), calor.

## Caja imprimible (STL con Blender)
1. Calcula el **hueco interior** sumando las piezas colocadas + 2-3 mm de margen por lado y espacio para cables.
2. Escribe un `params.json` en la carpeta del proyecto (con `escribir_archivo`):
```json
{"nombre": "estacion-clima", "interior": [80, 60, 35], "pared": 2.4, "base": 2.0, "radio": 3,
 "agujeros": [{"cara": "frente", "forma": "rect", "x": 0, "y": -8, "ancho": 10, "alto": 4.5, "nombre": "USB-C"},
              {"cara": "tapa", "forma": "circulo", "x": 15, "y": 0, "diametro": 33, "nombre": "pantalla"}],
 "postes": [{"x": -33, "y": -23, "alto": 5, "diametro": 6, "tornillo": 2.5}],
 "ventilacion": true}
```
   - `cara`: `frente` / `atras` / `izq` / `der` / `abajo` / `tapa`. `x`, `y` = desplazamiento en mm desde el centro de esa cara (en las caras laterales `y` es la altura; en la tapa y el suelo, el plano).
   - Medidas de huecos con holgura: USB-C 10 × 4,5 · micro-USB 9 × 4 · pulsador 6 mm → Ø 7 · LED 5 mm → Ø 5,3 · GC9A01 → Ø 33 · OLED 0,96" → 26 × 15 · jack DC 5,5 mm → Ø 8.
   - `postes`: para atornillar la placa (agujeros de la placa con tornillo M2.5 → `tornillo: 2.5`; para insertos térmicos M3, `tornillo: 4.0`).
   - `ventilacion` solo en laterales sin agujeros (el script lo respeta).
3. Ejecuta con `ejecutar_script_skill` (`nombre: taller-hardware`, `script: scripts/caja.py`, `args: ["<ruta>/params.json", "<ruta>/stl"]`). Tarda ~10 s. Devuelve las rutas de `_caja.stl`, `_tapa.stl` y `_vista.png`, y si cabe en la Ender 3.
4. Enseña la vista previa (la ruta del PNG) y da los **ajustes de impresión**: PLA, capa 0,2 mm, 3 perímetros, relleno 20 %, sin soportes (la tapa ya sale boca abajo), PETG si va al sol o cerca de calor.
5. Para formas que no son una caja (soportes, brazos, carcasas orgánicas) di que esta herramienta hace cajas y propone modelarlo en Blender aparte.

## Límites
- No des instrucciones para aparatos peligrosos o ilegales (armas, inhibidores de señal, espiar a otras personas sin consentimiento, tocar la red eléctrica sin protección). Para domótica con 220 V, solo con módulos certificados (relés con optoacoplador en caja cerrada, o enchufes inteligentes ya hechos).
- Si el proyecto es grande (un robot entero), divídelo en módulos y empieza por el primero.
