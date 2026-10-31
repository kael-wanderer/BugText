export function createCommitBox(onCommit: () => void, onChange: () => void) {
  const element = document.createElement("div"); element.className = "git-commit";
  const message = document.createElement("textarea"); message.placeholder = "Commit message"; message.setAttribute("aria-label", "Commit message");
  const actions = document.createElement("div"); actions.className = "git-actions";
  const commit = document.createElement("button"); commit.type = "button"; commit.textContent = "Commit"; commit.className = "git-primary"; commit.disabled = true;
  commit.addEventListener("click", onCommit); message.addEventListener("input", onChange);
  actions.append(commit); element.append(message, actions);
  return { element, message, actions, commit };
}
/** Modal confirmation over the window; Esc cancels and Tab stays inside the sheet. */
export function createSaveAndCommitSheet(count: number, onSave: () => void, onCancel: () => void): HTMLElement {
  const scrim = document.createElement("div"); scrim.className = "recovery-scrim";
  const sheet = document.createElement("section"); sheet.className = "recovery-sheet git-confirm";
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Save before committing");
  const head = document.createElement("header"), heading = document.createElement("h3"); heading.textContent = "Save before committing"; head.append(heading);
  const prompt = document.createElement("p"); prompt.className = "link-review-intro"; prompt.textContent = `Save ${count} ${count === 1 ? "file" : "files"} before committing?`;
  const foot = document.createElement("footer"), spacer = document.createElement("span");
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.addEventListener("click", onCancel);
  const save = document.createElement("button"); save.type = "button"; save.textContent = "Save and Commit"; save.addEventListener("click", onSave);
  foot.append(spacer, cancel, save); sheet.append(head, prompt, foot); scrim.append(sheet);
  scrim.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const first = cancel, last = save, active = document.activeElement;
    if (event.shiftKey ? active === first : active === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (active !== first && active !== last) { event.preventDefault(); first.focus(); }
  });
  return scrim;
}
