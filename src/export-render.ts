import { renderMarkdown } from "./preview";
import { enhancePreview } from "./render-extras";

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

export async function buildExportHtml(
  markdown: string,
  options: { rasterizeSvg: boolean; svgAsImage?: boolean },
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
  document.body.appendChild(host);
  try {
    await enhancePreview(host);
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
    return (
      "<!doctype html><html><head><meta charset=\"utf-8\">" +
      `<style>${PRINT_CSS}</style></head><body>${host.outerHTML}</body></html>`
    );
  } finally {
    host.remove();
  }
}
