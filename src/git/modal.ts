/**
 * A modal sheet over the window in the app's standard style. Esc runs `onEscape`, and Tab
 * cycles through the footer buttons. The caller removes the returned scrim when done.
 */
export function createGitModal(title: string, body: HTMLElement[], buttons: HTMLButtonElement[], onEscape: () => void, extraClass = ""): HTMLElement {
  const scrim = document.createElement("div"); scrim.className = "recovery-scrim";
  const sheet = document.createElement("section"); sheet.className = `recovery-sheet git-modal ${extraClass}`.trim();
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", title);
  const head = document.createElement("header"), heading = document.createElement("h3"); heading.textContent = title; head.append(heading);
  const foot = document.createElement("footer"); foot.append(document.createElement("span"), ...buttons);
  sheet.append(head, ...body, foot); scrim.append(sheet);
  scrim.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onEscape(); return; }
    if (event.key !== "Tab" || !buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? 0 : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next].focus();
  });
  return scrim;
}
