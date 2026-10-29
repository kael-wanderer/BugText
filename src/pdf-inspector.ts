// The single right-hand panel of the PDF view. Properties, Replace Text, Review,
// Check Text, OCR Review and Editing Support all render into it, so at most one
// right panel is ever open. Content comes from the owner; this module only owns
// the shell, its layout (docked beside the pages or an overlay drawer), Escape
// and focus.

export type PdfInspectorPage =
  | "annotations"
  | "properties"
  | "replace"
  | "review"
  | "proof"
  | "ocr"
  | "ocr-review"
  | "support";

export type PdfInspectorContent = {
  title: string;
  sub?: string;
  body: Node[];
};

export type PdfInspectorLayout = "docked" | "drawer";

export const PDF_INSPECTOR_WIDTH = 320;
/** Docking must leave at least this much room for the pages. */
export const PDF_MIN_VIEW_WIDTH = 360;

/** Docked when the pages keep enough room beside the panel, otherwise a drawer. */
export function pdfInspectorLayout(
  hostWidth: number,
  width = PDF_INSPECTOR_WIDTH,
  minView = PDF_MIN_VIEW_WIDTH,
): PdfInspectorLayout {
  return hostWidth - width >= minView ? "docked" : "drawer";
}

export type PdfInspector = {
  element: HTMLElement;
  /** The page on show, or null when closed. */
  readonly page: PdfInspectorPage | null;
  readonly layout: PdfInspectorLayout;
  /**
   * Shows `page`, replacing whatever was open. `onClose` runs once when this
   * page is closed or replaced; `restoreFocus` runs only when the person closes it.
   */
  open: (
    page: PdfInspectorPage,
    options?: { focus?: boolean; restoreFocus?: () => void },
  ) => void;
  /** Rebuilds the open page from its renderer, keeping the focus target. */
  refresh: (page?: PdfInspectorPage) => void;
  /** Closes the panel. Returns false when nothing was open. */
  close: (options?: { restoreFocus?: boolean }) => boolean;
  /** Re-evaluates docked versus drawer for a host this wide. */
  setHostWidth: (width: number) => void;
  destroy: () => void;
};

const FOCUSABLE = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

function focusables(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  const walk = (node: HTMLElement): void => {
    for (const child of Array.from(node.children) as HTMLElement[]) {
      if (child.hidden) continue;
      if (FOCUSABLE.has(child.tagName) && !(child as HTMLButtonElement).disabled)
        found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

export function createPdfInspector(
  doc: Document,
  options: {
    render: (page: PdfInspectorPage) => PdfInspectorContent;
    /** Called after the page or layout changes, e.g. to refit the pages. */
    onChange?: () => void;
  },
): PdfInspector {
  const element = doc.createElement("aside");
  element.className = "pdf-inspector";
  element.hidden = true;
  element.tabIndex = -1;
  element.setAttribute("aria-labelledby", "pdf-inspector-title");
  const head = doc.createElement("div");
  head.className = "pdf-inspector-head";
  const title = doc.createElement("strong");
  title.id = "pdf-inspector-title";
  const sub = doc.createElement("span");
  sub.className = "pdf-inspector-sub";
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "pdf-inspector-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close panel");
  close.title = "Close (Esc)";
  head.append(title, sub, close);
  const body = doc.createElement("div");
  body.className = "pdf-inspector-body";
  element.append(head, body);

  let page: PdfInspectorPage | null = null;
  let layout: PdfInspectorLayout = "docked";
  let restore: (() => void) | null = null;

  const paint = (): void => {
    if (!page) return;
    const content = options.render(page);
    title.textContent = content.title;
    sub.textContent = content.sub ?? "";
    body.replaceChildren(...content.body);
  };
  const applyLayout = (): void => {
    element.dataset.layout = layout;
  };

  const closePanel = ({ restoreFocus = true } = {}): boolean => {
    if (!page) return false;
    page = null;
    element.hidden = true;
    body.replaceChildren();
    const back = restore;
    restore = null;
    options.onChange?.();
    if (restoreFocus) back?.();
    return true;
  };

  close.addEventListener("click", () => closePanel());
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
      return;
    }
    // A drawer covers the pages, so Tab stays inside it until it closes.
    if (event.key !== "Tab" || layout !== "drawer") return;
    const items = focusables(element);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || active === element)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  element.addEventListener("keydown", onKey);

  return {
    element,
    get page() {
      return page;
    },
    get layout() {
      return layout;
    },
    open(next, { focus = true, restoreFocus } = {}) {
      const changed = page !== next;
      if (changed || restoreFocus) restore = restoreFocus ?? null;
      page = next;
      element.hidden = false;
      applyLayout();
      paint();
      if (focus || layout === "drawer") element.focus({ preventScroll: true });
      if (changed) options.onChange?.();
    },
    refresh(only) {
      if (!page || (only && only !== page)) return;
      paint();
    },
    close: closePanel,
    setHostWidth(width) {
      const next = pdfInspectorLayout(width);
      if (next === layout) return;
      layout = next;
      applyLayout();
      if (page) options.onChange?.();
    },
    destroy() {
      element.removeEventListener("keydown", onKey);
      element.remove();
      page = null;
      restore = null;
    },
  };
}
