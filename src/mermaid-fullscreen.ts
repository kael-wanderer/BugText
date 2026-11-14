import { fitView, STEP, zoomAt, type View } from "./mermaid-zoom";

const opened = new WeakMap<HTMLElement, { close(): void }>();

export function openMermaidFullscreen(svg: SVGSVGElement, host: HTMLElement): { close(): void } {
  opened.get(host)?.close();
  const previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "mermaid-fullscreen";
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Diagram");
  const stage = document.createElement("div");
  stage.className = "mermaid-stage";
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const content = box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
    ? { width: box[2], height: box[3] } : svg.getBoundingClientRect();
  clone.setAttribute("width", String(content.width));
  clone.setAttribute("height", String(content.height));
  clone.style.removeProperty("width");
  clone.style.removeProperty("max-width");
  stage.append(clone);
  const bar = document.createElement("div");
  bar.className = "mermaid-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Diagram");
  overlay.append(stage, bar);
  host.append(overlay);
  const controller = new AbortController();
  const { signal } = controller;
  let closed = false;
  let view: View;
  const apply = (): void => {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };
  const fit = (): void => {
    view = fitView(content, overlay.getBoundingClientRect(), 24);
    apply();
  };
  const zoom = (factor: number, point?: { x: number; y: number }): void => {
    const rect = overlay.getBoundingClientRect();
    view = zoomAt(view, factor, point ?? { x: rect.width / 2, y: rect.height / 2 });
    apply();
  };
  const handle = { close(): void {
    if (closed) return;
    closed = true;
    controller.abort();
    overlay.remove();
    opened.delete(host);
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  } };
  opened.set(host, handle);
  for (const [label, text, run] of [
    ["Zoom out", "−", () => zoom(1 / STEP)],
    ["Zoom in", "+", () => zoom(STEP)],
    ["Fit", "Fit", fit],
    ["Close", "Close", () => handle.close()],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", run, { signal });
    bar.append(button);
  }
  overlay.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = overlay.getBoundingClientRect();
    zoom(event.deltaY < 0 ? STEP : 1 / STEP, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false, signal });
  let drag: { id: number; x: number; y: number } | null = null;
  overlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  overlay.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    view = { ...view, x: view.x + event.clientX - drag.x, y: view.y + event.clientY - drag.y };
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    apply();
  }, { signal });
  const endDrag = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.id) return;
    overlay.releasePointerCapture(event.pointerId);
    drag = null;
  };
  overlay.addEventListener("pointerup", endDrag, { signal });
  overlay.addEventListener("pointercancel", endDrag, { signal });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const buttons = Array.from(bar.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.shiftKey
        ? (current <= 0 ? buttons.length - 1 : current - 1)
        : (current + 1) % buttons.length;
      buttons[next]?.focus();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      handle.close();
    }
  }, { signal });
  fit();
  overlay.focus();
  return handle;
}
