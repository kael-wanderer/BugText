import type { Annotation } from "./model";

export type AnnotationLayer = { element: HTMLElement; render(items: Annotation[]): void; select(id: string | null): void; flash(id: string): void; destroy(): void };
/** Rectangles are in the page's displayed coordinate space; the page wrapper supplies zoom. */
export function createAnnotationLayer(doc: Document, page: number, scale: number, onSelect: (id: string) => void = () => {}): AnnotationLayer {
  const element = doc.createElement("div"); element.className = "pdf-annot-layer";
  let selected: string | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function select(id: string | null): void {
    selected = id;
    element.querySelectorAll<HTMLElement>("[data-annotation]").forEach((node) => node.classList.toggle("selected", node.dataset.annotation === id));
  }
  return {
    element,
    render(items) {
      element.replaceChildren();
      for (const item of items.filter((a) => a.page === page)) {
        for (const [x, y, width, height] of item.rects) {
          const rect = doc.createElement("div"); rect.className = `pdf-annot-rect pdf-annot-${item.color}`;
          rect.dataset.annotation = item.id;
          Object.assign(rect.style, { left: `${x * scale}px`, top: `${y * scale}px`, width: `${width * scale}px`, height: `${height * scale}px` });
          rect.addEventListener("click", () => onSelect(item.id)); element.append(rect);
        }
        if (item.comment && item.rects.length) {
          const marker = doc.createElement("span"); marker.className = "pdf-annot-marker"; marker.textContent = "●";
          marker.style.top = `${item.rects[0][1] * scale}px`; marker.title = "Has comment"; element.append(marker);
        }
      }
      select(selected);
    }, select,
    flash(id) {
      const nodes = Array.from(element.querySelectorAll<HTMLElement>("[data-annotation]")).filter((node) => node.dataset.annotation === id);
      nodes.forEach((node) => node.classList.add("flash"));
      const timer = setTimeout(() => { nodes.forEach((node) => node.classList.remove("flash")); timers.delete(timer); }, 1200); timers.add(timer);
    },
    destroy() { timers.forEach(clearTimeout); timers.clear(); element.remove(); },
  };
}
