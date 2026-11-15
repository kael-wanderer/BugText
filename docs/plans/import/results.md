# Import — results

Branch `feat/import` from `d7c6a36` (main), built from `plan.md` in this folder (reading workflow Phase 5b, spec 5.5). Merged to `main` on 2026-11-15 (`dddb8c6`) and pushed; not tagged or released; `bundleVersion` unchanged; no DMG built. No new dependencies.

## Status

All 7 tasks are built and every automated check passes. Fable ran the security review from `review-request.md` (no Critical, 1 Important, 9 Minor; see "Review fixes"). The manual cases IMP-01..14 in `docs/test-cases/32-import.md` were run on 2026-11-15 in `npm run tauri dev`: all pass, findings under "Manual run".

## What was built, per task

| Task | Commit | What |
|---|---|---|
| 1 | `5044e5a` | `import_web.rs`: `check_address`, `public_ip` (IANA special-purpose IPv4/IPv6, embedded IPv4), `vet`, DNS-pinned client (`resolve`, `https_only`, `no_proxy`, `Policy::none`), manual redirects (4 requests), HTML-only, 5 MB cap, SHA-256 digest. |
| 2 | `76bfb08` | `import_files.rs`: `import_html_to_markdown` (Pandoc `--sandbox`, stdin), `import_probe`, `import_read_csv`, `import_copy_original`, `import_word` (fresh temp dir, `place_media`). Helpers in `assets.rs`, `export.rs`, `templates.rs` made `pub(crate)`. |
| 3 | `509b333` | `src/import/clean.ts` `cleanPage` (inert `DOMParser`). |
| 4 | `8115465` | `csv.ts` (`parseCsv`, `csvTable`), `note.ts` (`importedNote`, `nameFrom`, `defaultSavePath`, `earlierImport`). |
| 5 | `e8c69ef` | `run.ts` `importWeb`, `importFile`. |
| 6 | `c52159e` | `sheet.ts` `importUI`, lazy `host.ts`, File ▸ Import submenu (`menu.rs`), three keymap entries and palette items, CHANGELOG. |
| 7 | (this commit) | ARCHITECTURE paragraph, HELP paragraph, IMP-01..14, feature map row, this file. |

## Checks (2026-11-15, at the Task 7 commit)

- `npx tsc --noEmit`: clean.
- `npm run test`: 292 files, 1,645 tests passed (1,596 at branch start).
- `cargo test`: 253 passed, 4 ignored (17 new: 6 in `import_web`, 11 in `import_files`; the Pandoc ones ran, Pandoc 3.11 installed).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `npm run build`: startup chunk `main-*.js` 661.70 kB against 660.50 kB at branch start: +1.20 kB (budget +2 kB). Code alone +1.01 kB (661.51 kB at Task 6); the rest is the HELP paragraph. `src/import/` is a lazy chunk (`host-*.js` 11.3 kB).
- `npm run tauri build -- --no-bundle`: built at Task 6. CSP unchanged.

## Rulings (from the ledger)

- Pre-flight: Task 5 consumes Tasks 1–4 and Task 6 consumes Task 5; shapes match. No conflicts.
- T1: `public_ip` also refuses 192.88.99.0/24, IPv4-compatible `::/96`, `fec0::/10`, Teredo `2001::/32` and `100::/64`. Stricter is safe. Cost: a rare public host in one of these ranges is refused.
- T1: hosts read with `host_str` plus an `IpAddr` parse instead of `url::Host`, because `url` is not a direct dependency and the plan forbids adding it. Cost: none known.
- T1: no CHANGELOG line until the feature was visible (Task 6).
- T2: originals go to `confined_dir(<note dir>, "<images folder>/originals")` after `valid_folder(images_folder)`, not `image_dir` with a two-part folder. This keeps `valid_folder`'s two-segment limit for paste and drop, and `confined_dir` checks each existing step before creating anything. Cost: none known.
- T2: `place_media` rewrites image destinations in one pass over parsed `![..](dest)` references through a map (the absolute temp form and the `media/…` form), not by string replace. A chained replace could rewrite an already-rewritten link when the images folder is `media`. Cost: an image Pandoc writes in another syntax keeps its temp link and is then dropped.
- T2: three fixed strings the plan did not name:
  - Confinement errors: "The import must stay inside the open folder."
  - More than 200 media files: "Only the first 200 images were kept."
  - An image over 25 MB: "<name> is larger than 25 MB."
- T2: added the tests `read_csv_keeps_the_bom_and_caps_size`, `place_media_accepts_the_relative_form` and `probe_digest_is_sha256_of_the_bytes`.
- T3: the title is read before chrome is removed, so an `h1` inside `header` still names the page. An element other than `<a>` or `<img>` loses an `href` or `src` that is not allowed instead of being removed.
- T4: `parseCsv` skips every blank line, not only a trailing one, and only `<` is escaped in cells. Cost: a CSV whose blank lines mean empty rows loses those rows.
- T4: `earlierImport` returns the index path (absolute) and checks that the note is inside the folder by the prefix `<folder>/`.
- T5: the web sheet opens with an empty Save to. Empty means the active note's folder plus a name from the page title, decided after the fetch, because the title is unknown before then. Word and CSV open with `defaultSavePath(active, nameFrom(stem))`.
- T5: the digest check after a fetch is skipped when the owner already chose Import Again on an address match, so each import asks at most once.
- T5: the original is copied before the file is converted or read. Cost: a Pandoc failure after the copy leaves the copied original in `originals/`.
- T5: a rejection that is not a string, or is 300 characters or longer, becomes "The import did not finish."
- T6: the `ImportDeps` builder lives in lazy `src/import/host.ts`; `main.ts` passes a small host, as with `recipes/host.ts`.
- T6: `importUI(host, { label, openNote })` takes those two options. Open Note and the folder-relative paths need them.
- T6: no `styles.css` change. The sheet reuses the `organize.css` classes.

## Review fixes (Fable: no Critical, 1 Important, 9 Minor; verdict "fix first")

- Important 1: a Word import ran `--extract-media` on an untrusted `.docx` with any installed Pandoc; Pandoc 1.13–3.1.5 can write outside the media folder (CVE-2023-35936, CVE-2023-38745). `import_word` now reads `pandoc --version` and refuses below 3.1.6 with "Importing Word documents needs Pandoc 3.1.6 or later." Test `pandoc_version_floor_for_word` RED→GREEN. The web path already used `--sandbox` with stdin.
- Minor 5 (taken, as the review suggested): a folder switch during an import created the note in the old folder and indexed it in the new one. The flow now fails with "The folder changed. Nothing was imported into the new folder." before `create`. Test RED→GREEN.
- Minor 7 (taken): `{` and `}` are removed from default names, so a title holding `{{title}}` or `{{date}}` is not filled by `outputPath`. Test RED→GREEN.
- Minor 8 (taken; a one-line fix that otherwise corrupts tables): a backslash in a CSV cell is escaped before the pipe, so `a\|b` stays one cell. Test RED→GREEN.
- Checks after the fixes: tsc clean; `npm run test` 1,647 passed; `cargo test` 254 passed, 4 ignored; clippy clean; startup chunk 661.70 kB (unchanged).

## Deferred minors (Fable review)

2. `public_v6` is a deny-list; `64:ff9b:1::/48`, `::ffff:0:0:0/96`, `2001:2::/48`, `2001:10::/28`, `2001:20::/28`, `3fff::/20` pass. Suggested: allow only `2000::/3` minus the special ranges.
3. DNS pin relies on reqwest matching the override key; a second lock would check `response.remote_addr()` against the vetted IP.
4. Pandoc has no time limit and the busy sheet's Cancel is disabled; a hanging file leaves "Converting…" forever.
6. (Disagrees with ruling T5) a Pandoc or CSV failure after the copy leaves the original in `originals/` and does not say so.
9. Pages in other charsets (Shift-JIS, windows-1252) are decoded as lossy UTF-8.
10. An `<img>` with no `src` counts toward "N images stay linked to the web".

## Manual run (2026-11-15, `npm run tauri dev`)

IMP-01..14 all pass (details in `docs/test-cases/32-import.md`). Three bugs found and fixed with tests first:

- Tables whose cells hold paragraphs, lists, divs or tables were written by Pandoc as `[TABLE]` with their content dropped (every Wikipedia infobox and navbox, and with them all 4 images of the Markdown article). `cleanPage` now flattens such tables into blocks; simple tables stay tables. Tests `flattens a table whose cells hold blocks…`, `flattens a table that holds a table…`.
- The result sheet counted images before Pandoc ran ("54 images" for a note holding 38, "4" for one holding 0). The count now comes from the `![…](https://…)` images in the note. Test `counts the web images that reach the note`.
- Starting an import while an import sheet was open stacked a second sheet; an older import finishing later reopened its sheet. Only the newest import owns the sheet now. Test `replaces the first import's sheet and silences the first import`.

Suite after the fixes: 1,650 passed; startup chunk 661.70 kB. Not fixed, outside import: the ⌘K palette opens underneath an open sheet. Keychain: "Always Allow" did not survive a rebuild. Likely cause, not proven: the item's `partition_id` is the binary's cdhash ("BugText Local Dev" has no Team ID). The release-build check in `a10993e` saw no prompt on rebuilds, so this needs a re-test with two consecutive `npm run build:app` builds.

## Not done

- Manual cases in the release build (IMP-14's CSP half).
- No Windows or Linux check.
