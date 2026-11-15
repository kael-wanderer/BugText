// The small menu shown over a text selection in a Markdown note (spec 3.1).

export type CaptureAction = "excerpt" | "task" | "ask" | "copy";
export type CaptureMenu = { show(rect: DOMRect): void; hide(): void; destroy(): void };

const ACTIONS: [CaptureAction, string][] = [["excerpt", "Excerpt"], ["task", "Task"], ["ask", "Ask AI"], ["copy", "Copy link"]];

export function createCaptureMenu(doc: Document, run: (action: CaptureAction) => void): CaptureMenu {
  const element = doc.createElement("div");
  element.className = "capture-menu";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", "Selection");
  element.hidden = true;
  for (const [action, label] of ACTIONS) {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = label;
    // Keep the selection: a click would otherwise collapse it before the action reads it.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => { element.hidden = true; run(action); });
    element.append(button);
  }
  doc.body.append(element);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !element.hidden) { element.hidden = true; event.stopPropagation(); }
  };
  const onDown = (event: MouseEvent): void => {
    if (!element.hidden && !(event.target instanceof Node && element.contains(event.target))) element.hidden = true;
  };
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("mousedown", onDown, true);
  return {
    show(rect) {
      element.hidden = false;
      element.style.left = `${Math.max(4, rect.left)}px`;
      element.style.top = `${rect.top < 60 ? rect.bottom + 8 : rect.top - 46}px`;
    },
    hide() { element.hidden = true; },
    destroy() {
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("mousedown", onDown, true);
      element.remove();
    },
  };
}
