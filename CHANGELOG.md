# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.3.8] - 2026-11-15

### Fixed
- The «Estudio de vídeo» tab only worked on the author's PC (hard-coded paths to a private studio). It now uses the studio shipped with the estudio-creativo skill 1.1.0 (`scripts/estudio.py` + the ComfyUI Python written by its setup); `cfg.estudioVideo` still overrides it.
- If estudio-creativo is installed but not set up (or too old), the tab shows what is missing instead of disappearing.

## [0.3.7] - 2026-11-15

### Fixed
- Skill setup could hang forever while installing Python packages: pip on Windows sometimes crashes ("access violation") or freezes while checking certificates with the system store. pip now has a timeout and retries, falls back once to `--use-deprecated=legacy-certs`, and any step silent for 15 minutes is stopped with a clear message.

## [0.3.6] - 2026-11-14

### Fixed
- A skill that needs setting up (models, programs) could end up **active but never set up**, so nothing happened: only the DMN Library tab opened the setup. Now the skill page shows **«This skill needs to be set up · Set up now»** (or the progress), and the setup window opens by itself when the skill is installed from Explore, a link or a folder, or when it is enabled.

### Added
- APOLO warns when a skill is not set up yet and can set it up itself with the new `preparar_skill` tool (always asks for permission).

## [0.3.5] - 2026-11-14

### Added
- Optional **local download mirror** for skill setup (`skills.espejo`): another PC at home running `tools/espejo-recursos.js` serves models by sha256, so they are not downloaded twice. Files are still sha256-checked; if the mirror does not have them, APOLO uses the original URL.

### Fixed
- Mission Control: the "Create your own" fields can be typed in again (clicking a field redrew the screen and jumped to the top).
- Installer and skill setup on a fresh Windows: winget now uses `--source winget` (the msstore source failed with 0x8a15005e and nothing got installed), and its real error is shown.
- Skill setup warns that Windows will ask for administrator permission when installing programs, and explains what to do if it is cancelled.
- Skill scripts read JSON with or without a BOM (files written by PowerShell 5).

## [0.3.4] - 2026-11-14

### Added
- Skill setup can declare **external requirements** (things only you can install: Roblox Studio, ArtCraft apps, a ProtoForja account, Blender) with a link; they show on the library card and in the setup window.
- `documentos` sets itself up: Python libraries for Word, Excel, PowerPoint and PDF in its own environment, used automatically by its scripts.
- Blender can be detected and installed by skill setup (any installed version is found).

### Changed
- Library skills no longer contain the author's personal examples or paths (taller-hardware, documentos, suite-craft).

## [0.3.3] - 2026-11-14

### Added
- **DMN Library** (Skills → DMN Library): official skills from [DMNENGINE/apolo-skills](https://github.com/DMNENGINE/apolo-skills), signed by DMNENGINE (shown as verified without any setup) and scanned. 21 skills at launch: design, maker, office, marketing, development and creativity.
- **Automatic setup** for skills that need models or programs (`preparar.json`, `apolo-preparar/1`): APOLO checks your GPU, RAM and disk, shows every step and download size, and with one click installs programs (closed list, via winget), clones repos, creates Python environments, downloads models (resumable, sha256-checked) and pulls Ollama models. Shared folders so models download once; choose the drive from the setup window. If APOLO restarts in the middle, the setup resumes on its own. Free-form commands are not allowed and the scanner flags any plan that tries them.
- **Creative Studio** (`estudio-creativo`): photos with FLUX.1 schnell and short videos with Wan 2.2 (text or image to video) on your own NVIDIA GPU.
- APOLO knows what you did these last days with all your agents.
- `tools/publicar-skill.js` for maintainers: private-data cleaner + scanner + signature + index before publishing a skill.

### Fixed
- Skill scripts use the real Python install (not the Microsoft Store shortcut), even right after installing it.
- Removed local paths and LAN details from the suite-craft and video-tutorial-pc skills.

## [0.3.2] - 2026-11-14

### Added
- **SnapGrab**: save photos, videos and audio from Instagram, X, Spotify and YouTube from the APOLO menu (Ctrl+Alt+right click) or by pasting a link, with a gallery to keep only the originals you pick. Instagram is read through your own Chrome profile and the extension, without copying sessions.
- **Learning from DeepSeek Harness** sessions (`~/.dsh`), split into chunks so long projects are not lost.
- **Light mode for your own model**: a provider marked `ligero` chats, and anything that needs hands (files, web, generating photos/videos, skills) is routed to the model with tools.
- Dataset generators for the own model (v3–v5 identity, APOLO-MANOS tool calling).

### Changed
- **The helmet plays all 100 animations on its own**: a shuffled deck with no repeats until every one has played (it resumes after a restart), also while asleep, with long scenes every 5–8 minutes.
- `usar_skill` insists on loading the matching skill instead of answering «I can't».
- The spiders report real coverage and evidence; Ctrl+Alt+right click respects the target window and shows errors.

### Fixed
- Security updates for undici, nodemailer, mailparser and ip-address.
- The Prompts page is reachable from the side menu.

## [0.3.1] - 2026-11-10

### Added
- **What's new, in the island**: the first time you open a new version, the island opens with a card telling you what changed and the helmet plays **all its animations one after another** (100, about 12 minutes), with the name of each one and a progress bar. It pauses while APOLO works or asks for permission and repeats the one it cut. «Skip animations» stops it and «See again» replays it. With reduced motion, or with a character/avatar instead of the helmet, only the card is shown. It appears once per version.

## [0.3.0] - 2026-11-10

### Added
- **The helmet comes alive**: 6 new expressions (curious, suspicious, focused, excited, shy, angry), autonomous routines while idle and **100 animations in 10 families** (emotions, curiosity, rest, games, visor, maintenance, transformations, space, music, magic). 33 of them are mechanical scenes where the helmet comes apart and puts itself back together. Softer eyes and eyelids, elasticity and inertia when it moves. An **interactive gallery** in the panel lets you play each one. Interactions, tasks, permissions, reduced motion, Gamer mode and panic always interrupt them.
- **Digital spiders**: they crawl out of the helmet to read a page word by word, detect AI-written text, review code, watch Discord or scan GitHub/Hugging Face, with a report panel that points to each sentence.
- **APOLO menu**: Ctrl+Alt+right click anywhere opens a toolbox next to the cursor with actions for what you selected (video, image, audio, code, text, folder, browser), a free prompt and your own saved actions.
- **Codex CLI** sessions and permissions in the island, Mission Control, Stream Deck and phone (hooks, same format as Claude Code).
- **WhatsApp you can program**: reply rules, scheduled messages with text, photos or voice notes in APOLO's voice, and an agenda.
- **Prompts lab** tab with your prompt bank and an isolated live preview.
- **From a source to a skill**: give APOLO a link, a video or a text and it drafts a skill in the workshop, scanned like any other.
- **Binary analysis** tool (`analizar_binario`) and the *ingenieria-inversa-pe* skill: inspect a Windows .exe/.dll without running it. New *venta-prompts* skill.
- **Voice**: Whisper runs on the GPU when there is room, end-of-turn detection (Smart Turn) and an optional local voice. Meetings tell speakers apart. Optional memory reranker.
- **Video editor**: upload any video from your PC, «Editar ya» jumps the queue, silent videos get an audio track.
- Optional **model training** on your own Proxmox server and a dataset generator built from your conversations with open models.

### Changed
- Training, the dataset generator and the Discord spider stay **off until you configure them** (`entrenamiento.ssh`, `dataset.maestro.url`, `aranas.discord.ssh`); APOLO no longer tries to reach any host by default.
- The installer retries the Electron download without cache, falls back to the official zip and tells you when an antivirus quarantined it.

### Fixed
- The APOLO menu no longer closes the moment it opens.

## [0.2.9] - 2026-10-15

### Added
- **Mission Control world**: a live pixel-art map next to the classic list (Mundo | Lista). APOLO is the boss wizard: he conjures at the core when there is work and otherwise patrols the rooms commenting on what he sees and giving orders in speech bubbles. Every real agent is a character with its model's avatar (Claude, ChatGPT, Gemini, an Ollama llama, DeepSeek…); connected models roam the whole map and walk to their task when used. Subagents go to Leonardo's workshop, scheduled tasks to the 3D-printer room, plugins are goblins in the server room.
- **Claude Code, Gemini CLI and opencode sessions** show up in Mission Control as agents (state, tool, pending permission, model, tokens).
- **Tool effects**: web search sends a data stream from the core and wraps the agent in a globe aura; memory, subagents, terminal, files, screen and MCP each have their own aura and bubble icon; MCP calls light up the **MCP lab** (floor portal, robotic arms firing lasers, an object materialising).
- **Your online services in the server racks**: websites (HTTP), systemd units and pm2 apps over SSH, TCP ports — checked every minute, LED per service, floor plate per rack, red alarm when something goes down. Discord bots get their own avatar and personality and walk around.
- Dynamic lighting, particles, floor signs, holographic cards on tap, HUD with CPU/RAM/tokens, E-STOP and panic.
- **Create your own world**: describe it and APOLO generates it, or pick one from the gallery (Dungeon, Alien hive, Inferno, Science station). New **mission-control skill** turns a reference image into a world (validate, screenshot, compare, apply).
- **Internet Archive tools**: search archive.org, read books page by page or search inside them, Wayback Machine snapshots, download items.

### Changed
- Memory graph: the side panel is gone; tapping a node opens a holographic card next to it.

## [0.2.8] - 2026-10-15

### Added
- **Import your ChatGPT history**: Settings → Import → ChatGPT → pick the unzipped export folder. Only *your* messages are read, in the browser (ChatGPT's replies and chats marked "don't remember" are dropped); the brain model turns them into memories in the background, with pause/continue and keys masked automatically.
- **3D memory graph**: a free-flying 3D space (rotate on every axis, pan, zoom, fly with WASD/QE, touch gestures) with glowing orb nodes, stars and depth. Tap a node and the camera flies to it; **right click (long press on phone) isolates a node with only its connections**. A 2D button keeps the flat view.
- **Nerve impulses**: light pulses travel along the connections, nodes light up from inside when one arrives and fire on in cascades; lone nodes breathe and spark on their own.
- **APOLO live in the graph**: **red impulses show in real time which memories APOLO reads or saves** while it answers you, with a "APOLO read / saved …" log.
- **Memories of the past**: memories that are no longer current can stay as part of your story (shown as "past", dashed in the graph) instead of being deleted; new facts never overwrite them.
- Graph **Summary** view (the ~120 most important nodes) and a **The past** toggle.

### Changed
- The always-on profile now takes at most 60 % of the memory context, so relevant memories always fit.

### Fixed
- The graph no longer turns years, generic acronyms (ID, IP, VIP…) or sentence starts ("Between 2024", "Uses Windows") into nodes; existing ones are cleaned up automatically.
- The 3D graph no longer goes dark when you zoom far out.

## [0.2.7] - 2026-10-11

### Added
- **Animated 3D characters in the island**: instead of the helmet, the island can show a full-body 3D character with its own animations for every state and gesture (idle, working, asking permission, waving, celebrating, happy, sad, sleeping, dizzy, surprised, thinking, yawning, running between monitors). Its head follows your cursor and it blinks. Two to start with: **BlueGuy** and **Turista**. Choose it in Avatar → "Face in the island".
- **Size slider for the island**: make the helmet, avatar or character smaller or bigger (60–160 %). It grows away from the screen edge so it never gets cut off.
- Any character dropped in `app/personajes/` (a `.glb` with its `.json`) shows up by itself in the character picker.
- **APOLO's soul (SOUL.md) and inner life**: a personality APOLO can evolve, an optional "Mind" panel (mood, goals, nightly journal) and a first conversation where it gets to know you.

### Changed
- Voice and microphone no longer need Python: neural voice runs natively and speech-to-text uses whisper.cpp.
- The default model is whatever is already installed on the PC instead of guessing.

### Fixed
- The character/helmet picker used a dropdown whose options were invisible in the dark theme; it is now a row of buttons.
- Long prompts to Claude Code no longer fail with "spawn ENAMETOOLONG".
- `navegador_abrir` works when Chrome has no windows open; the island session rotates after 4 h.

## [0.2.6] - 2026-10-05

### Added
- **`apolo` in your terminal**: an interactive command-line chat in the style of Claude Code (live tools, permissions with 1/2/3, pasted text, an animated helmet that blinks, follows what you type and falls asleep). `apolo -p "..."` for one-shot answers and pipes; `apolo --simple` keeps the old CLI. The installer and the one-line install add `apolo` to your PATH.
- **opencode as an engine**: APOLO can approve or deny opencode's permission requests from the island, Discord, phone or Stream Deck, like it does with Claude Code. Install it from the tray menu.
- **Open design skills (MIT)**: 9 skills so any agent designs with good judgment — fundamentals, accessibility, login and forms, onboarding, checkout, dashboards, marketing sites, navigation and states, and design review. Find them in Skills → Explore.
- **Design library (optional)**: connect your own Mobbin account and APOLO can study interface patterns from real apps before designing (Control panel → Design).
- **Linux (early)**: the app starts on Linux, with `install.sh` and the updater. Still a first version.

### Fixed
- Design panel: if the core is outdated (app not restarted) it says so instead of showing a blank page.

## [0.2.5] - 2026-10-05

### Changed
- The 3D helmet is APOLO's face again by default. Using an avatar instead (island, panel and streaming overlay) is an option: Avatar Studio → "Use avatar instead of the helmet". When on, it uses APOLO's avatar, or yours if APOLO has none.

### Fixed
- Do Not Disturb while gaming no longer throws away what it silences: answers, reminders, messages and urgent notices are kept with their text and shown when you stop playing.

## [0.2.4] - 2026-10-05

### Added
- **One avatar everywhere**: the avatar you pick is now your face across the whole app. It replaces the 3D helmet on the floating island and the streaming overlay, and appears as the companion in the panel (sidebar, chat, Home, onboarding). Changing it updates everywhere live.
- **Floating island appearance**: pick its look in Settings → Appearance → Floating island — *Glassmorphism*, *Liquid glass* or *Solid color*, with a custom background color and border color/width, applied to the island live. You also choose the style on first run (new onboarding step).
- **Do Not Disturb while gaming**: with Game Mode active, APOLO's own notifications (cards, mentions, Gmail, channel messages, answers) are silenced — no pop-ups or sounds. When you leave, the island shows a summary of what you missed.

### Changed
- The floating companion follows your chosen avatar by default (the 3D helmet is used only until you pick one).

## [0.2.3] - 2026-10-05

### Added
- **Control panel → About**: links to the GitHub repository, the website (apolocompanion.com) and the release notes; it now shows the APOLO version next to the core version (also in the settings sidebar).

## [0.2.2] - 2026-10-05

### Fixed
- **Updates**: "Update now" seemed to do nothing. The .exe now shows *Downloading N %* → *Installing* on the island, and on failure the reason, **Retry** and a manual link. The one-line install launches its updater outside APOLO (it could die together with the app when APOLO ran inside a Windows job). `install.ps1` closes APOLO's helpers, waits and retries, so a locked file no longer leaves a half-deleted install. **Users on 0.2.1 or older must update once by hand** (download the new .exe, or run the install line again).
- **Desktop control**: screenshots could fail with a GDI+ error (the agent then fell back to shell commands); clicks that would land outside the active window (e.g. behind a *Save as* dialog) are refused; typing into an already focused field no longer clicks first (text came out of order); the check after typing now reads the field's text (it reported "nothing changed" and the model typed twice).
- **Go to terminal** works with Windows Terminal (from the island and the Stream Deck).
- Meeting summaries are written in the app language. "Review skill" opens that skill.
- Telegram plugin keeps the migrated chat link across restarts.

### Added
- **Several models at once from the island**: `gemma + chatgpt: question` shows every answer side by side; new **?** button with all the shortcuts.
- **Stream Deck 1.1**: 11 keys — panic/resume, microphone, open panel page, quick message, live plan usage, move island, go to terminal, Gamer Mode.
- **Speech-to-text**: personal vocabulary (Settings → Channels → Voice), the app language for the microphone and a hallucination filter (13.7 % → 9.5 % word error rate on our test set, 6 % with personal words).

### Changed
- Telegram and WhatsApp run only as isolated plugins (the old built-in versions were removed; existing links and sessions are migrated automatically).
- No hard-coded paths of the author's machine (MCP snippet uses the real install path).

## [0.2.1] - 2026-10-04

### Added
- **Island**: drag it anywhere (hold the robot ~0.3 s or drag the bar/header), on any monitor; it remembers the spot and opens toward the free side (bottom → up, right → left). Tray: "Reset island position".

### Fixed
- Island: the invisible area around the open island no longer blocks clicks (real click-through, only visible parts catch the mouse).
- Phone remote desktop failed with `n.remoto.http is not a function` (name clash with the Raspberry Pi actions).
- Wrapped PNG / ZIP / MP4, night-shift video and time-lapse failed with `WebSocket is not defined` inside the app (Electron 33 runs Node 20).
- Plugins crashed on Node 20–22.12 (experimental permission model); skill export to .zip was incomplete on Node 20.
- Desktop-eye server could hang on shutdown (open WebSocket sockets).
- Releases: one single release per tag with notes from this changelog (v0.2.0 had been published twice).
- CI now also tests on Node 20, the version the app actually runs on.

## [0.2.0] - 2026-10-03

### Added
- **Universal skills engine**: install any `SKILL.md` skill (Claude Code, Codex, Cursor rules, `AGENTS.md`, OpenClaw imports) and use it with any model, including local ones.
- **Skill antivirus**: every new skill/plugin is quarantined and scanned (prompt injection, credential theft, `curl | sh`, obfuscation, persistence, binaries) with a human-readable verdict.
- **Skills marketplace** in the panel, **ed25519 signatures** for skills and plugins, and a **skill workshop** (create from a conversation, learn from failures, propose improvements, evals across models, export).
- **Plugin SDK** (`@apolo/sdk` 1.0) with one isolated process per plugin and declared permissions/secrets; official plugins: weather, Telegram, Slack, Matrix, Signal.
- **Model council**: several models answer, debate and vote live in Mission Control.
- **Night shift**: queue tasks, each runs in its own git worktree while you sleep (never pushes), morning report + 60 s vertical video.
- **Memory v2**: sleep phases (off by default), knowledge graph, timeline, export/erase everything; **APOLO Wrapped** shareable cards and video.
- **Mobile PWA**: QR pairing, per-device tokens with limited scope, approvals with PIN or passkey, push, voice, and **remote desktop** (off by default, approved from the PC).
- **Desktop eye**: ESP32-S3 + GC9A01 firmware, WebSocket nodes, simulator, buy list (~25 $).
- **Hands phase 3**: verify after every action, "What it did" timeline with time-lapse export, macros by demonstration, numbered grid for apps without accessibility.
- **Meetings**: Google Meet/Teams/Zoom web captions or local audio (mic + system) → transcript, summary, decisions and tasks.
- **Agent-built dashboards** with native SVG charts.
- **Streaming co-host**: OBS overlay with the 3D robot, Twitch/YouTube chat, polls, alerts, panic.
- **Security**: DPAPI vault for API keys, hash-chained audit log, single panic switch everywhere (Ctrl+Alt+Esc), anti-exfiltration prompt for new domains, Host/Origin checks, hardened danger detection.
- Bilingual UI (English/Spanish) and first-run wizard.
- Windows installer (NSIS, per user, no admin) with auto-update from GitHub Releases; CI on Windows and Ubuntu.

### Fixed
- "Always allow" for shell no longer lets chained or wrapped commands through.
- Sensitive paths (token, config, `.env`, `.ssh`) always ask before being read.

## [0.1.0] - 2026-10-01

### Added
- Floating island with an animated 3D robot and 20+ gestures.
- Permission control for Claude Code and Gemini CLI from the island, Discord, Stream Deck and mobile.
- Multi-model core: agent loop, tools, semantic memory, scheduled tasks, subagents, context compaction and Mission Control.
- Browser extension (MV3) with per-site permissions.
- Screen reading and mouse/keyboard control with a panic stop.
- Web control panel, MCP server, and a Discord bot (PC or Raspberry Pi).
- Neural voice replies and speech input.
