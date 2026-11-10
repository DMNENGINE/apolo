# Expresiones y vida propia del casco

Nuevos gestos de `robot.gesto(nombre, segundos)`: `curioso`, `sospecha`,
`concentrado`, `ilusionado`, `timido` y `enfadado`. Cada uno combina ojos
y postura de cabeza. `cancelarGesto()` devuelve los ojos al estado real.

La isla usa `app/vida-casco.js` para encadenar cuatro rutinas decorativas:

- Explorar: mirar, curioso, guiño.
- Tener una idea: pensativo, concentrado, ilusionado.
- Descansar: bostezo, tímido, feliz.
- Investigar: curioso, sospecha, asentir.

Solo comienzan con el casco visible, en reposo y con la isla cerrada.
Hay una pausa de 35–75 segundos entre rutinas y nunca se repite la anterior.
Una interacción, tarea, permiso, arrastre o cambio de estado cancela la rutina;
tras interrumpirla espera al menos 20 segundos para volver a intentarlo.
Se desactivan con movimiento reducido, modo Gamer y pánico. No usan red,
voz ni herramientas. Se conserva el sueño y su frecuencia de renderizado.

Comprobaciones: `node tools/probar-vida-casco.cjs` prueba las prioridades,
pausas, variedad y cancelación. `node tools/galeria-robot.js salida.png`
genera las 26 poses sin arrastrar el gesto de la captura anterior.
La integración en navegador comprueba inicio de rutina, interrupción por
trabajo y bloqueo con movimiento reducido; sus capturas y capturador están
en `repair-backups/vida-casco/`. No se ha medido rendimiento con GPU real.

## Escenas mecánicas

`revision` (7 s) separa las piezas y abre parcialmente el visor;
`estornudo_explosivo` (5,5 s) las separa tras el estornudo y deja un auricular
rezagado; `montaje` (7 s) gira un auricular y lo corrige al recomponerse.
Se llaman con la misma API `gesto(nombre, segundos)`.

La autonomía requiere al menos tres rutinas normales antes de elegir una escena,
y deja 4–7 minutos entre escenas. No repite la escena anterior. El desmontaje
no empieza si el visor está ocupado por las arañas. Los estados importantes,
la cancelación y movimiento reducido restituyen las piezas; cada componente
conserva sus luces y recupera sus transformaciones originales.

Capturas por fases y pruebas de restitución en
`repair-backups/escenas-casco/`. No se añade geometría ni postproceso.
