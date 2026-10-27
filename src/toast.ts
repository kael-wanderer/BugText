// Short status message at the bottom of the window.
let current: HTMLElement | null = null;
let timer = 0;

export function showToast(text: string, ms = 3200): void {
  current?.remove();
  window.clearTimeout(timer);
  const node = document.createElement("div");
  node.className = "app-toast";
  node.setAttribute("role", "status");
  node.textContent = text;
  document.body.append(node);
  current = node;
  timer = window.setTimeout(() => {
    node.remove();
    if (current === node) current = null;
  }, ms);
}
