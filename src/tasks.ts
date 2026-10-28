// Markdown task items (`- [ ] text`, `1. [x] text`): find the marker on a
// source line and build the edits that tick or untick it.
import { scanMarkdownLines } from "./markdown-blocks";

export type TaskMarker = {
  /** Offset of the character between the brackets. */
  offset: number;
  checked: boolean;
};

export type TextChange = { from: number; to: number; insert: string };

const TASK = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=\s|$)/;
const LIST_ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+)/;

export function taskAt(line: string): TaskMarker | null {
  const match = TASK.exec(line);
  if (!match) return null;
  return { offset: match[1].length + 1, checked: match[2] !== " " };
}

/** The one-character change that flips the task on `line`, or null. */
export function taskToggleChange(line: string, lineStart: number): TextChange | null {
  const task = taskAt(line);
  if (!task) return null;
  const from = lineStart + task.offset;
  return { from, to: from + 1, insert: task.checked ? " " : "x" };
}

/**
 * Toggle Task over 1-based `lineNumbers` of a "\n"-separated source: tasks flip,
 * list items gain `[ ] `, other text lines become `- [ ] ` items. Code, front
 * matter, commented-out and blank lines are left alone.
 */
export function toggleTaskChanges(source: string, lineNumbers: number[]): TextChange[] {
  const wanted = new Set(lineNumbers);
  const scanned = scanMarkdownLines(source);
  const changes: TextChange[] = [];
  let start = 0;
  source.split("\n").forEach((line, index) => {
    const lineStart = start;
    start += line.length + 1;
    const info = scanned[index];
    if (!wanted.has(index + 1) || info.code || !line.trim() || info.text !== line) return;
    const toggle = taskToggleChange(line, lineStart);
    if (toggle) {
      changes.push(toggle);
      return;
    }
    const item = LIST_ITEM.exec(line);
    const at = lineStart + (item ? item[1].length : line.length - line.trimStart().length);
    changes.push({ from: at, to: at, insert: item ? "[ ] " : "- [ ] " });
  });
  return changes;
}
