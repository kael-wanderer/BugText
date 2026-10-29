import { renderMarkdown } from "./preview";
import { staticTaskMarks } from "./preview-tasks";
import { enhancePreview } from "./render-extras";
import { dirOf, isImagePath, isRelativeImageSrc } from "./image-insert";

const PRINT_CSS = `
body{margin:0;background:#fff;color:#111;font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.doc{box-sizing:border-box;max-width:900px;margin:0 auto;padding:48px}
img,svg{max-width:100%;height:auto}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #bbb;padding:6px 10px;text-align:left}
pre{white-space:pre-wrap}
`;

function svgToDataUri(svg: SVGElement): string {
  const xml = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

async function svgToPngDataUri(svg: SVGElement): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not rasterize diagram"));
    image.src = svgToDataUri(svg);
  });
  const viewBox = (svg as SVGSVGElement).viewBox?.baseVal;
  const width = Math.max(
    image.naturalWidth || viewBox?.width || svg.clientWidth || 1,
    1,
  );
  const height = Math.max(
    image.naturalHeight || viewBox?.height || svg.clientHeight || 1,
    1,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Image capture draws the page in this webview, where relative paths mean
 * nothing; embed the note's own images (no `..`, image types only) as data URIs.
 */
export async function inlineLocalImages(
  host: HTMLElement,
  notePath: string,
  read: (path: string) => Promise<Uint8Array>,
): Promise<void> {
  for (const img of Array.from(host.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (!isRelativeImageSrc(src)) continue;
    let relative: string;
    try {
      relative = decodeURIComponent(src.split(/[?#]/)[0]);
    } catch {
      continue;
    }
    if (relative.split("/").includes("..") || !isImagePath(relative)) continue;
    const type = IMAGE_TYPES[relative.slice(relative.lastIndexOf(".") + 1).toLowerCase()];
    try {
      const bytes = await read(`${dirOf(notePath)}/${relative.replace(/^(\.\/)+/, "")}`);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      img.src = `data:${type};base64,${btoa(binary)}`;
    } catch {
      // Leave it; the capture shows a broken image like the source would.
    }
  }
}

function promoteHeadings(root: HTMLElement): void {
  for (const heading of Array.from(root.querySelectorAll("h2, h3, h4, h5, h6"))) {
    const promoted = document.createElement(`h${Number(heading.tagName[1]) - 1}`);
    for (const attribute of Array.from(heading.attributes)) promoted.setAttribute(attribute.name, attribute.value);
    promoted.append(...Array.from(heading.childNodes));
    heading.replaceWith(promoted);
  }
}

export async function buildExportHtml(
  markdown: string,
  options: {
    rasterizeSvg: boolean;
    firstHeading?: (title: string) => void;
    svgAsImage?: boolean;
    inlineImages?: { notePath: string; read: (path: string) => Promise<Uint8Array> };
  },
): Promise<string> {
  const host = document.createElement("article");
  host.className = "doc";
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "800px",
  });
  host.innerHTML = renderMarkdown(markdown);
  if (options.firstHeading) {
    const heading = Array.from(host.children).find((child) => /^H[1-6]$/.test(child.tagName));
    options.firstHeading(heading?.textContent?.trim() ?? "");
    heading?.remove();
    // A "# Title" note with "##" sections: once the title moves to the title block, the sections
    // become the top level, so numbering reads "1 Summary" rather than "0.1 Summary".
    if (heading?.tagName === "H1" && !host.querySelector("h1")) promoteHeadings(host);
  }
  staticTaskMarks(host);
  document.body.appendChild(host);
  try {
    await enhancePreview(host);
    if (options.inlineImages) {
      await inlineLocalImages(host, options.inlineImages.notePath, options.inlineImages.read);
    }
    if (options.svgAsImage) {
      // Pandoc re-serializes inline SVG as HTML (e.g. a bare `style`
      // attribute), which Typst rejects; an image of serialized XML survives.
      for (const svg of Array.from(host.querySelectorAll("svg"))) {
        const image = document.createElement("img");
        image.src = svgToDataUri(svg);
        image.alt = "Rendered diagram";
        svg.replaceWith(image);
      }
    }
    if (options.rasterizeSvg) {
      for (const svg of Array.from(host.querySelectorAll("svg"))) {
        try {
          const image = document.createElement("img");
          image.src = await svgToPngDataUri(svg);
          image.alt = "Rendered diagram";
          svg.replaceWith(image);
        } catch {
          // Keep the original SVG. Pandoc may still preserve it.
        }
      }
    }
    // The off-screen placement above is for rendering only; left in the
    // output it would put image captures of the page outside their frame.
    host.removeAttribute?.("style");
    return (
      "<!doctype html><html><head><meta charset=\"utf-8\">" +
      `<style>${PRINT_CSS}</style></head><body>${host.outerHTML}</body></html>`
    );
  } finally {
    host.remove();
  }
}
