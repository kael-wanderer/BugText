# S8 large-workspace results

## Baseline

2,000 notes (~8 KB each), 1,000 other files, local debug build. Rust initial scan: 718.76 ms, 2,000 notes, 17,166,595 result bytes and 320,391 known bytes. Unchanged scan: 32.04 ms, zero notes, 320,426 result bytes. Frontend fixture: unchanged refresh 0.25 ms; 20 backlinks lookups 119.41 ms; Links panel 15.75 ms; table update 18.32 ms. Timings vary by machine.

After task 5: initial scan 797.56 ms, 2,000 notes, 17,086,637 result bytes, 240,391 known bytes; unchanged scan 88.31 ms, zero notes, 79 result bytes. Unchanged files are read to retain full unreadable/invalid-UTF-8 skip reporting, but are not reparsed or returned. The request is 75% of the original 320,391-byte baseline, so the spec's 50% request-size target is not yet met.

Follow-up: folder-relative known paths reduced the measured request to 102,391 bytes, 32% of the 320,391-byte baseline. The unchanged response remained 79 bytes. Unchanged scan time was 86.09 ms on this run.

## Acceptance and remaining verification

- Baseline: Rust scan and payload and Links panel timings are above; the native idle-tick baseline was not recorded before implementation. This is a deviation that cannot be reconstructed from these measurements.
- Unchanged index notifications: `notifies only when refresh changes indexed content or skipped notes`; frame coalescing: `coalesces requests and cancels pending frames`; graph idle: `keeps the layout when edits leave the graph snapshot unchanged`. A combined 20-tick render/graph spy remains a native check.
- Main-thread idle time ≤5 ms: native check.
- No-change payload: benchmark above (79-byte response, 102,391-byte request versus 320,391-byte baseline).
- One external edit gives one notify and one render: native check.
- Focus deduplication: `deduplicates focus notifications within 250 ms`; full native refresh count remains a native check.
- Explorer idle with 10 expanded folders: `notifies once for changes across expanded directories and never for unchanged entries`.
- Two native windows and clean-tab reload within 3 seconds: native check; `schedules only tab checks while unfocused and a full refresh on focus` simulates the cadence and dirty-tab rule.
- Typing scan/backlink counts and keystroke p95: native check.
- PDF binary IPC: `reads the binary response as bytes`, `uses no numeric-array IPC for file bytes`, and `binary_read_preserves_bytes`. 50 MB first-page timing is a native check; no pre-change native timing was captured.
- Thresholds, hysteresis, capped mode and Off: `uses hysteresis and the 10-second cadence for large folders`; `reports capped indexes and removes the notice when cleared`.
- Dirty tabs: simulated scheduler test above; native external-change check still needed.
- Stale scan: `drops an old folder's refresh without notifying`.
- Small folders and hostile filenames: `leaves small-folder notices hidden and treats hostile names as text` and `shows the status control only for large folders`.
- Private diagnostics and focus return: `limits the sheet to 20 ticks, copies only metrics and returns focus`.
