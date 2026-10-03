# APOLO — Plan maestro

> Meta: el agente personal open source **mejor que OpenClaw en todo**. Cualquier modelo, cualquier canal, con cuerpo físico, seguro de verdad, y tan bonito que la gente lo enseñe sola.
> Sin fecha límite. Se trabaja por fases; cada fase termina con tests verdes y probado en vivo.

Leyenda: ✅ hecho · 🟡 a medias · ⬜ pendiente · 🔥 gancho viral

---

## 0. Dónde estamos (2026-10-02)

| Área | Estado |
|---|---|
| Núcleo multi-modelo (22 proveedores, Ollama local, Claude Code/Codex/Gemini CLI como motores) | ✅ |
| Bucle de agente, permisos, sesiones, compactación, anti-promesa, verificación | ✅ |
| Memoria semántica + historial | ✅ |
| Tareas/cron/heartbeat | ✅ |
| Subagentes en paralelo + Mission Control | ✅ |
| Canales: isla, voz, Discord (Pi), Telegram, WhatsApp, Stream Deck, MCP | ✅ |
| Navegador (extensión con input real), ver pantalla, manos (fase 2) | 🟡 falta fase 3 y prueba en vivo de las manos |
| Correo / GitHub / HF / ElevenLabs | 🟡 OAuth sin IDs propios, correo sin probar con cuentas reales |
| Panel web (Control UI) | ✅ |
| Importar desde OpenClaw | ✅ |
| Instalador + autoupdate | 🟡 one-liner + .exe NSIS con electron-updater (sin firmar) |
| **Skills** | ✅ motor + antivirus + taller |
| Plugins / SDK | 🟡 SDK + gestor + aislamiento + clima + Telegram (tras flag); faltan WhatsApp/Discord y panel |
| macOS / Linux | ⬜ (solo Windows) |
| Inglés | 🟡 panel, isla y bandeja es/en + asistente de bienvenida; faltan textos del servidor y README |
| App móvil / nodos | 🟡 nodo ojo ESP32 (WebSocket); falta app móvil |

---

## FASE 1 — Motor de skills universal 🔥 ✅ (2026-10-02: marketplace en panel, firma ed25519, .cursor/rules + AGENTS.md; falta activar por canal/modelo)

**Gancho:** "Instala cualquier skill de Claude, Codex o Cursor… y úsala con Llama, Gemini o GPT gratis."

### 1.1 Formato
- Compatible 100 % con el estándar `SKILL.md` (frontmatter `name`, `description`, opcional `allowed-tools`, `license`, `metadata`) + carpeta con `scripts/`, `references/`, `assets/`.
- Extensiones propias en `metadata.apolo`: `modelos` recomendados, `canales`, `permisos` declarados, `disparadores` (palabras/regex), `version`, `autor`, `firma`.
- Lectura también de `.claude/skills`, `~/.codex/skills`, `.cursor/rules`, `AGENTS.md` y skills de OpenClaw (ya importadas en `nucleo/skills`).

### 1.2 Instalación (`core/skills/instalar.js`)
- Fuentes: carpeta local, `.zip`/`.skill`, URL directa, repo GitHub (`owner/repo[/ruta]`), marketplace (Skillry, anthropics/skills, ClawHub, el nuestro).
- Guarda en `nucleo/skills/<slug>/` con `instalado.json` (origen, sha, versión, fecha).
- `apolo skill add|rm|ls|update` en CLI, API `/v1/skills/*`, panel y por chat ("instálame la skill X").
- Actualizaciones: comprueba versión del origen, muestra diff antes de aplicar.

### 1.3 Seguridad (diferencia clave vs OpenClaw) 🔥 "el antivirus de skills"
- **Escáner** antes de activar: busca prompt-injection ("ignora instrucciones", exfiltración a URLs, lectura de `.ssh`/tokens/cookies), scripts con red/borrado/ofuscación (base64+eval, curl|sh), binarios.
- Informe con nivel 🟢/🟡/🔴 + explicación en lenguaje humano hecha por el modelo cerebro.
- Las skills **declaran permisos**; lo no declarado se pide siempre. Scripts corren con el mismo sistema de permisos + `peligro.js`.
- Cuarentena: skill nueva = desactivada hasta que el usuario la acepta.
- Firma opcional (ed25519) de autores verificados en nuestro marketplace.

### 1.4 Activación (`core/skills/indice.js`)
- Índice ligero: solo `name + description` de cada skill va al prompt (divulgación progresiva).
- Selección: disparadores → búsqueda híbrida con los mismos embeddings de la memoria → top-3 → el modelo decide con la herramienta `usar_skill {nombre}` que carga el `SKILL.md` completo.
- `leer_recurso_skill {nombre, ruta}` para `references/`; `ejecutar_script_skill` para `scripts/` (python/node/ps1/sh con cwd de la skill).
- Funciona con modelos pequeños: si el modelo no llama herramientas bien, el enrutador inyecta la skill directamente cuando la confianza es alta.
- Presupuesto de contexto por modelo (los locales cargan menos).

### 1.5 Taller de skills 🔥 "APOLO aprende oficios" ✅
- "Enséñame a hacer X": APOLO observa lo que hacéis juntos y propone convertirlo en skill (borrador → pruebas → guardar).
- **Auto-mejora**: tras usar una skill, guarda qué falló; cada semana propone un diff de mejora (el usuario aprueba).
- Evals por skill: casos de prueba en `tests/` y comparativa entre modelos ("esta skill va bien con gemma, mal con qwen").
- Exportar/compartir una skill en 1 clic (zip + enlace).

### 1.6 Panel
- Página **Skills**: instaladas, marketplace, escáner, taller, uso por skill, activar por canal/modelo.

**Hecho cuando:** instalo una skill de anthropics/skills desde GitHub, el escáner la aprueba, y gemma la usa sola desde Telegram. Tests offline del índice, escáner e instalador.

---

## FASE 2 — Plugins / SDK

- `apolo-plugin` = paquete npm o carpeta con `manifest.json`: herramientas, canales, proveedores, vistas del panel, gestos del robot, voces, comandos.
- API estable y versionada (`@apolo/sdk`): `registrarHerramienta`, `registrarCanal`, `registrarProveedor`, `bus`, `memoria`, `tareas`, `permisos`.
- Aislamiento: cada plugin en su proceso (`child_process` + RPC), permisos declarados, sin acceso a claves ajenas.
- Recarga en caliente; plantilla `npm create apolo-plugin`.
- Migrar los canales actuales (Telegram, WhatsApp, Discord) a plugins internos = demuestra el SDK.

---

## FASE 3 — Manos de verdad (control del PC fase 3) 🟡 (2026-10-02: comprobar tras cada acción · "Lo que hizo" + time-lapse · macros por demostración · rejilla de visión ✅ · falta la prueba en vivo con el usuario)

- Bucle mirar → actuar → comprobar con registro de capturas en Mission Control (vídeo de lo que hizo).
- Prueba en vivo de `manos.ps1` con el usuario delante.
- Grabación de "macros por demostración": haces algo una vez y APOLO lo convierte en skill.
- Juegos y apps sin accesibilidad: detección por visión (qwen3.6 local).

---

## FASE 4 — Memoria v2 🔥 ✅ (2026-10-02: sueño ligera/REM/profunda, grafo, línea de tiempo, exportar/borrar, Wrapped con vídeo)

- **Fases de sueño** (por la noche): ligera (dedupe), REM (conectar recuerdos, detectar patrones), profunda (resumir en perfil). Informe "esta noche aprendí…".
- Grafo de personas/proyectos/cosas con vista visual en el panel.
- Línea de tiempo de tu vida digital (sesiones, correos, tareas) con buscador.
- Exportar/borrar todo en 1 clic (privacidad).
- 🔥 **APOLO Wrapped**: resumen semanal/mensual tipo Spotify Wrapped (tarjeta/vídeo vertical con el robot, horas ahorradas, tareas, racha, "tu modelo favorito"). Botón compartir → **cada usuario se convierte en anuncio**.

---

## FASE 5 — Canales y nodos

- **App móvil** (PWA primero, luego Capacitor): chat, aprobaciones con biometría, voz, notificaciones push, robot 3D.
- Nodos: otro PC, la Pi, un portátil → un solo APOLO, varios cuerpos ("ejecuta esto en el PC del taller").
- Canales nuevos: Slack, Signal, Matrix, SMS, correo como canal, iMessage (vía Mac nodo).
- 🔥 **Llamadas de teléfono**: APOLO te llama cuando algo urgente pasa, o tú lo llamas y hablas (Twilio/SIP + STT/TTS en streaming).
- Voz en tiempo real (barge-in, interrumpirle hablando) y STT ligero mejor que Whisper small (probar Moonshine / Parakeet / whisper.cpp con turbo q5).

---

## FASE 6 — Multi-agente y trabajo pesado 🟡 (consejo ✅ · turno de noche ✅ · dashboards ✅ · reuniones ✅ · faltan worktrees sueltos)

- 🔥 **Consejo de modelos**: una pregunta → Claude, GPT, Gemini y un local responden en paralelo → debaten → votan. Se ve en vivo en Mission Control. Contenido viral garantizado ("puse a 4 IAs a pelear").
- **Turno de noche** 🔥: le dejas una cola de encargos, trabaja mientras duermes (subagentes + worktrees git), y por la mañana te da un vídeo-resumen de 60 s con su voz.
- Worktrees por tarea de código, PR automático para revisar.
- ✅ Dashboards generados por el agente (core/dashboards.js + panel #/dashboards, fijables en Inicio; fuentes nucleo/http/herramienta/comando/agente).
- ✅ Reuniones (core/reuniones.js + panel #/reuniones): subtítulos en vivo de Meet/Teams/Zoom web vía la extensión, o audio local mic+sistema (WASAPI, grabar.ps1) → Whisper; resumen con decisiones/tareas/preguntas, tareas y recordatorios, envío al móvil, export .md. Falta probar con una reunión real.

---

## FASE 7 — El cuerpo 🔥🔥 *(lo que nadie más tiene)*

**Gancho:** "El agente open source que vive en tu escritorio… y en un robot que te imprimes."

1. ✅ (sin hardware probado; falta carcasa) **Ojo de escritorio**: GC9A01 + ESP32-S3 (cámara + micro + altavoz) imprimible en Ender 3. Muestra los ojos del casco, mira hacia quien habla, despierta con su nombre. Kit < 25 $.
2. **Casco físico**: imprimir `casco_robot.blend` con el visor como pantalla.
3. **Conexión con el humanoide** (proyecto robot InMoov propio): el mismo cerebro APOLO controla el simulador MuJoCo y luego el robot real. "Mismo agente, cuerpo nuevo".
4. Paquete de STL + firmware + guía en el repo → la comunidad maker lo hará viral sola (Printables, Reddit r/3Dprinting, TikTok).

---

## FASE 8 — Funciones virales extra 🔥

| Idea | Por qué se comparte |
|---|---|
| **Usa lo que ya pagas** — conecta tu plan de Claude / ChatGPT / Gemini en vez de API | "No pagues API nunca más" — titular solo |
| **100 % gratis y local** con Ollama | el público de r/LocalLLaMA |
| **Migra de OpenClaw en 30 s** (ya existe, pulir) | roba usuarios del rival directo |
| **Co-host de streaming**: el robot como overlay de OBS que reacciona al chat de Twitch/YouTube/TikTok y al juego | cada stream = anuncio en directo |
| **Time-lapse automático** de lo que hizo en tu PC, vertical con marca de agua | la gente sube sus clips |
| **Skins y personajes** (orbe mandala, casco, comunidad): voces, gestos, colores; marketplace | identidad, coleccionismo |
| **Modo gemelo**: aprende tu forma de escribir y responde como tú (siempre con aprobación) | "mi IA contesta mis WhatsApp" |
| **Botón de pánico físico** (Stream Deck / ojo ESP32) | demuestra que es seguro, muy visual |
| **Desafío "APOLO hace mi día"**: 24 h dejando que lleve tu correo/agenda/tareas | formato de vídeo para creadores |
| **Logros** del robot (primer encargo nocturno, 100 skills usadas…) que se desbloquean con gestos | gamificación + capturas |

---

## FASE 9 — Seguridad y confianza (argumento de venta)

> 2026-10-02: hecho auditoría propia (docs/seguridad/auditoria-2026-10.md), bóveda DPAPI, auditoría encadenada, kill switch global, SECURITY.md con modelo de amenazas. Pendiente: sandbox de SO para terceros, comparativa con datos verificados de OpenClaw, bug bounty.

- Modelo de amenazas público en `SECURITY.md`; bug bounty pequeño.
- Bóveda de secretos (DPAPI/Keychain), nunca en texto plano ni en prompts.
- Sandboxing opcional de shell (Windows Sandbox / contenedor) para skills de terceros. 2026-10-03: hecho por niveles (normal / restringido = Job Object + integridad baja / aislado = Windows Sandbox), ver docs/seguridad/sandbox.md; pendiente AppContainer, mac/linux y probar aislado en Windows Pro.
- Registro de auditoría firmado: qué hizo, con qué permiso, quién aprobó.
- Ventanas/sitios protegidos ampliables por el usuario. Kill switch global.
- Comparativa honesta "APOLO vs OpenClaw" en seguridad.

---

## FASE 10 — Producto y lanzamiento

**Imprescindible antes de lanzar fuerte:**
- ⬜ **Inglés** en UI, prompts y README (es/en), i18n preparado para más.
- 🟡 **macOS y Linux** (capa core/escritorio/so + docs/portabilidad.md): sustituir los `.ps1` por módulos por SO (capturas, manos, TTS, notificaciones).
- 🟡 Instalador `.exe` NSIS hecho (sin firmar; CSC_LINK preparado, docs/instalador.md), `.dmg` + AppImage configurados sin construir; asistente de primer arranque (elegir modelo, canales, nombre, voz) en < 2 min.
- ⬜ Web + docs (docs.apolo…), vídeo de 60 s, GIFs en el README.
- 🟡 CI: test.yml (Windows + Ubuntu) y release.yml (tag v* → GitHub Release + latest.yml); falta mac y changelog automático.
- ⬜ Telemetría **opt-in** anónima + informe de errores.
- ⬜ Comprobar marca "APOLO" (conflictos) y dominio.
- ⬜ Discord de comunidad (ya tenemos la base con BOT CENTRAL).

**Plan de lanzamiento:**
1. Beta cerrada (20–50 personas: makers + usuarios de OpenClaw).
2. Vídeo hero: robot físico + consejo de modelos + turno de noche.
3. Día D: Hacker News (Show HN), Product Hunt, Reddit (r/LocalLLaMA, r/selfhosted, r/ClaudeAI, r/3Dprinting), X, TikTok/Shorts con los 15 guiones de `lanzamiento/videos.md`.
4. Semana siguiente: APOLO Wrapped y co-host de streaming para la segunda ola.

---

## Orden de trabajo propuesto

1. **Fase 1** motor de skills (con escáner) ← ahora
2. Inglés + primer arranque (sin esto, lo viral no convierte)
3. Fase 2 SDK de plugins
4. Fase 6 consejo de modelos + turno de noche (demo estrella)
5. Fase 7 ojo de escritorio ESP32
6. Fase 4 memoria v2 + Wrapped
7. Fase 5 móvil + llamadas
8. Fase 3 manos fase 3
9. macOS/Linux + instaladores
10. Fase 9 seguridad → **lanzamiento**

---

# PLAN v0.2 → v1.0 (2026-10-03)

> Las 10 fases de arriba están cubiertas (v0.2.0). Ahora toca: **probar en real, lanzar, crecer la comunidad y llegar a v1.0** en Windows + macOS + Linux.

## Etapa A — Cerrar v0.2 (esta semana)
- [ ] WhatsApp y Discord como plugins (en curso) · sandbox de Windows para skills de terceros
- [ ] Push + `git tag v0.2.0` → release automática con el `.exe`
- [ ] **Pruebas reales pendientes** (contigo delante): manos en Bloc de notas + pánico · grabar demostración · OBS overlay + Twitch · Meet real + audio de Discord · móvil: QR, PIN, escritorio remoto · Slack/Matrix/Signal · plugin Telegram con flag · sueño de memoria con tu memoria real (con copia)
- [ ] Arreglar lo que salga de esas pruebas → v0.2.1

## Etapa B — Lanzamiento 🔥 (semana 2)
- [ ] Grabar el vídeo (docs/lanzamiento/guion-video.md) + 15 shorts
- [ ] Landing web (lanzamiento/web) en GitHub Pages con dominio, GIFs reales y botón de descarga
- [ ] Discord de comunidad (servidor propio APOLO, no BOT CENTRAL) con canales de ayuda, skills y showcase
- [ ] Beta cerrada 20–50 personas (makers + usuarios de OpenClaw) → formulario de feedback dentro de la app
- [ ] Día D: Show HN, Product Hunt, Reddit (r/LocalLLaMA, r/selfhosted, r/ClaudeAI, r/3Dprinting), X, TikTok
- [ ] Telemetría **opt-in** anónima + informe de errores (para saber qué falla en PCs ajenos)

## Etapa C — Calidad de producto (semanas 2–4)
- [ ] Tests E2E de la app Electron real (Playwright para Electron): arranque, isla, permisos, panel
- [ ] Prueba de resistencia 24 h (fugas de memoria, CPU/GPU en reposo, reconexiones)
- [ ] Textos del servidor traducidos (herramientas, errores, avisos) + portugués y francés
- [ ] STT ligero y preciso (pendiente desde el principio): probar Moonshine / Parakeet / whisper.cpp turbo
- [ ] Voz en tiempo real con interrupción (barge-in) en isla, ojo y móvil
- [ ] Certificado de firma de código Windows (quita el aviso de SmartScreen)

## Etapa D — macOS y Linux (semanas 3–6)
- [ ] Capa so/: capturas (ScreenCaptureKit / X11-Wayland), manos (CGEvent / ydotool), TTS, notificaciones, grabación de audio
- [ ] Builds .dmg firmado y notarizado + AppImage/deb; CI que los publique
- [ ] Hooks de Claude Code/Gemini/Codex con rutas por SO

## Etapa E — Ecosistema
- [ ] Publicar `@apolo/sdk` en npm + plantillas `npm create apolo-plugin` / skill
- [ ] **APOLO Hub**: web pública del marketplace con valoraciones, autores verificados (firma ed25519) y escaneo automático en CI de cada envío
- [ ] Guía de contribución, issues "good first issue", programa de autores de skills
- [ ] API pública documentada (OpenAPI) para integrar APOLO en otras apps

## Etapa F — Ganchos virales que faltan
- [ ] **Modo gemelo**: aprende cómo escribes y redacta como tú (siempre con aprobación)
- [ ] **Logros** desbloqueables con gestos del robot + Wrapped mensual automático
- [ ] **Skins y personajes**: el orbe mandala, el casco y los de la comunidad (voces, gestos, colores) en el Hub
- [ ] **Desafío "APOLO hace mi día"** (formato para creadores) + compartir time-lapses en 1 clic
- [ ] Llamadas de teléfono (Twilio/SIP): te llama si algo urgente pasa

## Etapa G — El cuerpo 🔥🔥
- [ ] Carcasa del ojo en Blender → STL para la Ender 3 V2 → montar el ojo real y probar firmware (pines, micro, SPI)
- [ ] Casco físico con pantalla en el visor
- [ ] **Mismo cerebro, cuerpo nuevo**: APOLO controla el simulador MuJoCo del humanoide y luego el robot real (proyecto robot-inmoov-propio)

## Etapa H — Seguridad de verdad
- [ ] Sandbox de Windows (esta semana) y equivalentes en mac/Linux
- [ ] Pentest externo + bug bounty pequeño
- [ ] SBOM y builds reproducibles; firma de releases
- [ ] Comparativa con OpenClaw rellenada con su documentación pública

## Etapa I — Inteligencia
- [ ] **Benchmark público APOLO vs OpenClaw**: 30 tareas reales, mismos modelos, resultados en la web
- [ ] Enrutador automático aprendido (qué modelo para qué, según tus resultados)
- [ ] Memoria de procedimientos: skills que nacen solas de lo que repites
- [ ] Multiusuario/familia: perfiles, permisos por persona

## v1.0 = cuando
Windows + macOS + Linux firmados · 0 fallos graves abiertos · 1.000 usuarios activos · 100 skills en el Hub · el ojo montado por la comunidad.

## Etapa J — 🎮 Modo Gamer (comunidad gamer) 🔥
> Regla de oro: **solo optimizaciones reales, medidas y reversibles**. Nada de placebo ("limpiadores de RAM", tweaks mágicos del registro) ni de apagar la seguridad (Defender, firewall). Cada sesión enseña el antes/después con datos.

**Al activarse** (a mano, por voz "modo gamer", o solo al detectar un juego a pantalla completa — ya existe la detección):
- [ ] Plan de energía de **máximo rendimiento** (y vuelta al tuyo al salir)
- [ ] **Modo juego** de Windows activado + **No molestar** (notificaciones en silencio)
- [ ] **Pausar lo que roba recursos en segundo plano**: OneDrive/Dropbox, Windows Update, descargas (Steam/Epic que no sea el juego), indexación; cerrar apps pesadas de una lista que tú apruebas (navegador con 40 pestañas, etc.)
- [ ] **Prioridad alta** al proceso del juego y afinidad sana (sin tocar procesos del sistema)
- [ ] El propio APOLO baja a mínimo: isla dormida a 6 fps, cerebro en pausa, permisos en cola sin interrumpir (salvo lo urgente por el móvil)
- [ ] Red: pausar descargas/actualizaciones para bajar el ping; aviso si algo satura la conexión
- [ ] **Todo se deshace solo al cerrar el juego** (registro de cada cambio, como la copia del sueño)

**Mantenimiento** (bajo demanda, nunca durante la partida):
- [ ] Limpieza segura: temporales, caché de shaders de DirectX/NVIDIA/AMD (se regenera), restos de instaladores — mostrando cuánto libera antes de borrar
- [ ] Revisar drivers de GPU desactualizados y enlazar la descarga oficial
- [ ] Revisar ajustes que sí importan: HAGS (programación de GPU por hardware), VRR/G-Sync, frecuencia del monitor bien puesta (¡144 Hz configurado a 60 es el clásico!), XMP de la RAM (solo avisar: es de BIOS), plan de energía
- [ ] Arranque de Windows: lista de programas al inicio con impacto real y desactivar con 1 clic (reversible)

**Medir de verdad** (el gancho viral: "APOLO me subió 23 fps y aquí está la prueba"):
- [x] FPS, 1 % low y frametimes con **PresentMon** (herramienta open source de Intel) + temperaturas/uso de CPU/GPU (nvidia-smi + contadores WMI sin admin; LibreHardwareMonitor descartado: necesita admin) — fase 2, core/gamer/presentmon.js + sensores.js
- [x] Benchmark antes/después del modo gamer en el mismo juego → tarjeta para compartir estilo Wrapped (core/gamer/bench.js + core/ui/gamer-tarjeta.js)
- [x] Alerta de **thermal throttling** ("tu GPU está a 88 °C y está bajando reloj: limpia el polvo")
- [x] Auto-activación opcional al detectar un juego a pantalla completa (cfg.gamer.auto, apagada por defecto)
- PresentMon usa ETW: necesita **admin** o estar en el grupo "Usuarios del registro de rendimiento" (SID S-1-5-32-559, una vez + cerrar sesión). Alternativa en el panel: "Medir como administrador" (UAC por captura)
- [ ] Overlay propio opcional (FPS + temps) con el robot en una esquina

**Extras para gamers**:
- [ ] **Coach**: con visión local (qwen3.6) comenta la partida o da consejos a demanda ("¿qué hago en este jefe?") — ya existe la base del comentarista del co-host
- [ ] **Clips automáticos**: con el buffer de repetición de OBS, guarda los últimos 30 s cuando el robot detecta un momento épico o tú dices "clip"
- [ ] Perfiles por juego (ATS, Fortnite, etc.): qué cerrar, qué prioridad, qué overlay
- [ ] El robot reacciona al juego (gestos al ganar/perder) y en el Stream Deck un botón "modo gamer"
- [ ] Estado en Discord ("jugando a X con APOLO")
