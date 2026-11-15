// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderOverview } from "../overview/view";
import { overviewMarkdown, type ProjectOverview, type OverviewTask } from "../overview/model";
import { isVirtualTab } from "../tabops";

const task = (text: string, line: number, over: Partial<OverviewTask> = {}): OverviewTask => ({ path: "/r/p/plan.md", source: "", line, offset: 0, checked: false, text, heading: "Milestones", due: "2026-11-10", ...over });
const overview = (): ProjectOverview => ({
  folder: "/r/p", reviewRoot: "/r",
  keyDocs: [{ path: "/r/p/plan.md", name: "plan.md", badge: "current", review: "Changed 2 h ago · not reviewed" }, { path: "/r/p/<b>x</b>.md", name: "<b>x</b>.md", badge: "pinned", review: "" }],
  decisions: [{ path: "/r/p/d1.md", title: "Use one writer", date: "2026-11-08", summary: "Simpler recovery." }],
  questions: [task("Verify #question", 4, { due: null })],
  next: [task("Send list due:2026-11-10", 3), task("Draft", 5, { due: null })],
  changed: [{ path: "p/plan.md", state: "changed", digest: "d", changedAt: 0, route: "outside", reviewedAt: null, baseline: false, hasText: true, added: 42, removed: 7 }],
});
function setup(over: Partial<Parameters<typeof renderOverview>[2]> = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const deps = { open: vi.fn(), toggle: vi.fn(async () => {}), copy: vi.fn(async () => {}), openReview: vi.fn(), today: "2026-11-12", ...over };
  renderOverview(host, overview(), deps);
  return { host, deps };
}

describe("renderOverview", () => {
  it("shows five sections with counts", () => {
    const { host } = setup();
    expect([...host.querySelectorAll("h2")].map(h => h.textContent)).toEqual(["Key documents 2", "Decisions 1", "Open questions and blockers 1", "Next actions 2", "Changed since review 1"]);
    expect(host.textContent).toContain("Changed 2 h ago · not reviewed");
    expect(host.textContent).toContain("Simpler recovery.");
    expect(host.textContent).toContain("10 Nov");
    expect(host.textContent).toContain("+42 −7");
  });
  it("opens each row's source, tasks at their line", () => {
    const { host, deps } = setup();
    const link = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button.overview-link")].find(b => b.textContent === label)!;
    link("plan.md").click();
    expect(deps.open).toHaveBeenCalledWith("/r/p/plan.md", undefined);
    link("Send list due:2026-11-10").click();
    expect(deps.open).toHaveBeenCalledWith("/r/p/plan.md", 3);
    link("Use one writer").click();
    expect(deps.open).toHaveBeenCalledWith("/r/p/d1.md", undefined);
  });
  it("ticks tasks one at a time and shows a failure", async () => {
    let finish!: () => void;
    const toggle = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { host } = setup({ toggle });
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes()).toHaveLength(3);
    boxes()[1].click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(boxes().every(b => b.disabled)).toBe(true);
    finish(); await Promise.resolve(); await Promise.resolve();
    expect(boxes().every(b => !b.disabled)).toBe(true);
    const failing = setup({ toggle: vi.fn(async () => { throw new Error("This task changed. Refresh the list and try again."); }) });
    failing.host.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    await vi.waitFor(() => expect(failing.host.querySelector(".overview-error")!.textContent).toBe("This task changed. Refresh the list and try again."));
  });
  it("copies Markdown and opens Review", () => {
    const { host, deps } = setup();
    [...host.querySelectorAll("button")].find(b => b.textContent === "Copy as Markdown")!.click();
    expect(deps.copy).toHaveBeenCalledWith(overviewMarkdown(overview()));
    [...host.querySelectorAll("button")].find(b => b.textContent === "Open Review")!.click();
    expect(deps.openReview).toHaveBeenCalled();
  });
  it("shows names as text", () => {
    const { host } = setup();
    expect(host.querySelector("b")).toBeNull();
    expect(host.textContent).toContain("<b>x</b>.md");
  });
});

describe("isVirtualTab", () => {
  it("is true for table and overview tabs only", () => {
    expect(isVirtualTab({ id: "1", path: null, name: "O", dirty: false, overview: "/r" })).toBe(true);
    expect(isVirtualTab({ id: "1", path: null, name: "T", dirty: false, tableView: true })).toBe(true);
    expect(isVirtualTab({ id: "1", path: "/r/a.md", name: "a.md", dirty: false })).toBe(false);
  });
});
