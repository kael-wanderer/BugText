// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { barText, renderReviewBar, type ReviewBarDeps } from "../review/bar";
import type { ReviewItem } from "../review/types";

const day = new Date(2026, 10, 9, 12).getTime();
const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  path: "plan.md", state: "changed", digest: "d", changedAt: day, route: "outside", reviewedAt: day, baseline: false, hasText: true, added: 42, removed: 7, ...over,
});
const changes = { added: 42, removed: 7, lines: [3] };
const deps = (over: Partial<ReviewBarDeps> = {}): ReviewBarDeps => ({
  mark: vi.fn(async () => {}), showDiff: vi.fn(), explain: vi.fn(), step: vi.fn(), canExplain: () => true, dirty: () => false, marks: () => 1, ...over,
});
const labels = (host: HTMLElement) => [...host.querySelectorAll("button")].map(b => b.textContent);
const get = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(b => b.textContent === text)!;

describe("review bar", () => {
  it("bar text for each kind of item", () => {
    expect(barText(item(), changes, 3)).toBe("Changed since you reviewed it on 9 Nov · 3 sections · +42 −7");
    expect(barText(item(), changes, 1)).toBe("Changed since you reviewed it on 9 Nov · 1 section · +42 −7");
    expect(barText(item(), null, 0)).toBe("Changed since you reviewed it on 9 Nov");
    expect(barText(item({ baseline: true, hasText: false }), null, 0)).toBe("Changed since tracking began on 9 Nov · No reviewed version yet");
    expect(barText(item({ state: "new", reviewedAt: null, hasText: false }), null, 0)).toBe("New file · not reviewed yet");
  });

  it("disables Show diff without stored text and Mark reviewed on a dirty tab", () => {
    const host = document.createElement("div");
    renderReviewBar(host, item({ hasText: false }), null, 0, deps({ dirty: () => true }));
    expect(get(host, "Show diff").disabled).toBe(true);
    expect(get(host, "Show diff").title).toBe("No reviewed version yet");
    expect(get(host, "Mark reviewed").disabled).toBe(true);
    expect(get(host, "Mark reviewed").title).toBe("Save your changes first");
  });

  it("hides Explain changes when no AI engine is configured", () => {
    const host = document.createElement("div");
    renderReviewBar(host, item(), changes, 1, deps({ canExplain: () => false }));
    expect(labels(host)).not.toContain("Explain changes");
    renderReviewBar(host, item(), changes, 1, deps());
    expect(labels(host)).toEqual(["‹ Previous change", "Next change ›", "Show diff", "Explain changes", "Later", "Mark reviewed"]);
  });

  it("omits Previous and Next when there are no marks", () => {
    const host = document.createElement("div");
    renderReviewBar(host, item(), changes, 1, deps({ marks: () => 0 }));
    expect(labels(host)).not.toContain("Next change ›");
    expect(labels(host)).not.toContain("‹ Previous change");
  });

  it("buttons call their deps", () => {
    const host = document.createElement("div");
    const d = deps();
    renderReviewBar(host, item(), changes, 1, d);
    get(host, "Next change ›").click(); get(host, "‹ Previous change").click();
    get(host, "Mark reviewed").click(); get(host, "Later").click(); get(host, "Show diff").click(); get(host, "Explain changes").click();
    expect(d.step).toHaveBeenNthCalledWith(1, 1); expect(d.step).toHaveBeenNthCalledWith(2, -1);
    expect(d.mark).toHaveBeenCalledWith("reviewed"); expect(d.mark).toHaveBeenCalledWith("later");
    expect(d.showDiff).toHaveBeenCalled(); expect(d.explain).toHaveBeenCalled();
  });

  it("empties the host when the item is null", () => {
    const host = document.createElement("div");
    renderReviewBar(host, item(), changes, 1, deps());
    renderReviewBar(host, null, null, 0, deps());
    expect(host.childElementCount).toBe(0);
    expect(host.hidden).toBe(true);
  });
});
