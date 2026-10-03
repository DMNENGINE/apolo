# Plugins de APOLO

Un plugin añade **herramientas, comandos, canales o proveedores de modelos** a APOLO. Cada plugin corre en **su propio proceso Node** y no puede ver tus claves, tu `config.json` ni el token del núcleo.

## Crear uno

```bash
node core/sdk/crear.js mi-plugin          # o: npm create apolo-plugin (cuando se publique @apolo/sdk)
```

Genera `mi-plugin/` con tres archivos:

**apolo-plugin.json** (el manifest)
```json
{
  "nombre": "mi-plugin", "version": "0.1.0", "descripcion": "…", "autor": "", "licencia": "MIT",
  "entrada": "index.js", "apoloSdk": "^1.0.0",
  "permisos": ["red:api.ejemplo.com"],
  "aporta": {
    "herramientas": [{ "nombre": "mi_plugin_eco", "riesgo": "lectura", "descripcion": "…" }],
    "comandos": [{ "nombre": "mi_plugin" }],
    "canales": [], "proveedores": [], "vistas": [], "gestos": [], "voces": []
  }
}
```

**index.js** (CommonJS)
```js
const { definirPlugin } = require('@apolo/sdk');   // APOLO lo resuelve solo: no hay que instalarlo
module.exports = definirPlugin({
  async activar(apolo) {
    apolo.registrarHerramienta({
      nombre: 'mi_plugin_eco', descripcion: 'Repite el texto',
      parametros: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
      ejecutar: async ({ texto }, ctx) => `eco: ${texto}`,
    });
    apolo.registrarComando({ nombre: 'mi_plugin', ejecutar: async texto => `hola ${texto}` });
  },
  async desactivar() { },
});
```

## La API (`apolo`)

| | |
|---|---|
| `registrarHerramienta / registrarComando / registrarProveedor / registrarCanal` | Solo se puede registrar lo declarado en `aporta`. |
| `config` | Solo tu sección: `"plugins": { "mi-plugin": { … } }` en `config.json`. |
| `almacen` | Tu carpeta `<datos>/plugins-datos/<nombre>/`, con `leer`, `guardar` y `borrar`. |
| `memoria.buscar / recordar` | Necesita el permiso `memoria`. |
| `tareas.programar / ver / borrar` | Necesita el permiso `tareas`. `programar` acepta `{ aviso }` o `{ ejecutar }`. |
| `bus.on / emitir` | Eventos `plugins`, `skills`, `tarea` y `plugin:<x>:<evento>`. `turno` y `aviso` necesitan el permiso `conversaciones`. |
| `permisos.pedir(p)`, `archivos.leer / escribir`, `shell(cmd)` | Si no está declarado, se pregunta al usuario. |
| `secretos.leer / guardar(nombre)` | Solo los nombres declarados en `"secretos": ["tg:token"]` del manifest. Los da la app desde su almacén cifrado. Los de tu espacio (`<tu-nombre>:…`) se dan sin preguntar; los demás los aprueba el usuario una vez (o la app, si es suyo). |
| `log(...)` | Va al registro del panel. |

Los tipos completos están en `core/sdk/index.d.ts`.

### Canales remotos (Telegram, WhatsApp…)

`registrarCanal({ id, nombre, enviar, permiso, permisoResuelto, tarjeta, acciones })` devuelve `{ recibir, estado, decidir, tarjeta, transcribir }`.

- **Permisos**: el canal tiene que declarar `"permisos": true` en `aporta.canales` y tener `permiso(p)`. Así recibe los permisos pendientes, con botones si quiere. Con `decidir(id, 'allow'|'always'|'deny')` **solo** puede resolver los que se le mostraron a él; cualquier otro se rechaza. `always` en uno peligroso baja a `allow`.
- **Tarjetas** (`tarjeta(t)`) necesitan el permiso `conversaciones`.
- **Notas de voz**: guárdalas en tu almacén y llama a `transcribir(ruta)`, que usa el Whisper de la app.
- **`acciones`**: funciones que la app llama desde el panel (estado, conectar…).
- En la app de escritorio, `main.js` media con `plugins.mediar({ resolverPermiso, accionTarjeta, recibir, transcribir })`. Sin app (daemon/CLI), el gestor reenvía él mismo los permisos del núcleo.

Ejemplo real: `plugins/telegram` (se activa con `"plugins": { "telegramComoPlugin": true }` en config.json; si no arranca, la app vuelve a `telegram.js`).

- **Mensajes de otras personas** (por ejemplo, los contactos de WhatsApp en modo avisar/auto): se pasan con `ajeno(datos)`. Necesita el permiso `conversaciones`. Van **solo** a la app (el mediador), nunca al bus ni a otros plugins. Responder a esa persona lo decide siempre la app, nunca el plugin.
- `tarjeta(id, 'enviar', texto)` manda tu propio texto en vez de la respuesta sugerida.

Con el mismo patrón que Telegram (flag en `config.json` y caída a la versión de la app), hay dos más:

- `plugins/whatsapp`: `"whatsappComoPlugin": true`. Usa Baileys como dependencia del plugin y guarda la sesión en su almacén. En el panel, «Usar la sesión actual» copia la de la app con tu confirmación.
- `plugins/discord`: `"discordComoPlugin": true`, sin discord.js. Nunca corre junto al modo Pi ni al bot local. Guía: `docs/canales/discord.md`.

Más canales oficiales, con el mismo patrón y sin dependencias: `plugins/slack`, `plugins/matrix` y `plugins/signal`. Sus guías están en `docs/canales/`. Se instalan desde **Configuración → Canales**: `POST /v1/plugins/oficial/:nombre` y luego las acciones `POST /v1/plugins/:nombre/canales/:id/:accion`.

### WebSocket sin dependencias

`require('@apolo/sdk/ws-cliente')` da un cliente RFC 6455 mínimo, con TLS de `node:tls`:

```js
const ws = await conectar('wss://…', { cabeceras: {} });
ws.on('texto', s => { /* … */ });
ws.enviarJSON(o);
```

Usa `tls.connect` en el momento de conectar, así que pasa por la vigilancia de red: el dominio tiene que estar declarado. Es el mismo código que usa el servidor de `core/nodos`.

### Secretos sin la app

Si el núcleo corre sin la app de escritorio (daemon o CLI), los secretos de los plugins se guardan en la bóveda (DPAPI) como `plugin:<nombre>`.

## Seguridad

- Se usa el **modelo de permisos de Node**. El plugin:
  - solo puede leer su propia carpeta y escribir en su almacén;
  - solo puede usar `child_process` si declara `shell`;
  - no recibe tus variables de entorno.

  Dentro de la app (Electron) se usa el `node` del sistema. Si no tienes Node 20+, el plugin corre sin límite de archivos y queda un aviso en su log.
- **Red**: solo se conecta a los dominios declarados (`red:dominio`, `red:*.dominio`). Si `fetch` va a un dominio no declarado, se pregunta al usuario, y si `http`, `net` o `tls` intentan conectarse a uno, se bloquea.
- **Lo que no está declarado se pregunta siempre.** Sale en la isla, Discord o Stream Deck como «plugin X», y nunca se convierte en «siempre».
- **Herramientas**: cuenta el riesgo que declara el manifest; si no declara ninguno, se trata como `escritura`. Si el escaneo no es verde, se preguntan siempre.
- **Al instalar**, el plugin pasa el antivirus de skills, que además avisa de los dominios no declarados, y queda **desactivado**. Si el escaneo sale rojo, activarlo exige `forzar`.
- **Si el proceso se cae**, se reinicia con espera creciente (backoff). Tras 3 reinicios fallidos queda **ROTO** hasta que lo actives a mano.

## Instalar y gestionar

- **CLI**:
  - `/plugins` para listarlos;
  - `/plugin add <fuente> [--dev]`, `/plugin on|off <nombre> [--forzar]` y `/plugin rm|reload|scan <nombre>`;
  - `/<comando>` ejecuta un comando de un plugin.
- **Fuentes**: una carpeta, un `.zip` o `.tgz`, una URL, `owner/repo[/ruta][@ref]` de GitHub, o npm (`npm:paquete`, `@scope/pkg`). Con npm se usa `npm pack --ignore-scripts`, así que nunca se ejecutan scripts de instalación.
- **`--dev`**: usa la carpeta original y recarga el plugin cada vez que guardas.
- **API**:
  - `GET /v1/plugins`
  - `POST /v1/plugins/instalar {fuente, dev?}`
  - `PATCH /v1/plugins/:nombre {activo, forzar?}`
  - `POST /v1/plugins/:nombre/recargar|escanear`
  - `DELETE /v1/plugins/:nombre`
  - `POST /v1/plugins/comandos/:cmd {texto}`

  Los eventos llegan por el bus como `{tipo:'plugins', accion, nombre}`.

Ejemplo real: `plugins/clima`, el tiempo con Open-Meteo, sin clave.
