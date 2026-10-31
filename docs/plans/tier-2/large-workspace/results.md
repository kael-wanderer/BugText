# S8 large-workspace results

## Baseline

2,000 notes (~8 KB each), 1,000 other files, local debug build. Rust initial scan: 718.76 ms, 2,000 notes, 17,166,595 result bytes and 320,391 known bytes. Unchanged scan: 32.04 ms, zero notes, 320,426 result bytes. Frontend fixture: unchanged refresh 0.25 ms; 20 backlinks lookups 119.41 ms; Links panel 15.75 ms; table update 18.32 ms. Timings vary by machine.

After task 5: initial scan 797.56 ms, 2,000 notes, 17,086,637 result bytes, 240,391 known bytes; unchanged scan 88.31 ms, zero notes, 79 result bytes. Unchanged files are read to retain full unreadable/invalid-UTF-8 skip reporting, but are not reparsed or returned. The request is 75% of the original 320,391-byte baseline, so the spec's 50% request-size target is not yet met.

Follow-up: folder-relative known paths reduced the measured request to 102,391 bytes, 32% of the 320,391-byte baseline. The unchanged response remained 79 bytes. Unchanged scan time was 86.09 ms on this run.
