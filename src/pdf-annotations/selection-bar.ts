import type { AnnotationColor } from "./model";
export type SelectionBar = { element: HTMLElement; show(rect: DOMRect, selected: boolean): void; hide(): void; destroy(): void };
export function createSelectionBar(doc: Document, actions: { highlight(color: AnnotationColor): void; comment(): void; copy(): void; delete(): void }): SelectionBar {
  const element = doc.createElement("div"); element.className = "pdf-annot-bar"; element.hidden = true;
  for (const color of ["yellow", "green", "blue", "pink"] as const) {
    const button = doc.createElement("button"); button.type = "button"; button.className = `pdf-annot-dot pdf-annot-dot-${color}`;
    button.setAttribute("aria-label", `Highlight ${color}`); button.title = `Highlight ${color}`;
    button.addEventListener("mousedown", (event) => event.preventDefault()); button.addEventListener("click", () => actions.highlight(color)); element.append(button);
  }
  for (const [label, action] of [["Comment", actions.comment], ["Copy Quote", actions.copy], ["Delete", actions.delete]] as const) {
    const button = doc.createElement("button"); button.type = "button"; button.textContent = label;
    button.addEventListener("mousedown", (event) => event.preventDefault()); button.addEventListener("click", action); element.append(button);
  }
  const deleteButton = element.lastElementChild as HTMLButtonElement;
  const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape" && !element.hidden) { element.hidden = true; event.stopPropagation(); } };
  doc.addEventListener("keydown", onKey);
  return { element, show(rect, selected) {
    element.hidden = false; deleteButton.hidden = !selected;
    element.style.left = `${Math.max(4, rect.left)}px`;
    element.style.top = `${rect.top < 60 ? rect.bottom + 8 : rect.top - 46}px`;
  }, hide() { element.hidden = true; }, destroy() { doc.removeEventListener("keydown", onKey); element.remove(); } };
}
