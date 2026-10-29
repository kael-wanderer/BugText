# S5 folder replace results

Implementation is on `feat/s5-folder-replace`. Native acceptance remains outstanding; automated checks cover components but do not substitute for the complete native workflows.

1. **Native check needed:** Replace across six notes, including clean and dirty open tabs; verify disk writes, unsaved buffers, tags and one undo step. Automated pieces: `replace-flow.test.ts` (live buffer and atomic write), `replace-sheets.test.ts` (open tag).
2. **Automated:** `replace-sheets.test.ts` selection and counts; `replace-plan.test.ts` selected matches. Native check of mixed selections is still needed.
3. **Automated:** `replace-plan.test.ts` changed disk and changed open buffers. Native check of an external edit between preview and apply is needed.
4. **Automated:** `replace-flow.test.ts` snapshot label and `replace-plan.test.ts` snapshot-before-write. Native Recovery inspection needed.
5. **Automated:** `replace-plan.test.ts` undo conditions and inverse ranges; `replace-flow.test.ts` invalidation by another replace. Native undo and cursor/scroll check needed.
6. **Automated:** Rust `offsets_expansion_override_and_limits`, `groups_empty_multiline_and_paths` and `search-panel.test.ts` group error and inline expansion. Native full date replacement needed.
7. **Automated:** `replace-plan.test.ts` glob filtering and `search-panel.test.ts` exclude filtering. Native include/exclude check needed.
8. **Automated:** Rust `offsets_expansion_override_and_limits` and `replace-plan.test.ts` UTF-16 application. Native check needed.
9. **Automated:** Rust `offsets_expansion_override_and_limits` and `groups_empty_multiline_and_paths`; native check of limit and empty-pattern messages needed.
10. **Automated:** `replace-sheets.test.ts` renders hostile filename and line as text. Native visual check needed.
11. **Automated:** `replace-plan.test.ts` folder changed stops remaining files. Native folder-switch check needed.
12. **Automated:** Rust `replace::tests`; `replace-plan.test.ts`, `replace-flow.test.ts`, `replace-sheets.test.ts`, and `search-panel.test.ts`.
