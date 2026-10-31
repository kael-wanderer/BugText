# Unlinked mentions results

- Matching exclusions, Unicode boundaries and case: `mentions.test.ts`.
- Collapsed/expanded scan, session Skip and cancellation: `mentions-section.test.ts`, `mentions-panel.test.ts`, `mention-scan.test.ts`.
- Exact span and resolving link target: `mentions.test.ts`.
- Open tab one undo step and dirty state: native check needed; `mentions-section.test.ts` verifies one buffer apply and no disk write.
- Closed note Recovery before write: `links-write.test.ts`; native Recovery entry check needed.
- Stale source and Refresh: `mentions-section.test.ts`.
- Batch selection: `links-rename.test.ts`; batch action: `mentions-section.test.ts`.
- Cap: `mention-scan.test.ts` covers 200-result cap; native panel check needed for cap message.
- Hostile title and source: `mentions-section.test.ts`.
- Regex characters: `mentions.test.ts`.
- No file reads or writes during scanning: `mention-scan.test.ts` uses in-memory notes; native instrumentation check needed.
- Outside-folder and traversal paths: `links-write.test.ts`.
- Large-folder scan responsiveness: native check needed; individual notes are processed atomically.
