// @vitest-environment jsdom
import { it, expect } from "vitest";
import { renderMarkdown } from "../preview";
import { buildExportHtml, staticFootnotes } from "../export-render";

const NOTE = "Alpha[^a] beta[^b].\n\n[^a]: First note.\n[^b]: Second note.";
function check(root: ParentNode): void {
  expect(root.querySelector('a[href^="#fn"]')).toBeNull();
  expect(Array.from(root.querySelectorAll("sup.footnote-ref"), ref => ref.textContent)).toEqual(["1", "2"]);
  expect(root.querySelector(".footnotes")!.textContent).toContain("First note.");
  expect(root.querySelector(".footnotes")!.textContent).toContain("Second note.");
}
it("turns footnote links into static numbers and text for export", () => {
  const host = document.createElement("article");
  host.innerHTML = renderMarkdown(NOTE);
  staticFootnotes(host);
  check(host);
});
it.each([false, true])("always makes export footnotes static (calloutFallback=%s)", async (calloutFallback) => {
  const html = await buildExportHtml(NOTE, { rasterizeSvg: false, calloutFallback });
  check(new DOMParser().parseFromString(html, "text/html"));
});
