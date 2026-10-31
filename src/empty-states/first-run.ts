import { keyHint } from "./key-hint";
export type FirstRunDeps = { openFolder(): void; newNote(): void; showShortcuts(): void; dismiss(): void; keymap(): Record<string, string> };
export function createFirstRunHint(host: HTMLElement, deps: FirstRunDeps) {
  return { update(show: boolean) {
    host.hidden = !show; host.replaceChildren(); if (!show) return;
    const region = document.createElement("div"); region.className = "first-run-card"; region.setAttribute("role", "region"); region.setAttribute("aria-label", "Getting started");
    const close = document.createElement("button"); close.type = "button"; close.className = "first-run-dismiss"; close.textContent = "×"; close.setAttribute("aria-label", "Dismiss");
    close.onclick = () => { host.hidden = true; deps.dismiss(); };
    const title = document.createElement("strong"); title.textContent = "Welcome to BugText";
    const detail = document.createElement("p"); detail.textContent = "Open a folder of notes, start a new note, or look through the shortcuts.";
    const actions = document.createElement("div"); actions.className = "first-run-actions";
    for (const [label, id, action] of [["Open Folder", "file.open_folder", deps.openFolder], ["New Note", "file.new", deps.newNote], ["Show Shortcuts", "", deps.showShortcuts]] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.onclick = action;
      const hint = keyHint(id, deps.keymap()); if (hint) { const kbd = document.createElement("kbd"); kbd.textContent = hint; button.append(" ", kbd); }
      actions.append(button);
    }
    region.append(close, title, detail, actions); host.append(region);
  } };
}
