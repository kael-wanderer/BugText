// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../render-extras", () => ({
  enhancePreview: vi.fn(async () => {}),
}));

import { buildExportHtml } from "../export-render";
import { enhancePreview } from "../render-extras";

describe("buildExportHtml", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces a standalone HTML document containing rendered markdown", async () => {
    const host = {
      className: "",
      innerHTML: "",
      outerHTML: "",
      style: {},
      querySelectorAll: () => [],
      remove: vi.fn(),
    };
    Object.defineProperty(host, "outerHTML", {
      get: () => `<article class="${host.className}">${host.innerHTML}</article>`,
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => host),
      body: { appendChild: vi.fn() },
    });

    const html = await buildExportHtml("# Title\n\ntext", {
      rasterizeSvg: false,
    });
    expect(html).toContain("<html");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain('class="doc"');
  });

  it("replaces rendered SVG diagrams with PNG images for DOCX", async () => {
    const replacement = vi.fn();
    const svg = {
      clientWidth: 200,
      clientHeight: 100,
      viewBox: { baseVal: { width: 200, height: 100 } },
      replaceWith: replacement,
    };
    const host = {
      className: "",
      innerHTML: "",
      style: {},
      querySelectorAll: () => [svg],
      remove: vi.fn(),
    };
    Object.defineProperty(host, "outerHTML", {
      get: () => `<article class="${host.className}">${host.innerHTML}</article>`,
    });
    const imageElement = { src: "", alt: "" };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }),
      toDataURL: () => "data:image/png;base64,diagram",
    };
    vi.stubGlobal("document", {
      createElement: vi.fn((tag: string) => {
        if (tag === "article") return host;
        if (tag === "img") return imageElement;
        return canvas;
      }),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal(
      "XMLSerializer",
      class {
        serializeToString() {
          return "<svg></svg>";
        }
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 200;
        naturalHeight = 100;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          this.onload?.();
        }
      },
    );
    vi.mocked(enhancePreview).mockResolvedValueOnce();

    await buildExportHtml("diagram", { rasterizeSvg: true });

    expect(replacement).toHaveBeenCalledWith(imageElement);
    expect(imageElement.src).toBe("data:image/png;base64,diagram");
  });
});
