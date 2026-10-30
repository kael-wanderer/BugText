export function createGraphTab(root: HTMLElement, activate: () => void, close: () => void) {
  const tab = document.createElement("div"); tab.className = "tab";
  const name = document.createElement("button"); name.type = "button"; name.textContent = "Graph";
  name.setAttribute("aria-label", "Graph view"); name.className = "graph-tab-name"; name.onclick = activate;
  const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.textContent = "×";
  dismiss.className = "tab-close"; dismiss.setAttribute("aria-label", "Close graph"); dismiss.onclick = close;
  tab.append(name, dismiss);
  return {
    render(tabs: HTMLElement, active: boolean) { root.classList.toggle("graph-active", active); tab.classList.toggle("active", active); tabs.append(tab); },
    destroy() { root.classList.remove("graph-active"); tab.remove(); },
  };
}
