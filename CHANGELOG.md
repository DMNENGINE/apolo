# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

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
