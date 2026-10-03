# Discord como plugin (sin Raspberry Pi)

Tu propio bot de Discord, sin `discord.js`. Corre en su propio proceso, con el cliente WebSocket del SDK (`@apolo/sdk/ws-cliente`) para el Gateway y `fetch` para la API REST. Solo habla contigo.

> **¿Ya tienes el bot en una Raspberry Pi (modo Pi) o el bot de la app (`discord.json` con token)?** Entonces no lo necesitas. El plugin **nunca** corre a la vez que ninguno de los dos: si activas el flag igualmente, la app lo avisa en el registro, el panel lo marca como bloqueado y el plugin no se conecta.

## Qué hace

- **Mensajes directos contigo**: le escribes y te contesta (mismo enrutado que el resto de canales: `gemma: …`, `usa claude code`…). `/ayuda`, `/estado` y `/nueva`.
- **Permisos con botones**: Permitir, Siempre o Denegar. Lo peligroso pide un **segundo paso** («⛔ Sí, permitir») y nunca se convierte en «siempre». El bot solo puede resolver los permisos que se le mostraron a él.
- **Tarjetas** (Enviar, Descartar o Ruido), **avisos** y **notas de voz**. Las notas se descargan en el almacén del plugin y las transcribe el Whisper de la app.
- **Opcional**: una categoría privada **«🤖 APOLO»** en tu servidor, con `#🔐・permisos`, `#📣・avisos` y `#💬・hablar`. Solo tú y el bot la veis.

## 1. Crear el bot

1. Abre <https://discord.com/developers/applications> y pulsa **New Application**.
2. En **Bot**, pulsa **Reset Token** y copia el token. Se pega en el panel y queda cifrado en este equipo; el panel nunca lo vuelve a mostrar.
3. **Intents**:
   - **Solo mensajes directos**: no hace falta activar ninguno. El contenido de los DMs con el bot llega sin *Message Content*, y el plugin pide solo `DIRECT_MESSAGES`.
   - **Con la categoría en tu servidor**: activa **Message Content Intent**. El plugin pide además `GUILDS` y `GUILD_MESSAGES`. Si falta, Discord cierra con 4014 y el panel te dice qué activar.
4. Invita el bot a un servidor tuyo: Discord solo deja abrir un DM con alguien con quien el bot comparte servidor. El panel te da el enlace de invitación:
   - `permissions=0` para solo DMs;
   - con permisos de gestionar canales y roles si quieres la categoría.

## 2. Activarlo en APOLO

1. Ve a **Configuración → Canales → Discord (plugin)** y pulsa **Activar** en «Usar el plugin». Equivale a `"plugins": { "discordComoPlugin": true }` en `config.json`.
2. **Reinicia la app.** Instala y arranca `plugins/discord` sola.
3. En la misma tarjeta, rellena:
   - el **token**;
   - **tu id de usuario** (opcional). Si lo dejas vacío se usa el dueño de la aplicación de Discord. Si la aplicación es de un equipo, el panel muestra un código `APOLO-XXXXXX` que le mandas al bot por DM;
   - **el id de tu servidor** (opcional), solo si quieres la categoría.
4. Pulsa **Probar**: te llega un DM.

## Seguridad

- **Red**: solo `discord.com`, `gateway.discord.gg`, `*.discord.gg`, `cdn.discordapp.com` y `media.discordapp.net`.
- **Secretos**: el único es `discord:token`, dentro de su espacio. **No** lee el `discord.json` de la app ni el token del bot de la Pi.
- **Solo el dueño**: mensajes y botones de cualquier otra persona se ignoran o reciben «🔒». Fuera de la categoría, los mensajes de servidores no se leen.
- **Gateway**:
  - latido con jitter;
  - si el latido no recibe ACK (conexión zombi), reconecta y hace RESUME;
  - `op 7` hace RESUME y `op 9` un IDENTIFY nuevo;
  - los cierres 4004 y 4010–4014 son fatales: se para y lo dice en el panel, sin bucles.

## Volver atrás

Apaga el flag y reinicia: la app desactiva el plugin y vuelve a lo de antes (bot local o modo Pi).
