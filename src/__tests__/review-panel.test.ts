// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewPanel, type ReviewPanelDeps } from "../review/panel";
import type { ReviewItem, ReviewSnapshot } from "../review/types";

const item = (path: string, state: ReviewItem["state"] = "changed"): ReviewItem => ({
  path, state, digest: "d", changedAt: 0, route: "outside", reviewedAt: 0, baseline: false, hasText: true, added: 2, removed: 1,
});
const snap = (items: ReviewItem[]): ReviewSnapshot => ({ folder: "/r", tracked: 9, startedAt: 0, items });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(over: Partial<ReviewPanelDeps> = {}) {
  const host = document.createElement("aside");
  document.body.append(host);
  const deps: ReviewPanelDeps = {
    open: vi.fn(), mark: vi.fn(async () => []), confirm: vi.fn(async () => true), reset: vi.fn(async () => {}), now: () => 0, ...over,
  };
  return { host, deps, panel: createReviewPanel(host, deps) };
}
const buttons = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].filter(b => b.textContent === text);

describe("review panel", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("groups rows as Changed, New and Later and omits empty groups", () => {
    const { host, panel } = setup();
    panel.render(snap([item("a.md"), item("docs/b.md"), item("c.md", "later")]), null);
    expect([...host.querySelectorAll(".review-group-title")].map(e => e.textContent)).toEqual(["Changed · 2", "Later · 1"]);
    expect(host.querySelectorAll(".review-row")).toHaveLength(3);
    expect(host.querySelector(".review-row .review-dir")?.textContent).toBe("");
    expect(host.querySelectorAll(".review-row .review-dir")[1].textContent).toBe("docs/");
  });

  it("renders a hostile file name as text", () => {
    const { host, panel } = setup();
    panel.render(snap([item("<img src=x onerror=alert(1)>.md")]), null);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".review-name")?.textContent).toBe("<img src=x onerror=alert(1)>.md");
  });

  it("Mark reviewed calls mark('reviewed', [path]) and Later calls mark('later', [path])", async () => {
    const { host, deps, panel } = setup();
    panel.render(snap([item("a.md")]), null);
    const mark = buttons(host, "Mark reviewed")[0];
    expect(mark.title).toBe("Records that you have read this version. It does not check facts.");
    expect(mark.getAttribute("aria-label")).toContain("a.md");
    mark.click();
    buttons(host, "Later")[0].click();
    await flush();
    expect(deps.mark).toHaveBeenCalledWith("reviewed", ["a.md"]);
    expect(deps.mark).toHaveBeenCalledWith("later", ["a.md"]);
    expect(deps.open).not.toHaveBeenCalled();
    (host.querySelector(".review-row") as HTMLElement).click();
    expect(deps.open).toHaveBeenCalledWith("a.md");
  });

  it("the Later group offers Move back, which calls mark('restore', [path])", async () => {
    const { host, deps, panel } = setup();
    panel.render(snap([item("a.md", "later")]), null);
    expect(buttons(host, "Later")).toHaveLength(0);
    buttons(host, "Move back")[0].click();
    await flush();
    expect(deps.mark).toHaveBeenCalledWith("restore", ["a.md"]);
  });

  it("Mark All Reviewed asks first and does nothing when refused", async () => {
    const refuse = setup({ confirm: vi.fn(async () => false) });
    refuse.panel.render(snap([item("a.md"), item("b.md", "new"), item("c.md", "later")]), null);
    buttons(refuse.host, "Mark All Reviewed…")[0].click();
    await flush();
    expect(refuse.deps.confirm).toHaveBeenCalledWith("Mark 3 files as reviewed? This records that you have read them.");
    expect(refuse.deps.mark).not.toHaveBeenCalled();
    const accept = setup();
    accept.panel.render(snap([item("a.md"), item("b.md", "new")]), null);
    buttons(accept.host, "Mark All Reviewed…")[0].click();
    await flush();
    expect(accept.deps.mark).toHaveBeenCalledWith("reviewed", ["a.md", "b.md"]);
  });

  it("shows the stale-files toast when mark returns paths", async () => {
    const { host, panel } = setup({ mark: vi.fn(async () => ["a.md", "b.md"]) });
    panel.render(snap([item("a.md")]), null);
    buttons(host, "Mark reviewed")[0].click();
    await flush();
    expect(document.querySelector(".app-toast")?.textContent).toBe("2 files changed again and were not marked.");
  });

  it("shows the empty, off and error states with their exact text", () => {
    let reason: "no-folder" | "off" | null = null;
    const { host, panel } = setup({ reason: () => reason });
    panel.render(snap([]), null);
    expect(host.textContent).toContain("Nothing to review. Notes changed by an AI tool or another app appear here.");
    reason = "no-folder"; panel.render(null, null);
    expect(host.textContent).toContain("Open a folder to see what changed.");
    reason = "off"; panel.render(null, null);
    expect(host.textContent).toContain("The review queue is off. Turn it on in Settings ▸ General.");
    panel.render(null, "Review data could not be read");
    expect(host.textContent).toContain("Review data could not be read");
    expect(buttons(host, "Reset Review Data…")).toHaveLength(1);
  });

  it("Reset asks first, then calls reset", async () => {
    const { host, deps, panel } = setup();
    panel.render(null, "Review data could not be read");
    buttons(host, "Reset Review Data…")[0].click();
    await flush();
    expect(deps.confirm).toHaveBeenCalledWith("Start over? Every note is treated as reviewed from now. The old review data is kept as a backup file.");
    expect(deps.reset).toHaveBeenCalled();
  });
});
