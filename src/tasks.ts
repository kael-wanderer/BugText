import { markdownCodeLines } from "./markdown-blocks";

export type TaskMarker = { offset: number; checked: boolean };
const marker = /^\s*(?:[-*+]\s+|\d+[.)]\s+)\[([ xX])\]/;
export function taskAt(line: string): TaskMarker | null {
  const match = marker.exec(line);
  if (!match) return null;
  return { offset: match.index + match[0].lastIndexOf("[") + 1, checked: match[1].toLowerCase() === "x" };
}
export function toggleTaskLine(line: string): string {
  const task = taskAt(line);
  if (!task) return line;
  return line.slice(0, task.offset) + (task.checked ? " " : "x") + line.slice(task.offset + 1);
}
export function toggleTaskLines(source: string, lineNumbers: number[]): { from: number; to: number; insert: string }[] {
  const lines = source.split(/\r?\n/), blocked = markdownCodeLines(source), edits = [] as { from: number; to: number; insert: string }[];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lineNumbers.includes(i + 1) && !blocked[i]) {
      const task = taskAt(lines[i]);
      if (task) edits.push({ from: offset + task.offset, to: offset + task.offset + 1, insert: task.checked ? " " : "x" });
      else edits.push({ from: offset, to: offset, insert: "- [ ] " });
    }
    offset += lines[i].length + (i < lines.length - 1 ? 1 : 0);
  }
  return edits;
}
