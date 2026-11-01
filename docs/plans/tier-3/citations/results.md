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
| 8. Startup size | `npm run build`: index chunk 904.98 kB, 6.38 kB above the 898.6 kB baseline (under the 15 kB limit). |
| 9. Display 2 light/dark checks | Native check pending: picker, completion, preview jump, PDF and DOCX in each style. |

The preview is an approximation; citeproc produces document-export formatting. Two Pandoc
integration tests are ignored by default and were run explicitly. The normal Cargo run
also includes an unrelated ignored test.
