---
name: mission-control
description: Genera un mundo de Mission Control para APOLO (el mapa pixel-art vivo donde se ven los agentes, los modelos, los bots y los servicios) a partir de una imagen de referencia o de una descripción - analiza el estilo, lo traduce al catálogo del motor, escribe el JSON mundo/1, lo valida, lo captura, lo compara con la referencia y lo aplica. Úsala cuando pidan crear, cambiar o "hacer como esta imagen" el Mission Control o su mundo.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [mission control, misión control, mundo de mission control, crea un mundo, mapa de agentes, hazlo como esta imagen, tema del mission control, sala de servidores, pixel art de agentes]
---

# Generar un mundo de Mission Control

El mundo es un JSON `mundo/1` que el motor de APOLO dibuja en pixel-art: salas, pasillos y objetos de un catálogo cerrado, más un `estilo` (paleta, muros, núcleo, quién vive ahí, partículas). Todo lo que se puede usar está en `references/catalogo.md`: **léelo antes de empezar** y no inventes tipos, suelos ni temas fuera de él (el validador los descarta).

## Proceso

1. **Leer la referencia.** Si es una imagen, descríbela con tus propios ojos (visión) en 6 apartados y apúntalos:
   - **Paleta**: fondo, paredes, suelo, color de acento y de las luces (en hex).
   - **Materiales**: de qué parecen los muros y los suelos (piedra, metal, carne, roca volcánica, madera…).
   - **Núcleo**: qué hay en el centro (orbe, cerebro, cerebro en llamas…).
   - **Pueblo**: quién trabaja ahí (humanos, aliens, demonios, científicos) y cómo es el jefe/orquestador.
   - **Salas**: cuáles se ven, **con el nombre tal cual aparece**, y dónde están (arriba-izquierda, centro…).
   - **Objetos icónicos**: los 3–6 que hacen reconocible la imagen (vainas, jaulas de fuego, hologramas, láseres…).
   Si es texto, saca lo mismo de la descripción y decide lo que falte con criterio.
2. **Traducir al catálogo.** Elige el `tema` más cercano y ajusta con `estilo` solo lo que difiera (colores en hex, `amb` = luz ambiente RGB). Para cada objeto icónico busca su equivalente en la tabla de equivalencias del catálogo; si no hay, el más parecido. Anota la tabla «referencia → catálogo».
3. **Bocetar en ASCII** la rejilla (36–40 × 20–26 casillas) con las salas en la **misma posición relativa** que en la referencia, los pasillos y las puertas. Respeta las reglas de distribución del catálogo (huecos, entradas libres, tamaños mínimos).
4. **Escribir el JSON** (`formato`, `nombre`, `tema`, `estilo`, `ancho`, `alto`, `salas`, `pasillos`, `objetos`). Pon los objetos grandes primero y deja libres las casillas de entrada de cada sala.
5. **Validar**: `node scripts/validar.js <mundo.json>`. Corrige hasta **0 errores**; los avisos, léelos y decide.
6. **Ver de verdad**: `node scripts/captura.js <mundo.json> <salida.png>` (necesita APOLO abierto; no cambia el mundo de la persona). Mira la captura y **compárala con la referencia** con la rúbrica de abajo. Corrige y vuelve a capturar: **dos vueltas como mínimo**.
7. **Entregar**: con permiso, `node scripts/aplicar.js <mundo.json> [--galeria <id>]` lo pone como mundo actual y lo guarda en la galería (⚙ del Mission Control). Explica en 3–5 líneas las decisiones (qué es cada cosa de la referencia en el mundo) y qué no se pudo representar.

## Rúbrica de parecido (puntúa 1–5 cada una y da la media)
| Criterio | 5 = |
|---|---|
| Paleta y ambiente | Los colores dominantes y la luz (cálida, fría, tóxica…) se reconocen a primera vista |
| Distribución | Las salas están donde en la referencia y con proporciones parecidas |
| Objetos icónicos | Los 3–6 objetos clave tienen un equivalente visible en su sala |
| Pueblo y jefe | Los personajes y el orquestador son del tipo correcto |
| Núcleo | El centro (orbe/cerebro/fuego) se parece |
| Legibilidad | Los carteles se leen, nada tapa las entradas, los personajes caben |

Si la media es < 3,5, vuelve al paso 2: casi siempre falla la traducción de objetos o la paleta.

## Qué NO hacer
- No inventes tipos de objeto, suelos o temas: el validador los quita y el mundo queda vacío.
- No pongas objetos que bloquean en las casillas de entrada de una sala ni encima de los pasillos.
- No tapes los carteles: la fila superior de cada sala (y la inferior en el laboratorio MCP) es para su nombre.
- No guardes ni apliques sin enseñar antes la captura y la puntuación.
