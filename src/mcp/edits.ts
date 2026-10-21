import { hashText } from "../hash";

export type NoteEdit = { old: string; new: string };
export type TextChange = { from: number; to: number; insert: string };
export type ApplyEditsResult =
  | { ok: true; text: string; changes: TextChange[] }
  | { ok: false; error: string };

function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  while (from <= text.length - needle.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    found.push(index);
    from = index + 1;
  }
  return found;
}

function currentRange(change: TextChange, changes: TextChange[]): [number, number] {
  let delta = 0;
  for (const previous of [...changes].sort((a, b) => a.from - b.from)) {
    if (previous === change) break;
    delta += previous.insert.length - (previous.to - previous.from);
  }
  const from = change.from + delta;
  return [from, from + change.insert.length];
}

function singleDiff(original: string, text: string): TextChange[] {
  let from = 0;
  const maxPrefix = Math.min(original.length, text.length);
  while (from < maxPrefix && original[from] === text[from]) from += 1;
  let originalEnd = original.length;
  let textEnd = text.length;
  while (
    originalEnd > from &&
    textEnd > from &&
    original[originalEnd - 1] === text[textEnd - 1]
  ) {
    originalEnd -= 1;
    textEnd -= 1;
  }
  return [{ from, to: originalEnd, insert: text.slice(from, textEnd) }];
}

export function applyEdits(text: string, edits: NoteEdit[]): ApplyEditsResult {
  const original = text;
  const changes: TextChange[] = [];
  let overlaps = false;
  for (let index = 0; index < edits.length; index += 1) {
    const edit = edits[index];
    if (!edit.old) return { ok: false, error: `Edit ${index + 1}: old text is empty.` };
    const matches = occurrences(text, edit.old);
    if (matches.length === 0)
      return { ok: false, error: `Edit ${index + 1}: text not found.` };
    if (matches.length > 1)
      return {
        ok: false,
        error: `Edit ${index + 1}: text found ${matches.length} times; add more context.`,
      };
    const from = matches[0];
    const to = from + edit.old.length;
    let delta = 0;
    for (const previous of changes) {
      const [previousFrom, previousTo] = currentRange(previous, changes);
      if (from < previousTo && to > previousFrom) overlaps = true;
      if (previousTo <= from)
        delta += previous.insert.length - (previous.to - previous.from);
    }
    const originalFrom = from - delta;
    const originalTo = to - delta;
    if (
      changes.some(
        (previous) =>
          originalFrom < previous.to && originalTo > previous.from,
      )
    )
      overlaps = true;
    text = text.slice(0, from) + edit.new + text.slice(to);
    if (edit.old !== edit.new)
      changes.push({ from: originalFrom, to: originalTo, insert: edit.new });
  }
  if (overlaps) return { ok: true, text, changes: singleDiff(original, text) };
  changes.sort((a, b) => a.from - b.from);
  return { ok: true, text, changes };
}

export function checkRevision(
  text: string,
  revision: string | undefined,
): string | null {
  return revision === hashText(text)
    ? null
    : "The note changed since you read it. Read it again.";
}
