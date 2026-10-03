# Canal de Matrix

Habla con APOLO desde cualquier cliente de Matrix (Element, FluffyChat, Cinny…) en una **sala privada** entre tú y una cuenta de bot.

> ⚠️ **Sin cifrado de extremo a extremo (E2EE) en la v1.**
> - La sala que crea el robot **no está cifrada**: tu homeserver puede leer esos mensajes, como en un chat sin cifrar.
> - Si activas el cifrado en la sala, o usas un DM cifrado creado desde Element, el robot **no podrá leer** los mensajes y te avisará.
> - Si necesitas E2EE hoy, usa Signal o Telegram (chats normales cifrados en tránsito).

## Cómo funciona

- Es un plugin del SDK (`plugins/matrix`) en su propio proceso. Usa la **Client-Server API v3** con `/sync` en *long-poll*:
  - El `since` se guarda: al reiniciar sigue donde lo dejó, sin repetir mensajes.
  - El primer sync se trata como historial y no se responde.
- **Solo tú**:
  - El robot crea la sala y te invita.
  - Solo acepta invitaciones que le mandes tú; las demás las rechaza.
  - Solo lee los mensajes de tu usuario en esa sala. Aunque alguien se cuele en la sala, lo ignora.
- **Red**:
  - El manifest declara `matrix.org` y `*.matrix.org`.
  - Si tu homeserver es otro (p. ej. `matrix.midominio.es`), la **primera vez** APOLO te pregunta si el plugin puede conectarse con él.
  - Solo `https://`, salvo `localhost` para pruebas.
- **Credenciales**:
  - La contraseña del bot solo se usa para iniciar sesión (`/login`) y **no se guarda**.
  - Se guarda el token de acceso, cifrado (secreto `matrix:token`). El panel nunca lo muestra.

## Configurar

1. Crea una cuenta **nueva, solo para el robot**, por ejemplo `@apolo_bot:matrix.org` en <https://app.element.io>. Tiene que ser distinta de la tuya.
2. En APOLO: **Configuración → Canales → Matrix → Instalar**.
3. Rellena:
   - **Homeserver**: `https://matrix.org`, o el tuyo.
   - **Tu usuario**: `@tu_usuario:matrix.org`.
   - **Usuario y contraseña del bot**, o su **token de acceso** si lo prefieres (en Element: Ajustes → Ayuda y acerca de → Avanzado).
4. Pulsa **Conectar**. El robot inicia sesión, crea la sala **APOLO** y te invita.
5. Acepta la invitación en tu cliente. El panel pasa a **Enlazado**; pulsa **Probar**.

**Desconectar** sale de la sala, cierra la sesión del bot (`/logout`) y borra el token.

## Uso

- **Escribe cualquier cosa**. Además: `ayuda`, `estado` y `nueva`.
- **Permisos**: el mensaje lleva un número (`Permiso #3`) y el robot le pone las reacciones 👍 🔁 👎, así que basta con pulsar una:
  - 👍 o responder `1`: permitir.
  - 🔁 o `2`: siempre (no existe para los peligrosos).
  - 👎 o `3`: denegar.
  - Si hay varios pendientes, añade el número (`1 #3`) o responde citando el mensaje del permiso.
  - **Peligrosos**: tras 👍 o `1` te pide un segundo paso. Escribe `CONFIRMO 3`.
  - Solo cuentan las reacciones y respuestas **tuyas**, y solo para permisos que se mostraron en Matrix.
- **Tarjetas**: reacciona 📨 (enviar), 🗑 (descartar) o 🔕 (ruido), o respóndelas con esas palabras.
- **Notas de voz** (`m.audio`): se descargan con el endpoint autenticado `/_matrix/client/v1/media/download` (si el servidor es antiguo, se usa el `/media/v3`), las transcribe Whisper en la app y luego se borran.

## Pendiente (v2)

- E2EE con Olm/Megolm. Necesita guardar las claves del dispositivo y verificarlo; sin dependencias es un trabajo grande.
- Descubrir el homeserver por `.well-known` (hoy se pone la URL a mano).
