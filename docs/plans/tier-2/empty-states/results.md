# Empty states and first-run results

- No-folder and empty-folder actions, live tree changes and hidden files: `updates explorer empty states and invokes their actions`.
- Finished search, filter clearing and safe query rendering: `shows finished empty results and clears active file filters`; running search: `does not show empty results while a search is running`.
- Resolved key hints, override and unbinding: `identifies visibly empty folders and displays resolved key hints`.
- Fresh, old and corrupt settings: `shows the first-run hint only for explicit fresh settings`; dismissal and shortcuts: `renders the hint and wires dismissal and shortcuts`; one write and failed writes: `writes once only for an explicitly fresh setting`, `hides the hint and shows a generic toast when saving fails`.
- Native checks: first launch with no settings file, restart after dismissal, folder-open and save persistence, cross-window dismissal broadcast, loading/recovery/settings suppression, keyboard navigation and theme appearance.
