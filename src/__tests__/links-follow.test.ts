// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { bindPreviewLinks, configureLinks, followLink } from "../links/follow";
import { createLinkIndex } from "../links/index";
import { renderMarkdown } from "../preview";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
import { openUrl } from "@tauri-apps/plugin-opener";
function setup() {
  const open = vi.fn().mockResolvedValue(undefined), jump = vi.fn(), toast = vi.fn(), create = vi.fn().mockResolvedValue(undefined);
  const openPdfAt = vi.fn();
  const read = vi.fn().mockResolvedValue("## Notes\n## Notes");
  const index = createLinkIndex(async () => ({ notes: [], skipped: [] }));
  configureLinks({ index, open, jump, toast, create, read, openPdfAt, context: () => null });
  return { open, jump, toast, create, read, openPdfAt };
}
const context = { path: "/r/a.md", text: "[b](b.md)", folder: "/r" };
describe("follow links", () => {
  it("opens notes and jumps to duplicate anchors; reports a missing heading", async () => {
    const s = setup();
    await followLink("b.md#notes-1", context);
    expect(s.open).toHaveBeenCalledWith("/r/b.md", false);
    expect(s.jump).toHaveBeenLastCalledWith(2);
    await followLink("b.md#missing", context);
    expect(s.jump).toHaveBeenLastCalledWith(1);
    expect(s.toast).toHaveBeenCalledWith("Heading not found: #missing");
  });
  it("opens PDF pages and flashes annotation IDs while ignoring other anchors", async () => {
    const s = setup();
    await followLink("papers/a.pdf#page=4&annotation=abc123", context);
    expect(s.open).toHaveBeenCalledWith("/r/papers/a.pdf", false);
    expect(s.openPdfAt).toHaveBeenCalledWith(4, "abc123");
    await followLink("papers/a.pdf#chapter", context);
    expect(s.openPdfAt).toHaveBeenCalledTimes(1);
  });
  it("allows only http https mailto through the opener", async () => {
    setup(); vi.mocked(openUrl).mockClear();
    for (const target of ["https://example.com", "http://example.com", "mailto:a@b.c", "javascript:evil()", "file:/etc/passwd"]) await followLink(target, context);
    expect(openUrl).toHaveBeenCalledTimes(3);
  });
  it("offers Create for missing notes", async () => {
    const s = setup(); s.read.mockRejectedValue(new Error());
    await followLink("b.md", context);
    expect(s.toast.mock.calls[0][0]).toBe("Note not found: b.md");
    s.toast.mock.calls[0][1].run(); await new Promise((r) => setTimeout(r, 0));
    expect(s.create).toHaveBeenCalledWith("/r", "/r/b.md");
  });
  it("always prevents preview navigation, including unsupported schemes and middle clicks", () => {
    setup(); const host = document.createElement("div");
    const a = document.createElement("a"); a.href = "file:/etc/passwd"; host.append(a);
    const dispose = bindPreviewLinks(host, () => context);
    for (const type of ["click", "auxclick"]) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: type === "click" ? 0 : 1 });
      a.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    }
    dispose();
  });
  it("renders duplicate heading anchors without ids", () => {
    const html = renderMarkdown("## snake_case Title\n## Notes\n## Notes");
    expect(html).toContain('data-anchor="snake_case-title"');
    expect(html).toContain('data-anchor="notes-1"');
    expect(html).not.toContain(' id=');
  });
});
