# Security Policy

APOLO can run commands, control the browser, and use the mouse and keyboard, so security reports matter a lot to us.

## Reporting a vulnerability

Please **do not open a public issue.** Instead, use GitHub's [private vulnerability reporting](https://github.com/DMNENGINE/apolo/security/advisories/new).

Include:
- what is affected and how to reproduce it;
- the impact (for example, permission bypass, token leak, or remote access);
- your suggested fix, if you have one.

You will get an answer within a few days.

## Supported versions

Only the latest release on `main` receives security fixes.

## Design principles

- The local API binds to `127.0.0.1` and requires a token.
- Dangerous actions always require explicit user approval.
- Secrets are never stored in memory or sent to the UI.
