// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderLifecycleBar } from "../lifecycle/bar";
import type { Lifecycle } from "../lifecycle/model";

const life = (over: Partial<Lifecycle>): Lifecycle => ({ status: null, supersededBy: null, reviewBy: null, ...over });

describe("renderLifecycleBar", () => {
  it("shows the replacing note with Open, and the AI note", () => {
    const host = document.createElement("div"); const open = vi.fn();
    renderLifecycleBar(host, { lifecycle: life({ status: "superseded", supersededBy: "docs/sync-design.md" }), today: "2026-11-15", leftOutOfAI: true }, { open });
    expect(host.hidden).toBe(false);
    expect(host.textContent).toContain("Superseded by sync-design.md");
    expect(host.textContent).toContain("Left out of AI folder search");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Open")!.click();
    expect(open).toHaveBeenCalledWith("docs/sync-design.md");
  });
  it("shows the full target when it is not a note in the folder", () => {
    const host = document.createElement("div");
    renderLifecycleBar(host, { lifecycle: life({ status: "superseded", supersededBy: "https://example.com/x.md" }), today: "2026-11-15", leftOutOfAI: false, targetInFolder: false }, { open: vi.fn() });
    expect(host.textContent).toContain("Superseded by https://example.com/x.md");
    renderLifecycleBar(host, { lifecycle: life({ status: "superseded", supersededBy: "docs/b.md" }), today: "2026-11-15", leftOutOfAI: false, targetInFolder: true }, { open: vi.fn() });
    expect(host.textContent).toContain("Superseded by b.md");
  });
  it("shows an overdue review date, alone or with the superseded line", () => {
    const host = document.createElement("div");
    renderLifecycleBar(host, { lifecycle: life({ reviewBy: "2026-11-01" }), today: "2026-11-15", leftOutOfAI: false }, { open: vi.fn() });
    expect(host.textContent).toBe("Review was due 1 Nov");
    renderLifecycleBar(host, { lifecycle: life({ status: "superseded", supersededBy: "b.md", reviewBy: "2026-11-01" }), today: "2026-11-15", leftOutOfAI: false }, { open: vi.fn() });
    expect(host.textContent).toContain("Superseded by b.md");
    expect(host.textContent).toContain("Review was due 1 Nov");
    expect(host.textContent).not.toContain("AI");
  });
  it("hides when there is nothing to say", () => {
    const host = document.createElement("div");
    renderLifecycleBar(host, { lifecycle: life({ status: "current", reviewBy: "2026-12-01" }), today: "2026-11-15", leftOutOfAI: false }, { open: vi.fn() });
    expect(host.hidden).toBe(true);
    expect(host.childNodes).toHaveLength(0);
    renderLifecycleBar(host, null, { open: vi.fn() });
    expect(host.hidden).toBe(true);
  });
  it("shows a superseded note without a target, and names as text", () => {
    const host = document.createElement("div");
    renderLifecycleBar(host, { lifecycle: life({ status: "superseded" }), today: "2026-11-15", leftOutOfAI: false }, { open: vi.fn() });
    expect(host.textContent).toBe("Superseded");
    renderLifecycleBar(host, { lifecycle: life({ status: "superseded", supersededBy: "<img src=x onerror=alert(1)>.md" }), today: "2026-11-15", leftOutOfAI: false }, { open: vi.fn() });
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>.md");
  });
});
