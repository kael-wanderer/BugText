// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { renderMarkdown } from "../preview";
import { buildExportHtml, plainCallouts } from "../export-render";
it("turns callouts into quotes with a bold label", () => {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown("> [!CAUTION] Mind the gap\n> Body");
  plainCallouts(host);
  const quote = host.querySelector("blockquote")!;
  expect(quote.className).toBe("");
  expect(quote.querySelector("p")!.innerHTML).toBe("<strong>Mind the gap</strong>");
  expect(quote.querySelector(".callout-title")).toBeNull();
});

const initialize = vi.fn();
const render = vi.fn().mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });
vi.mock("mermaid", () => ({ default: { initialize, render } }));

it.each([false, true])("exports callouts and diagrams without interactive controls (fallback=%s)", async (calloutFallback) => {
  const source = [
    "> [!NOTE] Export title", "> Body", "",
    "```js", "const a = 1;", "```", "",
    "```mermaid", "graph TD; A-->B", "```",
  ].join("\n");
  const html = await buildExportHtml(source, { rasterizeSvg: false, calloutFallback });
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("button")).toBeNull();
  expect(doc.querySelector(".mermaid-toolbar")).toBeNull();
  expect(doc.querySelector(".code-copy")).toBeNull();
  expect(doc.querySelector(".mermaid-rendered svg")).not.toBeNull();
  expect(doc.querySelector("pre.hljs code")!.textContent).toBe("const a = 1;\n");
  expect(Boolean(doc.querySelector(".callout"))).toBe(!calloutFallback);
  expect(doc.querySelector("blockquote")!.textContent).toContain("Export title");
});
