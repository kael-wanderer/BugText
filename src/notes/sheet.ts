import "./organize.css";
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value;
}
export function action(label: string, run: () => void) { const b = node("button", label); b.type = "button"; b.addEventListener("click", run); return b; }
export function field(label: string, control: HTMLElement) { const wrapper = node("label", label); wrapper.append(control); return wrapper; }
export function organizeSheet(host: HTMLElement, title: string) {
  const previous = document.activeElement as HTMLElement | null;
  const scrim = node("div"); scrim.className = "organize-scrim";
  const body = node("section"); body.className = "organize-sheet"; body.setAttribute("role", "dialog"); body.setAttribute("aria-modal", "true"); body.setAttribute("aria-label", title);
  const heading = node("header"); heading.append(node("h2", title));
  let closed = false; const cleanups: (() => void)[] = [];
  const close = () => { if (closed) return; closed = true; cleanups.forEach(fn => fn()); scrim.remove(); if (previous?.isConnected) previous.focus(); };
  heading.append(action("Close", close)); body.append(heading); scrim.append(body); host.append(scrim);
  scrim.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Tab") {
      const controls = [...body.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => !el.hidden);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  heading.querySelector("button")?.focus();
  return { body, close, cleanup: (fn: () => void) => cleanups.push(fn), get closed() { return closed; } };
}
