# CLAUDE.md

## What is BugText

A fast, lightweight markdown editor built with Tauri 2 + Rust. **Clean-room rewrite**
— independent, MIT-licensed. Same eventual feature set as the Kaelio editor, but
written from scratch with a modular architecture and refined UI. License: MIT.
Identifier: `com.kael.bugtext`. Shipped features are listed in `CHANGELOG.md`.

**Before changing a feature area, read its paragraphs in `ARCHITECTURE.md`** (search it
for the feature name). Do not read the whole file by default.

## Clean-room rule (do not violate — this is the legal basis of the project)

BugText must stay legally independent of Kaelio / mx / Vibery Studio (those are
GPL-3.0). Therefore:

- **Never copy, paste, or port code or CSS from Kaelio.** Not a single line.
- Kaelio (`/Users/cong.bui/Kael/20-Projects/kaelio`) may be **read only as a behavior
  reference** — to learn *what* a feature does and *how it behaves* — then a fresh
  implementation is written from understanding, not from the source text.
- No names "mx", "Vibery", "Kaelio", or attribution to them anywhere in source, UI,
  or docs.
- This rule applies to every contributor, human or AI (including Codex).

### How to reference Kaelio correctly

When you want a feature to behave like Kaelio's: open the relevant Kaelio file by
absolute path, study the behavior, describe it in your own words / as a spec, then
implement fresh in BugText. Do not keep Kaelio source open while typing BugText code,
and never paste from it. Do not add Kaelio as a submodule or copy its files in.

## Working style (from global rules)

- Keep it simple. No premature abstraction. Small, focused files (one responsibility).
- Spec-driven: spec → plan → build → test → document, in order.
- Solo dev — favor low-risk, incremental, always-shippable steps.
- Any bug fix must update `CHANGELOG.md` in the same change, unless the user
  explicitly says not to.

## Commands

- `npm install` — install JS deps. Native postinstalls are allowed through
  `allowScripts` in `package.json`.
- Build/test/check commands are the standard ones — see `package.json` scripts and
  `src-tauri/` for cargo. `npm run test` covers pure functions and UI behavior with a small DOM fixture.

## Architecture

Tauri 2 + Rust native shell; plain-TypeScript frontend (no framework) wired by a
thin `main.ts`. One responsibility per file. Details per feature: `ARCHITECTURE.md`.

Rules that hold everywhere:

- **Untrusted text never reaches `innerHTML`.** Rendered Markdown goes through
  `src/sanitize.ts` first; user strings (file, font, theme, model, template names)
  use `textContent` / `.value`.
- **The webview runs under a strict CSP** (`tauri.conf.json`), enforced only in
  release builds; check policy changes with `npm run tauri build -- --no-bundle`.
- **Rust confines paths.** Commands that act inside the open folder canonicalize and
  check the path (symlinks included) before reading or writing, and write atomically.
- **Writes behind the user's back get a Recovery snapshot first**, and open tabs change
  through the editor (dirty state, one undo step), never by writing under them.
- **API keys live in the OS keychain**, never in `agent.json` or logs. Connection
  addresses require HTTPS, except loopback HTTP.
- **Coding CLIs** run only through the typed `ai_run` spec: Rust builds the arguments,
  prompts go on stdin, and macOS runs are sandboxed with no unsandboxed fallback.
- **Shortcuts:** the command/file palette is `⌘K` only; `⌘P` is the preview toggle.
  Command ids in `keymap.ts` match the native menu item ids in `menu.rs`.
- **Settings** live in `<app config dir>/settings.json`, AI settings in `agent.json`.
- **Build number:** `bundle.macOS.bundleVersion` in `tauri.conf.json`. Raise it by one
  for every build handed out, even when the version is unchanged; never reuse one.
- **Heavy engines load on demand** so the startup chunk stays under the 800 kB
  warning limit in `vite.config.ts`.
- Document PDF/DOCX export needs `brew install pandoc typst`.
