import { newAction } from "./api";
import { createCommitBox, createSaveAndCommitSheet } from "./commit-box";
import { renderConflictBanner } from "./conflict-banner";
import { renderGitDiff } from "./diff-view";
import { createGitLog } from "./log";
import { aheadText, buttonState, ERROR_TEXT, groupEntries, scopeLine } from "./model";
import type { GitAction, GitActionRequest, GitActionResult, GitDiff, GitError, GitRepoInfo, GitStatus } from "./model";

export interface GitPanelDeps {
  repo(folder: string): Promise<GitRepoInfo>;
  status(folder: string): Promise<GitStatus>;
  diff(folder: string, path: string): Promise<GitDiff>;
  // The caller owns the Recovery and save checks around worktree-changing actions.
  action(req: GitActionRequest): Promise<GitActionResult | null>;
  cancel(requestId: string): Promise<void>;
  openFile?(folder: string, path: string): void;
}
export type GitPanelControl = "commit" | "pull" | "push" | "fetch" | "log";
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el;
}
function button(text: string, click: () => void): HTMLButtonElement {
  const el = node("button", "", text); el.type = "button"; el.addEventListener("click", click); return el;
}
export function createGitPanel(host: HTMLElement, deps: GitPanelDeps) {
  let folder: string | null = null, generation = 0, state: GitStatus | null = null, info: GitRepoInfo | null = null;
  let selected: string | null = null, checked = new Set<string>(), known = new Set<string>(), busy = false, request: GitActionRequest | null = null;
  let fetchedAt: Date | null = null, showMerge = false, timer: ReturnType<typeof setTimeout> | null = null, running = false, queued = false;
  let waiters: Array<() => void> = [];
  const log = createGitLog();
  const header = node("div", "git-header"), title = node("div", "git-title"), branch = node("div", "git-branch"), scope = node("div", "git-scope");
  const fetch = button("Fetch", () => { void run("fetch"); });
  const menu = button("⋯", () => { menuItems.hidden = !menuItems.hidden; }); menu.setAttribute("aria-label", "More: Show Git Log");
  const menuItems = node("div", "git-menu"); menuItems.hidden = true;
  const showLog = button("Show Git Log", () => { menuItems.hidden = true; log.show(host); }); menuItems.append(showLog);
  title.append(node("strong", "", "Source Control"), fetch, menu, menuItems); header.append(title, branch, scope);
  const banner = node("div"), error = node("div", "git-error"); error.setAttribute("role", "status");
  const box = createCommitBox(() => { void run("commit"); }, updateControls);
  const pull = button("Pull", () => { void run("pull"); });
  const push = button("Push", () => { void run("push"); });
  const merge = button("Merge", () => { void run("merge"); });
  const cancel = button("Cancel", () => { if (request) void deps.cancel(request.request_id); });
  box.actions.append(pull, push, merge, cancel);
  const list = node("div", "git-list"); list.setAttribute("aria-label", "Changed files");
  const diff = node("div", "git-diff"), diffTitle = node("div", "git-diff-title"), diffBody = node("div", "git-diff-body"); diff.append(diffTitle, diffBody);
  const footer = node("div", "git-footer", "Recovery keeps unsaved drafts on this Mac. Push copies commits to your remote.");
  host.replaceChildren(header, banner, error, box.element, list, diff, footer);
  function showError(value: unknown) {
    const e = value as Partial<GitError> | null;
    if (Array.isArray(e?.log)) log.add(e.log);
    error.textContent = e?.kind && e.kind in ERROR_TEXT ? ERROR_TEXT[e.kind] : ERROR_TEXT.failed;
  }
  function updateControls() {
    const current = state;
    if (!current) { box.commit.disabled = pull.disabled = push.disabled = fetch.disabled = true; merge.hidden = cancel.hidden = true; return; }
    const controls = buttonState(current, { message: box.message.value, checked: checked.size, busy });
    box.commit.disabled = !controls.commit; box.commit.textContent = current.merging ? "Commit merge" : `Commit ${checked.size} ${checked.size === 1 ? "file" : "files"}`;
    pull.disabled = !controls.pull; push.disabled = !controls.push; push.title = controls.pushHint; fetch.disabled = !controls.fetch;
    merge.hidden = !showMerge; merge.disabled = busy || current.merging;
    cancel.hidden = !request || !["fetch", "pull", "push"].includes(request.action);
    renderConflictBanner(banner, groupEntries(current).conflicted.length, current.entries.some(e => e.path === selected && e.group === "conflicted"), busy, () => { if (selected) void run("resolve", [selected]); }, () => { void run("abort"); });
    for (const checkbox of list.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) checkbox.disabled = controls.checkboxesLocked;
  }
  async function select(path: string) {
    selected = path; diffTitle.textContent = path; diffBody.replaceChildren(); updateControls();
    const activeFolder = folder, token = generation;
    if (!activeFolder) return;
    try { const result = await deps.diff(activeFolder, path); if (folder === activeFolder && generation === token && selected === path) renderGitDiff(diffBody, result); }
    catch (e) { if (folder === activeFolder && generation === token && selected === path) showError(e); }
  }
  function render() {
    if (!state || !info) { branch.textContent = ""; scope.textContent = ""; list.replaceChildren(); updateControls(); return; }
    branch.textContent = `⎇ ${state.branch}  ${aheadText(state.ahead, state.behind)}  ${fetchedAt ? `as of fetch ${fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "as of last fetch"}`;
    scope.textContent = scopeLine(info); list.replaceChildren();
    const groups = groupEntries(state);
    for (const [key, label] of [["conflicted", "Conflicted"], ["changed", "Changed"], ["new", "New"]] as const) {
      if (!groups[key].length) continue;
      const group = node("section", "git-group"); group.append(node("h4", "", `${label} · ${groups[key].length}`));
      for (const entry of groups[key]) {
        const row = node("div", "git-file");
        const check = node("input"); check.type = "checkbox"; check.checked = checked.has(entry.path); check.setAttribute("aria-label", `Include ${entry.path}`);
        check.onchange = () => { if (check.checked) checked.add(entry.path); else checked.delete(entry.path); updateControls(); };
        const file = button(entry.path, () => { void select(entry.path); }); file.className = "git-file-name"; file.title = entry.orig_path ? `Renamed from ${entry.orig_path}` : entry.path;
        file.ondblclick = () => { if (folder) deps.openFile?.(folder, entry.path); };
        row.append(check, file, node("span", `git-badge git-badge-${entry.badge}`, entry.badge)); group.append(row);
      }
      list.append(group);
    }
    if (state.total > state.entries.length) list.append(node("p", "git-limit", `Showing ${state.entries.length.toLocaleString()} of ${state.total.toLocaleString()} changes.`));
    if (!state.total) list.append(node("p", "git-empty", "No changes."));
    updateControls();
  }
  async function load() {
    if (!folder) return;
    const currentFolder = folder, token = generation;
    try {
      const nextInfo = await deps.repo(currentFolder);
      if (token !== generation) return;
      info = nextInfo;
      if (!info.in_repo) { state = null; error.textContent = ERROR_TEXT.not_repo; render(); return; }
      const next = await deps.status(currentFolder);
      if (token !== generation) return;
      const nextPaths = new Set(next.entries.map(e => e.path));
      checked = new Set(next.entries.filter(e => next.merging || !known.has(e.path) || checked.has(e.path)).map(e => e.path));
      known = nextPaths; state = next; error.textContent = "";
      if (selected && !nextPaths.has(selected)) { selected = null; diffTitle.textContent = ""; diffBody.replaceChildren(); }
      render();
    } catch (e) { if (token === generation) { state = null; render(); showError(e); } }
  }
  async function drain() {
    timer = null;
    if (running) { queued = true; return; }
    running = true;
    do { queued = false; await load(); } while (queued);
    running = false; const done = waiters; waiters = []; done.forEach(resolve => resolve());
  }
  function refresh(): Promise<void> {
    if (timer) clearTimeout(timer);
    if (running) queued = true;
    else timer = setTimeout(() => { void drain(); }, 1000);
    return new Promise(resolve => waiters.push(resolve));
  }
  async function run(action: GitAction, paths: string[] = []) {
    if (!folder || !state || busy) return;
    const origin = folder, token = generation;
    const actionPaths = action === "commit" ? [...checked] : paths;
    const req = newAction(origin, action, actionPaths, action === "commit" ? box.message.value : null);
    request = req; busy = true; error.textContent = ""; updateControls();
    try {
      const result = await deps.action(req);
      if (!result) return;
      log.add(result.log);
      if (token !== generation) return;
      if (action === "fetch" || action === "pull") fetchedAt = new Date();
      showMerge = result.outcome === "diverged";
      if (showMerge) error.textContent = ERROR_TEXT.diverged;
      if (result.outcome === "merged_staged") box.message.value = "Merge remote changes";
      if (action === "commit") box.message.value = "";
      await refresh();
      if (showMerge && token === generation) error.textContent = ERROR_TEXT.diverged;
    } catch (e) { if (token === generation) { showError(e); void refresh(); } }
    finally { if (token === generation) { busy = false; request = null; updateControls(); } }
  }
  function setFolder(value: string | null) {
    generation++; folder = value; state = null; info = null; selected = null; known.clear(); checked.clear(); busy = false; request = null; showMerge = false; fetchedAt = null; error.textContent = ""; box.message.value = ""; diffTitle.textContent = ""; diffBody.replaceChildren(); render();
    if (folder) void refresh();
  }
  function focus(control: GitPanelControl) {
    if (control === "log") { log.show(host); return; }
    ({ commit: box.message, pull, push, fetch })[control].focus();
  }
  function confirmSave(count: number): Promise<boolean> {
    return new Promise(resolve => {
      const sheet = createSaveAndCommitSheet(count, () => finish(true), () => finish(false));
      function finish(accepted: boolean) { sheet.remove(); resolve(accepted); }
      document.body.append(sheet);
      [...sheet.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Save and Commit")?.focus();
    });
  }
  render();
  return { refresh, setFolder, focus, confirmSave };
}
