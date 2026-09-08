async function rasterize(
  svg: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not rasterize preview"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  return canvas;
}

function serializeElement(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  if (typeof XMLSerializer !== "undefined") {
    return new XMLSerializer().serializeToString(clone);
  }
  return clone.outerHTML;
}

export function nodeToSvg(node: HTMLElement): string {
  const rect = node.getBoundingClientRect();
  const width = Math.max(
    1,
    Math.ceil(rect.width || node.clientWidth || 0),
  );
  const height = Math.max(1, Math.ceil(node.scrollHeight || rect.height || 0));
  const html = serializeElement(node);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    '<foreignObject width="100%" height="100%">' +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;background:#fff;color:#111;padding:16px;width:${width}px">${html}</div>` +
    "</foreignObject></svg>"
  );
}

// Many HTML "slide" docs use a fixed-size stage (#frame) or a large SVG, laid
// out with position:fixed so the document's scroll size is just the viewport.
// Detect that natural artboard so the capture isn't clipped on the right.
function detectArtboard(
  doc: Document,
): { width: number; height: number } | null {
  const frame = doc.getElementById("frame");
  if (frame) {
    const width = Math.max(frame.scrollWidth, frame.clientWidth, 1);
    const height = Math.max(frame.scrollHeight, frame.clientHeight, 1);
    if (width > 1 && height > 1) return { width, height };
  }
  let best: { width: number; height: number } | null = null;
  doc.querySelectorAll("svg").forEach((svg) => {
    const box = svg.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
    const size =
      box && box.length === 4 && box.every(Number.isFinite)
        ? { width: box[2], height: box[3] }
        : { width: svg.clientWidth, height: svg.clientHeight };
    if (size.width <= 0 || size.height <= 0) return;
    if (!best || size.width * size.height > best.width * best.height) best = size;
  });
  return best;
}

// Capture a full HTML document: render it in an off-screen iframe so its own
// stylesheet and layout apply, measure the real content size, then rasterize.
async function htmlToSvgAndSize(
  html: string,
): Promise<{ svg: string; width: number; height: number }> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "1280px",
    height: "1024px",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      frame.srcdoc = html;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Could not render HTML for capture");

    const artboard = detectArtboard(doc);
    const width =
      artboard?.width ??
      Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0, 1);
    const height =
      artboard?.height ??
      Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 1);

    const styles = Array.from(doc.querySelectorAll("style"))
      .map((style) => style.outerHTML)
      .join("");
    // Neutralize fixed/centered stage layout so the artboard flows at full size.
    const artboardCss = artboard
      ? `<style>#stage{position:relative!important;inset:auto!important;display:block!important;width:${artboard.width}px!important;height:${artboard.height}px!important;place-items:initial!important}#frame{position:relative!important;transform:none!important;transform-origin:top left!important}svg{max-width:none!important}</style>`
      : "";
    const body = doc.body ? doc.body.innerHTML : "";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      '<foreignObject width="100%" height="100%">' +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:#fff">${styles}${artboardCss}${body}</div>` +
      "</foreignObject></svg>";
    return { svg, width, height };
  } finally {
    frame.remove();
  }
}

export async function htmlToSvg(html: string): Promise<string> {
  return (await htmlToSvgAndSize(html)).svg;
}

export async function htmlToCanvas(html: string): Promise<HTMLCanvasElement> {
  const { svg, width, height } = await htmlToSvgAndSize(html);
  return rasterize(svg, width, height);
}
