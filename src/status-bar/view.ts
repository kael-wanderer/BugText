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
};

export function createStatusBar(host: HTMLElement, goToLine: () => void, onLargeFolder: () => void = () => {}) {
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
  bar.append(cursor, selection, words, large, save);
  let readingTime = false;
  let wordCount = 0;
  const updateWords = (): void => {
    words.textContent = `${wordCount.toLocaleString("en-US")} ${wordCount === 1 ? "word" : "words"}${readingTime ? ` · ≈ ${Math.ceil(wordCount / 230)} min` : ""}`;
    words.setAttribute("aria-label", readingTime ? "Hide reading time" : "Show reading time");
    words.setAttribute("aria-pressed", String(readingTime));
  };
  words.addEventListener("click", () => { readingTime = !readingTime; updateWords(); });
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
      if (wordCount !== state.words || !words.textContent) { wordCount = state.words; updateWords(); }
      const saveText = saveStateText(state.dirty, state.recovered);
      // Do not retrigger the live region on cursor-only updates.
      if (save.textContent !== saveText) save.textContent = saveText;
      save.classList.toggle("pending", state.dirty || state.recovered);
      if (bar.parentElement !== host) host.append(bar);
    },
  };
}
