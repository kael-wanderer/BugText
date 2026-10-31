// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { aheadText, buttonState, ERROR_TEXT, groupEntries, scopeLine } from "../git/model";
import type { GitActionResult, GitDiff, GitErrorKind, GitLogEntry, GitStatus } from "../git/model";
import { createGitPanel } from "../git/panel";
import { renderGitDiff } from "../git/diff-view";
import { createGitLog } from "../git/log";

const hostile = "<img src=x onerror=alert(1)>";
const base = (): GitStatus => ({ branch: "main", upstream: "origin/main", ahead: 2, behind: 1, merging: false, entries: [
  { path: "changed.md", orig_path: null, group: "changed", badge: "M" },
  { path: "new.md", orig_path: null, group: "new", badge: "A" },
  { path: "conflict.md", orig_path: null, group: "conflicted", badge: "C" },
], total: 3 });
const result: GitActionResult = { outcome: "done", changed: [], log: [] };
const diff: GitDiff = { lines: ["meta", "hunk", "add", "del", "ctx", "marker"].map(kind => ({ kind: kind as GitDiff["lines"][number]["kind"], text: hostile })), binary: false, truncated: false };
const make = (status: GitStatus, action = vi.fn(async () => result)) => {
  const host = document.createElement("div");
  const deps = { repo: vi.fn(async () => ({ in_repo: true, repo_name: "notes", subfolder: "", root: "/repo" })), status: vi.fn(async () => status), diff: vi.fn(async () => diff), action, cancel: vi.fn(async () => {}) };
  const panel = createGitPanel(host, deps); panel.setFolder("/notes");
  return { host, panel, deps };
};
const flush = async () => { await vi.advanceTimersByTimeAsync(1000); };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Git model", () => {
  it("groups entries, counts changes, formats ahead and scopes", () => {
    const groups = groupEntries(base());
    expect([groups.conflicted.length, groups.changed.length, groups.new.length]).toEqual([1, 1, 1]);
    expect(aheadText(2, 1)).toBe("↑2 ↓1");
    expect(scopeLine({ in_repo: true, repo_name: "notes", subfolder: "daily", root: "/notes" })).toBe("Repository: notes (whole repository for pull and push)");
  });
  it("requires a message and selection, disables conflicting and busy actions, and explains the upstream", () => {
    const s = base(); s.entries = s.entries.filter(e => e.group !== "conflicted");
    expect(buttonState(s, { message: "", checked: 1, busy: false }).commit).toBe(false);
    expect(buttonState(s, { message: "hello", checked: 0, busy: false }).commit).toBe(false);
    expect(buttonState(s, { message: "hello", checked: 1, busy: false }).commit).toBe(true);
    expect(buttonState(base(), { message: "hello", checked: 1, busy: false }).commit).toBe(false);
    const busy = buttonState(s, { message: "hello", checked: 1, busy: true });
    expect([busy.commit, busy.pull, busy.push, busy.fetch]).toEqual([false, false, false, false]);
    s.merging = true;
    expect(buttonState(s, { message: "hello", checked: 1, busy: false })).toMatchObject({ checkboxesLocked: true, pull: false, push: false });
    s.merging = false; s.upstream = null;
    expect(buttonState(s, { message: "hello", checked: 1, busy: false })).toMatchObject({ push: false, pushHint: "This branch has no upstream. Set one in Terminal with git push -u." });
  });
  it("maps every Rust error kind to its intended sentence", () => {
    const expected: Record<GitErrorKind, string> = {
      not_found: "Git was not found. Install it with: brew install git", unsupported: "Git 2.30 or later is required.", not_repo: "This folder is not in a Git repository.", outside: "This file is outside the open folder.", busy: "Another Git action is running.", auth: "Git could not sign in to the remote. Set up a credential helper or SSH key in Terminal, then try again.", network: "Git could not reach the remote. Check your network connection and try again.", rejected: "The remote has new commits. Pull first.", overwrite: "Pull would overwrite uncommitted changes. Commit them first.", diverged: "Your branch and the remote both have new commits.", conflicts: "Resolve the conflicts before committing.", identity: "Git needs your name and email. Set them in Terminal with git config --global user.name and user.email.", locked: "The Git repository is locked. Try again after the other Git operation finishes.", no_upstream: "This branch has no upstream. Set one in Terminal with git push -u.", markers: "Remove the conflict markers before marking this file resolved.", empty_message: "Enter a commit message.", timeout: "Git action timed out.", cancelled: "Git action cancelled.", failed: "Git action failed.",
    };
    expect(ERROR_TEXT).toEqual(expected);
  });
});

describe("Git panel", () => {
  it("renders each diff line by kind as text and displays binary and truncation", () => {
    const host = document.createElement("div"); renderGitDiff(host, { ...diff, binary: true, truncated: true });
    for (const line of diff.lines) expect(host.querySelector(`.git-diff-${line.kind}`)?.textContent).toBe(hostile);
    expect(host.textContent).toContain("Binary file changed."); expect(host.textContent).toContain("Diff truncated."); expect(host.querySelector("img")).toBeNull();
  });
  it("renders untrusted branch, file names and diff text safely below the list", async () => {
    vi.useFakeTimers(); const s = base(); s.branch = hostile; s.entries[0].path = `${hostile}.md`;
    const { host } = make(s); await flush();
    expect(host.querySelector(".git-branch")?.textContent).toContain(hostile);
    const file = [...host.querySelectorAll<HTMLButtonElement>(".git-file-name")].find(e => e.textContent === `${hostile}.md`)!;
    expect(file).toBeTruthy(); file.click(); await Promise.resolve(); await Promise.resolve();
    expect(host.querySelector(".git-diff-body")?.textContent).toContain(hostile);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".git-list")!.compareDocumentPosition(host.querySelector(".git-diff")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("shows the entry limit, conflict actions and locks all checkboxes during a merge", async () => {
    vi.useFakeTimers(); const s = base(); s.merging = true; s.total = 12408;
    const { host, deps } = make(s); await flush();
    expect(host.textContent).toContain("Showing 3 of 12,408 changes.");
    expect([...host.querySelectorAll<HTMLInputElement>('.git-file input')].every(e => e.checked && e.disabled)).toBe(true);
    const mark = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Mark resolved")!;
    const abort = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Abort merge")!;
    expect(mark.disabled).toBe(true); expect(abort).toBeTruthy();
    [...host.querySelectorAll<HTMLButtonElement>(".git-file-name")].find(b => b.textContent === "conflict.md")!.click();
    expect(mark.isConnected).toBe(false);
    const activeMark = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Mark resolved")!;
    expect(activeMark.disabled).toBe(false); activeMark.click(); expect(deps.action).toHaveBeenCalledWith(expect.objectContaining({ action: "resolve", paths: ["conflict.md"] }));
  });
  it("invokes abort only when its conflict control is clicked", async () => {
    vi.useFakeTimers(); const s = base(); s.merging = true;
    const { host, deps } = make(s); await flush();
    const abort = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Abort merge")!;
    abort.click(); expect(deps.action).toHaveBeenCalledWith(expect.objectContaining({ action: "abort" }));
  });
  it("shows 5,000 of N changes and blocks commit while an action is running", async () => {
    vi.useFakeTimers(); const s = base(); s.entries = Array.from({ length: 5000 }, (_, i) => ({ path: `file-${i}`, group: "changed", badge: "M", orig_path: null })); s.total = 12408;
    let finish!: (value: GitActionResult) => void;
    const action = vi.fn(() => new Promise<GitActionResult>(resolve => { finish = resolve; }));
    const { host } = make(s, action); await flush();
    expect(host.textContent).toContain("Showing 5,000 of 12,408 changes.");
    const message = host.querySelector<HTMLTextAreaElement>("textarea")!; message.value = "message"; message.dispatchEvent(new Event("input"));
    const commit = host.querySelector<HTMLButtonElement>(".git-primary")!; expect(commit.disabled).toBe(false);
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Fetch")!.click();
    expect(commit.disabled).toBe(true); finish(result); await flush();
  });
  it("coalesces refreshes and provides an upstream hint", async () => {
    vi.useFakeTimers(); const s = base(); s.upstream = null; const { host, panel, deps } = make(s);
    const one = panel.refresh(), two = panel.refresh(); await flush(); await Promise.all([one, two]);
    expect(deps.status).toHaveBeenCalledTimes(1);
    const push = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Push")!;
    expect(push.disabled).toBe(true); expect(push.title).toBe(ERROR_TEXT.no_upstream);
  });
  it("keeps only fifty log entries and copies plain text", async () => {
    const log = createGitLog();
    const entries: GitLogEntry[] = Array.from({ length: 51 }, (_, i) => ({ at_ms: i * 1000, action: `action-${i}`, args: hostile, exit: 0, stderr_tail: "" }));
    log.add(entries); const host = document.createElement("div"); const sheet = log.show(host);
    const writeText = vi.fn(async () => {}); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    expect(sheet.textContent).not.toContain("action-0"); expect(sheet.textContent).toContain("action-50"); expect(sheet.querySelector("img")).toBeNull();
    [...sheet.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Copy")!.click();
    expect(writeText).toHaveBeenCalledWith(sheet.querySelector("pre")!.textContent);
  });
});
