# Canal de Slack

Habla con APOLO desde Slack por **mensaje directo**: escribirle, recibir permisos con botones, avisos, tarjetas y mandarle clips de audio.

- Usa **Socket Mode**: la conexión sale de tu PC hacia Slack por WebSocket. No hace falta servidor público, túnel ni abrir puertos.
- **Solo tú**: el bot se enlaza a tu usuario con un código. Cualquier otra persona que le escriba recibe «🔒 Este bot es privado» y su mensaje no llega a APOLO.
- Es un plugin del SDK (`plugins/slack`). Corre en su propio proceso y solo puede conectarse a `slack.com` y `*.slack.com`.
- Los dos tokens se guardan **cifrados** (secretos `slack:app` y `slack:bot`). El panel nunca los vuelve a mostrar.

## 1. Crear la app con el manifest

1. Abre <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Elige tu espacio de trabajo.
3. Pega esto (formato YAML) y crea la app:

```yaml
display_information:
  name: APOLO
  description: Tu robot APOLO por mensaje directo
  background_color: "#0b0f0c"
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
  bot_user:
    display_name: APOLO
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write
      - im:history
      - im:read
      - im:write
      - users:read
      - files:read
settings:
  event_subscriptions:
    bot_events:
      - message.im
  interactivity:
    is_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false
```

Qué pide cada permiso:

| Permiso | Para qué |
|---|---|
| `chat:write` | Contestarte y editar los mensajes de permisos |
| `im:history`, `im:read`, `im:write` | Leer y abrir **solo** los mensajes directos con la app |
| `users:read` | Poner tu nombre en el panel |
| `files:read` | Descargar tus clips de audio para transcribirlos |

No pide acceso a canales públicos ni privados.

## 2. Los dos tokens

1. **Token de app (`xapp-…`)**: *Basic Information* → *App-Level Tokens* → **Generate Token and Scopes**. Ponle un nombre, añade el permiso `connections:write` y pulsa **Generate**.
2. **Token de bot (`xoxb-…`)**: *OAuth & Permissions* → **Install to Workspace** → copia el *Bot User OAuth Token*.

## 3. Conectar en APOLO

1. Ve a **Configuración → Canales → Slack**.
2. Pulsa **Instalar**. El plugin pasa el antivirus y se activa.
3. Pega los dos tokens y pulsa **Conectar**. APOLO comprueba los dos tokens (`auth.test` y `apps.connections.open`) antes de guardarlos.
4. El panel muestra un código del tipo `APOLO-1A2B3C`. En Slack, abre la app (sección *Apps* → APOLO → pestaña *Mensajes*) y mándale ese código.
5. Listo: el panel pasa a **Enlazado**. Usa **Probar** para recibir un mensaje de prueba.

**Nuevo código** desenlaza tu usuario y genera otro. **Desconectar** borra los tokens de este equipo; la app de Slack sigue existiendo y puedes borrarla desde api.slack.com.

## Uso

- **Escribe cualquier cosa**. Funcionan los mismos atajos que en los demás canales: `gemma: …`, `usa claude code`… Además: `ayuda`, `estado` y `nueva`.
- **Permisos**: llegan con los botones **Permitir**, **Siempre** y **Denegar**.
  - Los peligrosos no tienen «Siempre» y piden un **segundo paso** («¿Seguro?»).
  - El botón solo vale si lo pulsas tú (se comprueban tu usuario y tu espacio de trabajo).
  - Solo resuelve los permisos que se mostraron en Slack.
- **Tarjetas** (correos y mensajes importantes): con los botones **Enviar**/**Responder**, **Descartar** y **Ruido**.
- **Audio**: graba un clip en el DM. Se descarga al almacén del plugin, Whisper lo transcribe en la app y luego se borra.

## Detalles técnicos

- Socket Mode:
  - `apps.connections.open` (con el token xapp-) devuelve una URL `wss://`, a la que se conecta `@apolo/sdk/ws-cliente` (RFC 6455, sin dependencias, TLS con `node:tls`).
  - Cada sobre (`envelope_id`) se confirma **al momento** con un ack. Si no, Slack lo reenvía a los 3 s; los duplicados se ignoran por `client_msg_id`.
  - Si Slack manda un `disconnect`, el plugin pide otra URL y se reconecta.
- Con un token revocado o no válido, el canal se para con el estado «token no válido».
- Código:
  - `plugins/slack/slack.js` tiene la lógica, que se prueba sin red en `core/test/canales.test.js`.
  - `plugins/slack/index.js` lo une al SDK.
