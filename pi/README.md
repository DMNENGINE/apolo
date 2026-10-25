# Bot de Discord en Raspberry Pi

El bot puede usar el modulo compartido `../bot-discord.js` desde un checkout completo de APOLO. Instala las dependencias del repositorio y ejecuta `node pi/robot-discord-pi.js`. No requiere Electron para cargar el bot compartido.

Conserva `pc.json` y `discord.json` en la carpeta `pi`, con permisos 600. No los incluyas en una distribucion ni publiques sus valores. No copies ni cambies credenciales existentes para probar la resolucion del modulo.

Para systemd, adapta `User` y `WorkingDirectory` en `robot-companion-bot.service` a tu usuario y a la carpeta `pi` del checkout. El servicio de ejemplo no se instala automaticamente.

El despliegue anterior en una carpeta independiente sigue admitido si contiene `bot-discord.js`, `robot-discord-pi.js`, `cargar-bot.js` y las dependencias de `pi/package.json`. El modulo local tiene prioridad. Los errores al cargarlo se propagan, sin ocultarlos con otro modulo.
