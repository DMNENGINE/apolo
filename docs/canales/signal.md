# Canal de Signal

Habla con APOLO desde Signal. El robot usa **su propio número** a través de [signal-cli](https://github.com/AsamK/signal-cli), que corre en tu PC como servicio local.

- Es un plugin del SDK (`plugins/signal`) en su propio proceso. **Solo se conecta a `127.0.0.1` / `localhost`**: lo declara el manifest y el plugin rechaza cualquier otra dirección.
- No guarda secretos: la cuenta de Signal y sus claves las tiene signal-cli en su carpeta de datos.
- **Solo tu número**:
  - Ignora cualquier otro número y todos los grupos.
  - Reconoce tu número y, cuando lo conoce, tu UUID, así que funciona aunque ocultes tu número.
  - Nunca escribe a nadie más.

## 1. Instalar Java y signal-cli

signal-cli necesita **Java 21 o más nuevo**.

1. **Java**:
   - Windows: `winget install EclipseAdoptium.Temurin.21.JRE`
   - Linux: `sudo apt install openjdk-21-jre`
   - Comprueba con `java -version`.
2. **signal-cli**:
   - Descarga la última versión de <https://github.com/AsamK/signal-cli/releases> (`signal-cli-<versión>.tar.gz`) y descomprímela, por ejemplo en `C:\signal-cli`.
   - El ejecutable es `bin\signal-cli.bat` en Windows y `bin/signal-cli` en Linux/mac.
   - Las notas de voz necesitan la versión **0.13 o más nueva**, que trae `getAttachment`.

## 2. Un número para el robot

Usa un número **distinto del tuyo**: una SIM secundaria, un número virtual o un fijo que pueda recibir SMS o llamadas.

```bash
signal-cli -a +34600111222 register            # si pide captcha: https://signalcaptchas.org/registration/generate.html
signal-cli -a +34600111222 register --captcha "signalcaptcha://…"
signal-cli -a +34600111222 verify 123-456      # el código que te llega por SMS
signal-cli -a +34600111222 updateProfile --given-name APOLO
```

> También puedes vincular signal-cli como **dispositivo secundario** de otra cuenta (`signal-cli link -n APOLO` y escanear el QR). No lo hagas con **tu propia** cuenta: el robot solo atiende mensajes que le manda tu número a su cuenta.

## 3. Arrancar el daemon (JSON-RPC por HTTP, solo local)

```bash
signal-cli -a +34600111222 daemon --http 127.0.0.1:8080
```

- Escucha **solo en 127.0.0.1**. No uses `0.0.0.0`: cualquiera de tu red podría mandar mensajes con tu número de robot.
- Endpoints que usa el plugin:
  - `POST /api/v1/rpc`: JSON-RPC 2.0 (`send`, `sendReaction`, `getAttachment`, `version`).
  - `GET /api/v1/events`: eventos SSE.
- Para que arranque con Windows, crea una tarea programada «Al iniciar sesión» que ejecute `C:\signal-cli\bin\signal-cli.bat -a +34600111222 daemon --http 127.0.0.1:8080`. En Linux, usa un servicio de systemd.

## 4. Conectar en APOLO

1. Ve a **Configuración → Canales → Signal → Instalar**.
2. Rellena:
   - **Dirección**: `http://127.0.0.1:8080`.
   - **Número del robot**: el de signal-cli.
   - **Tu número**: con prefijo, `+34…`.
3. Pulsa **Conectar**. APOLO comprueba que signal-cli responde (`version`) y te manda un mensaje de bienvenida.
4. Contesta cualquier cosa desde tu Signal. El panel pasa a **Enlazado**; pulsa **Probar**.

## Uso

- **Escribe cualquier cosa**. Además: `ayuda`, `estado` y `nueva`.
- **Permisos**: el mensaje lleva un número (`Permiso #3`). Puedes reaccionar al mensaje o responder:
  - 👍 o `1`: permitir.
  - 🔁 o `2`: siempre (no existe para los peligrosos).
  - 👎 o `3`: denegar.
  - Si hay varios pendientes, añade el número (`1 #3`) o cita el mensaje.
  - **Peligrosos**: segundo paso, `CONFIRMO 3`.
  - Al resolverse, el robot reacciona ✅ o ✋ al mensaje y te dice desde dónde se decidió.
- **Tarjetas**: reacciona 📨, 🗑 o 🔕, o cítalas con `enviar`, `descartar` o `ruido`.
- **Notas de voz**: el plugin las pide con `getAttachment` (en base64), las guarda en su almacén, Whisper las transcribe en la app y luego se borran.

## Si no funciona

- **«signal-cli no responde, reintentando»**: el daemon no está arrancado o escucha en otro puerto.
- **No te llegan mensajes**: comprueba que el número del robot está registrado (`signal-cli -a +NUM receive`) y que tu número está bien escrito, con `+` y prefijo.
- **Las notas de voz fallan**: actualiza signal-cli a la 0.13 o más nueva.
