import { applyMatches, inverseChanges, toChanges, type ReplacePreview, type ReplaceSelection, type UndoRecord } from "./plan";

type Change = { from: number; to: number; insert: string };
export type ReplaceDeps = {
  findOpen: (path: string) => { text: string; apply: (changes: Change[]) => void } | null;
  read: (path: string) => Promise<string>;
  snapshot: (path: string, text: string, label: string) => Promise<unknown>;
  write: (path: string, contents: string, expected: string) => Promise<void>;
  folderStillOpen: () => boolean;
};
export type Failure = { path: string; reason: string };
const short = (s: string) => s.length > 40 ? s.slice(0, 40) + "…" : s;
export async function applyReplace(preview: ReplacePreview, selection: ReplaceSelection, folder: string, deps: ReplaceDeps, query: string, replacement: string) {
  const changed: { path: string; matches: number }[] = [], notChanged: Failure[] = [], undo: UndoRecord[] = [];
  const root = folder.replace(/\/$/, "");
  for (const [i, file] of preview.files.entries()) {
    const matches = file.matches.filter((_, j) => selection[i]?.[j]);
    if (!matches.length) continue;
    const path = `${root}/${file.relative}`;
    const fail = (reason: string) => notChanged.push({ path, reason });
    if (!deps.folderStillOpen()) { fail("folder changed"); continue; }
    if (!file.relative || /^(?:\/|[a-z]:)/i.test(file.relative) || file.relative.split(/[\\/]/).includes("..")) { fail("outside the folder"); continue; }
    const after = applyMatches(file.source, matches);
    const open = deps.findOpen(path);
    if (open) {
      if (open.text !== file.source) { fail("changed since preview"); continue; }
      open.apply(toChanges(matches));
      changed.push({ path, matches: matches.length }); undo.push({ path, before: file.source, after, open: true, inverse: inverseChanges(file.source, matches) }); continue;
    }
    try {
      if (await deps.read(path) !== file.source) { fail("changed on disk"); continue; }
      await deps.snapshot(path, file.source, `Before replace “${short(query)}” → “${short(replacement)}”`);
      if (!deps.folderStillOpen()) { fail("folder changed"); continue; }
      if (await deps.read(path) !== file.source || deps.findOpen(path)) { fail("changed on disk"); continue; }
      if (!deps.folderStillOpen()) { fail("folder changed"); continue; }
      await deps.write(path, after, file.source);
      changed.push({ path, matches: matches.length }); undo.push({ path, before: file.source, after, open: false, inverse: inverseChanges(file.source, matches) });
    } catch { fail("couldn't be written"); }
  }
  return { changed, notChanged, undo };
}
export async function undoReplace(records: UndoRecord[], deps: ReplaceDeps) {
  const undone: string[] = [], notUndone: Failure[] = [];
  for (const record of records) {
    try {
      if (!deps.folderStillOpen()) { notUndone.push({ path: record.path, reason: "folder changed" }); continue; }
      const open = deps.findOpen(record.path);
      if (open) {
        if (open.text !== record.after) throw new Error();
        open.apply(record.inverse);
      } else {
        if (record.open || await deps.read(record.path) !== record.after || deps.findOpen(record.path) || !deps.folderStillOpen()) throw new Error();
        await deps.snapshot(record.path, record.after, "Before undo replace");
        if (!deps.folderStillOpen() || await deps.read(record.path) !== record.after || deps.findOpen(record.path)) throw new Error();
        await deps.write(record.path, record.before, record.after);
      }
      undone.push(record.path);
    } catch { notUndone.push({ path: record.path, reason: "not undone; restore from Recovery" }); }
  }
  return { undone, notUndone };
}
