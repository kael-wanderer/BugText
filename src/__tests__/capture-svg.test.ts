// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { nodeToSvg, xhtmlMarkup } from "../capture";

describe("nodeToSvg", () => {
  it("wraps serialized HTML in a sized foreignObject SVG", () => {
    const clone = document.createElement("div");
    clone.innerHTML = "<p>hi</p>";
    const node = {
      clientWidth: 120,
      scrollHeight: 40,
      cloneNode: () => clone,
      getBoundingClientRect: () => ({
        width: 120,
        height: 40,
      }),
    } as unknown as HTMLElement;

    const svg = nodeToSvg(node);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="120"');
    expect(svg).toContain("foreignObject");
    expect(svg).toContain("<p>hi</p>");
  });

  it("serializes foreignObject content as well-formed XHTML", () => {
    const doc = new DOMParser().parseFromString(
      '<p>a<br>b <img src="data:image/png;base64,AA==" alt="x"></p><hr>',
      "text/html",
    );
    const markup = xhtmlMarkup(Array.from(doc.body.childNodes));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>' +
      `<div xmlns="http://www.w3.org/1999/xhtml">${markup}</div></foreignObject></svg>`;
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(markup).toContain("<br />");
  });
});
