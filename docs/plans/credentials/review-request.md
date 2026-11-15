# Review request: Trust and Resume + API keys in a file (both merged to `main`)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

---

Review two branches that the owner had merged into `main` on 2026-11-15, before review.
This is a review after merge: do not edit code, commit, revert, push, tag or raise
`bundleVersion`. Report findings; the owner decides what gets fixed and in which branch.

| Branch | Merge commit | Range to review |
|---|---|---|
| `feat/trust-resume` | `20fb4a1` | `git diff 787816a..4980864` |
| `feat/file-credentials` | `609b34f` | `git diff 20fb4a1..71b9c1b` |

Claude built both. Nothing is pushed.

## Part 1: Trust and Resume (`feat/trust-resume`)

The full brief is `docs/plans/trust/review-request.md`: scope, what to read first, where to
look hardest and which decisions to weigh. Use it as written, with these changes since it
was first drafted:

- The manual cases TRU-01 to TRU-14 were run on 2026-11-15 in the release build and all
  pass. Findings 1–4 were fixed in `33ec78d`, each with a unit test (finding 1 is CSS only
  and was not re-checked in the app). Findings 5–9 are still open: see
  `docs/plans/trust/results.md`, "Manual run". Say whether any of them should be fixed
  before release.
- Fix 3 (`src/task-inbox/write.ts`, `taskWriter` in `src/main.ts`): after a tick in an
  open, unsaved tab, the link index now gets the tab's new text with `persisted = false`,
  so Tasks in Folder and the overview drop the row at once. Check that nothing else treats
  that text as saved: the Review queue, the on-disk "changed" check, and the dirty state.

## Part 2: API keys in a private file (`feat/file-credentials`)

**The owner asked for this change.** Their words: "app still requires keychain access,
should we change it to file as same as BugMind app". BugText kept API keys in the macOS
Keychain. A Keychain item is bound to the app's code signature, so every ad-hoc signed
build asked for the login password again. BugMind (`/Users/cong.bui/Kael/19-AppBuild/BugMind`)
already moved its keys to a plain file for the same reason. The owner approved the plan
below and asked for it to be built and merged.

What changed:

- `src-tauri/src/secrets.rs`, rewritten. Keys are in
  `<app config dir>/secrets/credentials.json`, a `{ "version": 1, "keys": { id: key } }`
  map. Rules:
  - The file is mode 0600 and its folder 0700.
  - Writes go to a temporary sibling created with mode 0600 and are renamed into place,
    under a process-wide lock.
  - A file that is not valid JSON is moved aside as `credentials.json.bad-<time>`, not
    overwritten.
  - If the path is a symlink it is treated as unreadable and replaced, never followed.
  - The four commands (`set_secret`, `get_secret`, `has_secret`, `delete_secret`) and
    their signatures are unchanged, so no frontend code changed except two comments and
    one error message.
- The `keyring` dependency is removed from `Cargo.toml`.
- `src-tauri/src/lib.rs`: `setup` calls `secrets::init(app_config_dir)`.
- `src-tauri/src/sandbox.rs` and `ai.rs`: the coding CLI sandbox profile ends with a
  deny for reading and writing under the `secrets/` folder. In SBPL the last matching
  rule wins, so the deny holds even when the run folder contains the app config folder,
  for example when the owner's home folder is open. The path is canonicalized.
- Docs: `CLAUDE.md`, whose rule "API keys live in the OS keychain" now names the file;
  `ARCHITECTURE.md`, `README.md`, `HELP.md`, the website copy in `site-content/`, and
  `CHANGELOG.md` under Changed.

Decisions to weigh:

1. **Plaintext, not encrypted.** Any process running as the owner, outside the
   sandbox, can read the keys, and so can backups such as Time Machine. BugMind decided
   on 2026-10-08 not to encrypt, because the key to decrypt would have to sit next to
   the file. Is the same call right here?
2. **No migration from the Keychain.** Reading the old items would show the very
   password prompt this change removes. After the update, Settings shows no saved keys
   and the owner enters each one once. The old items stay in the Keychain under service
   `com.kael.bugtext` until deleted by hand. The `extractLegacyKeys` path, which moves
   plaintext keys out of an old `agent.json`, still runs and now writes to the file.
3. **`get_secret` still returns the raw key to the webview.** HTTP connections
   (`src/ai/connections.ts` `request`) call `fetch` from the webview with the key in a
   header, so the key has to reach the webview. Keeping keys on the Rust side would mean
   moving those requests into Rust. Claude proposed that and did not build it. Say
   whether it is worth a follow-up.
4. **Config folder, not local data folder.** BugMind uses the local data folder. BugText
   uses `app_config_dir`, where `settings.json` and `agent.json` already live. On macOS
   these are the same `~/Library/Application Support/com.kael.bugtext`.
5. **Windows and Linux.** The mode bits apply only on Unix (`#[cfg(unix)]`), and the
   unit tests are Unix only. On Windows the file gets the default ACL of the user's
   profile folder.

Where to look hardest:

- `update_at` in `secrets.rs`: the error path when the file exists but cannot be read
  (permissions, not JSON), races between two windows, and whether a failed write can
  ever lose the keys that were already saved.
- `delete_secret`'s early return when there is no file.
- The sandbox deny: can a CLI reach the keys through a hard link, a symlink inside the
  run folder, `..`, or `file-read-metadata`? Metadata is allowed, contents are not.
- `ai.rs` `prepare_command` reads `cli-<tool>` from the store and puts it in the CLI's
  environment, as before. Check that output redaction still covers it.

Checks at `71b9c1b`:

- `cargo test`: 241 passed, 4 ignored. This includes five new `secrets` tests and the
  new `sandbox_denies_secrets_dir_even_inside_workdir`, which failed before the deny was
  added.
- `cargo clippy --all-targets -- -D warnings`: clean.
- `tsc`: clean.
- `vitest`: 1,488 passed.

Not done:

- Not run in the app. A GUI run would write keys to the owner's real config folder,
  because it is shared with the installed BugText.
- No Windows or Linux build.
- The `secrets` tests were written together with the new code, not before it. There was
  no file store to fail against before.

## How to report

Findings first, ranked Critical, Important, Minor, with one part per branch. For each
finding give:

- the file and line;
- what a person using BugText gets;
- a suggested fix.

Then list the decisions above that you disagree with. End with a one-line verdict for
each branch: keep as is, fix on `main`, or revert.

---

## Outcome (2026-11-15, after Fable's review)

Fable recommended reverting; the owner chose to revert. `609b34f` was reverted in
`238ff68`: keys are back in the OS keychain, `keyring` restored, the `secrets/` sandbox
deny removed with the folder. Instead, every handed-out build is signed with the stable
self-signed identity "BugText Local Dev" through `APPLE_SIGNING_IDENTITY`
(`npm run build:app`, `scripts/build-local-app.sh`, commits `2d7a696`, `b3c4c66`).

Checked in the release build on the second display, using the `omlx` key (Test text
model, a real request that needs the key):

| Step | Build | Keychain prompt |
|---|---|---|
| 1. First signed build, launch, use a key | CDHash `077139de…` | none (the identity already had Always Allow from earlier dev runs signed with the same certificate) |
| 2. Quit, relaunch the same build | same | none |
| 3. Build again, launch | rebuild was byte-identical, so a second build was made with a temporary `bundleVersion` (not committed): CDHash `e78e28e5…` | none |

Signature of every build:

```
Authority=BugText Local Dev
designated => identifier "com.kael.bugtext" and certificate leaf = H"281139f5041e9ccaaa706f5945d9f41dfd0ee03b"
```

Seen on the way: in Settings ▸ AI ▸ API providers, Edit… opens the form at the top of
the page, out of view when the list is scrolled, and Test shows no progress and leaves
the status line unchanged when the result is the same, so both look like "nothing
happens".
