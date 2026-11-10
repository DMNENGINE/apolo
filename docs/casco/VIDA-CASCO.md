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
genera las 23 poses sin arrastrar el gesto de la captura anterior.
La integración en navegador comprueba inicio de rutina, interrupción por
trabajo y bloqueo con movimiento reducido; sus capturas y capturador están
en `repair-backups/vida-casco/`. No se ha medido rendimiento con GPU real.
