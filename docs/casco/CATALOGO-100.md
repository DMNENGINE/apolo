# Las 100 animaciones del casco

El catálogo añade 100 animaciones a los gestos anteriores. Cada entrada combina
una expresión, una trayectoria y un mecanismo propio; las transformaciones usan
las piezas del casco existente. La familia musical representa ritmos visuales.

La vista interactiva está en `/galeria-casco.html` del panel de APOLO y permite
seleccionar cualquiera, repetirla, pasar a la siguiente o recorrerlas en orden.
La vista independiente se abre con `node tools/ver-catalogo-casco.cjs`
y se visita en `http://127.0.0.1:47931/app/galeria-100.html`.
Su fuente es `app/galeria-100.html`; el panel se genera con
`node tools/derivar-robot3d.js`. La API es `robot.gesto(id)` y
`robot.animaciones()` devuelve las 100 fichas.

## Autonomía y prioridades

Las animaciones cotidianas se intercalan con las rutinas anteriores. Las escenas
grandes requieren varias rutinas normales y al menos cuatro minutos de pausa.
La selección evita repetir las últimas 24 entradas del catálogo. Trabajo, permisos,
interacción, sueño, pánico y modo Gamer mantienen su prioridad. Las arañas conservan
el control del visor. Con movimiento reducido se mantiene la expresión sin
movimientos de piezas, apertura ni giros del catálogo.

## Comprobación

- `node tools/probar-catalogo-casco.cjs`: 100 identificadores y trayectorias distintas,
  10 familias de diez, 10.100 poses finitas dentro de los límites y retorno al origen.
- `node tools/probar-vida-casco.cjs`: prioridades, pausas, acceso autónomo a las cien
  y memoria de las últimas 24.
- `node tools/galeria-100.cjs carpeta`: captura las cien y comprueba la restitución
  de piezas al pedir permiso; produce diez hojas y prueba los controles de la galeria.
- Capturas revisadas en `repair-backups/catalogo-100/`. Rendimiento con GPU real pendiente.

## Emociones

[Ver capturas](../../repair-backups/catalogo-100/01-emociones.png)

| ID | Animación | Duración |
|---|---|---|
| `alegria_radiante` | Alegría radiante | 4.5 s |
| `orgullo_robot` | Orgullo | 7 s |
| `carino_suave` | Cariño | 4.5 s |
| `risa_contagiosa` | Carcajada | 7 s |
| `verguenza_dulce` | Vergüenza | 7 s |
| `asombro_cosmico` | Asombro cósmico | 7 s |
| `serenidad` | Serenidad | 4.5 s |
| `determinacion` | Determinación | 7 s |
| `melancolia` | Melancolía | 4.5 s |
| `alivio_profundo` | Alivio | 7 s |

## Curiosidad

[Ver capturas](../../repair-backups/catalogo-100/02-curiosidad.png)

| ID | Animación | Duración |
|---|---|---|
| `buscar_pista` | Buscar una pista | 7 s |
| `escuchar_izquierda` | Escuchar a la izquierda | 7 s |
| `escuchar_derecha` | Escuchar a la derecha | 7 s |
| `inspeccionar_techo` | Inspeccionar el techo | 7 s |
| `rastrear_suelo` | Rastrear el suelo | 4.5 s |
| `descubrir_secreto` | Descubrir un secreto | 7 s |
| `doble_comprobacion` | Doble comprobación | 4.5 s |
| `seguir_mariposa` | Seguir una mariposa | 7 s |
| `leer_entre_lineas` | Leer entre líneas | 4.5 s |
| `idea_repentina` | Idea repentina | 7 s |

## Descanso

[Ver capturas](../../repair-backups/catalogo-100/03-descanso.png)

| ID | Animación | Duración |
|---|---|---|
| `siesta_lunar` | Siesta lunar | 4.5 s |
| `estiramiento_largo` | Estiramiento largo | 7 s |
| `respirar_nubes` | Respirar nubes | 7 s |
| `ojos_pesados` | Ojos pesados | 7 s |
| `despertar_estelar` | Despertar estelar | 7 s |
| `sacudir_sueno` | Sacudir el sueño | 7 s |
| `meditar_infinito` | Meditar | 4.5 s |
| `bostezo_en_cadena` | Bostezos seguidos | 7 s |
| `acurrucarse` | Acurrucarse | 7 s |
| `saludo_amanecer` | Saludo al amanecer | 7 s |

## Juegos

[Ver capturas](../../repair-backups/catalogo-100/04-juegos.png)

| ID | Animación | Duración |
|---|---|---|
| `pelota_imaginaria` | Pelota imaginaria | 7 s |
| `equilibrio_imposible` | Equilibrio imposible | 7 s |
| `escondite` | Escondite | 7 s |
| `robot_pixel` | Robot de píxeles | 4.5 s |
| `tictac_divertido` | Tictac | 7 s |
| `hacer_pirueta` | Pirueta | 7 s |
| `salto_rana` | Salto de rana | 7 s |
| `burbuja_curiosa` | Burbuja curiosa | 7 s |
| `guino_complice` | Guiño cómplice | 7 s |
| `aplauso_auriculares` | Aplauso de auriculares | 7 s |

## Visor

[Ver capturas](../../repair-backups/catalogo-100/05-visor.png)

| ID | Animación | Duración |
|---|---|---|
| `ventilar_visor` | Ventilar el visor | 7 s |
| `mirar_por_rendija` | Mirar por una rendija | 7 s |
| `saludo_del_nido` | Saludo del nido | 7 s |
| `visor_mariposa` | Visor mariposa | 7 s |
| `escotilla_espacial` | Escotilla espacial | 7 s |
| `visor_tictac` | Visor tictac | 7 s |
| `escaneo_vertical` | Escaneo vertical | 7 s |
| `escaneo_horizontal` | Escaneo horizontal | 7 s |
| `visor_fotografo` | Visor fotógrafo | 7 s |
| `cerrar_con_guino` | Cerrar con un guiño | 7 s |

## Mantenimiento

[Ver capturas](../../repair-backups/catalogo-100/06-mantenimiento.png)

| ID | Animación | Duración |
|---|---|---|
| `calibrar_antenas` | Calibrar antenas | 7 s |
| `limpiar_pantalla` | Limpiar la pantalla | 7 s |
| `afinar_engranajes` | Afinar engranajes | 7 s |
| `prueba_suspension` | Probar la suspensión | 7 s |
| `revisar_auricular` | Revisar un auricular | 7 s |
| `cambiar_fusible` | Cambiar un fusible | 7 s |
| `alinear_placas` | Alinear placas | 7 s |
| `equilibrar_motor` | Equilibrar el motor | 7 s |
| `enfriar_circuitos` | Enfriar circuitos | 7 s |
| `autodiagnostico` | Autodiagnóstico | 7 s |

## Transformaciones

[Ver capturas](../../repair-backups/catalogo-100/07-transformaciones.png)

| ID | Animación | Duración |
|---|---|---|
| `forma_satelite` | Forma satélite | 7 s |
| `forma_nave` | Forma de nave | 7 s |
| `forma_esfera` | Forma esférica | 7 s |
| `forma_flor` | Forma de flor | 7 s |
| `forma_totem` | Forma de tótem | 7 s |
| `forma_escudo` | Forma de escudo | 7 s |
| `forma_helice` | Forma de hélice | 7 s |
| `forma_cometa` | Forma de cometa | 7 s |
| `forma_acordeon` | Forma de acordeón | 7 s |
| `forma_constelacion` | Constelación de piezas | 7 s |

## Espacio

[Ver capturas](../../repair-backups/catalogo-100/08-espacio.png)

| ID | Animación | Duración |
|---|---|---|
| `gravedad_cero` | Gravedad cero | 7 s |
| `buscar_senal` | Buscar una señal | 7 s |
| `lluvia_estrellas` | Lluvia de estrellas | 7 s |
| `aterrizaje_lunar` | Aterrizaje lunar | 7 s |
| `agujero_gusano` | Agujero de gusano | 7 s |
| `saludo_marciano` | Saludo marciano | 7 s |
| `eclipse` | Eclipse | 7 s |
| `orbita_doble` | Órbita doble | 7 s |
| `despegue` | Despegue | 7 s |
| `brujula_galactica` | Brújula galáctica | 7 s |

## Musica

[Ver capturas](../../repair-backups/catalogo-100/09-musica.png)

| ID | Animación | Duración |
|---|---|---|
| `ritmo_suave` | Ritmo suave | 4.5 s |
| `bajo_robotico` | Bajo robótico | 7 s |
| `solo_bateria` | Solo de batería | 7 s |
| `vals_mecanico` | Vals mecánico | 7 s |
| `director_orquesta` | Director de orquesta | 7 s |
| `escuchar_melodia` | Escuchar una melodía | 7 s |
| `campanillas` | Campanillas | 7 s |
| `baile_disco` | Baile disco | 7 s |
| `caja_musical` | Caja musical | 7 s |
| `final_con_aplauso` | Final con aplauso | 7 s |

## Magia

[Ver capturas](../../repair-backups/catalogo-100/10-magia.png)

| ID | Animación | Duración |
|---|---|---|
| `levitar_placas` | Levitar placas | 7 s |
| `ojos_de_cristal` | Ojos de cristal | 4.5 s |
| `portal_pequeno` | Portal pequeño | 7 s |
| `truco_sombrero` | Truco del sombrero | 7 s |
| `recomponer_hechizo` | Recomponer un hechizo | 7 s |
| `flor_encantada` | Flor encantada | 7 s |
| `corazon_flotante` | Corazón flotante | 7 s |
| `reloj_encantado` | Reloj encantado | 7 s |
| `chispa_traviesa` | Chispa traviesa | 7 s |
| `gran_final` | Gran final | 7 s |

