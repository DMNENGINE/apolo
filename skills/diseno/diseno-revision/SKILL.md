---
name: diseno-revision
description: Proceso de diseño de principio a fin y revisión crítica de una interfaz ya hecha - plan, referencias, construcción, captura de pantalla y autocrítica con heurísticas de usabilidad hasta que quede bien. Úsala para revisar, criticar o mejorar un diseño, o cuando te pidan algo "con nivel profesional".
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [revisa el diseño, revisar diseño, critica, crítica de diseño, mejora el diseño, auditoría ux, heurísticas, nivel profesional, que quede bonito, pulir, polish, design review]
---

# Proceso de diseño y revisión

## Proceso para diseñar algo nuevo
1. **Entender:** en 2–3 frases, quién lo usa, qué quiere conseguir y en qué dispositivo. Si falta algo crítico, pregunta una sola vez; si no, asume lo razonable y dilo.
2. **Referencias:** carga las skills específicas que apliquen (formularios, onboarding, checkout, dashboards, web, navegación) y la de fundamentos. Si tienes la biblioteca de diseño de APOLO (`buscar_patrones_diseno`), consúltala; si la persona tiene Mobbin conectado y falta el patrón, estúdialo con `estudiar_diseno`.
3. **Estructura antes que estilo:** lista las zonas o pasos en orden y la acción principal. Decide la navegación.
4. **Sistema mínimo:** define primero los tokens (colores semánticos, escala de espaciado de 8, escala tipográfica, radios) y úsalos en todo.
5. **Construir** con contenido realista y todos los estados (vacío, cargando, error, deshabilitado y foco).
6. **Ver el resultado de verdad:** abre el HTML y haz una captura (en APOLO: el navegador, `ver_pantalla` o Edge/Chrome headless con `--screenshot`) en **móvil (390 px)** y **escritorio (1440 px)**. No des por bueno nada sin mirarlo.
7. **Criticar** con la lista de abajo, corregir y volver a capturar. Dos vueltas como mínimo.
8. **Entregar** explicando las 3–5 decisiones clave y qué quedaría por probar con usuarios.

## Las 10 heurísticas de usabilidad (Nielsen), en preguntas
1. **Estado del sistema:** ¿sé siempre qué está pasando (cargando, guardado, error)?
2. **Lenguaje del usuario:** ¿palabras y orden del mundo real, sin jerga interna?
3. **Control y libertad:** ¿puedo volver atrás, cancelar o deshacer?
4. **Consistencia:** ¿lo mismo se ve y se llama igual en todas partes? ¿Respeta las convenciones de la plataforma?
5. **Prevención de errores:** ¿el diseño evita el error (valores por defecto, confirmar lo grave, formatos flexibles)?
6. **Reconocer antes que recordar:** ¿las opciones están a la vista en lugar de tener que memorizarlas?
7. **Flexibilidad:** ¿hay atajos para expertos sin estorbar a los novatos?
8. **Estética y minimalismo:** ¿sobra algo? ¿Compite lo secundario con lo principal?
9. **Errores comprensibles:** ¿el mensaje dice qué pasó y cómo arreglarlo?
10. **Ayuda:** si hace falta, ¿está en contexto y es breve?

## Leyes de UX útiles para decidir
- **Fitts:** objetivos importantes grandes y cerca. El primario va donde llega el pulgar o el cursor.
- **Hick:** más opciones, decisión más lenta. Reduce, agrupa y destaca la recomendada.
- **Jakob:** la gente pasa la mayor parte del tiempo en otras apps, así que haz lo que ya conoce.
- **Ley de Miller:** no satures la memoria; divide en grupos pequeños (es una idea orientativa, no un número mágico).
- **Doherty:** respuestas en menos de ~400 ms mantienen el ritmo; si tarda más, da feedback.
- **Von Restorff:** lo distinto se recuerda; reserva el contraste para lo importante.
- **Gradiente de meta:** el progreso visible motiva a terminar.
- **Pico-final:** cuida el momento más intenso y el final (confirmaciones, éxito).
- **Estética-usabilidad:** lo bonito parece más fácil de usar. No es excusa para que no funcione.

## Lista de revisión visual
- [ ] Jerarquía: al entornar los ojos se ve el título y la acción principal.
- [ ] Un solo primario por vista; los destructivos separados y en rojo.
- [ ] Espaciado en la escala de 8; alineaciones a pocos ejes; agrupación por proximidad.
- [ ] Tipografía con 3–5 tamaños, cuerpo de 16 px o más, líneas de 45–75 caracteres.
- [ ] Color: tokens semánticos, contraste AA, el color nunca como única señal.
- [ ] Estados vacío, cargando, error, deshabilitado y foco diseñados.
- [ ] Móvil: nada se corta, objetivos de 44 px, sin scroll horizontal.
- [ ] Textos: verbos concretos en los botones y errores útiles.
- [ ] Modo oscuro (si aplica) revisado aparte.

## Cómo dar una crítica (a otra persona o a ti mismo)
- Empieza por el objetivo y si se cumple. Luego los problemas, **ordenados por impacto** (bloquea, confunde, molesta, detalle). Cada problema va con su **por qué** y una **propuesta concreta**.
- Separa los hechos ("el botón tiene un contraste de 2.8:1") de los gustos ("prefiero otro azul").
