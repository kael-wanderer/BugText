import type { IndexedNote } from "../links/index";
import { scanMarkdownLines } from "../markdown-blocks";
import { taskAt, taskToggleChange } from "../tasks";
import { tagAncestors, tagKey } from "../properties/tags";

export type InboxTask = { path: string; source: string; line: number; offset: number; checked: boolean; text: string; heading: string };
export type InboxFilter = { state: "incomplete" | "completed" | "all"; tag: string; folder: string };

const cached = new WeakMap<IndexedNote, InboxTask[]>();
export function noteTasks(note: IndexedNote): InboxTask[] {
  const previous = cached.get(note); if (previous) return previous;
  const lines = note.source.split("\n"); const scanned = scanMarkdownLines(note.source);
  let offset = 0, heading = "";
  const tasks: InboxTask[] = [];
  lines.forEach((line, index) => {
    if (!scanned[index].code && scanned[index].text === line) {
      const headingMatch = /^ {0,3}#{1,6}\s+(.+)$/.exec(line);
      if (headingMatch) heading = headingMatch[1];
      const marker = taskAt(line);
      if (marker) tasks.push({ path: note.path, source: note.source, line: index + 1, offset, checked: marker.checked, text: line.slice(marker.offset + 2).trim(), heading });
    }
    offset += line.length + 1;
  });
  cached.set(note, tasks); return tasks;
}
export function inboxTasks(notes: IndexedNote[], filter: InboxFilter): InboxTask[] {
  return notes.filter(note => (!filter.folder || note.path.startsWith(filter.folder.replace(/\/$/, "") + "/")) && (!filter.tag || note.tags.some(tag => tagAncestors(tag).map(tagKey).includes(tagKey(filter.tag)))))
    .sort((a, b) => a.path.localeCompare(b.path)).flatMap(noteTasks)
    .filter(task => filter.state === "all" || task.checked === (filter.state === "completed"));
}
export function inboxTaskChange(task: InboxTask, current: string) {
  if (current !== task.source) throw new Error("This task changed. Refresh the list and try again.");
  const line = current.split("\n")[task.line - 1];
  const change = taskToggleChange(line, task.offset);
  if (!change) throw new Error("This task is no longer available.");
  return change;
}
