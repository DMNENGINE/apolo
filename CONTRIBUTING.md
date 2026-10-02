# Contributing to APOLO

Thanks for wanting to help! Issues and pull requests are welcome, in English or Spanish.

## Development setup

```powershell
git clone https://github.com/DMNENGINE/apolo.git
cd apolo
npm install
npm start          # runs the Electron app
cd core; npm test  # core tests (no network or models needed)
```

## Guidelines

- **Keep it dependency-light.** The core (`core/`) has zero runtime dependencies. Please keep it that way.
- **Match the surrounding style:** plain JavaScript (CommonJS in `core/`, ES modules in `app/`), 2-space indent, and short comments that explain *why*.
- **Safety first.** Anything that runs commands, touches files, the screen or the browser must go through the permission system. Never log or store secrets.
- **Add tests** in `core/test/` for core changes, and make sure `npm test` passes.
- **Keep PRs small,** with one topic each, and describe how you tested them.

## Reporting bugs

Open an issue using the **Bug report** template. Include your Windows version, Node version, and the steps to reproduce.

For security issues, see [SECURITY.md](SECURITY.md); please do not open a public issue.
