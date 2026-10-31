export type ViewSnapshot = { topLine: number; selection: { from: number; to: number } };
export type FocusDeps = { eligible(): boolean; overlayOpen(): boolean; captureView(): ViewSnapshot; restoreView(snapshot: ViewSnapshot): void; onChange(active: boolean): void; toast(text: string): void; exitHint(): string };
export function createFocusMode(deps: FocusDeps) {
  let active = false, snapshot: ViewSnapshot | null = null;
  let button: HTMLButtonElement | null = null, hint: HTMLElement | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  function exit() {
    if (!active) return;
    active = false; document.body.classList.remove("focus-active"); button?.remove(); hint?.remove(); button = null; hint = null;
    if (timer !== null) clearTimeout(timer); timer = null;
    const saved = snapshot; snapshot = null; if (saved) deps.restoreView(saved); deps.onChange(false);
  }
  return {
    active: () => active,
    toggle() {
      if (active) { exit(); return; }
      if (!deps.eligible()) { deps.toast("Focus mode works on Markdown and text notes."); return; }
      snapshot = deps.captureView(); active = true; document.body.classList.add("focus-active");
      button = document.createElement("button"); button.type = "button"; button.className = "focus-exit"; button.textContent = "Exit Focus"; button.setAttribute("aria-label", "Exit focus mode"); button.onclick = exit;
      hint = document.createElement("div"); hint.className = "focus-hint"; const key = deps.exitHint(); hint.textContent = key ? `Esc or ${key} to exit` : "Esc to exit";
      document.body.append(button, hint); timer = setTimeout(() => { hint?.remove(); hint = null; timer = null; }, 3000); deps.onChange(true);
    },
    exit,
    sync() { if (active && !deps.eligible()) exit(); },
    dispose: exit,
  };
}
