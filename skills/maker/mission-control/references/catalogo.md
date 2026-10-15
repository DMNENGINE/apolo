# Catálogo del motor de Mission Control (mundo/1)

Coordenadas en **casillas** (32 px cada una), (0,0) arriba a la izquierda. `ancho` 24–96, `alto` 16–54; **recomendado 36–40 × 20–26** (más grande se ve diminuto).

## Estructura
```json
{ "formato": "mundo/1", "nombre": "…", "tema": "mazmorra", "estilo": { … },
  "ancho": 37, "alto": 26,
  "salas": [{ "id": "principal", "nombre": "Área del agente principal de IA", "rol": "principal", "x": 15, "y": 6, "w": 11, "h": 10, "suelo": "piedra" }],
  "pasillos": [{ "x": 12, "y": 3, "w": 16, "h": 2 }],
  "objetos": [{ "tipo": "orbe", "x": 19, "y": 10 }] }
```
Los pasillos llevan el suelo por defecto del tema (tierra; metal en nave/laboratorio/estación; madera en oficina; hierba en bosque). Las paredes salen solas alrededor de todo lo que es suelo.

## Roles de sala (qué se ve en cada una)
| rol | obligatoria | qué pasa ahí |
|---|---|---|
| `principal` | **sí** | el jefe (APOLO, el orquestador) y las conversaciones; **lleva un `orbe` en el centro** (se dibuja como orbe o cerebro según `estilo.nucleo`) |
| `subagentes` | **sí** | adonde van los subagentes; la más grande |
| `servidores` | recomendada | cada objeto servidor (`rack`, `vaina`, `jaula`) es un grupo de servicios en línea del usuario (hasta 6–8) |
| `taller` | recomendada | tareas programadas y turno de noche; su objeto estrella es `impresora` (o `yunque` en temas de fuego) |
| `mcp` | recomendada | el laboratorio donde se conjuran las herramientas MCP: `portal` en el centro y dos `brazo` a los lados; su cartel va **abajo** |
| `biblioteca`, `decor` | no | memoria / ambiente |
Los modelos de IA y los bots de Discord **pasean por todo el mapa**: no necesitan sala.

## Temas (`tema`) y sus valores por defecto
| tema | muros | luz | núcleo | pueblo | partículas | para |
|---|---|---|---|---|---|---|
| `mazmorra` | ladrillo gris | antorcha | orbe | humanos | brasas | medieval, fantasía |
| `castillo` | ladrillo cálido | antorcha | orbe | humanos | brasas | medieval noble |
| `nave` | panel | neón | orbe | humanos | brasas | sci-fi |
| `laboratorio` | azulejo blanco | neón | orbe | humanos | brasas | laboratorio limpio |
| `oficina` | yeso | lámpara | orbe | humanos | brasas | oficina |
| `bosque` | troncos | antorcha | orbe | humanos | brasas | naturaleza |
| `colmena` | orgánico (carne, venas verdes) | bio (bulbos verdes) | cerebro | aliens | esporas | alien, bio-orgánico |
| `infierno` | roca volcánica con grietas de lava | lava | cerebro en llamas | demonios | brasas | infierno, lava, fuego |
| `estacion` | panel | neón | cerebro | científicos | chispas | estación espacial, científicos |

## `estilo` (opcional: ajusta el tema; solo estas claves)
| clave | valores |
|---|---|
| `muro` | ladrillo · panel · azulejo · yeso · tronco · organico · roca |
| `luz` | antorcha · neon · lampara · lava · bio |
| `nucleo` | orbe · cerebro · cerebro-fuego |
| `nucleoColor` | `#rrggbb` (color del orbe/cerebro y su luz) |
| `pueblo` | humanos · aliens · demonios · cientificos (cambia a todos: agentes, modelos, bots, jefe y bichos de servidores) |
| `particulas` | brasas · esporas · chispas · ninguna |
| `deco` | mazmorra · nave · oficina · colmena · infierno (detalles automáticos: telarañas/huesos, rejillas/pantallas, huevos/hongos/tentáculos, calaveras/cadenas/charcos de lava) |
| `pared`, `borde`, `acento` | `#rrggbb` (muro, filo de carteles y HUD, estandartes) |
| `fondo`, `amb` | `[r,g,b]` (vacío fuera del mapa; luz ambiente: más alto = más claro, 90–170) |
| `sala` | 0–0.5 (luz de relleno dentro de las salas) |

## Suelos (`sala.suelo`)
piedra · tierra · madera · metal · hierba · alfombra · **organico** (carne con venas) · **roca** (basalto con grietas de lava) · **lava** (no se pisa, alumbra; úsala en franjas o charcos dentro de salas/pasillos sin cortar el paso) · **rejilla** (metálica).
Para un foso, charco o río de lava (o cualquier suelo distinto) **dentro** de una sala: añade una sala `decor` **sin nombre** (`"nombre": ""`) con ese suelo, **dentro** de la otra y **después** de ella en la lista (la última manda). Es la única excepción a «sin solaparse». La lava no se pisa: deja siempre paso alrededor.

## Objetos (`tipo`, ancho × alto en casillas; B = bloquea el paso)
| tipo | tamaño | B | qué es | dónde |
|---|---|---|---|---|
| `orbe` | 2×2 | B | núcleo (orbe o cerebro según estilo) | centro de `principal` (obligatorio) |
| `rack` | 2×2 | B | armario de servidores con LEDs | `servidores` |
| `vaina` | 1×2 | B | vaina orgánica con líquido verde (servidor bio) | `servidores` en colmena |
| `jaula` | 2×2 | B | jaula de hierro con fuego (servidor infernal) | `servidores` en infierno |
| `impresora` | 3×3 | B | impresora 3D con cabezal y pieza | `taller` |
| `yunque` | 2×1 | B | forja con pieza al rojo | `taller` en infierno |
| `brazo` | 1×2 | B | brazo robótico con láser (apunta al portal cuando hay MCP) | junto al `portal`; también decora talleres |
| `portal` | 3×3 | B | portal de materia (laboratorio MCP) | centro de `mcp` |
| `alambique`, `caldero` | 2×1, 1×1 | B | mesa de alquimia; caldero burbujeante | `mcp`, `taller` |
| `pc`, `consola`, `holo` | 2×2, 2×1, 1×1 | B | ordenador; consola; pantalla holográfica flotante | `subagentes`, `principal` |
| `mesa`, `banco`, `estanteria` | 2×1, 2×1, 2×2 | B | mesa; banco de carpintero; estantería (brilla con la memoria) | cualquiera |
| `tanque` | 1×2 | B | tanque de cristal con criatura y burbujas | laboratorio, colmena |
| `telescopio`, `barril`, `cofre`, `caja`, `planta`, `sofa` | 1×2, 1×1… | B | ambiente | cualquiera |
| `ornitoptero` 3×2, `tornillo` 2×2, `maniqui` 1×2, `engranajes` 2×2, `carro` 2×2, `caballete` 1×2, `vela` 1×1 | | B | taller de Leonardo | `subagentes` medieval |
| `brasero`, `calaveras` | 1×1 | B | fuego en cuenco; montón de calaveras | infierno |
| `tentaculos` | 1×1 | – | tentáculos que se mueven | colmena |
| `antorcha`, `lampara` | 1×1 | – | luz de pared (el tema decide fuego/neón/bulbo) | **en la fila de pared encima de una sala o pasillo** |
| `cuadro`, `codice`, `tuberias` | 2×1 | – | plano; bocetos de Leonardo; tuberías | **en la pared** |
| `cables` | 2×1 | – | cables por el suelo | cualquiera |

## Equivalencias habituales (referencia → catálogo)
| en la imagen | en el mundo |
|---|---|
| servidores / racks / armarios | `rack` |
| tubos o vainas con líquido brillante | `vaina` |
| jaulas, celdas o servidores con fuego | `jaula` |
| cerebro en el centro | `orbe` + `estilo.nucleo: "cerebro"` (`"cerebro-fuego"` si arde) |
| brazos con láseres sobre una pieza | `impresora` o `yunque` + dos `brazo` a los lados |
| pantallas flotantes, hologramas | `holo` |
| consolas, escritorios con monitores | `consola`, `pc` |
| antorchas, braseros, velas | `antorcha` (pared), `brasero`, `vela` |
| calaveras, huesos | `calaveras` (y `deco: infierno`/`mazmorra` los esparce solos) |
| tentáculos, raíces vivas | `tentaculos` |
| tuberías y cables | `tuberias` (pared), `cables` (suelo) |
| robots pequeños | `pueblo: cientificos` (los bichos de servidores son robots) |
| diablillos, imps | `pueblo: demonios` |
| aliens, criaturas | `pueblo: aliens` |

## Reglas de distribución (el validador las comprueba)
- Salas sin solaparse, interior mínimo 5×5 (la del taller de 3D: 8×7; la `mcp`: 12×5).
- Deja **2 casillas** de hueco entre salas (ahí van las paredes) y únelas con pasillos de 2–3 de ancho que **toquen** las dos salas.
- Todo el suelo debe estar conectado: se tiene que poder ir andando de `principal` a cualquier sala **esquivando los objetos que bloquean**.
- No pongas objetos que bloquean en las casillas donde un pasillo entra en la sala, ni en la fila del cartel (fila superior; inferior en `mcp`).
- `principal` lleva exactamente un `orbe`; `mcp` un `portal`; `servidores` entre 4 y 6 objetos servidor.
- Antorchas, lámparas, cuadros, códices y tuberías van en la **fila de pared** justo encima de una sala o pasillo (`y` = fila de la sala − 1).
- Nombres de sala tal como aparecen en la referencia (≤ 40 caracteres; se escriben en el suelo).
