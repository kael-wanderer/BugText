# Recovery and version history

### REC-01 — Saved-file crash recovery
- Steps: Open a saved file, edit without saving, wait two seconds, force-quit, relaunch.
- Expected: The recovery banner lists the file; Restore all opens the unsaved text
  with a dirty marker and does not modify the disk file.
- Status: [ ]  Notes:

### REC-02 — Untitled crash recovery and discard
- Steps: Type in an untitled tab, force-quit, relaunch, choose Discard all, relaunch.
- Expected: The first relaunch offers the untitled draft; the second shows no banner.
- Status: [ ]  Notes:

### REC-03 — Clean external change
- Steps: Open a saved file without editing it, change it in another editor, refocus Bugter.
- Expected: Bugter reloads the new disk contents without marking the tab dirty.
- Status: [ ]  Notes:

### REC-04 — Dirty external conflict
- Steps: Edit a file in Bugter, change it externally, refocus Bugter, choose Keep mine.
- Expected: The Bugter buffer remains intact and a side-by-side disk/editor comparison opens.
- Status: [ ]  Notes:

### REC-05 — Pre-save overwrite guard
- Steps: Open and edit a file in Bugter, change it externally, then save from Bugter.
- Expected: Bugter asks before overwriting the newer disk contents; Cancel leaves both intact.
- Status: [ ]  Notes:

### REC-06 — Deleted file
- Steps: Open a file, delete it externally, refocus Bugter, then save.
- Expected: The tab becomes dirty and Save recreates the file from the editor buffer.
- Status: [ ]  Notes:

### REC-07 — Snapshot history
- Steps: Save changed contents three times, run Snapshot Now, then Show Version History.
- Expected: Versions are newest-first; Compare opens a diff and Restore loads the
  selected version as dirty unsaved edits.
- Status: [ ]  Notes:

### REC-08 — Snapshot retention
- Steps: Create more than 50 snapshots for one file and reopen history.
- Expected: At most 50 remain; entries beyond the newest ten are pruned after 30 days.
- Status: [ ]  Notes:
