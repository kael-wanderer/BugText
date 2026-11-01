import { goalText, goalTitle } from "../writing-goals/labels";
import { goalRing } from "../writing-goals/ring";
import { fileLanguageInfo, isPdfFile } from "../document-kind";
import { countWords, cursorLabel, saveStateText } from "./model";

export type StatusBarState = {
  pathOrName: string | null;
  enabled: boolean;
  cursor: { line: number; column: number };
  selection: string;
  words: number;
  dirty: boolean;
  recovered: boolean;
  largeFolder: boolean;
  readingTime: boolean;
  noteGoal: { goal: number; words: number } | null;
  session: { goal: number; written: number } | null;
};

export function createStatusBar(host: HTMLElement, goToLine: () => void, onLargeFolder: () => void = () => {}, onGoals: (anchor: HTMLElement) => void = () => {}) {
  const bar = document.createElement("div");
  bar.className = "status-bar";
  const cursor = document.createElement("button");
  cursor.type = "button";
  cursor.setAttribute("aria-label", "Go to line");
  cursor.addEventListener("click", goToLine);
  const selection = document.createElement("span");
  const words = document.createElement("button");
  words.type = "button";
  const save = document.createElement("span");
  save.className = "status-bar-save";
  save.setAttribute("role", "status");
  save.setAttribute("aria-live", "polite");
  const large = document.createElement("button");
  large.type = "button"; large.className = "status-bar-large"; large.textContent = "Large folder";
  large.title = "Folder checked every 10 s · Show diagnostics"; large.onclick = onLargeFolder;
  const sessionButton = document.createElement("button");
  sessionButton.type = "button";
  words.addEventListener("click", () => onGoals(words));
  sessionButton.addEventListener("click", () => onGoals(sessionButton));
  bar.append(cursor, selection, words, sessionButton, large, save);
  function renderGoal(button: HTMLButtonElement, value: number, goal: number, session: boolean): void {
    const done = value >= goal;
    button.classList.toggle("done", done);
    button.title = goalTitle(value, goal, session);
    button.removeAttribute("aria-label");
    button.replaceChildren(goalRing(value / goal), document.createTextNode(`${done ? "✓ " : ""}${goalText(value, goal, session)}`));
  }
  return {
    update(state: StatusBarState): void {
      const kind = fileLanguageInfo(state.pathOrName).editor;
      const shown = state.enabled && state.pathOrName !== null && !isPdfFile(state.pathOrName) && (kind === "markdown" || kind === "plain");
      // The bar replaces the window footer's word count and cursor while it shows.
      document.documentElement.classList.toggle("status-bar-active", shown);
      if (!shown) {
        bar.remove();
        return;
      }
      large.hidden = !state.largeFolder;
      cursor.textContent = cursorLabel(state.cursor);
      selection.hidden = !state.selection.length;
      selection.textContent = state.selection.length
        ? `${countWords(state.selection).toLocaleString("en-US")} words · ${state.selection.length.toLocaleString("en-US")} chars selected` : "";
      const first = state.noteGoal ?? (state.session ? { goal: state.session.goal, words: state.session.written } : null);
      if (first) renderGoal(words, first.words, first.goal, !state.noteGoal);
      else {
        words.classList.remove("done"); words.title = ""; words.setAttribute("aria-label", "Writing goals");
        words.textContent = `${state.words.toLocaleString("en-US")} ${state.words === 1 ? "word" : "words"}${state.readingTime ? ` · ≈ ${Math.ceil(state.words / 230)} min` : ""}`;
      }
      sessionButton.hidden = !(state.noteGoal && state.session);
      if (state.noteGoal && state.session) renderGoal(sessionButton, state.session.written, state.session.goal, true);
      const saveText = saveStateText(state.dirty, state.recovered);
      // Do not retrigger the live region on cursor-only updates.
      if (save.textContent !== saveText) save.textContent = saveText;
      save.classList.toggle("pending", state.dirty || state.recovered);
      if (bar.parentElement !== host) host.append(bar);
    },
  };
}
