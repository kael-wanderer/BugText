// Mark as Superseded By… (spec 4.1): pick the replacing note, then set status and
// superseded_by. An open note changes through its editor; a closed note gets a Recovery
// snapshot and a checked atomic write. Loads on demand.
import type { setProperty as SetProperty } from "../properties/edit";
import { formatLinkTarget } from "../links/parse";
import { supersedeChange } from "./supersede";
import type { TextChange } from "../tasks";

export type MarkDeps = {
  folder: string | null;
  /** Markdown notes of the open folder, relative to it. */
  notes: () => string[];
  pick: (files: string[]) => Promise<string | null>;
  setProperty: typeof SetProperty;
  findOpen: (path: string) => { text: string; apply: (changes: TextChange[]) => void } | null;
  read: (path: string) => Promise<string>;
  snapshot: (path: string, text: string) => Promise<unknown>;
  write: (path: string, contents: string, expected: string) => Promise<void>;
  toast: (text: string) => void;
};

const fileName = (path: string): string => path.split("/").pop() ?? path;

export async function markSuperseded(path: string, deps: MarkDeps): Promise<void> {
  const root = deps.folder?.replace(/\/+$/, "");
  if (!root || !path.startsWith(`${root}/`)) { deps.toast("Open the note from a folder first."); return; }
  const self = path.slice(root.length + 1);
  const chosen = await deps.pick(deps.notes().filter((file) => file !== self));
  if (!chosen) return;
  const target = `${root}/${chosen}`;
  const link = formatLinkTarget(path, target);
  try {
    const open = deps.findOpen(path);
    const text = open ? open.text : await deps.read(path);
    const change = supersedeChange(text, link, deps.setProperty);
    if (!change) { deps.toast("Fix this note's properties first."); return; }
    if (open) open.apply([change]);
    else {
      await deps.snapshot(path, text);
      await deps.write(path, text.slice(0, change.from) + change.insert + text.slice(change.to), text);
    }
    deps.toast(`Marked as superseded by ${fileName(chosen)}`);
  } catch (error) {
    deps.toast(`Could not mark this note: ${error instanceof Error ? error.message : String(error)}`);
  }
}
