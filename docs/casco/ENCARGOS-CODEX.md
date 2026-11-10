# Encargos del casco para Codex

Lista de trabajos para pulir el casco de APOLO y darle nuevas animaciones, reacciones e interacciones.
**Haz UN encargo cada vez**, en orden, y para al terminarlo. Lee antes `AGENTS.md` (sección "El casco").

Para cada encargo:
1. Lee el código que vas a tocar (`app/robot.js`, `app/island.js`, `main.js`/`preload.js` si hace falta IPC).
2. Implementa sin romper lo que ya existe (gestos, estados, compuerta del visor, arañas, mareo, rodar entre monitores).
3. **Compruébalo mirándolo**: capturas headless antes/después (ver AGENTS.md) y, si es un gesto, añádelo a `tools/galeria-robot.js` y saca la hoja.
4. `node tools/derivar-robot3d.js` si tocaste `app/robot.js`.
5. Commit local (sin push) solo con tus archivos. Resume en 3-5 líneas qué hiciste, cómo lo comprobaste y qué no pudiste probar.

Límites que no se negocian:
- Rendimiento: la isla es una ventana transparente siempre encima. Sin postproceso, sin sombras, sin geometría pesada; anima con lo que ya hay (rotaciones, escalas, emisivos, el HUD de canvas). En reposo debe seguir a 15 fps.
- Todo lo nuevo debe respetar `prefers-reduced-motion` del sistema (versión suave o nada).
- Nada de dependencias nuevas.

Ya existe (no lo dupliques): estados reposo/trabajando/permiso/listo/error/dormido; gestos remolino, guiño, corazón, sorpresa, reloj, feliz, triste, duda, bostezo, estornudo, pensativo, navegando, saludo, sí, no, mirar, celebrar; mareo con 3 clics; poke; rodar al cambiar de monitor; compuerta del visor con nido de arañas; reacciones de la isla a Stop (celebrar), error (triste), permiso (duda), despertar (bostezo), cursor cerca (sorpresa), gestos aleatorios en reposo.

---

## 1. Ojos vivos (pulido)
Hoy los ojos siguen el ratón de forma lineal. Haz que parezcan de verdad:
- **Microsacadas**: pequeños saltos rápidos de la mirada cada 0,4–2 s cuando no sigue nada concreto.
- **Muelle** (spring con amortiguación) en vez de interpolación lineal al seguir el cursor: un poco de sobreimpulso al pararse.
- **Pupilas** que se dilatan con poca luz del tema / al sorprenderse y se contraen en "error".
- **Parpadeo** con párpado de verdad (arriba y abajo, con curva), no solo escalar el ojo; parpadeo doble ocasional ya existe: consérvalo.
Comprobar: capturas en 4 instantes de una misma secuencia + 15 fps en reposo.

## 2. Cuerpo con física (pulido)
- **Squash & stretch** suave en `celebrar`, `saludo`, `poke` y al aterrizar del bote.
- **Inercia**: cuando la isla se arrastra o rueda a otro monitor, la cabeza se inclina contra el movimiento y vuelve con muelle (`main.js` ya manda los movimientos; añade IPC si falta la velocidad).
- **Respiración** con dos frecuencias mezcladas (no una senoide perfecta); dormido más lenta y profunda (ya existe: mejórala, no la dupliques).

## 3. Boca que habla de verdad (lip-sync)
Las láminas `Voz_0..3` se iluminan hoy con una onda fija. Haz que sigan **la voz real** de APOLO:
- En `app/island.js`, donde se reproduce el audio TTS, conecta un `AnalyserNode` (Web Audio) y pasa la amplitud (0–1) al casco con un método nuevo, p. ej. `robot.voz(nivel)`.
- Cada lámina responde a una banda de frecuencia distinta (graves abajo, agudos arriba) con suavizado de ataque rápido y caída lenta.
- Sin audio, las láminas en reposo (no la onda fija).
Comprobar: script de prueba que reproduzca un mp3 y capture 3 fotogramas con láminas distintas.

## 4. Emociones de su conciencia en la cara
`core/conciencia.js` ya emite en el bus `conciencia` `{ tipo:'emocion', emocion, gesto }` pero el casco no se entera.
- Lleva ese evento a la isla (main.js → IPC → preload → island.js) y que el casco lo muestre: un **tinte de ánimo** sutil en el color del visor que dura minutos (no segundos) y el gesto asociado si el robot está en reposo.
- No debe pisar estados importantes (permiso, error, trabajando).

## 5. Reacciones nuevas a lo que pasa
- **Tarea larga** (trabajando > 2 min seguidos): gotas de sudor en el HUD y de vez en cuando se seca la frente (cabeza que se inclina).
- **Error**: glitch del HUD (líneas desplazadas, colores separados) 0,6 s + chispa en un auricular.
- **Mensaje entrante** de Telegram/WhatsApp/Discord: el LED del auricular parpadea con el color del canal y gira la cabeza un poco hacia ese lado.
- **Entrenamiento del modelo propio** (`session_id === 'entrenamiento'` en los eventos de la isla): mientras dura, un gesto "concentrado" propio (ojos entrecerrados, pequeñas chispas en el circuito); al terminar con éxito, una celebración especial más larga que la normal ("¡HE NACIDO!").
- **Las arañas** (`bridge.onAranas`): cuando salen, los ojos siguen a la araña más cercana hasta que se va.

## 6. Interacciones con el ratón
- **Acariciar**: mantener el ratón encima y moverlo despacio de lado a lado → ojos felices, corazones pequeños, se inclina hacia el cursor.
- **Doble clic** → guiño y risa en el HUD.
- **Clic derecho** (sin abrir menú del sistema si no hay ya uno) → mira al cursor sorprendido.
- **Arrastrar rápido** la isla → mareo proporcional a la velocidad (reusa `dizzy`).
- Que nada de esto robe clics a la isla ni rompa el hit-test de clic-a-través.

## 7. Ritmo del día
- **Sueño progresivo**: antes de dormirse, bosteza, se le cierran los ojos a medias, cabecea; si mueves el ratón en ese momento, se despierta sobresaltado.
- **Mañana**: al primer uso del día después de las 6:00, se estira (cabeza arriba, visor brillante) además del "¡buenos días!" que ya existe.
- **Noche** (23–6): ojos más pequeños y cansados en reposo, parpadeo más lento.

## 8. Pulido final y hoja de gestos
- Revisa que todos los gestos nuevos convivan (no se pisen, vuelvan al estado real).
- Añádelos a `tools/galeria-robot.js` y genera la hoja (`node tools/galeria-robot.js docs/casco/galeria.png`).
- Mide fps en reposo/trabajando/dormido y anótalos en el commit.
