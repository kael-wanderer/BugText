# Citations implementation results

| Spec acceptance | Evidence and remaining checks |
| --- | --- |
| 1. Equivalent 200-entry files | `citations-parse.test.ts` generates and compares 200 BibTeX and CSL JSON entries. |
| 2. Syntax, styles, missing keys and code | `citations-syntax.test.ts`, `citations-format.test.ts`, and `citations-apply.test.ts`; native check pending for all syntax/style combinations. |
| 3. Picker, completion and undo | `citations-picker.test.ts` and `citations-insert.test.ts` cover filtering, keyboard submission, insertion, completion and an isolated undo step. Native completion interaction check pending. |
| 4. PDF and DOCX output | Rust `pandoc_formats_citation_and_references` exercises citeproc and all three styles with Pandoc plain output; native PDF and DOCX checks pending. |
| 5. Style setting | `citations-format.test.ts` covers style output; native check pending for settings-to-preview and export integration. |
| 6. Hostile content, paths and malformed files | `citations-apply.test.ts`, `citations-picker.test.ts`, `citations-library.test.ts`, and Rust citation path tests cover text rendering and confined reads; `rejects_raw_typst_in_citation_source` checks the filter with Pandoc. Native check pending for the complete export and completion matrix. |
| 7. Export sheet counts and error | `export-sheet.test.ts` and `citations-apply.test.ts` cover the rows and exclusion of unknown bare mentions. |
| 8. Startup size | `npm run build`: index chunk 905.15 kB, 6.55 kB above the 898.6 kB baseline (under the 15 kB limit). |
| 9. Display 2 light/dark checks | Native check pending: picker, completion, preview jump, PDF and DOCX in each style. |

The preview is an approximation; citeproc produces document-export formatting. Two Pandoc
integration tests are ignored by default and were run explicitly. The normal Cargo run
also includes an unrelated ignored test.

## Native check — 2026-11-01 (dev build, display 2, fixture with references.bib)

Passed:
- Preview (Nord and Light): bracketed, multi-key, locator and in-text forms render in Chicago and IEEE;
  missing key `(?hall2019)` / `[?hall2019]` in the warning colour; `me@example.com`, `@lena`, `[ask a@b.com]`
  and inline code stay plain; References lists the three entries; a hostile title shows as text.
- Insert Citation… (Edit menu): lists 3 entries with "3 entries · references.bib", filters, Enter inserts `[@ong2020]`.
- Completion after `[@` offers keys with "Authors · Year"; Enter inserts the key.
- Export sheet: "Citations: 3 cited · Chicago author-date" / "· IEEE" and a warning for hall2019.
- PDF (Chicago) and DOCX (IEEE): formatted citations, exact References from Pandoc citeproc, hostile title as
  text, code literal, missing key shown as `hall2019?`.

Failed or not met at the original native check (fixes below; native re-check pending):
- Citation picker sheet is unstyled: full window width, unpadded search field on the sheet edge, oversized
  footer text, weak highlight on the selected row.
- After Insert Citation the cursor stays before the inserted text.
- Export sheet says "1 keys not found".
- Preview reference lines: no period after the authors ("Newport, Cal 2016."), and 3+ authors read as
  "Ong, Mei, Park, Jin, Diaz, Luis". IEEE preview groups as "[2; 3]" while export prints "[2], [3]".
- Line 9 (`Code stays literal: \`[@newport2016]\``) shows a red spell underline across the whole line; the
  citation code does not touch the editor, so this is likely a spell-check issue (not yet checked on main).

Not run natively: changing Citation style through the Settings dropdown (scripted input cannot open the
webview select; style was switched in settings.json instead), APA, no-bibliography notes, path escape and
malformed files (unit tests only).

### Native-check fixes

- Picker layout, row highlighting and keyboard scrolling fixed; native re-check pending.
- Citation insertion places the cursor after the inserted text in one transaction; native re-check pending.
- Export warning grammar and Chicago/IEEE preview formatting fixed; native re-check pending.
- Settings citation style selection is covered through the save/preview-refresh path; native re-check pending.
- Spell checking: macOS returned an orthography result spanning the masked line even when spelling was requested. The native bridge now filters for spelling results; native re-check pending.

Automated verification: TypeScript check passed; Vitest 1,131 tests passed; Cargo 181 tests passed, 3 ignored. The index chunk is 905.15 kB.
