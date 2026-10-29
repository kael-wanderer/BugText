export function createCommentBox(doc: Document, value: string, onSave: (text: string) => void): { element: HTMLElement; focus(): void; destroy(): void } {
  const element = doc.createElement("div"); element.className = "pdf-annot-comment";
  const textarea = doc.createElement("textarea"); textarea.value = value; textarea.maxLength = 10000; textarea.setAttribute("aria-label", "Comment");
  element.append(textarea); let finished = false;
  const finish = (save: boolean): void => { if (finished) return; finished = true; if (save) onSave(textarea.value); element.remove(); };
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
    else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); finish(true); }
  });
  textarea.addEventListener("blur", () => finish(true));
  return { element, focus: () => textarea.focus(), destroy: () => finish(false) };
}
