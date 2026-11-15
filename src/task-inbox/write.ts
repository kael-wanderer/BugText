// Ticks a task from Tasks in Folder or Project Overview (spec 4.3). An open note changes
// through its editor; a closed note gets a Recovery snapshot, then a checked atomic write.
import type { TextChange } from "../tasks";
import { inboxTaskChange, type InboxTask } from "./model";

export type TaskWriteDeps = {
  folder: () => string | null;
  /** The note when it is open in any tab; apply returns false when the tab refused the change. */
  findOpen: (path: string) => { text: string; apply: (changes: TextChange[]) => boolean } | null;
  read: (path: string) => Promise<string>;
  /** manualSnapshot(path, text, "Before task edit", true) */
  snapshot: (path: string, text: string) => Promise<void>;
  /** write_file_atomic with expected text */
  write: (path: string, contents: string, expected: string) => Promise<void>;
  /** The note's new text, for the link and workspace indexes. */
  changed: (path: string, text: string) => void;
  stamp: () => string | null;
};

const applyAll = (text: string, changes: TextChange[]): string =>
  [...changes].sort((a, b) => b.from - a.from).reduce((out, c) => out.slice(0, c.from) + c.insert + out.slice(c.to), text);

export async function toggleTask(task: InboxTask, deps: TaskWriteDeps): Promise<void> {
  const root = deps.folder()?.replace(/\/+$/, "");
  if (!root || !task.path.startsWith(`${root}/`)) throw new Error("The folder changed. Refresh the tasks list.");
  const open = deps.findOpen(task.path);
  if (open) {
    const changes = inboxTaskChange(task, open.text, deps.stamp());
    if (!open.apply(changes)) throw new Error("This note changed. Refresh the tasks list and try again.");
    return;
  }
  const text = await deps.read(task.path);
  const changes = inboxTaskChange(task, text, deps.stamp());
  await deps.snapshot(task.path, text);
  const next = applyAll(text, changes);
  await deps.write(task.path, next, text);
  deps.changed(task.path, next);
}
