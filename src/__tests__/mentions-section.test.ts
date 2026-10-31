// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { parseNote } from "../links/index";
import { createMentionsSection } from "../links/mentions-section";
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
it("scans only while expanded, shows counts, and keeps skipped lines across mounts", () => {
  vi.useFakeTimers(); const notes = vi.fn(() => [parseNote("/r/one.md", "Title here\nTitle again"), parseNote("/r/two.md", "Title")]);
  const host = document.createElement("div"), section = createMentionsSection({ notes, folder: () => "/r", open: vi.fn(), link: vi.fn() });
  section.mount(host, { path: "/r/Title.md" }); expect(notes).not.toHaveBeenCalled();
  const details = host.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); vi.runAllTimers();
  expect(host.textContent).toContain("3 in 2 notes");
  [...host.querySelectorAll("button")].find(b => b.textContent === "Skip")!.click();
  host.replaceChildren(); section.mount(host, { path: "/r/Title.md" }); vi.runAllTimers(); expect(host.textContent).toContain("2 in 2 notes");
  host.querySelector("details")!.open = false; host.querySelector("details")!.dispatchEvent(new Event("toggle")); section.cancel();
});
it("renders safe text and offers batch linking and stale refresh", async () => {
  vi.useFakeTimers(); const link = vi.fn().mockResolvedValue({ stale: 1, failed: 0 });
  const title = "<img src=x onerror=alert(1)>", host = document.createElement("div");
  const section = createMentionsSection({ notes: () => [parseNote("/r/source.md", `${title}\n${title}`)], folder: () => "/r", open: vi.fn(), link });
  section.mount(host, { path: `/r/${title}.md` }); host.querySelector("details")!.open = true; host.querySelector("details")!.dispatchEvent(new Event("toggle")); vi.runAllTimers();
  expect(host.querySelector("img")).toBeNull(); expect(host.textContent).toContain(title);
  [...host.querySelectorAll("button")].find(b => b.textContent === "Link all in this note…")!.click(); await Promise.resolve();
  expect(link.mock.calls[0][1]).toBe(true); expect(host.textContent).toContain("Changed since scan — Refresh");
  [...host.querySelectorAll("button")].find(b => b.textContent === "Refresh")!.click(); vi.runAllTimers(); expect(host.textContent).toContain("2 in 1 note");
});
it("explains short titles and empty scans", () => {
  vi.useFakeTimers(); const host = document.createElement("div"), section = createMentionsSection({ notes: () => [], folder: () => "/r", open: vi.fn(), link: vi.fn() });
  section.mount(host, { path: "/r/ab.md" }); expect(host.textContent).toContain("Title too short to search.");
  host.replaceChildren(); section.mount(host, { path: "/r/Title.md" }); host.querySelector("details")!.open = true; host.querySelector("details")!.dispatchEvent(new Event("toggle")); vi.runAllTimers();
  expect(host.textContent).toContain('No other note mentions "Title" without linking it.'); expect(host.textContent).toContain("none");
});
