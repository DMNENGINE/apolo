# Ojo de escritorio de APOLO (FASE 7.1)

El cuerpo físico más pequeño de APOLO: una pantalla redonda con **los mismos ojos del casco**, un botón para
**Permitir / Denegar / pánico**, un micro para **hablarle** y un altavoz para que **te conteste**. Cámara opcional.
Kit por **menos de 25 $**, carcasa imprimible en una Ender 3.

![Estados y gestos](hoja-gestos.png)

*Hoja generada con el simulador (`tools/simulador-ojo.html?hoja=1`): el dibujo es el mismo código que lleva el firmware.*

## Qué hace

| En el PC pasa… | El ojo… |
|---|---|
| Un agente trabaja (sesión del núcleo, o Claude Code si main.js lo reenvía) | Ojos azules que "leen" de lado a lado + nombre de la herramienta |
| Hay un permiso pendiente | Ojos ámbar, aro que late, `PERMISO?` y gesto de duda |
| Termina una tarea | `^ ^` verde + `LISTO` |
| Error | `X X` roja + `ERROR` |
| 3 min sin actividad | Se duerme (ojos cerrados y Zzz); al volver bosteza |
| Aviso de otro agente (MCP) | Sorpresa |

| Botón | Hay permiso pendiente | No hay permiso |
|---|---|---|
| Pulsación corta | **Permitir** (los PELIGROSOS no: solo en el PC) | Saluda |
| Mantener (0,7 s) | **Denegar** | **Hablar** (push-to-talk) mientras lo mantienes |
| Doble pulsación | **Pánico**: deniega todo, suelta el control del PC y cancela lo que esté corriendo | Pánico |

Gestos: feliz, triste, duda, sorpresa, guiño, corazón, remolino, bostezo y reloj (la hora en grande).

## Lista de compra (precios aproximados AliExpress, 2026)

| Pieza | Para qué | Precio |
|---|---|---|
| **Seeed XIAO ESP32S3 Sense** (cámara OV2640 + 8 MB PSRAM) | cerebro + cámara | 13–15 $ |
| *o* ESP32-S3-DevKitC-1 N8R2/N16R8 (sin cámara) | alternativa barata | 6–8 $ |
| Pantalla redonda **GC9A01** 1,28" 240×240 SPI (módulo con pines) | los ojos | 3–4 $ |
| Micrófono I2S **INMP441** | push-to-talk | 1,5–2 $ |
| Amplificador I2S **MAX98357A** | voz | 1,5–2 $ |
| Altavoz 28 mm 8 Ω 1–2 W (o 40 mm 3 W) | voz | 0,8–1,5 $ |
| Pulsador 12×12 mm con capuchón (1 o 2) | botón / hablar | 0,3 $ |
| Cables dupont hembra-hembra 10 cm o placa perforada | conexiones | 1 $ |
| PLA (~60 g) | carcasa (ver [carcasa.md](carcasa.md)) | 1,2 $ |
| Cable USB-C (de datos) | alimentación y flasheo | — (el que tengas) |
| **Total** con XIAO Sense | | **≈ 22–25 $** |
| Total con DevKit (sin cámara) | | ≈ 15–18 $ |

## Pines

Los pines están en `firmware/ojo-esp32/src/config.h` (cámbialos ahí si cableas distinto).
El micro y el amplificador **comparten BCLK y WS** (I2S full-duplex a 16 kHz): así caben en la XIAO.

### XIAO ESP32S3 Sense

| Módulo | Pin del módulo | XIAO | GPIO |
|---|---|---|---|
| GC9A01 | VCC / GND | 3V3 / GND | — |
| GC9A01 | SCL (SCK) | D8 | 7 |
| GC9A01 | SDA (MOSI) | D10 | 9 |
| GC9A01 | CS | D1 | 2 |
| GC9A01 | DC | D2 | 3 |
| GC9A01 | RST | 3V3 (o EN) | — |
| GC9A01 | BLK (si lo tiene) | 3V3 | — |
| INMP441 | VDD / GND | 3V3 / GND | — |
| INMP441 | SCK | D3 | 4 |
| INMP441 | WS | D4 | 5 |
| INMP441 | SD | D5 | 6 |
| INMP441 | L/R | GND (canal izquierdo) | — |
| MAX98357A | VIN / GND | 5V / GND | — |
| MAX98357A | BCLK | D3 (con el micro) | 4 |
| MAX98357A | LRC | D4 (con el micro) | 5 |
| MAX98357A | DIN | D6 | 43 |
| MAX98357A | GAIN / SD | sin conectar (9 dB, mezcla L+R) | — |
| Altavoz | + / − | salidas + / − del MAX98357A | — |
| Botón principal | una pata / otra | D0 / GND | 1 |
| Botón hablar (opcional) | una pata / otra | D7 / GND | 44 |
| LED de cámara | — | el LED naranja de la placa | 21 |
| Cámara OV2640 | — | ya va en la placa Sense | 10–18, 38–40, 47, 48 |

### ESP32-S3-DevKitC-1

| Módulo | Pin | GPIO |
|---|---|---|
| GC9A01 | SCK / MOSI / CS / DC / RST / BLK | 12 / 11 / 10 / 9 / 14 / 13 |
| INMP441 | SCK / WS / SD (L/R a GND) | 4 / 5 / 6 |
| MAX98357A | BCLK / LRC / DIN | 4 / 5 / 7 |
| Botón | a GND (vale el BOOT de la placa para probar) | 0 |
| LED de cámara | LED rojo + 330 Ω a GND (no hay cámara en esta placa) | 21 |

## Montaje

1. **Prueba en la mesa antes de la carcasa**: cablea con dupont siguiendo la tabla y flashea (paso siguiente).
2. **Firmware** (necesitas Python): `pip install --user platformio`, luego en `firmware/ojo-esp32`:
   `pio run -e xiao_s3_sense -t upload` (o `-e devkit_s3`). Monitor: `pio device monitor`.
   Si la XIAO no aparece como puerto: mantén BOOT, pulsa RESET, suelta BOOT.
3. **Activa los dispositivos en el PC**: panel → Configuración → **Dispositivos** → *Activar*.
   Se abre el puerto **47901** solo para IPs de tu red local (la API del núcleo, 47900, sigue cerrada).
   Si Windows pregunta por el cortafuegos, permite **redes privadas**.
4. **WiFi**: la primera vez el ojo crea la red **APOLO-Ojo**. Conéctate con el móvil, elige tu WiFi y escribe
   la **IP del PC** (la ves con `ipconfig`; mejor resérvala en el router) y el puerto `47901`.
5. **Emparejar**: el ojo enseña un **código de 6 dígitos**. Escríbelo en el panel → Dispositivos → *Emparejar*.
   El ojo guarda su token (en el PC solo se guarda su huella sha256). El código caduca a los 5 min.
6. **Carcasa**: pega la pantalla al frontal, el micro detrás de su agujero (con la junta de espuma),
   el altavoz contra la rejilla y atornilla con M2. Medidas en [carcasa.md](carcasa.md).

Borrar WiFi y emparejamiento: mantén el botón **al encender** 3 segundos.

## Sin hardware: simulador

`tools/simulador-ojo.html` hace de ojo: abre el archivo en el navegador, pulsa *Conectar*
(`ws://127.0.0.1:47901/`), empareja con el código que sale en su pantalla y prueba el botón
(clic o barra espaciadora), el micro (push-to-talk) y la "cámara" (manda su propia pantalla como JPEG).
`?hoja=1` genera la hoja de todos los estados y gestos.

## Cómo funciona (para desarrolladores)

- **PC**: `core/nodos/` — servidor WebSocket propio sin dependencias (`ws.js`, RFC 6455 mínimo) en `cfg.nodos.puerto`
  (47901), conectado al bus del núcleo. API `/v1/nodos` (GET lista · POST `emparejar {codigo}` · POST `activar {activo}` ·
  PATCH/DELETE `:id` · POST `:id/gesto` · POST `:id/foto`). No es un plugin del SDK porque los plugins viven en un proceso
  hijo con la red bloqueada y esto necesita abrir un puerto y resolver permisos en directo.
- **Ajustes** (`config.json` → `nodos`): `puerto`, `permitidos` (IPs o CIDR; vacío = cualquier IP privada),
  `dormirMin` (3), `permitirPeligrosos` (false), `maxAudioSeg` (30), `ffmpeg`. El on/off se guarda en `nodos.json`.
- **Firmware**: `firmware/ojo-esp32` (PlatformIO, Arduino): LovyanGFX (sprite 240×240 = doble búfer, ~40 fps),
  WebSockets (links2004), ArduinoJson 7, WiFiManager. `src/ojos.cpp` es la traducción línea a línea de
  `tools/ojo-dibujo.js`: **si cambias el dibujo, cambia los dos**.
- **Protocolo** (JSON en texto; audio/fotos en binario):
  - ojo → PC: `hola {id, nombre, version, modelo, capacidades, token?}` · `boton {pulsacion}` ·
    `audio-inicio {frecuencia}` + PCM s16le mono + `audio-fin` · `foto-inicio {bytes}` + JPEG + `foto-fin`
  - PC → ojo: `emparejar {codigo}` · `emparejado {token}` · `bienvenido {epoch, tz}` · `estado {estado, msg}` ·
    `flash {estado, msg, segundos}` · `gesto {gesto, segundos, msg?}` · `mirar {x, y}` · `permiso {id, resumen, peligro}` ·
    `audio-inicio` + PCM + `audio-fin` · `foto` · `oido {texto}`
- **Cámara**: solo cuando el PC la pide (`POST /v1/nodos/:id/foto`), **siempre con tu permiso** (`pedirExterno`),
  y el ojo enciende el LED + aro rojo 0,8 s antes de disparar. JPEG en `nucleo/capturas/`.

## Pendiente (conexión con la app de escritorio, main.js)

El núcleo ya emite y escucha todo; falta enchufarlo en `main.js` (no se tocó en esta fase):

```js
// voz del ojo → whisper_srv → el mismo enrutado que la voz de la isla
nucleo.nodos.transcriptor = ruta => transcribirArchivo(ruta);
nucleo.bus.on('nodo-texto', ({ texto }) => handleText(texto, { origen: 'voz' }));   // adaptar a la firma real de handleText
// el ojo también habla: tras generar el mp3 del TTS
nucleo.nodos.reproducirArchivo(rutaMp3);            // ffmpeg → PCM 16 kHz → altavoz del ojo
// las sesiones de Claude Code (hooks) también mueven los ojos
nucleo.bus.emit('nodo-estado', { estado: 'trabajando', msg: 'Claude Code' });   // permiso | listo | error | reposo
nucleo.bus.emit('nodo-gesto', { gesto: 'feliz' });
```

Más adelante: "mira hacia quien habla" (dirección con dos micros o con la cámara) y despertar por su nombre (wake word).
