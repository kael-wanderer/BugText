// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseNote } from "../links/index";
import { applyRename, editedText, planRename } from "../links/rename-plan";
import { showRenameReview } from "../links/rename-review";
import { createLinksPanel } from "../links/panel";
import { createLinkIndex } from "../links/index";
const folder = "/r";
function writer(text: string) {
  return { findOpen: vi.fn().mockReturnValue(null), read: vi.fn().mockResolvedValue(text), snapshot: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined) };
}
describe("rename links", () => {
  it("plans incoming and moved-note relative targets, preserving labels anchors angles and encoding", () => {
    const notes = [parseNote("/r/a.md", "[label](notes/b.md#notes) [space](notes/b%20c.md)"), parseNote("/r/notes/b.md", "[a](../a.md) [self](#notes)")];
    const plans = planRename(notes, "/r/notes", "/r/archive/deep", folder);
    expect(editedText(plans[0].source, plans[0].edits)).toBe("[label](archive/deep/b.md#notes) [space](archive/deep/b%20c.md)");
    expect(editedText(plans[1].source, plans[1].edits)).toBe("[a](../../a.md) [self](#notes)");
    const angle = planRename([parseNote("/r/a.md", "[label](<b.md#notes>)")], "/r/b.md", "/r/b c.md", folder);
    expect(editedText(angle[0].source, angle[0].edits)).toBe("[label](<b c.md#notes>)");
  });
  it("applies an open dirty note with one dispatch and leaves unchecked edits alone", async () => {
    const source = "dirty [a](b.md) [b](b.md)";
    const plans = planRename([parseNote("/r/a.md", source)], "/r/b.md", "/r/c.md", folder);
    plans[0].edits[1].checked = false;
    const deps = writer(source); const apply = vi.fn(); deps.findOpen.mockReturnValue({ text: source, apply });
    expect(await applyRename(plans, folder, deps)).toBe(0);
    expect(apply).toHaveBeenCalledTimes(1); expect(apply.mock.calls[0][0]).toHaveLength(1);
    expect(deps.write).not.toHaveBeenCalled();
  });
  it("snapshots before atomic writes and skips disk or buffer changes", async () => {
    const source = "[a](b.md)";
    const plans = planRename([parseNote("/r/a.md", source)], "/r/b.md", "/r/c.md", folder);
    const deps = writer(source);
    expect(await applyRename(plans, folder, deps)).toBe(0);
    expect(deps.snapshot.mock.invocationCallOrder[0]).toBeLessThan(deps.write.mock.invocationCallOrder[0]);
    expect(deps.write).toHaveBeenCalledWith("/r/a.md", "[a](c.md)", source);
    deps.read.mockResolvedValue("changed"); deps.write.mockClear();
    expect(await applyRename(plans, folder, deps)).toBe(1); expect(deps.write).not.toHaveBeenCalled();
    deps.findOpen.mockReturnValue({ text: "changed", apply: vi.fn() });
    expect(await applyRename(plans, folder, deps)).toBe(1);
  });
  it("Don't Update writes nothing and untrusted names stay text", async () => {
    const source = "[<img src=x onerror=evil>](b.md)";
    const plans = planRename([parseNote("/r/<img src=x>.md", source)], "/r/b.md", "/r/c.md", folder);
    const deps = writer(source);
    const review = showRenameReview(plans, folder, deps, vi.fn());
    const sheet = document.querySelector(".link-rename-review")!;
    expect(sheet.querySelector("img")).toBeNull(); expect(sheet.textContent).toContain("<img src=x>");
    [...sheet.querySelectorAll("button")].find((b) => b.textContent === "Don't Update")!.click(); await review;
    expect(deps.snapshot).not.toHaveBeenCalled(); expect(deps.write).not.toHaveBeenCalled();
  });
  it("shows backlinks context and broken targets in the panel as text", async () => {
    const index = createLinkIndex(async () => ({ notes: [parseNote("/r/a.md", "[<img src=x>](b.md)"), parseNote("/r/b.md", "[bad](missing.md)")], skipped: [] }));
    await index.ensure(folder);
    const host = document.createElement("div");
    const panel = createLinksPanel(host, index, () => ({ path: "/r/b.md", text: "[bad](missing.md)" }), vi.fn(), vi.fn());
    await panel.show(true);
    expect(host.textContent).toContain("Linked from · 1"); expect(host.textContent).toContain("Broken · Note not found"); expect(host.querySelector("img")).toBeNull();
  });
});
