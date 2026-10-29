// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
vi.mock("../render-extras", () => ({ enhancePreview: vi.fn(async () => {}) }));
import { buildExportHtml } from "../export-render";
import { missingImages, exportTitle, fontAvailable } from "../export/checks";

it("moves only the first top-level heading into the title", async () => {
  let title = "";
  const html = await buildExportHtml("# First\n\n# Second", { rasterizeSvg: false, firstHeading: value => { title = value; } });
  expect(title).toBe("First"); expect(html).not.toContain(">First</h1>"); expect(html).toContain(">Second</h1>");
});
it("promotes ## sections once the # title moves to the title block", async () => {
  let title = "";
  const html = await buildExportHtml("# Q3\n\n## Summary\n\n### Revenue", { rasterizeSvg: false, firstHeading: value => { title = value; } });
  expect(title).toBe("Q3");
  expect(html).toMatch(/<h1[^>]*>Summary<\/h1>/); expect(html).toMatch(/<h2[^>]*>Revenue<\/h2>/);
});
it("leaves a document without a heading intact", async () => {
  let title = "x";
  const html = await buildExportHtml("Hello", { rasterizeSvg: false, firstHeading: value => { title = value; } });
  expect(title).toBe(""); expect(html).toContain("Hello");
});
it("checks local images and skips remote and data URLs", async () => {
  const stat = vi.fn(async (path: string) => path.endsWith("present.png") ? {} : null);
  const result = await missingImages('![a](missing.png) ![b](present.png) ![c](https://x/a.png) ![d](data:image/png;base64,AA)', "/notes/a.md", stat);
  expect(result).toEqual(["missing.png"]); expect(stat).toHaveBeenCalledTimes(2);
  expect(exportTitle("file-name", "", "/notes/a.md")).toBe("a"); expect(fontAvailable("Inter", ["Inter"])).toBe(true);
});
