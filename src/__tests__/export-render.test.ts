// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../render-extras", () => ({
  enhancePreview: vi.fn(async () => {}),
}));

import { buildExportHtml, inlineLocalImages } from "../export-render";
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

  it("embeds rendered SVG as serialized XML images for PDF", async () => {
    const replacement = vi.fn();
    const svg = { replaceWith: replacement };
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
    vi.stubGlobal("document", {
      createElement: vi.fn((tag: string) => (tag === "img" ? imageElement : host)),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal(
      "XMLSerializer",
      class {
        serializeToString() {
          return '<svg xmlns="http://www.w3.org/2000/svg"><rect style=""/></svg>';
        }
      },
    );
    vi.mocked(enhancePreview).mockResolvedValueOnce();

    await buildExportHtml("diagram", { rasterizeSvg: false, svgAsImage: true });

    expect(replacement).toHaveBeenCalledWith(imageElement);
    expect(imageElement.src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(imageElement.src.split(",")[1])).toContain('style=""');
  });

  it("leaves inline SVG alone for image capture", async () => {
    const replacement = vi.fn();
    const host = {
      className: "",
      innerHTML: "",
      style: {},
      querySelectorAll: () => [{ replaceWith: replacement }],
      remove: vi.fn(),
    };
    Object.defineProperty(host, "outerHTML", {
      get: () => `<article class="${host.className}">${host.innerHTML}</article>`,
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => host),
      body: { appendChild: vi.fn() },
    });
    vi.mocked(enhancePreview).mockResolvedValueOnce();

    await buildExportHtml("diagram", { rasterizeSvg: false });

    expect(replacement).not.toHaveBeenCalled();
  });

  it("inlines the note's own images for image capture", async () => {
    vi.unstubAllGlobals();
    const host = document.createElement("article");
    host.innerHTML = '<img src="assets/a%20b.png"><img src="../secret.png"><img src="https://x.test/r.png"><img src="notes.md">';
    const read = vi.fn(async () => new Uint8Array([1, 2, 3]));
    await inlineLocalImages(host, "/n/note.md", read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("/n/assets/a b.png");
    const [local, up, remote] = Array.from(host.querySelectorAll("img"));
    expect(local.getAttribute("src")).toBe("data:image/png;base64,AQID");
    expect(up.getAttribute("src")).toBe("../secret.png");
    expect(remote.getAttribute("src")).toBe("https://x.test/r.png");
  });
});
