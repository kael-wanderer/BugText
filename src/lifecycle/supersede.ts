// Mark as Superseded By… (spec 4.1): status and superseded_by set as one text change, so
// an open note gets one undo step and a closed note one write.
import type { setProperty as SetProperty } from "../properties/edit";
import type { TextChange } from "../tasks";
import { wholeChange } from "../text-change";

const applyEdit = (source: string, edit: { from: number; to: number; insert: string }): string =>
  source.slice(0, edit.from) + edit.insert + source.slice(edit.to);

/** One change setting status: superseded and superseded_by: link; null when the properties cannot be edited. */
export function supersedeChange(source: string, link: string, set: typeof SetProperty): TextChange | null {
  const first = set(source, "status", "superseded");
  if (!first) return null;
  const middle = applyEdit(source, first);
  const second = set(middle, "superseded_by", link);
  if (!second) return null;
  return wholeChange(source, applyEdit(middle, second));
}
