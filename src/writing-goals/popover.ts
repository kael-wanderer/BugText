import { readProperties } from "../properties/parse";
import { removeProperty, setProperty, type PropertyEdit } from "../properties/edit";
import { parseGoalInput, readNoteGoal } from "./note-goal";
import type { SessionState } from "./session";

export type GoalPopoverOptions = {
  anchor: HTMLElement;
  note: { source: string; markdown: boolean } | null;
  session: SessionState | null;
  readingTime: boolean;
  apply(result: { noteEdit: PropertyEdit | null; expectedSource: string; session: number | null | "keep"; readingTime: boolean }): boolean;
};

export function openGoalPopover(options: GoalPopoverOptions): () => void {
  const panel = document.createElement("div"); panel.className = "goal-popover"; panel.setAttribute("role", "dialog");
  const source = options.note?.source ?? "";
  const goal = readNoteGoal(source);
  const properties = readProperties(source);
  function field(label: string): { input: HTMLInputElement; hint: HTMLElement; error: HTMLElement } {
    const wrapper = document.createElement("label");
    const title = document.createElement("span"); title.textContent = label;
    const input = document.createElement("input"); input.type = "number"; input.placeholder = "No goal"; input.min = "1"; input.max = "1000000"; input.step = "1";
    const hint = document.createElement("small"), error = document.createElement("small"); error.className = "goal-error";
    wrapper.append(title, input, hint, error); panel.append(wrapper); return { input, hint, error };
  }
  const note = field("This note"), session = field("This session");
  note.input.value = goal.kind === "set" ? String(goal.goal) : "";
  if (!options.note?.markdown) { note.input.disabled = true; note.hint.textContent = "Plain-text files have no properties"; }
  else if (properties && !properties.ok) { note.input.readOnly = true; note.hint.textContent = "Fix the note's properties to set a goal"; }
  else if (goal.kind === "invalid") note.hint.textContent = "word_goal in this note's properties is not a whole number.";
  session.input.value = options.session ? String(options.session.goal) : "";
  if (options.session) {
    const date = new Date(options.session.startedAt);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    session.hint.textContent = `Started ${time} · ${options.session.written.toLocaleString("en-US")} words written`;
  }
  const checkLabel = document.createElement("label"); checkLabel.className = "goal-reading-time";
  const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = options.readingTime;
  const checkText = document.createElement("span"); checkText.textContent = "Show reading time"; checkLabel.append(checkbox, checkText); panel.append(checkLabel);
  const message = document.createElement("div"); message.className = "goal-error"; panel.append(message);
  const buttons = document.createElement("div"); buttons.className = "goal-buttons";
  const clear = document.createElement("button"), done = document.createElement("button"); clear.type = done.type = "button"; clear.textContent = "Clear"; done.textContent = "Done"; buttons.append(clear, done); panel.append(buttons);
  document.body.append(panel);
  const rect = options.anchor.getBoundingClientRect(), box = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`;
  // Anchor by the bottom edge so error lines grow the panel upward, away from the anchor.
  if (rect.top - box.height - 8 >= 8) panel.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  else panel.style.top = "8px";
  let closed = false;
  function close(): void { if (closed) return; closed = true; document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key, true); panel.remove(); options.anchor.focus(); }
  function outside(event: Event): void { if (!panel.contains(event.target as Node) && !options.anchor.contains(event.target as Node)) close(); }
  function apply(): void {
    note.error.textContent = session.error.textContent = message.textContent = "";
    const noteValue = parseGoalInput(note.input.value), sessionValue = parseGoalInput(session.input.value);
    if (!note.input.disabled && !note.input.readOnly && noteValue === "invalid") note.error.textContent = "Enter a whole number of words.";
    if (sessionValue === "invalid") session.error.textContent = "Enter a whole number of words.";
    if (note.error.textContent || session.error.textContent) return;
    let edit: PropertyEdit | null = null;
    if (!note.input.disabled && !note.input.readOnly && noteValue !== "invalid") {
      const unchanged = goal.kind === "set" ? noteValue === goal.goal : goal.kind === "none" && noteValue === null;
      if (!unchanged) {
        edit = noteValue === null ? removeProperty(source, "word_goal") : setProperty(source, "word_goal", noteValue);
        if (!edit) { message.textContent = "Fix the note's properties to set a goal"; return; }
      }
    }
    const nextSession = sessionValue === options.session?.goal || (sessionValue === null && !options.session) ? "keep" : sessionValue;
    if (nextSession === "invalid") return;
    if (!options.apply({ noteEdit: edit, expectedSource: source, session: nextSession, readingTime: checkbox.checked })) { message.textContent = "The note changed. Try again."; return; }
    close();
  }
  function key(event: KeyboardEvent): void { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } else if (event.key === "Enter") { event.preventDefault(); apply(); } }
  clear.onclick = () => { if (!note.input.disabled && !note.input.readOnly) note.input.value = ""; session.input.value = ""; apply(); };
  done.onclick = apply;
  document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key, true);
  (note.input.disabled || note.input.readOnly ? session.input : note.input).focus();
  return close;
}
