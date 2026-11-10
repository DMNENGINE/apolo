# Pulido de las arañas

El motor visual vive en `extension/arana-motor.js`; `app/arana-motor.js` es una
copia exacta. La isla usa `app/aranas.js` para salir del nido y regresar.
La extensión y la ventana propia usan el mismo motor para recorrer palabras,
mostrar el escaneo y vigilar las marcas del análisis.

## Mejoras

- Si quedan palabras por encima de la entrada, vuelve a ellas en lugar de
  marcar el recorrido como terminado sin haberlas visitado.
- Las ocho patas nacen en sus apoyos, en vez de aparecer amontonadas.
- La alternancia del paso sigue la distancia recorrida; los apoyos se levantan
  según la velocidad. El reloj del movimiento avanza con el tiempo simulado.
- Al trepar se orientan hacia el nido. Las patas alternan el agarre y el hilo
  acompaña un balanceo pequeño, con interpolación independiente de los fps.
- Las rutas de la isla conservan sus pausas expresivas y eliminan las aleatorias.
- El regreso adapta la velocidad a la distancia hasta el casco y usa un tramo
  uniforme; el radio final se alcanza antes de desaparecer dentro del nido.
- Se reduce el temblor, el salto alegre y el parpadeo del haz. Las patas pequeñas
  se dibujan sin el desenfoque de sombra que tenían en cada trazo.
- Con movimiento reducido se eliminan balanceos, saltos y pulsos decorativos;
  el desplazamiento necesario para completar la lectura permanece.

## Verificación

`node tools/probar-aranas.cjs` comprueba apoyos, orientación al trepar,
avance comparable a 30/60 fps, rutas sin pausas aleatorias, encogimiento,
callbacks únicos, fundido y movimiento reducido.

`node tools/galeria-aranas.cjs salida.png` captura ocho poses y las rutas reales
de la isla. Verifica que las dos arañas regresan antes de los 4,6 segundos del
cierre del visor. También carga la animación de la extensión sobre un documento
local de prueba y comprueba extracción y recogida, sin visitar webs externas.
`--antes` sirve el motor guardado en `repair-backups/aranas-pulido/`.

Las capturas comparativas están en esa carpeta. La página de prueba es
`app/galeria-aranas.html`. Para ver el motor nuevo en una extensión de Chrome
que ya esté cargada, hay que recargarla y volver a abrir la página donde actúa.

Las siguientes mejoras visuales de mayor valor serían perfiles de movimiento
por tipo de araña y anticipación al borde de los bloques de texto.
