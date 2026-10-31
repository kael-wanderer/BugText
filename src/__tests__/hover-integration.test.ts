// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createHoverCard } from "../links/hover-card";
import { createLinkIndex, parseNote } from "../links/index";
import { bindPreviewLinks, configureLinks } from "../links/follow";
import { createLinksPanel } from "../links/panel";
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
it("previews note links, restores broken titles, and detaches on disposal", async () => {
  vi.useFakeTimers(); let enabled = true;
  const index = createLinkIndex(async () => ({ notes: [parseNote("/r/b.md", "# B\nSaved excerpt")], skipped: [] })); await index.ensure("/r");
  const card = createHoverCard(), read = vi.fn();
  configureLinks({ index, hoverCard: card, hoverPreview: () => enabled, context: () => null, open: vi.fn(), jump: vi.fn(), read, create: vi.fn(), toast: vi.fn() });
  const host = document.createElement("div"); host.innerHTML = '<a href="b.md">B</a><a href="missing.md">Missing</a><a href="https://example.com">Web</a><a href="a.pdf">PDF</a><a href="image.png">Image</a>'; document.body.append(host);
  const context = { path: "/r/a.md", folder: "/r", text: "[b](b.md) [missing](missing.md)" };
  const dispose = bindPreviewLinks(host, () => context); const anchors = host.querySelectorAll("a"), tip = document.getElementById("link-hover-card")!;
  expect(anchors[1].title).toBe(""); anchors[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400); expect(tip.textContent).toContain("Saved excerpt");
  card.hide(); for (const anchor of [...anchors].slice(2)) { anchor.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400); expect(tip.hidden).toBe(true); }
  enabled = false; index.onFileChanged("/r/c.md", "x"); expect(anchors[1].title).toBe("Note not found");
  enabled = true; dispose(); anchors[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400); expect(tip.hidden).toBe(true); expect(read).not.toHaveBeenCalled(); card.dispose();
});
it("previews both Links sections and hides on rerender", async () => {
  vi.useFakeTimers(); const index = createLinkIndex(async () => ({ notes: [parseNote("/r/a.md", "[b](b.md)"), parseNote("/r/b.md", "# B\n[a](a.md)")], skipped: [] })); await index.ensure("/r");
  const card = createHoverCard(), host = document.createElement("div"); document.body.append(host);
  const panel = createLinksPanel(host, index, () => ({ path: "/r/a.md", text: "[b](b.md)" }), () => {}, () => {}, undefined, { card, enabled: () => true }); await panel.show(true);
  const rows = host.querySelectorAll(".link-panel-row"); expect(rows).toHaveLength(2);
  const tip = document.getElementById("link-hover-card")!;
  for (const row of rows) { row.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400); expect(tip.hidden).toBe(false); card.hide(); }
  rows[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400); panel.render(); expect(tip.hidden).toBe(true); card.dispose();
});

it("updates an indexing tooltip when the scan finishes and hides on folder change", async () => {
  vi.useFakeTimers(); let finish!: (value: { notes: ReturnType<typeof parseNote>[]; skipped: string[] }) => void;
  const index = createLinkIndex(() => new Promise(resolve => { finish = resolve; })); index.setFolder("/r");
  const card = createHoverCard(); configureLinks({ index, hoverCard: card, hoverPreview: () => true, context: () => null, open: vi.fn(), jump: vi.fn(), read: vi.fn(), create: vi.fn(), toast: vi.fn() });
  const host = document.createElement("div"); host.innerHTML = '<a href="b.md">B</a>'; document.body.append(host);
  const dispose = bindPreviewLinks(host, () => ({ path: "/r/a.md", folder: "/r", text: "[B](b.md)" }));
  await Promise.resolve(); await Promise.resolve();
  host.querySelector("a")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400);
  const tip = document.getElementById("link-hover-card")!; expect(tip.textContent).toContain("Indexing notes");
  finish({ notes: [parseNote("/r/b.md", "saved")], skipped: [] }); await Promise.resolve(); await Promise.resolve();
  expect(tip.textContent).toContain("saved"); index.setFolder("/other"); expect(tip.hidden).toBe(true); dispose(); card.dispose();
});

it("hides a preview card when the rendered document is replaced", async () => {
  vi.useFakeTimers(); const index = createLinkIndex(async () => ({ notes: [parseNote("/r/b.md", "saved")], skipped: [] })); await index.ensure("/r");
  const card = createHoverCard(); configureLinks({ index, hoverCard: card, hoverPreview: () => true, context: () => null, open: vi.fn(), jump: vi.fn(), read: vi.fn(), create: vi.fn(), toast: vi.fn() });
  const host = document.createElement("div"); host.innerHTML = '<a href="b.md">B</a>'; document.body.append(host);
  const dispose = bindPreviewLinks(host, () => ({ path: "/r/a.md", folder: "/r", text: "[B](b.md)" }));
  host.querySelector("a")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400);
  const tip = document.getElementById("link-hover-card")!; expect(tip.hidden).toBe(false);
  host.replaceChildren(); await Promise.resolve(); expect(tip.hidden).toBe(true); dispose(); card.dispose();
});
