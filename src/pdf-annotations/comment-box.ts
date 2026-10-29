export function createCommentBox(doc: Document, value: string, onSave: (text: string) => void): { element: HTMLElement; focus(): void; destroy(): void } {
  const element = doc.createElement("div"); element.className = "pdf-annot-comment";
  const textarea = doc.createElement("textarea"); textarea.value = value; textarea.maxLength = 10000; textarea.setAttribute("aria-label", "Comment");
  const footer = doc.createElement("div"); footer.className = "pdf-annot-comment-footer";
  const hint = doc.createElement("span"); hint.textContent = "⌘Enter to save · Esc to cancel";
  const save = doc.createElement("button"); save.type = "button"; save.textContent = "Save";
  footer.append(hint, save); element.append(textarea, footer); let finished = false;
  const finish = (save: boolean): void => { if (finished) return; finished = true; if (save) onSave(textarea.value); element.remove(); };
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
    else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); finish(true); }
  });
  save.addEventListener("mousedown", (event) => event.preventDefault());
  save.addEventListener("click", () => finish(true));
  textarea.addEventListener("blur", () => finish(true));
  return { element, focus: () => textarea.focus(), destroy: () => finish(false) };
}
