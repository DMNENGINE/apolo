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

## FASE 1 — Motor de skills universal 🔥 ✅ (falta firma ed25519 y marketplace en panel)

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

## FASE 6 — Multi-agente y trabajo pesado 🟡 (consejo ✅ · turno de noche ✅ · faltan worktrees sueltos, dashboards, reuniones)

- 🔥 **Consejo de modelos**: una pregunta → Claude, GPT, Gemini y un local responden en paralelo → debaten → votan. Se ve en vivo en Mission Control. Contenido viral garantizado ("puse a 4 IAs a pelear").
- **Turno de noche** 🔥: le dejas una cola de encargos, trabaja mientras duermes (subagentes + worktrees git), y por la mañana te da un vídeo-resumen de 60 s con su voz.
- Worktrees por tarea de código, PR automático para revisar.
- Dashboards generados por el agente (widgets en el panel a partir de datos: correo, GitHub, uso…).
- Reuniones: une a Meet/Zoom/Discord voz, transcribe, resume, saca tareas.

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
- Sandboxing opcional de shell (Windows Sandbox / contenedor) para skills de terceros.
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
