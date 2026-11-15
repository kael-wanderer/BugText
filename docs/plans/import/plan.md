# Import (Reading Workflow Phase 5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline execution; Opus builds, Fable reviews the diff and does the security review of Tasks 1 and 2). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** File ▸ Import turns a web page, a Word document or a CSV file into a Markdown note inside the open folder, with `source`, `imported_at` and `source_digest` properties, and says so when the same source was imported before.

**Architecture:** Rust does everything that touches the network, Pandoc or files outside the folder: one module fetches a page with the address checks, one runs Pandoc and places media and originals. The webview cleans the fetched HTML in an inert `DOMParser` document, builds the note text and creates the note with the existing `create_from_template`, which never overwrites. Everything under `src/import/` loads on demand.

**Tech Stack:** Rust (Tauri 2, `reqwest` 0.13 with rustls, `sha2`, both already in `Cargo.toml`), Pandoc on the owner's machine, TypeScript (no framework), vitest + jsdom.

**Spec:** `docs/plans/reading-pack/spec.md`, "Phase 5 — Recipes and import", section 5.5, and "Constraints". Mockup: `docs/plans/reading-pack/mockup.html`, `id="s7"`, the third sheet (Import Web Page). Read both before starting a task.

**Branch:** `feat/import`, from `main` after `feat/recipes` (Phase 5a) is merged. Task 5 uses `outputPath` from `src/recipes/path.ts`.

## Global Constraints

- Clean-room rule (`CLAUDE.md`): all code fresh. No new dependency, npm or Rust. Do not add `tokio`, `url` or `scraper` to `Cargo.toml`; use `reqwest::Url`, `std::net` and `tauri::async_runtime::spawn_blocking`.
- The webview never fetches the page. Only Rust talks to the network, and only through `import_fetch_page`.
- HTTPS only. Private, loopback, link-local and other non-public addresses are refused, for the first address and for every redirect. The body is capped at 5 MB (5 × 1024 × 1024 bytes).
- Untrusted text never reaches `innerHTML`. Fetched HTML is parsed with `new DOMParser().parseFromString(html, "text/html")` and read back with `body.innerHTML` (a read). It is never assigned to a live element. Page titles, addresses, file names and problem lines use `textContent`.
- Pandoc runs with fixed arguments built in Rust, input on stdin or as one checked file path, never through a shell.
- Every file written lands inside the open folder: notes through `create_from_template`, media and originals through the confined helpers in `src-tauri/src/assets.rs`. Import never overwrites and never changes an existing note, so no Recovery snapshot is needed; "Import Again" creates a second, numbered note.
- An open folder is required. Without one every Import command shows "Open a folder to import into."
- New code loads on demand (dynamic `import()`). The startup chunk stays under 800 kB and within +2 kB of `main` at branch time; record both numbers in `results.md`.
- Menu ids in `keymap.ts` match `menu.rs`: `file.import_web` "Web Page…", `file.import_word` "Word Document…", `file.import_csv` "CSV…", scope `menu`, no default shortcut, in a File ▸ Import submenu after Export.
- Error text shown to the owner is one of the fixed strings in this plan. No raw `reqwest`, IO or Pandoc error reaches the UI except Pandoc's stderr in the result sheet's problem list, cut to 500 characters.
- Every task that changes behaviour adds its line to `CHANGELOG.md` under `## [Unreleased]` → `### Added`.
- Checks green after every task: `npx tsc --noEmit`, `npm run test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.
- Do not merge, push, tag, raise `bundleVersion` or build a DMG.

## Decisions this plan makes beyond the spec

1. **Where the HTML is cleaned.** In the webview, in an inert `DOMParser` document. Rust has no HTML parser and a regex cleaner is not safe to trust; Pandoc's reader does not keep `nav`, `aside` or `footer` as elements a filter could drop. A `DOMParser` document has no browsing context: scripts do not run and nothing is loaded.
2. **What is removed.** Elements `script, style, noscript, template, nav, header, footer, aside, form, iframe, frame, object, embed, canvas, svg, dialog, button, input, select, textarea, link, meta, base`; elements with `hidden` or `aria-hidden="true"`; comments; every attribute except `href`, `src`, `alt`, `title`, `colspan`, `rowspan`, `lang`. If the page has exactly one `main`, only it is kept; else if exactly one `article`, only it.
3. **Links and images.** `href` and `src` are resolved against the final address. A link that is not `http:`, `https:` or `mailto:` is unwrapped (its text stays). An image that is not `https:` is removed. Images are not downloaded: they stay as web links, and the result sheet says "N images stay linked to the web."
4. **No raw HTML in the note.** Pandoc writes `gfm-raw_html`, so anything it cannot express in Markdown is dropped instead of kept as HTML.
5. **Redirects** are followed by hand, at most three, each one checked like the first address. `source` records the address the owner typed (without its fragment); the final address is used only to resolve links.
6. **DNS pinning.** The host is resolved once per hop; every address returned must be public; the request is pinned to the first one with `ClientBuilder::resolve`. A second lookup by the HTTP client, which could answer differently, never happens.
7. **Properties.** `source`: the address for a web page, or the relative link from the note to the copied original for Word and CSV. `imported_at`: local `YYYY-MM-DD`. `source_digest`: lowercase SHA-256 hex of the fetched bytes or the original file. A `title` property is added for a web page when the page has one.
8. **Already imported** means a note in the open folder whose `source` equals the address (web) or whose `source_digest` equals the new digest (all three). The web check on the address happens before any request is sent.
9. **Save to** is a path relative to the folder, checked by `outputPath` (Phase 5a). Default: the folder of the active note (the root when none) plus a name from the page title or the file stem.
10. **Word media** is extracted by Pandoc into a fresh temp directory, then copied by Rust into `<note dir>/<images folder>/` with the existing image checks. Pandoc never writes into the folder itself. At most 200 media files, 25 MB each (the existing image limit); the rest are problems on the result sheet.
11. **CSV.** Comma separated, RFC 4180 quoting, a leading BOM dropped, first row is the header. Up to 500 data rows become a table. More than 500, more than 50 columns, or a file over 2 MB: the note holds a link to the copied original and the line "N rows, M columns. The file is too large for a table." Original files over 50 MB are refused.
12. **Limits on originals.** Word and CSV originals are copied to `<note dir>/<images folder>/originals/`, numbered on a name clash, never overwritten.

**Confirmed by the owner, 2026-11-15:** all twelve decisions stand as written. Two things are left out on purpose and can be added later if missed: downloading a web page's images into the images folder (decision 3; it needs the address checks of Task 1 for every image), and reading CSV files that use `;` or a tab as the separator (decision 11).

## Review Focus

1. An address that reaches a private service: `https://localhost`, `https://127.0.0.1`, `https://[::1]`, `https://10.0.0.5`, `https://169.254.169.254`, `https://[::ffff:127.0.0.1]`, a public host name whose DNS answer includes a private address, or a public page that redirects to any of these. All refused with "This address is not on the public internet." before a request is sent to it. (Task 1)
2. A page larger than 5 MB, with or without a `Content-Length` header, or one that is not HTML (a PDF, an image, a download): refused; memory use stays under the cap. (Task 1)
3. A page that tries to run or load something: `<script>`, `<img src=x onerror=…>`, `<a href="javascript:…">`, `<iframe>`, `<meta http-equiv=refresh>`, `<base href>`. None of it runs during import, and none of it is in the note. (Task 3)
4. A Word file whose media names try to leave the target (`../../x.png`, an absolute path), or media that are not images: nothing is written outside `<images folder>`, and the bad item is a problem line. (Task 2)
5. Importing the same address or file twice: the sheet offers Open Existing or Import Again, and Import Again creates a second note instead of changing the first. (Tasks 5 and 6)

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/import_web.rs` | create | Address checks, public-IP rule, pinned fetch with manual redirects |
| `src-tauri/src/import_files.rs` | create | Pandoc HTML → Markdown, Word → Markdown with media, probe and copy of originals |
| `src-tauri/src/assets.rs` | modify | `pub(crate)` helpers reused for media and originals |
| `src-tauri/src/export.rs` | modify | `find_pandoc` becomes `pub(crate)` |
| `src-tauri/src/lib.rs`, `menu.rs` | modify | Register commands; File ▸ Import submenu |
| `src/import/clean.ts` | create | Pure: clean fetched HTML, title, image count |
| `src/import/csv.ts` | create | Pure: parse CSV, Markdown table |
| `src/import/note.ts` | create | Pure: front matter, default save path, find an earlier import |
| `src/import/run.ts` | create | The three import flows over injected deps |
| `src/import/sheet.ts` | create | Import sheet, already-imported state, result sheet |
| `src/keymap.ts`, `src/main.ts` | modify | Three commands, menu events, palette entries, deps |
| `src/styles.css` | modify | Sheet |

---

### Task 1: Fetch a page safely

**Files:**
- Create: `src-tauri/src/import_web.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: Rust tests in `import_web.rs`

**Interfaces:**
- Produces:
  ```rust
  pub const MAX_PAGE_BYTES: usize = 5 * 1024 * 1024;
  pub fn public_ip(ip: std::net::IpAddr) -> bool;
  pub fn check_address(raw: &str) -> Result<reqwest::Url, String>;
  pub fn next_hop(current: &reqwest::Url, location: &str) -> Result<reqwest::Url, String>;
  pub fn vet(addrs: &[std::net::SocketAddr]) -> Result<std::net::SocketAddr, String>; // all must be public; returns the first
  pub fn html_type(content_type: Option<&str>) -> bool;
  #[derive(serde::Serialize)] pub struct Page { pub url: String /* final */, pub html: String, pub digest: String }
  #[tauri::command] pub async fn import_fetch_page(address: String) -> Result<Page, String>;
  ```
- Fixed errors: `NOT_HTTPS` "Only https:// addresses can be imported." · `NOT_PUBLIC` "This address is not on the public internet." · `BAD_ADDRESS` "Enter a web address like https://example.com/page." · `TOO_LARGE` "The page is larger than 5 MB." · `NOT_HTML` "This address is not a web page." · `TOO_MANY` "The page redirected too many times." · `UNREACHABLE` "Could not reach the page. Check the address and your connection." · `TIMED_OUT` "The page did not answer in time." · `STATUS` "The page answered with status {code}."

- [ ] **Step 1: Write the failing tests.**
  - `public_ip_refuses_non_public_ranges`: `false` for each of `0.0.0.0`, `10.1.2.3`, `100.64.0.1`, `127.0.0.1`, `169.254.169.254`, `172.16.0.1`, `172.31.255.255`, `192.0.0.1`, `192.0.2.1`, `192.168.1.1`, `198.18.0.1`, `198.51.100.1`, `203.0.113.1`, `224.0.0.1`, `240.0.0.1`, `255.255.255.255`, `::`, `::1`, `fc00::1`, `fd12::1`, `fe80::1`, `ff02::1`, `2001:db8::1`, `::ffff:127.0.0.1`, `::ffff:10.0.0.1`, `64:ff9b::7f00:1`, `2002:7f00:1::1`; `true` for `1.1.1.1`, `93.184.216.34`, `172.32.0.1`, `2606:4700:4700::1111`, `::ffff:1.1.1.1`.
  - `check_address`: accepts `https://example.com/a?b=1#frag` and returns it without the fragment; `NOT_HTTPS` for `http://example.com`, `ftp://example.com`, `file:///etc/passwd`; `BAD_ADDRESS` for `""`, `"example.com"`, `https://`, `https://user:pw@example.com/`, an address longer than 2048 characters; `NOT_PUBLIC` for `https://localhost/`, `https://LOCALHOST./`, `https://127.0.0.1/`, `https://[::1]/`, `https://10.0.0.5/`, `https://169.254.169.254/latest/meta-data`, `https://2130706433/`, `https://0x7f.0.0.1/`, `https://foo.local/`, `https://foo.internal/`.
  - `next_hop`: a relative `Location` (`/b`) resolves against the current address; `http://example.com/` → `NOT_HTTPS`; `https://127.0.0.1/` → `NOT_PUBLIC`; an empty `Location` → `UNREACHABLE`.
  - `vet`: `[1.1.1.1:443, 10.0.0.1:443]` → `NOT_PUBLIC`; `[]` → `UNREACHABLE`; `[1.1.1.1:443, 1.0.0.1:443]` → the first.
  - `html_type`: `true` for `text/html`, `Text/HTML; charset=utf-8`, `application/xhtml+xml`; `false` for `None`, `application/pdf`, `text/plain`, `image/png`.

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml import_web`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement.**
  - `public_ip`: IPv4 by the ranges in the test. IPv6: refuse unspecified, loopback, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`; for IPv4-mapped (`::ffff:0:0/96`), NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`) take the embedded IPv4 address and apply the IPv4 rule.
  - `check_address`: trim; parse with `reqwest::Url`; require scheme `https`, a host, empty username and no password; drop the fragment. A host that `Url` reports as an IP goes through `public_ip` (`Url` already turns `2130706433` and `0x7f.0.0.1` into IPv4). A domain is lowercased with one trailing dot removed and refused when it is `localhost` or ends with `.localhost`, `.local`, `.internal`, `.home.arpa`.
  - `import_fetch_page` loops over at most four requests (the first and three redirects):
    1. Resolve `(host, port_or_known_default)` with `std::net::ToSocketAddrs` inside `tauri::async_runtime::spawn_blocking`; a failure is `UNREACHABLE`. `vet` the result.
    2. Build a client for this hop: install the rustls provider as `update_feed.rs` does, then `.https_only(true).no_proxy().redirect(reqwest::redirect::Policy::none()).resolve(host, addr).connect_timeout(10 s).timeout(20 s).user_agent(concat!("BugText/", env!("CARGO_PKG_VERSION")))`. For an IP host skip `resolve`.
    3. Send `GET` with `Accept: text/html,application/xhtml+xml`. No cookies, no other headers.
    4. A 301, 302, 303, 307 or 308 with a `Location` header: `next_hop`, then loop; a fifth request is `TOO_MANY`. Any other status outside 200 to 299 is `STATUS`.
    5. Require `html_type(content-type)`, else `NOT_HTML`. A `Content-Length` over the cap is `TOO_LARGE` before reading.
    6. Read with `response.chunk()` as `update_feed.rs` does, stopping with `TOO_LARGE` past `MAX_PAGE_BYTES`.
    7. `digest` = SHA-256 hex of the bytes; `html` = `String::from_utf8_lossy`; `url` = the address of this hop.
  - Map `is_timeout()` to `TIMED_OUT`, every other `reqwest` error to `UNREACHABLE`. Do not log the address or the body.
  - Register the command in `lib.rs`.

- [ ] **Step 4: Run** the tests and clippy. Expected: PASS, clean.

- [ ] **Step 5: Commit** `feat(import): fetch a web page with address checks`.

### Task 2: Pandoc conversion, media and originals

**Files:**
- Create: `src-tauri/src/import_files.rs`
- Modify: `src-tauri/src/assets.rs`, `src-tauri/src/export.rs`, `src-tauri/src/lib.rs`
- Test: Rust tests in `import_files.rs`

**Interfaces:**
- Consumes: `find_pandoc` (`export.rs`, made `pub(crate)`), `image_dir`, `unique_target`, `clean_stem`, `link_for`, `extension_of`, `matches_extension`, `MAX_IMAGE_BYTES` (`assets.rs`, made `pub(crate)`), `write_atomic` (`files.rs`), `confined_dir` and `plain_parts` (`templates.rs`, made `pub(crate)`).
- Produces:
  ```rust
  #[tauri::command] pub async fn import_html_to_markdown(html: String) -> Result<String, String>;
  #[derive(serde::Serialize)] pub struct Probe { pub name: String, pub stem: String, pub bytes: u64, pub digest: String }
  #[tauri::command] pub async fn import_probe(path: String, kind: String) -> Result<Probe, String>;            // kind: "word" | "csv"
  #[tauri::command] pub async fn import_read_csv(path: String) -> Result<String, String>;                       // ≤ 2 MB, UTF-8 (lossy), BOM kept for the parser
  #[derive(serde::Serialize)] pub struct Original { pub link: String }                                          // relative to the note's folder
  #[tauri::command] pub async fn import_copy_original(folder: String, relative_dir: String, images_folder: String, path: String, kind: String) -> Result<Original, String>;
  #[derive(serde::Serialize)] pub struct WordResult { pub markdown: String, pub problems: Vec<String> }
  #[tauri::command] pub async fn import_word(folder: String, relative_dir: String, images_folder: String, path: String) -> Result<WordResult, String>;
  ```
- Fixed errors: `NO_PANDOC` "Importing needs Pandoc. Install it with: brew install pandoc" · `CONVERT` "Pandoc could not convert this file." · `NOT_WORD` "Choose a .docx file." · `NOT_CSV` "Choose a .csv file." · `SOURCE_GONE` "The file no longer exists." · `SOURCE_LARGE` "The file is larger than 50 MB." · `CSV_LARGE` (returned by `import_read_csv` over 2 MB) "too-large".

- [ ] **Step 1: Write the failing tests** (those that run Pandoc return early when `find_pandoc()` is `None`, as the existing Pandoc tests do):
  - `html_becomes_markdown_without_raw_html`: `<h1>T</h1><p>a <b>b</b></p><div class="x"><iframe src="https://e.com"></iframe></div><table><tr><th>h</th></tr><tr><td>c</td></tr></table>` → output contains `# T`, `**b**`, a pipe table, and no `<`.
  - `html_input_over_the_cap_is_refused`: a string of `MAX_PAGE_BYTES + 1` bytes → `CONVERT`, Pandoc not started.
  - `probe_checks_kind_and_size`: a `.docx` → `Probe` with the SHA-256 of its bytes and `stem` without the extension; `kind: "word"` with a `.txt` path → `NOT_WORD`; a missing path → `SOURCE_GONE`; a directory → `SOURCE_GONE`.
  - `original_is_copied_inside_and_numbered`: copying `report.docx` twice into scratch folder `r`, `relative_dir: "research"`, `images_folder: "assets"` → `research/assets/originals/report.docx` then `…/report-2.docx` (the `unique_target` naming); links are `assets/originals/report.docx` and `assets/originals/report-2.docx`.
  - `original_refuses_outside_targets`: `relative_dir: "../x"` → error, nothing written; `images_folder: "../y"` → error; a symlinked `assets` pointing outside `r` → error.
  - `place_media_keeps_images_only`: given a temp directory holding `media/image1.png` (valid PNG bytes), `media/notes.txt`, and `media/fake.png` (text bytes), and Markdown `![](TMP/media/image1.png) ![](TMP/media/fake.png)`, `place_media` copies only `image1.png` into `<note dir>/assets/`, rewrites its link to `assets/image1.png`, removes the other image reference, and returns two problem lines: `fake.png is not a valid image.` and `notes.txt was left out.`
  - `place_media_ignores_links_and_nested_escapes`: a symlink inside the temp media directory is skipped with a problem line; a file reached through `media/../../x.png` is never read.
  - `word_roundtrip` (needs Pandoc): build a `.docx` with `pandoc -f markdown -o` from `# T\n\ntext\n`, import it → `markdown` contains `# T` and `text`, `problems` is empty.

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml import_files`. Expected: FAIL.

- [ ] **Step 3: Implement.** Every command body runs inside `spawn_blocking`.
  - `import_html_to_markdown`: refuse over `MAX_PAGE_BYTES`; run `pandoc --from html --to gfm-raw_html --wrap=none --sandbox` with the HTML on stdin, stdout captured, `current_dir(std::env::temp_dir())`. A non-zero exit is `CONVERT`.
  - `import_probe`: canonicalize; require a regular file; extension `docx` for `word`, `csv` for `csv` (case-insensitive); size at most 50 MB; hash by streaming.
  - `import_copy_original`: `confined_dir(folder, plain_parts(relative_dir))` gives the note directory (created if missing, as `create_from_template` does); `image_dir(<note dir>/x.md, "<images_folder>/originals")` gives the confined target (`valid_folder` must accept the two-part folder; `.` as images folder gives `originals`); `unique_target` with the cleaned stem and the extension; read, then `write_atomic`.
  - `import_word`: probe as `word`; create a fresh directory under `std::env::temp_dir()` named `bugtext-import-<pid>-<nanos>`; run `pandoc --from docx --to gfm-raw_html --wrap=none --extract-media=<temp> <canonical path>` with `current_dir(<temp>)` and stdout captured; call `place_media`; remove the temp directory whatever happened.
  - `fn place_media(markdown: &str, temp: &Path, note_dir_file: &str, images_folder: &str) -> (String, Vec<String>)`: walk `<temp>/media` one level deep, regular files only (`symlink_metadata`), at most 200. For each: `extension_of` and `matches_extension` and `MAX_IMAGE_BYTES` as `copy_image_at` checks them; write with `unique_target` into `image_dir(...)`; replace the temp path in the Markdown (both the absolute form and the `media/…` relative form Pandoc may write) with `link_for`. Remove any image reference still pointing into the temp directory. Problem lines use the file name only, never a path.

- [ ] **Step 4: Run** the tests and clippy. Expected: PASS, clean.

- [ ] **Step 5: Commit** `feat(import): Pandoc conversion, media and originals`.

### Task 3: Clean fetched HTML

**Files:**
- Create: `src/import/clean.ts`
- Test: `src/__tests__/import-clean.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Cleaned = { html: string; title: string; webImages: number };
  export function cleanPage(html: string, baseUrl: string): Cleaned;
  ```

- [ ] **Step 1: Write the failing tests** (jsdom):
  - `removes page chrome`: `<header>H</header><nav>N</nav><main><p>Body</p></main><aside>A</aside><footer>F</footer>` → `html` contains `Body` and none of `H`, `N`, `A`, `F` as element text.
  - `removes active content`: input with `<script>alert(1)</script>`, `<style>`, `<iframe>`, `<form>`, `<object>`, `<svg>`, `<meta http-equiv="refresh" content="0;url=https://e.com">`, `<base href="https://evil.example/">`, `<img src="https://e.com/a.png" onerror="alert(1)" srcset="x 2x">`, `<p onclick="x()" style="color:red" data-x="1">t</p>` → `html` has no `script`, `style`, `iframe`, `form`, `object`, `svg`, `meta`, `base`; no attribute starting with `on`; no `style`, `srcset` or `data-` attribute; the `img` keeps only `src` and `alt`.
  - `nothing runs or loads`: a global `window.__ran = false`; cleaning `<img src=x onerror="window.__ran=true"><script>window.__ran=true</script>` leaves it `false`.
  - `links`: with base `https://e.com/docs/page`, `<a href="../x">a</a>` → `href="https://e.com/x"`; `<a href="javascript:alert(1)">j</a>` and `<a href="data:text/html,x">d</a>` → no `a` element, the text `j` and `d` kept; `<a href="mailto:a@b.c">m</a>` kept.
  - `images`: `<img src="/a.png">` → `src="https://e.com/a.png"`; `<img src="http://e.com/a.png">` and `<img src="data:image/png;base64,AAAA">` removed; `webImages` counts the images kept.
  - `base tag does not change resolution`: `<base href="https://evil.example/">` plus `<a href="x">` resolves against the `baseUrl` argument.
  - `prefers one main or article`: a page with one `main` keeps only its content; two `article` elements and no `main` keep the whole body.
  - `hidden`: elements with `hidden` or `aria-hidden="true"` are removed; comments are removed.
  - `title`: `<title> A   page </title>` → `"A page"`; no `title` → the first `h1` text; neither → `""`; cut to 120 characters.

- [ ] **Step 2: Run** `npx vitest run src/__tests__/import-clean.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** with `new DOMParser().parseFromString(html, "text/html")`. Remove `base` first, then the element list of decision 2, then walk the remaining elements: drop attributes outside the allow list, resolve `href` and `src` with `new URL(value, baseUrl)` inside `try` (a value that does not parse is treated as not allowed), apply decision 3. Return `root.innerHTML` of the kept root. Never assign `innerHTML`, never append the parsed nodes to `document`.

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit** `feat(import): clean fetched HTML`.

### Task 4: CSV and note text

**Files:**
- Create: `src/import/csv.ts`, `src/import/note.ts`
- Test: `src/__tests__/import-csv.test.ts`, `src/__tests__/import-note.test.ts`

**Interfaces:**
- Consumes: `PropertiesModule` (`src/properties/loader.ts`), `IndexedNote` (`src/links/index.ts`), `outputPath` (`src/recipes/path.ts`).
- Produces:
  ```ts
  // csv.ts
  export const MAX_TABLE_ROWS = 500; export const MAX_TABLE_COLUMNS = 50;
  export function parseCsv(text: string): string[][];
  export function csvTable(rows: string[][]): { markdown: string } | { tooLarge: true; rows: number; columns: number };
  // note.ts
  export type ImportMeta = { source: string; importedAt: string; digest: string; title?: string };
  export function importedNote(body: string, meta: ImportMeta): string;
  export function nameFrom(text: string): string;                                   // a safe file stem, "Imported page" when empty
  export function defaultSavePath(activeRelative: string | null, name: string): string;
  export function earlierImport(notes: IndexedNote[], folder: string, match: { source?: string; digest?: string }): { path: string; importedAt: string | null } | null;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `parseCsv`: `"a,b\n1,2\n"` → `[["a","b"],["1","2"]]`; quoted fields with a comma, a doubled quote and a line break (`'"x, y","he said ""hi""","l1\nl2"'`) → one row of three fields; CRLF line ends; a leading `﻿` dropped; a last line with no newline kept; an empty trailing line ignored; `""` → `[]`.
  - `csvTable`: `[["a","b"],["1","2"]]` → `"| a | b |\n| --- | --- |\n| 1 | 2 |\n"`; a cell `x|y` → `x\|y`; a cell with a line break → `l1 l2` (a space, since the note holds no raw HTML); a cell `<b>` → `&lt;b>`; a short row is padded with empty cells; an empty header cell becomes `Column 3`; 501 data rows → `{ tooLarge: true, rows: 501, columns: 2 }`; 51 columns → `tooLarge`; exactly 500 rows → a table.
  - `importedNote`: body `"# T\n\ntext\n"` with `{ source: "https://e.com/a?b=1", importedAt: "2026-11-15", digest: "9f2c", title: "A: \"page\"" }` → text that starts with a front matter block which `readProperties` parses to exactly `{ title: 'A: "page"', source: "https://e.com/a?b=1", imported_at: "2026-11-15", source_digest: "9f2c" }`, followed by a blank line and the body. A `source` containing `: `, `#` or a leading `<` still round-trips. A body that itself starts with `---` is kept as body (it comes after the block).
  - `nameFrom`: `"  A / B: c?  "` → `"A B c"`; control characters, `/ \ : * ? " < > |` and leading dots removed; runs of spaces collapsed; cut to 80 characters; `""` → `"Imported page"`.
  - `defaultSavePath`: `("research/x.md", "Queue patterns")` → `"research/Queue patterns.md"`; `(null, "A")` → `"A.md"`.
  - `earlierImport`: finds the note whose `properties.source` equals the address; finds by `source_digest`; ignores notes outside `folder`; returns `importedAt` from `imported_at` when it is a string; `null` when nothing matches or when both match values are missing.

- [ ] **Step 2: Run** both files. Expected: FAIL.

- [ ] **Step 3: Implement.** `parseCsv` is a single pass state machine over characters. `importedNote` writes each value as a JSON string (`JSON.stringify`), which is a valid YAML double-quoted scalar, so no value can break out of the block: `---\ntitle: "…"\nsource: "…"\nimported_at: "…"\nsource_digest: "…"\n---\n\n`. `earlierImport` reads `note.properties`; it does not parse anything.

- [ ] **Step 4: Run** both files. Expected: PASS.

- [ ] **Step 5: Commit** `feat(import): CSV table and imported note text`.

### Task 5: The three flows

**Files:**
- Create: `src/import/run.ts`
- Test: `src/__tests__/import-run.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4; `outputPath` (`src/recipes/path.ts`).
- Produces:
  ```ts
  export type ImportKind = "web" | "word" | "csv";
  export type ImportUI = {
    ask: (args: { kind: ImportKind; address?: string; savePath: string; earlier: { path: string; importedAt: string | null } | null }) => Promise<{ savePath: string; address?: string; again: boolean } | { open: string } | null>;
    busy: (text: string) => void;
    result: (args: { path: string; problems: string[] }) => void;
    fail: (text: string) => void;
  };
  export type ImportDeps = {
    folder: () => string | null; activeRelative: () => string | null; imagesFolder: () => string; today: () => string;
    notes: () => IndexedNote[];
    pickFile: (kind: "word" | "csv") => Promise<string | null>;
    fetchPage: (address: string) => Promise<{ url: string; html: string; digest: string }>;
    htmlToMarkdown: (html: string) => Promise<string>;
    probe: (path: string, kind: "word" | "csv") => Promise<{ name: string; stem: string; bytes: number; digest: string }>;
    readCsv: (path: string) => Promise<string>;                       // rejects with "too-large" over 2 MB
    copyOriginal: (args: { folder: string; relativeDir: string; imagesFolder: string; path: string; kind: "word" | "csv" }) => Promise<{ link: string }>;
    word: (args: { folder: string; relativeDir: string; imagesFolder: string; path: string }) => Promise<{ markdown: string; problems: string[] }>;
    create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>;
    created: (path: string, text: string) => void;                   // indexes, Explorer
    open: (path: string) => void;
  };
  export async function importWeb(deps: ImportDeps, ui: ImportUI): Promise<void>;
  export async function importFile(kind: "word" | "csv", deps: ImportDeps, ui: ImportUI): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests** (fakes for every dep):
  - `no folder`: `fail("Open a folder to import into.")`, nothing else called.
  - `web, first time`: `ask` is called with `earlier: null`; after the owner gives `https://e.com/a` and `research/a.md`, the order is `fetchPage`, `htmlToMarkdown` (with the cleaned HTML, not the fetched HTML), `create` with `relativeDir: "research"`, `stem: "a"` and contents whose properties are the address, today and the digest; `created` and `result` are called with the path `create` returned.
  - `web, address already imported`: with a note whose `source` is the address, `ask` is called a second time with `earlier` set before `fetchPage` is called; `{ open }` calls `open(path)` and nothing else; `{ again: true }` continues and `create` is called (a second note; no write to the first).
  - `web, same digest under another address`: after `fetchPage`, `ask` is called again with `earlier` set; cancel writes nothing.
  - `web, problems`: three kept images → `problems` contains `3 images stay linked to the web.`; one → `1 image stays linked to the web.`; an empty Markdown result → `fail("The page has no text to import.")`.
  - `web, errors`: `fetchPage` rejecting with `"This address is not on the public internet."` → `fail` with that text; nothing created.
  - `save path`: `../x.md`, `/tmp/x.md` and `x.txt` → `fail("The output path must be a Markdown note inside this folder.")` before any fetch; a path with no extension gets `.md`.
  - `word`: `pickFile` → `probe` → `earlier` check by digest → `ask` → `copyOriginal` → `word` → `create`; the note's `source` is the link the note needs to reach the original (`assets/originals/report.docx`), and `problems` from `word` reach `result`.
  - `word, cancel at the picker or the sheet`: nothing copied, nothing created.
  - `csv, small`: the note body is the table from `csvTable` followed by a line `Original: [data.csv](assets/originals/data.csv)`.
  - `csv, large` (`readCsv` rejects with `too-large`, or `csvTable` says `tooLarge`): the body is `[data.csv](assets/originals/data.csv)` and `501 rows, 2 columns. The file is too large for a table.` (for the 2 MB case: `The file is too large for a table.` alone).
  - `create fails after the original was copied`: `fail("Could not create the note. The original was copied to assets/originals/report.docx.")`.

- [ ] **Step 2: Run** the file. Expected: FAIL.

- [ ] **Step 3: Implement** the two functions in the orders the tests give. The save path goes through `outputPath(savePath, { now: new Date(), current: null })`; split its `relative` into `relativeDir` and `stem`. Link targets with a space or parenthesis are written in angle brackets, as `formatLinkTarget` does.

- [ ] **Step 4: Run** the file. Expected: PASS.

- [ ] **Step 5: Commit** `feat(import): web, Word and CSV flows`.

### Task 6: Sheet, menu and wiring

**Files:**
- Create: `src/import/sheet.ts`
- Modify: `src-tauri/src/menu.rs`, `src/keymap.ts`, `src/main.ts`, `src/styles.css`
- Test: `src/__tests__/import-sheet.test.ts`

**Interfaces:**
- Consumes: `ImportUI`, `importWeb`, `importFile` (Task 5).
- Produces: `export function importUI(host: HTMLElement): ImportUI;` and keymap entries `{ id: "file.import_web", label: "Web Page…", category: "File", default: "", scope: "menu" }`, `file.import_word` "Word Document…", `file.import_csv` "CSV…".

- [ ] **Step 1: Write the failing tests** (jsdom):
  - `web sheet`: title `Import Web Page`; fields `Address` and `Save to`; buttons Cancel and Import; Import is disabled until the address starts with `https://`; typing `http://x` shows `Only https:// addresses can be imported.`; Enter in the address field acts as Import; Esc and Cancel resolve `null`.
  - `already imported`: with `earlier: { path: "research/queue-patterns.md", importedAt: "2026-11-03" }` the sheet shows `Already imported` and `This address was imported on 3 Nov as research/queue-patterns.md.` with buttons Open Existing and Import Again; they resolve `{ open: path }` and `{ …, again: true }`. For Word and CSV the line starts `This file was imported`.
  - `file sheet`: title `Import Word Document` or `Import CSV`; no address field; `Save to` prefilled.
  - `busy`: shows the text and disables the buttons.
  - `result sheet`: `Imported research/queue-patterns.md`, a list with one item per problem, buttons Open Note and Done; with no problems the list is absent.
  - `untrusted text`: a problem line and a save path holding `<img src=x onerror=alert(1)>` render as text: no `img` element.
  - `commands`: the three ids exist in `KEYMAP_COMMANDS` with scope `menu`, and `menu.rs` contains `MenuItemBuilder::with_id("file.import_web", "Web Page…")` and the other two (the pattern of `capture-notes-button.test.ts`).

- [ ] **Step 2: Run** the file. Expected: FAIL.

- [ ] **Step 3: Implement.** Model the sheet on `src/note-types/sheet.ts`. In `menu.rs` add `SubmenuBuilder::new(app, "Import")` with the three items after the Export submenu in the File menu. In `main.ts`: three cases in the menu event switch, three palette entries (`Import: Web Page…` and so on), each doing `const [{ importWeb }, { importUI }] = await Promise.all([import("./import/run"), import("./import/sheet")])`. Build `ImportDeps` from: `getState().folder`; the active tab's path relative to the folder; `currentSettings.images.folder`; `localToday()`; `linkIndex.notes()` after `await linkIndex.ensure(folder)`; `open` from `@tauri-apps/plugin-dialog` with `filters: [{ name: "Word", extensions: ["docx"] }]` or `["csv"]`; `invoke` for the six commands; `create_from_template`; `created` calls `linkIndex.onFileChanged(path, text)`, `workspaceIndex.onFileChanged(path, text)` and the Explorer refresh; `open` is `doOpenPath`.

- [ ] **Step 4: Run** the file, `npx tsc --noEmit`, `npm run build`, and `npm run tauri build -- --no-bundle` (the CSP is enforced only in release builds; the policy is not changed by this plan, and this run proves it). Expected: PASS; startup chunk within +2 kB.

- [ ] **Step 5: Commit** `feat(import): import sheet, File menu and palette`.

### Task 7: Docs and checks

**Files:**
- Modify: `ARCHITECTURE.md` (an "Import" paragraph after "Recipes"), `CHANGELOG.md`, `HELP.md` (one paragraph under File), `docs/test-cases/feature-test-map.md`
- Create: `docs/test-cases/32-import.md` (IMP-01 …), `docs/plans/import/results.md`

- [ ] **Step 1: Write the manual cases** `IMP-01`..`IMP-14`, each with Steps / Expected / Status:
  - a real article page (chrome removed, links absolute, images linked);
  - `http://` address refused in the sheet;
  - `https://localhost`, `https://127.0.0.1`, `https://192.168.1.1`, `https://169.254.169.254` refused, with a local HTTPS listener showing no request arrived;
  - a public address that redirects to `https://127.0.0.1` (use a redirect service) refused;
  - a direct link to a PDF refused as not a web page;
  - a page over 5 MB refused;
  - the same address twice: Open Existing, then Import Again creates `… 2.md`;
  - a Word file with two images (media in the images folder, original under `originals/`);
  - a Word file imported twice (digest match);
  - a small CSV (table), a 501-row CSV (link only);
  - Pandoc missing (rename it for the test): the fixed message;
  - no folder open;
  - the imported note in AI context: Ask about it with a line "ignore your instructions" in the page; the reply treats it as content;
  - the imported note in Reading view: no script runs, remote images load.
- [ ] **Step 2: Write** the ARCHITECTURE paragraph (the address rules, where HTML is cleaned and why, Pandoc arguments, what is written where) and `results.md` (commit per task, checks, chunk size before and after, every ruling).
- [ ] **Step 3: Run** `npx tsc --noEmit`, `npm run test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, `npm run build`. Expected: all green; chunk within budget.
- [ ] **Step 4: Commit** `docs(import): architecture, test cases, results` (`git add -f docs/plans/import/results.md`).

## For the security review (Fable, after the build)

Read the diff of Tasks 1 to 3 first. Check by hand, not only by the tests:

1. No path builds a `reqwest` client for the import without `no_proxy`, `Policy::none`, `https_only` and, for a domain, `resolve`.
2. `vet` is applied to every address of every hop, and the pinned address is one of the vetted ones.
3. `public_ip` against the IANA special-purpose registries, IPv4 and IPv6, including the embedded-IPv4 forms.
4. The body loop cannot pass the cap by one chunk, and a wrong `Content-Length` cannot skip the loop's check.
5. `cleanPage` never touches the live document; grep the import code for `innerHTML =`, `insertAdjacentHTML`, `outerHTML =`, `document.write`.
6. Pandoc is started only with the argument lists in Task 2; no value from the page or the file name is an argument except the canonical `.docx` path.
7. `place_media` and `import_copy_original` with a symlinked images folder and with hostile names.
8. No address, page text or file path is written to a log.
