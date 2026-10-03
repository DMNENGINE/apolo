# App móvil (PWA)

APOLO trae una app móvil instalable que sirve el propio daemon en `/m/`: chat (con voz), permisos pendientes, tarjetas del cerebro,
Mission Control resumido, añadir encargos al turno de noche, tu Wrapped de la semana y el robot 3D en la cabecera con su estado.
No hay tienda ni cuenta: el móvil se empareja con tu PC escaneando un QR.

## Emparejar (2 minutos)

1. En el PC: panel → **Configuración → Dispositivos → App móvil**.
2. Activa **Acceso de móviles en la red local** (o pulsa directamente **Conectar móvil**, que te lo ofrece).
3. Escanea el QR con la cámara del móvil (mismo Wi-Fi). Elige un nombre y un **PIN de 4–8 cifras**.
4. Añádela a la pantalla de inicio (Android: menú → *Instalar app*; iPhone: Compartir → *Añadir a pantalla de inicio*).

El QR lleva `http://<IP-del-PC>:47900/m/#par=<código>`. El código es de **un solo uso y caduca a los 5 minutos**.
Si el PC tiene varias IPs (Wi-Fi y cable), el diálogo te deja elegir. Si tu router cambia la IP del PC, reserva la IP en el DHCP.

> Windows: el perfil de red "Pública" a veces bloquea conexiones entrantes. Si el móvil no carga la página, permite Node/Electron
> en el Firewall de Windows para redes privadas o cambia el perfil de tu Wi-Fi a "Privada".

## Seguridad

- **El token maestro nunca va al móvil.** El móvil canjea el código por un **token de dispositivo** propio (en disco solo se guarda su
  SHA-256), con nombre y última conexión. Se revoca al momento desde *Dispositivos* (o desde el propio móvil: *Desemparejar*).
- Sin el modo móviles (`cfg.red.moviles`), cualquier IP que no sea este PC o las de `red.permitidos` recibe **403 antes de mirar el token**,
  como siempre. Con el modo activado, el daemon acepta **IPs privadas** (192.168/16, 10/8, 172.16/12, 100.64/10 de Tailscale, IPv6 ULA)
  **solo** para los archivos de `/m/` (y el robot 3D/i18n que usa) y para `/v1` **con un token de dispositivo válido**.
  El panel de escritorio no se sirve a esas IPs y el token maestro desde ellas da 401.
- **Alcance del token de dispositivo** (lista blanca en `core/movil.js` → `alcance`): estado, sesiones de chat (crear, leer, enviar,
  cancelar; sin carpeta propia), eventos en vivo (sin registros), Mission Control, `GET/POST /v1/turno` (solo añadir encargos, sin
  carpeta ni modelo), Wrapped (sin textos), voz y `/v1/movil/*` (sus permisos, tarjetas, passkey, push).
  **Prohibido (403):** `/v1/config`, claves, conectores, privacidad/exportar/borrar, memoria, skills, plugins, reglas, registros,
  control del PC, borrar sesiones, configurar el turno… Los tests (`core/test/movil.test.js`) lo comprueban ruta a ruta.
- **Acciones peligrosas** (las que `shared/peligro.js` marca, también las de Claude Code): aprobarlas desde el móvil exige una **prueba**
  verificada en el PC: una **passkey** del móvil con verificación de usuario (huella/cara; WebAuthn verificado con `node:crypto`, contador
  anti-clonado, reto de un solo uso ligado a ESE permiso) o el **PIN**. 5 PIN fallidos bloquean el dispositivo (hay que re-emparejar).
  Denegar nunca pide nada. "Permitir siempre" no existe para lo peligroso.
- El canje de códigos tiene límite de intentos (20 fallos / 10 min).

## Qué funciona según cómo abras la app

Los navegadores solo dan ciertas funciones en **origen seguro** (HTTPS o `localhost`). `http://192.168.x.x` no lo es.

| Función | http en la LAN | HTTPS (Tailscale / túnel) |
|---|---|---|
| Chat, permisos (peligrosos con PIN), tarjetas, Mission Control, turno, Wrapped | ✅ | ✅ |
| Instalar como app (pantalla completa, icono) | acceso directo (Android) | ✅ |
| Funcionar sin red (cascarón en caché + aviso "sin conexión") | ❌ (no hay service worker) | ✅ |
| Voz (mantener para hablar) | ❌ (no hay micrófono) | ✅ |
| Huella / cara (passkey) | ❌ (WebAuthn no admite IPs) | ✅ |
| Avisos push | ❌ | ✅ (iPhone: iOS ≥ 16.4 y app instalada) |

**Atajo para probar en la LAN con Chrome Android:** `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → añade
`http://<IP-del-PC>:47900` → reinicia Chrome. Así funcionan service worker, micrófono y push. La passkey seguirá sin funcionar
(una IP no puede ser "rpId"); usarás el PIN.

## Avisos push

Están implementados de verdad y **sin dependencias**: claves VAPID propias (ES256, RFC 8292) y cifrado `aes128gcm` (RFC 8291) con
`node:crypto` (`core/movil.js`). El PC envía directamente al servicio push del navegador (FCM, Mozilla, Apple) cuando:
llega un permiso (del núcleo o de Claude Code) o un aviso urgente (incluido el informe del turno de noche).
Prueba: *Dispositivos → Probar aviso*. Requisitos: app abierta por HTTPS, *Ajustes → Avisos push → Activar*, y el PC encendido.

**Respaldo sin HTTPS:** Telegram. La app de escritorio ya te manda allí los permisos y los avisos cuando no estás en el PC.

## Fuera de casa (sin abrir nada a internet por tu cuenta)

APOLO **no** abre puertos ni configura túneles. Dos opciones, de más simple a más trabajo:

### A) Tailscale (recomendada)
1. Instala Tailscale en el PC y en el móvil, misma cuenta.
2. En el PC: `tailscale serve --bg 47900` → te da `https://<pc>.<tailnet>.ts.net` con certificado válido y **solo visible en tu tailnet**.
3. Panel → Dispositivos → App móvil → **URL pública (HTTPS)**: `https://<pc>.<tailnet>.ts.net`. El QR apuntará ahí.
   Empareja desde esa URL (el token y la passkey quedan ligados a ese origen).
4. Con HTTPS ya tienes huella, push, voz y modo sin red.

Nota: con `tailscale serve` las peticiones llegan al daemon desde `127.0.0.1` (como si fueran locales). El móvil sigue usando solo su
token de dispositivo (alcance limitado); el panel completo exige el token maestro, que nunca sale del PC.

### B) Cloudflare Tunnel + Access (ya tienes un túnel)
1. Añade una ruta al túnel existente, p. ej. `apolo.tudominio.com → http://127.0.0.1:47900`.
2. **Obligatorio:** una aplicación de **Cloudflare Access** delante de ese hostname (política: solo tu correo, OTP o Google). Sin Access,
   cualquiera en internet llegaría al daemon como si fuera local (cloudflared conecta desde 127.0.0.1); solo le pararía el token.
3. Recomendado: en el *ingress* limita las rutas a `^/(m/|v1/|vendor/|robot3d\.js|casco\.glb|i18n\.js|wrapped)` y devuelve 404 al resto.
4. Pon `https://apolo.tudominio.com` en **URL pública (HTTPS)** (Dispositivos → App móvil) y empareja desde ahí.

No uses "Bypass" de Access para `/v1`. El túnel de Mobile Lab (`mobilelab.clipsfarmer.com`) es otro servicio: no lo reutilices tal cual.

## Escritorio remoto

Ver el PC en vivo y usar su ratón y teclado desde el móvil (botón **Escritorio remoto** en Inicio).

- **Apagado por defecto.** Se concede por móvil en el PC: Configuración → Dispositivos → "Permitir escritorio remoto". El móvil no puede dárselo a sí mismo.
- **Cada sesión se aprueba**: en el PC (diálogo; por defecto) o con el PIN/huella del móvil (`cfg.escritorio.remoto.aprobacion: 'pin'`).
- **Ventanas protegidas** (`cfg.escritorio.bloqueadas`: bancos, gestores de contraseñas…) salen en negro y no se pueden tocar ni escribir en ellas.
- Mientras dura: borde rojo y "Control remoto activo desde <móvil>" en todos los monitores. Si alguien toca el ratón o el teclado del PC, se corta. Ctrl+Alt+Esc / Parar TODO = pánico.
- Límites: `maxMin` 30 y `inactividadMin` 5 (sin tocar nada). Todo queda en la auditoría (inicio, cada acción —del texto escrito solo su longitud— y fin).
- Gestos: toque = clic · mantener = clic derecho · dos dedos = scroll · pellizco = zoom (con zoom, un dedo mueve la vista) · ⌨ = teclado del móvil · barra de teclas (Esc, Tab, Ctrl/Alt/⇧/⊞ fijables, flechas, Supr, Ctrl+C/V/Z, Alt+Tab, Alt+F4).
- Rendimiento medido (monitor 2560×1440 → 1280–1688 px, JPEG 60): ~7–9 fps con ~150 KB/s cuando hay movimiento; ~1 fps y ~11 KB/s con la pantalla quieta (solo se envía lo que cambia). Por http en la LAN el tráfico NO va cifrado: fuera de casa usa HTTPS (túnel/Tailscale).

## Para desarrolladores

- Archivos: `core/movil.js` (emparejar, tokens, alcance, WebAuthn, push), `core/qr.js` (codificador QR propio, modo byte, nivel M,
  versiones 1–10; idéntico bit a bit al paquete `qrcode`), `core/ui/m/` (PWA: `index.html`, `app.js`, `app.css`, `robot.js`, `sw.js`,
  `manifest.webmanifest`, iconos), `core/ui/moviles.js` (sección del panel). Datos: `<nucleo>/movil.json` (modo 600).
- API: ver la cabecera de `core/daemon.js`. El móvil usa el header `x-dispositivo`; el canje (`POST /v1/movil/canjear`) va sin token.
- Voz: `POST /v1/voz/transcribir` (audio binario) emite el evento de bus `transcribir-audio {ruta, responder}`; `main.js` lo resuelve
  con Whisper (`transcribirArchivo`). Sin la app de escritorio responde 501.
- Tarjetas: `nucleo.cerebro.tarjetas()` / `accion(id, accion)` los pone `main.js`. Permisos de Claude Code: `nucleo.nodos.permisosExternos`.
- Tests: `cd core && npm test` (`test/movil.test.js`).
