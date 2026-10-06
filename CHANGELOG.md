# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

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
