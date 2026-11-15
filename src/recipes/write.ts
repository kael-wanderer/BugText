/** Writes a recipe's output note by the app's three routes: open tab, closed note, new note. */
import type { TextChange } from "../tasks";
import { wholeChange } from "../text-change";

export { wholeChange };

export type OutputDeps = {
  folder: string;
  folderNow: () => string | null; // the open folder at the time of the call
  findOpen: (path: string) => { text: string; apply: (changes: TextChange[]) => boolean } | null; // false: the tab refused
  read: (path: string) => Promise<string>; // rejects when the note is missing
  changed: (path: string, text: string, saved: boolean) => void; // link and workspace indexes
  snapshot: (path: string, text: string) => Promise<unknown>; // label "Before recipe run"
  write: (path: string, contents: string, expected: string) => Promise<void>;
  create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>;
};
export type Current = { kind: "new" } | { kind: "open"; text: string } | { kind: "closed"; text: string };

const CHANGED = "The output note changed. Run the recipe again.";

/** The output note as it is now: the open tab's text, else the disk; a note that cannot be read is new. */
export async function currentOutput(path: string, deps: OutputDeps): Promise<Current> {
  const tab = deps.findOpen(path);
  if (tab) return { kind: "open", text: tab.text };
  try { return { kind: "closed", text: await deps.read(path) }; }
  catch { return { kind: "new" }; }
}

/** Writes `next` when the note is still as `base` saw it; otherwise throws and writes nothing. */
export async function writeOutput(path: string, next: string, base: Current, deps: OutputDeps): Promise<{ path: string }> {
  if (deps.folderNow() !== deps.folder) throw new Error("The folder changed. Run the recipe again.");
  const tab = deps.findOpen(path);
  if (base.kind === "open") {
    if (!tab || tab.text !== base.text) throw new Error(CHANGED);
    if (!tab.apply([wholeChange(tab.text, next)])) throw new Error(CHANGED);
    deps.changed(path, next, false);
    return { path };
  }
  if (tab) throw new Error(CHANGED);
  if (base.kind === "closed") {
    if (await deps.read(path) !== base.text) throw new Error(CHANGED);
    await deps.snapshot(path, base.text);
    await deps.write(path, next, base.text);
    deps.changed(path, next, true);
    return { path };
  }
  const relative = path.slice(deps.folder.replace(/\/$/, "").length + 1);
  const slash = relative.lastIndexOf("/");
  const created = await deps.create({
    folder: deps.folder,
    relativeDir: slash < 0 ? "" : relative.slice(0, slash),
    stem: relative.slice(slash + 1).replace(/\.md$/i, ""),
    contents: next,
  });
  deps.changed(created, next, true);
  return { path: created };
}
