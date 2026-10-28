import type { RunnableAction } from "./actions";
export function renderActionBar(host: HTMLElement, actions: RunnableAction[], run: (id: string) => void): void {
  host.replaceChildren();
  const shown = actions.filter(a => a.feature || a.panel);
  function button(a: RunnableAction): HTMLButtonElement {
    const b = document.createElement("button"); b.type = "button"; b.textContent = a.name; b.addEventListener("click", () => run(a.id)); return b;
  }
  host.append(...shown.slice(0, 5).map(button));
  if (shown.length > 5) { const more = document.createElement("details"); const title = document.createElement("summary"); title.textContent = "More ▾"; more.append(title, ...shown.slice(5).map(button)); host.append(more); }
}
