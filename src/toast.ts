// Short status message at the bottom of the window.
let current: HTMLElement | null = null;
let timer = 0;

export function dismissToast(): void { current?.remove(); current = null; window.clearTimeout(timer); }

export function showToast(text: string, ms = 3200, action?: { label: string; run: () => void }): void {
  current?.remove();
  window.clearTimeout(timer);
  const node = document.createElement("div");
  node.className = "app-toast";
  node.setAttribute("role", "status");
  node.textContent = text;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => { node.remove(); action.run(); });
    node.append(" ", button);
  }
  document.body.append(node);
  current = node;
  timer = window.setTimeout(() => {
    node.remove();
    if (current === node) current = null;
  }, ms);
}
