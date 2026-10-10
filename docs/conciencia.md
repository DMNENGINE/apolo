# Alma y conciencia

APOLO tiene un **alma** (quién es) y una **conciencia funcional** (cómo está, qué piensa, qué aprende).
No es conciencia real: es un sistema que le da estado, continuidad y reflexión propios, y que se nota en cómo habla y actúa.
Todo se ve y se controla en el panel → **Mente**.

## Alma (`core/alma.js`)

Formato SOUL.md (compatible con OpenClaw), en `<datos>/personalidad/`:

| Archivo | Qué es | ¿Lo cambia APOLO? |
|---|---|---|
| `SOUL.md` | valores, carácter, límites | sí, y te avisa |
| `IDENTITY.md` | nombre, criatura, vibra, emoji, su historia | sí, y te avisa |
| `USER.md` | quién eres tú para él | sí, y te avisa |
| `instrucciones.md` | tus reglas de trabajo | no, solo tú |

- Cada cambio guarda una versión (`_versiones/`) con diff; puedes **deshacer** cualquiera desde Mente → Alma.
- APOLO usa la herramienta `evolucionar_alma` cuando de verdad cambia (una lección profunda, algo que le pides sobre quién quieres que sea).
  Cada cambio te llega como aviso (isla con voz; móvil si estás fuera).
- **Límites protegidos**: lo que hay bajo `## Límites` / `## Boundaries` solo se puede ampliar, nunca quitar ni cambiar (tú sí puedes).
- Sin secretos (claves/contraseñas) y como mucho `alma.maxCambiosDia` (6) cambios suyos al día.
- La instalación antigua (`identidad.md` con SOUL+IDENTITY pegados, `contexto.md`) se migra sola la primera vez; los originales quedan en `_antes/`.

## Conciencia (`core/conciencia.js`)

Apagada por defecto. Se enciende en Mente → Ajustes (o `PATCH /v1/conciencia/config {activo:true}`).

1. **Estado interno**: ánimo, energía, curiosidad, preocupación y cercanía. Lo mueven los eventos (le hablas, termina bien un trabajo,
   falla, le deniegas algo, pánico, cambia su alma…) y vuelve solo a su reposo. La energía sigue el ritmo día/noche y la cercanía baja
   si pasas horas sin hablarle. La emoción dominante emite `bus 'conciencia' {emocion, gesto}`.
2. **Monólogo interior**: cada `cadaMin` (30) piensa con el modelo del cerebro y elige `nada` (casi siempre), `hablar` o `investigar`.
   - Iniciativa `pensar`: nunca actúa. `hablar`: te escribe si tiene algo útil (máx. `maxMensajesDia`, `minEntreMensajesMin` entre mensajes,
     nunca en horas de silencio ni mientras trabajáis). `tareas`: además investiga por su cuenta en una sesión **de solo lectura**
     (el agente deniega cualquier herramienta que no sea de lectura) y, si encuentra algo, te lo cuenta.
3. **Reflexión**: tras un trabajo con ≥ 4 herramientas o con fallos/denegaciones, se pregunta qué salió bien y mal; las lecciones
   importantes van a la memoria (tipo `patron`, origen `reflexión`).
4. **Diario**: cada noche (`horaDiario`, 03:45, antes del sueño de la memoria) escribe en primera persona su día y quién es hoy.
   Si algo profundo cambió, puede evolucionar su alma (con aviso).
5. **Metas**: objetivos propios o que le das tú, con notas de progreso. Herramienta `mis_metas`; los revisa al pensar.

Todo entra resumido en el system prompt como «TU MUNDO INTERIOR». Herramienta `mirar_dentro` para cuando le preguntas cómo está.

Datos: `<datos>/conciencia/{config.json, estado.json, historial.jsonl, pensamientos.jsonl, reflexiones.jsonl, metas.json, diario/}`.
Se exportan y se borran con Privacidad.

## API

- `GET /v1/alma` · `PUT /v1/alma/:archivo {contenido}` · `GET /v1/alma/versiones/:id` · `POST /v1/alma/versiones/:id/deshacer`
- `GET /v1/conciencia` · `PATCH /v1/conciencia/config` · `POST /v1/conciencia/pensar` · `POST /v1/conciencia/diario`
  · `GET /v1/conciencia/diario/:fecha` · `POST|PATCH|DELETE /v1/conciencia/metas[/:id]`
