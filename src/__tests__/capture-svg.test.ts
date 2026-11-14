// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { nodeToSvg, xhtmlMarkup, svgToPngBlob } from "../capture";

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

function diagramSvg(width = 400, height = 200): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return svg;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function rasterizer(blob: Blob | null): { sources: string[]; fill: ReturnType<typeof vi.fn> } {
  const sources: string[] = [];
  vi.stubGlobal("Image", class {
    onload?: () => void;
    set src(value: string) { sources.push(value); queueMicrotask(() => this.onload?.()); }
  });
  const fill = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillStyle: "", fillRect: fill, drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) { callback(blob); });
  return { sources, fill };
}
it("rasterizes a copy at twice the viewBox size on white", async () => {
  const png = new Blob(["png"], { type: "image/png" });
  const { sources, fill } = rasterizer(png);
  const svg = diagramSvg();
  svg.style.width = "125%";
  const result = await svgToPngBlob(svg);
  expect(result).toBe(png);
  const markup = decodeURIComponent(sources[0].split(",")[1]);
  expect(markup).toContain('width="800"');
  expect(markup).toContain('height="400"');
  expect(markup).not.toContain("125%");
  expect(fill).toHaveBeenCalledWith(0, 0, 800, 400);
  expect(svg.style.width).toBe("125%");
});
it("refuses an oversized raster before allocating a canvas", async () => {
  await expect(svgToPngBlob(diagramSvg(9000, 200))).rejects.toThrow("The diagram is too large to copy as an image.");
});
it("reports a null PNG blob", async () => {
  rasterizer(null);
  await expect(svgToPngBlob(diagramSvg())).rejects.toThrow("The diagram is too large to copy as an image.");
});
