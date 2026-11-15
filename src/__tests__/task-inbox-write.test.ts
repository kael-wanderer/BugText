// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { toggleTask, type TaskWriteDeps } from "../task-inbox/write";
import { noteTasks } from "../task-inbox/model";
import { showTaskInbox } from "../task-inbox/panel";
import { createLinkIndex, parseNote } from "../links/index";

const SOURCE = "# A\n- [ ] one\n";
const task = () => noteTasks(parseNote("/r/a.md", SOURCE))[0];

function deps(over: Partial<TaskWriteDeps> = {}) {
  const calls: string[] = [];
  const d: TaskWriteDeps = {
    folder: () => "/r",
    findOpen: () => null,
    read: vi.fn(async () => { calls.push("read"); return SOURCE; }),
    snapshot: vi.fn(async (_p: string, text: string) => { calls.push(`snapshot ${text === SOURCE}`); }),
    write: vi.fn(async (_p: string, contents: string, expected: string) => { calls.push(`write ${contents} ${expected === SOURCE}`); }),
    changed: vi.fn((_p: string, text: string) => { calls.push(`changed ${text}`); }),
    stamp: () => "2026-11-12",
    ...over,
  };
  return { d, calls };
}

describe("toggleTask", () => {
  it("ticks an open note through its editor only", async () => {
    const apply = vi.fn(() => true);
    const { d } = deps({ findOpen: () => ({ text: SOURCE, apply }) });
    await toggleTask(task(), d);
    expect(apply).toHaveBeenCalledTimes(1);
    expect((apply.mock.calls[0] as unknown[])[0]).toHaveLength(2);
    expect(d.read).not.toHaveBeenCalled();
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
  });
  it("snapshots, then writes a closed note with the expected text", async () => {
    const { d, calls } = deps();
    await toggleTask(task(), d);
    const next = "# A\n- [x] one ✅ 2026-11-12\n";
    expect(calls).toEqual(["read", "snapshot true", `write ${next} true`, `changed ${next}`]);
  });
  it("refuses a closed note that changed, without a snapshot or write", async () => {
    const { d } = deps({ read: vi.fn(async () => "# A\n- [ ] one\nmore\n") });
    await expect(toggleTask(task(), d)).rejects.toThrow("This task changed. Refresh the list and try again.");
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
  });
  it("writes nothing when the snapshot fails", async () => {
    const { d } = deps({ snapshot: vi.fn(async () => { throw new Error("disk full"); }) });
    await expect(toggleTask(task(), d)).rejects.toThrow("disk full");
    expect(d.write).not.toHaveBeenCalled();
  });
  it("refuses a task outside the open folder", async () => {
    const { d } = deps({ folder: () => "/other" });
    await expect(toggleTask(task(), d)).rejects.toThrow("The folder changed. Refresh the tasks list.");
    expect(d.read).not.toHaveBeenCalled();
  });
  it("refuses an open note whose editor rejects the change", async () => {
    const { d } = deps({ findOpen: () => ({ text: SOURCE, apply: () => false }) });
    await expect(toggleTask(task(), d)).rejects.toThrow("This note changed. Refresh the tasks list and try again.");
  });
});

describe("Tasks in Folder by date", () => {
  it("groups by due date with path, heading and short date", async () => {
    const source = "# Plan\n## Milestones\n- [ ] Send list due:2026-11-10\n- [ ] Reply 📅 2026-11-12\n- [ ] Draft due:2026-11-16\n- [ ] Rename\n";
    const index = createLinkIndex(async () => ({ notes: [parseNote("/r/p/plan.md", source)], skipped: [] }));
    index.setFolder("/r");
    const host = document.createElement("div"); document.body.append(host);
    showTaskInbox(host, { index, folder: () => "/r", open: vi.fn(), toggle: vi.fn(), today: () => "2026-11-12" });
    await vi.waitFor(() => expect(host.querySelectorAll(".organize-task-row")).toHaveLength(4));
    expect([...host.querySelectorAll("h3")].map(h => h.textContent)).toEqual(["Overdue · 1", "Today · 1", "This week · 1", "No date · 1"]);
    const first = host.querySelector(".organize-task-row")!;
    expect(first.textContent).toContain("Send list due:2026-11-10");
    expect(first.textContent).toContain("p/plan.md › Milestones");
    expect(first.textContent).toContain("10 Nov");
  });
});
