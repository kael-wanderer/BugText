// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { runGitAction } from "../git/flow";
import { createGitPanel } from "../git/panel";
import type { GitActionRequest, GitActionResult } from "../git/model";
const result: GitActionResult = { outcome: "done", changed: ["/repo/open.md", "/repo/closed.md", "/repo/open.md"], log: [] };
const req = (action: GitActionRequest["action"]): GitActionRequest => ({ folder: "/repo/sub", request_id: "id-1", action, paths: ["dirty.md"], message: "message" });
function fixture() {
  let tabs = [{ path: "/repo/sub/dirty.md", dirty: true, text: "unsaved" }, { path: "/repo/open.md", dirty: false, text: "saved" }, { path: "/elsewhere/outside.md", dirty: true, text: "outside" }];
  const deps = { tabsInFolder: vi.fn((folder: string) => tabs.filter(t => !folder || t.path.startsWith(`${folder}/`))), snapshot: vi.fn(async () => {}), checkTab: vi.fn(async () => {}), invoke: vi.fn(async (_req: GitActionRequest) => result), save: vi.fn(async (path: string) => { tabs = tabs.map(t => t.path === path ? { ...t, dirty: false } : t); return true; }), confirmSave: vi.fn(async () => true), refresh: vi.fn(async () => {}) };
  return deps;
}
it("snapshots dirty repository tabs before pull and checks only open changed paths", async () => {
  const d = fixture(); await runGitAction(req("pull"), "/repo", d);
  expect(d.snapshot).toHaveBeenCalledOnce(); expect(d.snapshot).toHaveBeenCalledWith("/repo/sub/dirty.md", "unsaved", "Before Git pull");
  expect(d.snapshot.mock.invocationCallOrder[0]).toBeLessThan(d.invoke.mock.invocationCallOrder[0]);
  expect(d.checkTab).toHaveBeenCalledOnce(); expect(d.checkTab).toHaveBeenCalledWith("/repo/open.md"); expect(d.refresh).toHaveBeenCalledOnce();
});
it("stops when a snapshot fails and labels merge and abort", async () => {
  for (const action of ["merge", "abort"] as const) {
    const d = fixture(); d.snapshot.mockRejectedValueOnce(new Error("failed"));
    await expect(runGitAction(req(action), "/repo", d)).rejects.toThrow();
    expect(d.snapshot).toHaveBeenCalledWith(expect.anything(), expect.anything(), `Before Git ${action}`); expect(d.invoke).not.toHaveBeenCalled();
  }
});
it("passes diverged and conflict outcomes through without starting further actions", async () => {
  for (const outcome of ["diverged", "conflicts"] as const) {
    const d = fixture(); d.invoke.mockResolvedValueOnce({ ...result, outcome });
    expect((await runGitAction(req("pull"), "/repo", d))?.outcome).toBe(outcome);
    expect(d.invoke).toHaveBeenCalledOnce(); expect(d.invoke.mock.calls[0][0].action).toBe("pull");
  }
});
it("asks before saving a dirty checked file; cancel does nothing and acceptance saves before commit", async () => {
  const d = fixture(); d.confirmSave.mockResolvedValueOnce(false);
  expect(await runGitAction(req("commit"), "/repo", d)).toBeNull(); expect(d.save).not.toHaveBeenCalled(); expect(d.invoke).not.toHaveBeenCalled();
  await runGitAction(req("commit"), "/repo", d); expect(d.save).toHaveBeenCalledWith("/repo/sub/dirty.md");
  expect(d.save.mock.invocationCallOrder[0]).toBeLessThan(d.invoke.mock.invocationCallOrder[0]);
});
it("save and commit confirmation sheet calls the selected button", async () => {
  const host = document.createElement("div"); const panel = createGitPanel(host, { repo: vi.fn(), status: vi.fn(), diff: vi.fn(), action: vi.fn(), cancel: vi.fn() });
  const cancelled = panel.confirmSave(1); expect(host.textContent).toContain("Save 1 file before committing?");
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Cancel" && b.closest('[role=dialog]'))!.click(); expect(await cancelled).toBe(false);
  const accepted = panel.confirmSave(1); [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Save and Commit")!.click(); expect(await accepted).toBe(true);
});
it("the running action's cancel button passes its request id", async () => {
  vi.useFakeTimers();
  const host = document.createElement("div"); let resolve!: (r: GitActionResult) => void;
  const cancel = vi.fn(async () => {}); const action = vi.fn((_req: GitActionRequest) => new Promise<GitActionResult>(r => { resolve = r; }));
  const panel = createGitPanel(host, { repo: async () => ({ in_repo: true, repo_name: "repo", subfolder: "" }), status: async () => ({ branch: "main", upstream: "origin/main", ahead: 1, behind: 0, merging: false, entries: [], total: 0 }), diff: vi.fn(), action, cancel });
  panel.setFolder("/repo"); await vi.advanceTimersByTimeAsync(1000);
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Fetch")!.click();
  const id = action.mock.calls[0][0].request_id; [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Cancel")!.click(); expect(cancel).toHaveBeenCalledWith(id);
  resolve(result); await vi.advanceTimersByTimeAsync(1000); vi.useRealTimers();
});
