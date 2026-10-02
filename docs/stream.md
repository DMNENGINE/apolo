# APOLO co-host de streaming

APOLO sale en tu directo como overlay de OBS: lee el chat, contesta con su voz, hace gestos, agradece subs y raids, lanza encuestas y, si quieres, comenta tu partida.

## 1. Overlay en OBS
1. Panel → **Stream** → copia la URL (horizontal 1920×1080 o vertical 1080×1920).
2. OBS → Fuentes → **+** → **Navegador**. Pega la URL y pon el ancho y el alto.
3. Marca **«Controlar audio mediante OBS»**: así su voz va al directo.
4. Deja el CSS por defecto (fondo transparente) y pon la fuente encima del juego.
5. Si no ves el robot: Ajustes → Avanzado → aceleración por hardware de las fuentes de navegador.

La URL lleva una **clave de solo lectura del overlay**, que no es el token del núcleo. Con ella solo se puede ver lo que sale en pantalla. Si se filtra, pulsa **Nueva clave** y vuelve a pegar la URL.
Parámetros: `&formato=vertical|horizontal` (si no lo pones, se elige por la proporción), `&demo=1` (escena de ejemplo), `&fondo=juego` (un juego falso detrás para la vista previa) y `&robot=0`.

## 2. Twitch
- **Leer** es anónimo, sin cuenta: escribe el canal y pulsa Conectar (IRC por WebSocket, `wss://irc-ws.chat.twitch.tv`, nick `justinfanNNNN`).
- **Escribir en el chat (opcional)**:
  1. Crea una cuenta para el bot (p. ej. `ApoloBot`).
  2. En https://dev.twitch.tv/console registra una aplicación con la redirect URL `http://localhost`.
  3. Con la sesión del bot abierta, entra en `https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=<TU_CLIENT_ID>&redirect_uri=http://localhost&scope=chat:read+chat:edit`.
  4. Copia el `access_token` de la URL a la que te redirige.
  5. Panel → Stream → «Escribir en el chat»: usuario del bot + token, y activa «Contestar también por escrito».
- El token se guarda en el almacén cifrado de la app (o en `<datos>/stream/secretos.json` con permisos 0600). La API solo dice si está guardado, nunca lo devuelve.
- Alertas que llegan por IRC: subs, resubs, subs regaladas, raids, bits. **Los follows no van por IRC**: hacen falta EventSub y el OAuth del canal (pendiente).

## 3. YouTube
- Hace falta una **API key** de Google Cloud (YouTube Data API v3) y la URL o el ID del directo. Con solo la key, es de solo lectura.
- Con un **token OAuth** (scope `youtube.force-ssl`) también puede escribir. Si no das la URL, busca tu emisión activa.
- **Cuota**: 10 000 unidades al día. Cada lectura del chat gasta unas 5 unidades y cada mensaje que escribe, 50.
  - El sondeo nunca baja de «Sondeo (s)», 15 s por defecto (unas 1200 unidades por hora).
  - Si se agota la cuota, se para y lo indica.
- Alertas: Super Chat, Super Sticker, nuevos miembros, hitos de membresía y membresías regaladas.

## 4. TikTok Live
No tiene API oficial. Las librerías que existen hacen ingeniería inversa del protocolo web: se rompen a menudo y pueden ir contra los términos de uso. El conector queda como **plugin opcional pendiente** (SDK de plugins: un canal que llame a `stream.entrada()` / `stream.alerta()`). No viene incluido.

## 5. Cerebro y seguridad
- Modelo: por defecto `ollama/gemma4:31b-cloud` (nunca el plan de Claude). Se cambia en el panel.
- **Los mensajes del chat no son de fiar**:
  - No hay agente ni herramientas, solo una llamada `generarJSON`.
  - El modelo no ve tu memoria. Solo ve la **ficha pública del stream** que escribes tú y los últimos mensajes, marcados como datos dentro de `<chat>`.
- Filtro previo, sin coste:
  - inyección de instrucciones (es/en, también en leetspeak)
  - odio y acoso, más tus palabras bloqueadas
  - enlaces (salvo de mods)
  - flood, mensajes repetidos, mayúsculas y caracteres repetidos
- Filtro de salida: quita enlaces y `@everyone`, y descarta cualquier respuesta que contenga algo con pinta de token o un secreto real.
- Frecuencia: una respuesta cada `cadaSeg` como máximo, y cada `porUsuarioSeg` a la misma persona.
- **Que se calle**: deja de hablar, pero sigue leyendo y moderando.
- **Pánico**: silencio total y overlay vacío. También se activa con el pánico global del bus (`panico`). Para salir, pulsa **Reanudar**.

## 6. Comandos del chat
`!apolo <pregunta>` (también cuenta mencionarlo) · `!gesto <saludo|si|no|mirar|celebrar|feliz|triste|duda|sorpresa|guino|corazon|pensativo>` · `!voto <n>` (o solo el número).
Para mods y el streamer: `!encuesta pregunta | a | b | c`, `!callate`, `!habla`.

## 7. Comentarista de juego (opcional)
Cuando la app detecta una ventana a pantalla completa, cada N minutos hace una captura (si la ventana está protegida, no la mira). La comenta con un modelo de visión local (`ollama/qwen3.6`) en una frase. La captura se borra al momento.

## API
`/v1/stream` (con token): GET · PATCH config · POST secretos | conectar | desconectar | callar | panico | reanudar | clave | silenciar | decir | gesto | alerta | simular | comentar · POST/DELETE encuesta · POST mensajes/:id/responder | ocultar.
Overlay (solo clave): `/stream/overlay`, `/stream/eventos` (SSE), `/stream/audio/:id`.
