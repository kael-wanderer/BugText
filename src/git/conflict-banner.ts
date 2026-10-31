export function renderConflictBanner(host: HTMLElement, count: number, selectedConflict: boolean, busy: boolean, resolve: () => void, abort: () => void, open?: () => void): void {
  host.replaceChildren(); host.hidden = count === 0;
  if (!count) return;
  host.className = "git-conflict"; host.setAttribute("role", "status");
  const title = document.createElement("div"); title.textContent = `Merge stopped: ${count} ${count === 1 ? "file has" : "files have"} conflicts. Nothing was committed.`;
  const help = document.createElement("div"); help.textContent = "Open each file, fix the marked lines, then Mark resolved.";
  const actions = document.createElement("div"); actions.className = "git-actions";
  const mark = document.createElement("button"); mark.type = "button"; mark.textContent = "Mark resolved"; mark.disabled = !selectedConflict || busy; mark.onclick = resolve;
  const stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Abort merge"; stop.disabled = busy; stop.onclick = abort;
  if (open) {
    const view = document.createElement("button"); view.type = "button"; view.textContent = "Open file"; view.disabled = !selectedConflict; view.onclick = open;
    actions.append(view);
  }
  actions.append(mark, stop); host.append(title, help, actions);
}
