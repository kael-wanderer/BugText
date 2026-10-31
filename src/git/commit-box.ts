import { createGitModal } from "./modal";
export function createCommitBox(onCommit: () => void, onChange: () => void) {
  const element = document.createElement("div"); element.className = "git-commit";
  const message = document.createElement("textarea"); message.placeholder = "Commit message"; message.setAttribute("aria-label", "Commit message");
  const actions = document.createElement("div"); actions.className = "git-actions";
  const commit = document.createElement("button"); commit.type = "button"; commit.textContent = "Commit"; commit.className = "git-primary"; commit.disabled = true;
  commit.addEventListener("click", onCommit); message.addEventListener("input", onChange);
  actions.append(commit); element.append(message, actions);
  return { element, message, actions, commit };
}
/** Modal confirmation over the window; Esc cancels. */
export function createSaveAndCommitSheet(count: number, onSave: () => void, onCancel: () => void): HTMLElement {
  const prompt = document.createElement("p"); prompt.className = "link-review-intro"; prompt.textContent = "Unsaved changes in checked files are saved first, then included in the commit.";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.addEventListener("click", onCancel);
  const save = document.createElement("button"); save.type = "button"; save.textContent = "Save and Commit"; save.addEventListener("click", onSave);
  const title = `Save ${count} ${count === 1 ? "file" : "files"} before committing?`;
  const scrim = createGitModal(title, [prompt], [cancel, save], onCancel, "git-confirm");
  scrim.querySelector("[role=dialog]")!.setAttribute("aria-label", "Save before committing");
  return scrim;
}
