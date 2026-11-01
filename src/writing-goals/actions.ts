import { openGoalPopover } from "./popover";
import { removeProperty } from "../properties/edit";
import type { PropertyEdit } from "../properties/edit";
import type { SessionState } from "./session";

type Note = { source: string; markdown: boolean; current(): boolean; apply(edit: PropertyEdit): void };
type Actions = { note: Note | null; session: SessionState | null; readingTime: boolean; update(session: number | null | "keep", readingTime: boolean): void };
export function showGoals(anchor: HTMLElement, options: Actions): void {
  openGoalPopover({ anchor, note: options.note, session: options.session, readingTime: options.readingTime,
    apply(result) {
      if (result.noteEdit) {
        if (!options.note?.current()) return false;
        options.note.apply(result.noteEdit);
      }
      options.update(result.session, result.readingTime); return true;
    },
  });
}
export function clearGoals(note: Note | null): boolean {
  if (!note?.markdown) return true;
  const edit = removeProperty(note.source, "word_goal");
  if (!edit) return true;
  if (!note.current()) return false;
  note.apply(edit); return true;
}
