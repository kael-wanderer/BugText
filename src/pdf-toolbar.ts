// PDF toolbar: a Read row that is always shown and an Edit row shown while editing.
// It renders state and reports commands; the PDF view owns every action.

import type { PdfFitMode } from "./pdf-navigation";

export type PdfEditTool = "select" | "text" | "cover" | "replace" | "image";

/** Right-hand inspector pages a toolbar control opens. */
export type PdfPanel = "annotations" | "replace" | "review" | "proof" | "ocr" | "ocr-review" | "support";

export type PdfToolbarCommand =
  | "annotations"
  | "pages"
  | "page-prev"
  | "page-next"
  | "zoom-in"
  | "zoom-out"
  | "zoom-actual"
  | `fit-${PdfFitMode}`
  | "find"
  | "edit"
  | "save"
  | "save-copy"
  | "ocr"
  | "ocr-review"
  | "proof"
  | "support"
  | "replace-selection"
  | "reflow"
  | "snap"
  | "delete"
  | "undo"
  | "redo"
  | "review"
  | `tool:${PdfEditTool}`;

export type PdfToolbarState = {
  /** One-based page in view; 0 before pages exist. */
  page: number;
  pageCount: number;
  zoomLabel: string;
  fit: PdfFitMode | null;
  /** Display zoom; the Actual Size item is checked at 1 without a fit mode. */
  zoom: number;
  editing: boolean;
  tool: PdfEditTool;
  saving: boolean;
  /** Pending (unsaved) edit count. */
  pending: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelectedEdit: boolean;
  canReflow: boolean;
  snap: boolean;
  ocrBusy: boolean;
  ocrReview: { total: number; lowConfidence: number };
  proofIssues: number;
  pagesReady: boolean;
  /** Editing support summary once pages are inspected; limited flags pages that resist editing. */
  support: { limited: boolean; note: string } | null;
  /** The Pages rail sits on the left and can be open beside the inspector. */
  pagesOpen: boolean;
  openPanel: PdfPanel | null;
};

export type PdfToolbar = {
  element: HTMLElement;
  /** Flexible slot on the Read row for status messages. */
  status: HTMLElement;
  update(state: PdfToolbarState): void;
  /** Closes an open menu; true when one was open. */
  closeMenu(): boolean;
  /** Focuses the visible control for a command, or the menu that holds it. */
  focusCommand(command: PdfToolbarCommand): void;
  destroy(): void;
};

type Fit = "full" | "compact" | "narrow";
const FITS: Fit[] = ["full", "compact", "narrow"];

// 16px line icons; each shape is [tag, attributes].
type Shape = [string, Record<string, string>];
const ICONS: Record<string, Shape[]> = {
  annotations: [["path", { d: "M3 3h10v10H3zM5 6h6M5 9h4" }]],
  pages: [
    ["rect", { x: "2.5", y: "2.5", width: "4", height: "5", rx: ".8" }],
    ["rect", { x: "2.5", y: "9", width: "4", height: "4.5", rx: ".8" }],
    ["path", { d: "M9 3.5h4.5M9 6.5h4.5M9 10h4.5M9 13h3" }],
  ],
  find: [
    ["circle", { cx: "7", cy: "7", r: "4.5" }],
    ["path", { d: "M10.5 10.5l3.5 3.5" }],
  ],
  edit: [["path", { d: "M10.5 2.5l3 3-8 8-3.5.5.5-3.5z" }]],
  save: [
    ["path", { d: "M3 3h8l2 2v8H3z" }],
    ["path", { d: "M5.5 3v3h4V3M5 13V9.5h6V13" }],
  ],
  more: [["path", { d: "M3.5 8h.01M8 8h.01M12.5 8h.01", "stroke-width": "2.2" }]],
  prev: [["path", { d: "M10 3.5L5.5 8l4.5 4.5" }]],
  next: [["path", { d: "M6 3.5L10.5 8 6 12.5" }]],
  minus: [["path", { d: "M3.5 8h9" }]],
  plus: [["path", { d: "M3.5 8h9M8 3.5v9" }]],
  caret: [["path", { d: "M5 6.5l3 3 3-3" }]],
  select: [["path", { d: "M4 2.5l8.5 5.8-3.8.7 2.1 3.8-1.6.9-2.1-3.8L4 12.6z" }]],
  text: [["path", { d: "M2.5 4V3h7v1M6 3v9.5M4.5 12.5h3M12 8.5v5M9.5 11h5" }]],
  replace: [
    ["path", { d: "M2.5 3.5h5M5 3.5v7" }],
    ["path", { d: "M9 6.5h4.5L12 5M13.5 10.5H9l1.5 1.5" }],
  ],
  cover: [
    ["rect", { x: "2.5", y: "4.5", width: "11", height: "7", rx: "1", fill: "currentColor", "fill-opacity": ".3" }],
  ],
  image: [
    ["rect", { x: "2.5", y: "3", width: "11", height: "10", rx: "1.5" }],
    ["circle", { cx: "6", cy: "6.5", r: "1.2" }],
    ["path", { d: "M3 12l3.5-3.5 2.5 2.5 2-2 2.5 2.5" }],
  ],
  undo: [["path", { d: "M5.5 4L2.5 7l3 3M2.5 7h7a4 4 0 010 8H8" }]],
  redo: [["path", { d: "M10.5 4l3 3-3 3M13.5 7h-7a4 4 0 000 8H8" }]],
  delete: [["path", { d: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" }]],
  review: [["path", { d: "M3 4.5h1.5M3 8h1.5M3 11.5h1.5M7 4.5h6M7 8h6M7 11.5h6" }]],
  actions: [["path", { d: "M8 2.5l1.4 3.1 3.1 1.4-3.1 1.4L8 11.5 6.6 8.4 3.5 7l3.1-1.4z" }]],
};

const TOOLS: { tool: PdfEditTool; label: string; key: string }[] = [
  { tool: "select", label: "Select", key: "V" },
  { tool: "text", label: "Add Text", key: "T" },
  { tool: "replace", label: "Replace Text", key: "R" },
  { tool: "cover", label: "Cover", key: "C" },
  { tool: "image", label: "Image", key: "I" },
];

/** Tool for a single-letter shortcut, or null. */
export function toolForKey(key: string): PdfEditTool | null {
  return TOOLS.find((entry) => entry.key === key.toUpperCase())?.tool ?? null;
}

type MenuItem = {
  command: PdfToolbarCommand;
  element: HTMLButtonElement;
};

type Menu = {
  trigger: HTMLButtonElement;
  list: HTMLElement;
  items: MenuItem[];
};

export function createPdfToolbar(
  doc: Document,
  options: {
    onCommand: (command: PdfToolbarCommand) => void;
    /** Runs on press, before focus or text selection can change. */
    onPress?: (command: PdfToolbarCommand | "actions-menu") => void;
    /** Jumps to a typed page; returns an error message when the input is not a page. */
    onPageInput?: (text: string) => string | null;
    /** The page field went back to the current page (Escape or leaving it). */
    onPageReset?: () => void;
  },
): PdfToolbar {
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  };
  const icon = (name: string): Element => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("class", name === "caret" ? "pdf-tb-caret" : "pdf-tb-icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.3");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of ICONS[name]) {
      const shape = doc.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
      svg.appendChild(shape);
    }
    return svg;
  };
  // A label marked secondary collapses to its icon when the row is cramped.
  const button = (
    command: PdfToolbarCommand,
    label: string,
    iconName: string,
    opts: { title?: string; secondary?: boolean; iconOnly?: boolean } = {},
  ): HTMLButtonElement => {
    const node = el("button", "pdf-tb-btn");
    node.type = "button";
    node.dataset.command = command;
    node.title = opts.title ?? label;
    node.setAttribute("aria-label", label);
    node.append(icon(iconName));
    if (!opts.iconOnly) {
      const text = el("span", opts.secondary ? "pdf-tb-label pdf-tb-secondary" : "pdf-tb-label");
      text.textContent = label;
      node.append(text);
    }
    node.addEventListener("click", () => options.onCommand(command));
    return node;
  };
  const group = (...nodes: HTMLElement[]): HTMLElement => {
    const node = el("div", "pdf-tb-group");
    node.append(...nodes);
    return node;
  };
  const grow = (): HTMLElement => el("div", "pdf-tb-grow");

  const menus: Menu[] = [];
  let openMenu: Menu | null = null;
  const menuItem = (
    command: PdfToolbarCommand,
    label: string,
    shortcut?: string,
    checkable: false | "checkbox" | "radio" = false,
  ): MenuItem => {
    const node = el("button", "pdf-tb-item");
    node.type = "button";
    node.dataset.command = command;
    node.setAttribute("role", checkable === "checkbox" ? "menuitemcheckbox" : checkable === "radio" ? "menuitemradio" : "menuitem");
    node.tabIndex = -1;
    const text = el("span", "pdf-tb-item-label");
    text.textContent = label;
    node.append(text);
    if (shortcut) {
      const keys = el("span", "pdf-tb-item-key");
      keys.textContent = shortcut;
      node.append(keys);
    }
    node.addEventListener("click", () => {
      closeMenu(false);
      options.onCommand(command);
    });
    return { command, element: node };
  };
  const menu = (
    trigger: HTMLButtonElement,
    label: string,
    entries: (MenuItem | HTMLElement)[],
  ): HTMLElement => {
    const list = el("div", "pdf-tb-menu");
    list.setAttribute("role", "menu");
    list.setAttribute("aria-label", label);
    list.hidden = true;
    const items: MenuItem[] = [];
    for (const entry of entries) {
      if ("command" in entry && "element" in entry) {
        items.push(entry);
        list.append(entry.element);
      } else {
        list.append(entry);
      }
    }
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    const record: Menu = { trigger, list, items };
    menus.push(record);
    trigger.addEventListener("click", () => {
      if (openMenu === record) closeMenu(true);
      else showMenu(record);
    });
    list.addEventListener("keydown", (event) => onMenuKey(record, event));
    const wrap = el("div", "pdf-tb-menuwrap");
    wrap.append(trigger, list);
    return wrap;
  };
  const enabledItems = (record: Menu): HTMLButtonElement[] =>
    record.items
      .map((item) => item.element)
      .filter((item) => !item.disabled && !item.hidden);
  const showMenu = (record: Menu): void => {
    closeMenu(false);
    openMenu = record;
    record.list.hidden = false;
    record.trigger.setAttribute("aria-expanded", "true");
    record.trigger.classList.add("active");
    enabledItems(record)[0]?.focus();
    doc.addEventListener("pointerdown", onOutside, true);
  };
  const closeMenu = (restoreFocus: boolean): boolean => {
    const record = openMenu;
    if (!record) return false;
    openMenu = null;
    record.list.hidden = true;
    record.trigger.setAttribute("aria-expanded", "false");
    record.trigger.classList.remove("active");
    doc.removeEventListener("pointerdown", onOutside, true);
    if (restoreFocus) record.trigger.focus({ preventScroll: true });
    return true;
  };
  const onOutside = (event: Event): void => {
    const target = event.target as Node | null;
    if (openMenu && target && !openMenu.list.parentElement?.contains(target)) closeMenu(false);
  };
  const onMenuKey = (record: Menu, event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement && event.key !== "Escape") return;
    const items = enabledItems(record);
    const index = items.indexOf(doc.activeElement as HTMLButtonElement);
    const move = (next: number): void => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index < 0 ? items.length - 1 : index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === "Tab") closeMenu(false);
  };

  // Read row.
  const pagesButton = button("pages", "Pages", "pages", { title: "Pages", secondary: true });
  const annotationsButton = button("annotations", "Annotations", "annotations", { title: "Annotations (⇧⌘A)", secondary: true });
  const findButton = button("find", "Find", "find", { title: "Find in PDF (⌘F)", secondary: true });
  findButton.classList.add("pdf-tb-wide-only");
  const status = el("span", "pdf-tb-status");
  status.setAttribute("role", "status");
  const editButton = el("button", "pdf-tb-btn pdf-tb-edit");
  editButton.type = "button";
  editButton.dataset.command = "edit";
  editButton.title = "Edit PDF (⌘E)";
  editButton.setAttribute("aria-label", "Edit PDF");
  editButton.setAttribute("aria-pressed", "false");
  const editLabel = el("span", "pdf-tb-label");
  const editSuffix = el("span", "pdf-tb-secondary");
  editSuffix.textContent = " PDF";
  editLabel.append("Edit", editSuffix);
  editButton.append(icon("edit"), editLabel);
  editButton.addEventListener("click", () => options.onCommand("edit"));

  const saveTrigger = el("button", "pdf-tb-btn");
  saveTrigger.type = "button";
  saveTrigger.title = "Save";
  saveTrigger.setAttribute("aria-label", "Save");
  const saveLabel = el("span", "pdf-tb-label pdf-tb-secondary");
  saveLabel.textContent = "Save";
  saveTrigger.append(icon("save"), saveLabel, icon("caret"));
  const saveItem = menuItem("save", "Save Changes", "⌘S");
  const saveCopyItem = menuItem("save-copy", "Save a Copy…", "⇧⌘S");
  const saveMenu = menu(saveTrigger, "Save", [saveItem, saveCopyItem]);

  const moreTrigger = el("button", "pdf-tb-btn pdf-tb-more");
  moreTrigger.type = "button";
  moreTrigger.title = "More";
  moreTrigger.setAttribute("aria-label", "More PDF actions");
  moreTrigger.append(icon("more"));
  const findItem = menuItem("find", "Find in PDF", "⌘F");
  findItem.element.classList.add("pdf-tb-narrow-only");
  const ocrItem = menuItem("ocr", "Recognize Text…");
  const ocrReviewItem = menuItem("ocr-review", "Review OCR Text");
  const proofItem = menuItem("proof", "Check Text Edits");
  const supportItem = menuItem("support", "Editing Support");
  const separator = (): HTMLElement => {
    const node = el("div", "pdf-tb-sep");
    node.setAttribute("role", "separator");
    return node;
  };
  // Zoom moves here when the row is too narrow for its own controls.
  const narrowZoom = [
    menuItem("zoom-in", "Zoom In", "⌘+"),
    menuItem("zoom-out", "Zoom Out", "⌘−"),
    menuItem("fit-auto", "Automatic Zoom", "⌘0"),
    menuItem("fit-width", "Fit Width"),
    menuItem("fit-page", "Fit Page"),
  ];
  narrowZoom.forEach((item) => item.element.classList.add("pdf-tb-narrow-only"));
  const narrowSeparator = separator();
  narrowSeparator.classList.add("pdf-tb-narrow-only");
  const moreMenu = menu(moreTrigger, "More PDF actions", [
    findItem,
    ...narrowZoom,
    narrowSeparator,
    ocrItem,
    ocrReviewItem,
    separator(),
    proofItem,
    supportItem,
  ]);

  // Page position: previous, editable one-based page, count, next.
  const prevButton = button("page-prev", "Previous Page", "prev", { iconOnly: true });
  const nextButton = button("page-next", "Next Page", "next", { iconOnly: true });
  const pageInput = el("input", "pdf-tb-page-input");
  pageInput.type = "text";
  pageInput.inputMode = "numeric";
  pageInput.setAttribute("aria-label", "Page number");
  pageInput.value = "0";
  const pageCount = el("span", "pdf-tb-page-count");
  let lastPage = 0;
  const clearPageError = (): void => {
    if (pageInput.getAttribute("aria-invalid")) options.onPageReset?.();
    pageInput.removeAttribute("aria-invalid");
    pageInput.title = "Page number";
  };
  pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const error = options.onPageInput?.(pageInput.value) ?? null;
      if (error) {
        pageInput.setAttribute("aria-invalid", "true");
        pageInput.title = error;
        pageInput.select();
      } else {
        clearPageError();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      pageInput.value = String(lastPage);
      clearPageError();
      pageInput.select();
    }
  });
  pageInput.addEventListener("focus", () => pageInput.select());
  pageInput.addEventListener("blur", () => {
    pageInput.value = String(lastPage);
    clearPageError();
  });
  const pageGroup = group(prevButton, pageInput, pageCount, nextButton);
  pageGroup.classList.add("pdf-tb-pager");

  // Zoom: out, a fit/zoom menu showing the current state, in.
  const zoomOutButton = button("zoom-out", "Zoom Out", "minus", { title: "Zoom Out (⌘−)", iconOnly: true });
  const zoomInButton = button("zoom-in", "Zoom In", "plus", { title: "Zoom In (⌘+)", iconOnly: true });
  const zoomTrigger = el("button", "pdf-tb-btn pdf-tb-zoom-label");
  zoomTrigger.type = "button";
  zoomTrigger.title = "Zoom";
  zoomTrigger.setAttribute("aria-label", "Zoom");
  const zoomText = el("span");
  zoomTrigger.append(zoomText, icon("caret"));
  const fitItems: Record<string, MenuItem> = {
    auto: menuItem("fit-auto", "Automatic", "⌘0", "radio"),
    width: menuItem("fit-width", "Fit Width", undefined, "radio"),
    page: menuItem("fit-page", "Fit Page", undefined, "radio"),
  };
  const actualItem = menuItem("zoom-actual", "Actual Size", undefined, "radio");
  const zoomMenu = menu(zoomTrigger, "Zoom", [fitItems.auto, fitItems.width, fitItems.page, actualItem]);
  const zoomGroup = group(zoomOutButton, zoomMenu, zoomInButton);
  zoomGroup.classList.add("pdf-tb-zoom", "pdf-tb-wide-only");

  const readRow = el("div", "pdf-tb-row pdf-tb-read");
  readRow.dataset.fit = "full";
  readRow.setAttribute("role", "toolbar");
  readRow.setAttribute("aria-label", "PDF");
  readRow.append(pagesButton, pageGroup, zoomGroup, findButton, status, annotationsButton, editButton, saveMenu, moreMenu);

  // Edit row.
  const toolButtons = new Map<PdfEditTool, HTMLButtonElement>();
  const toolGroup = group(
    ...TOOLS.map(({ tool, label, key }) => {
      const node = button(`tool:${tool}`, label, tool, { title: `${label} (${key})`, secondary: true });
      node.setAttribute("aria-pressed", "false");
      toolButtons.set(tool, node);
      return node;
    }),
  );
  toolGroup.classList.add("pdf-tb-tools");
  const undoButton = button("undo", "Undo", "undo", { title: "Undo (⌘Z)", iconOnly: true });
  const redoButton = button("redo", "Redo", "redo", { title: "Redo (⇧⌘Z)", iconOnly: true });
  const actionsTrigger = el("button", "pdf-tb-btn");
  actionsTrigger.type = "button";
  actionsTrigger.dataset.command = "actions-menu";
  actionsTrigger.title = "Text actions";
  actionsTrigger.setAttribute("aria-label", "Text actions");
  const actionsLabel = el("span", "pdf-tb-label pdf-tb-secondary");
  actionsLabel.textContent = "Actions";
  actionsTrigger.append(icon("actions"), actionsLabel, icon("caret"));
  const replaceSelectionItem = menuItem("replace-selection", "Replace Selected Text…");
  const reflowItem = menuItem("reflow", "Reflow Text Box");
  const snapItem = menuItem("snap", "Snap to 5-Point Grid", undefined, "checkbox");
  const deleteItem = menuItem("delete", "Delete Selected Edit", "⌫");
  deleteItem.element.classList.add("pdf-tb-narrow-only");
  const actionsMenu = menu(actionsTrigger, "Text actions", [
    replaceSelectionItem,
    reflowItem,
    deleteItem,
    separator(),
    snapItem,
  ]);
  const deleteButton = button("delete", "Delete", "delete", { title: "Delete selected edit (⌫)", secondary: true });
  deleteButton.classList.add("pdf-tb-wide-only");
  const reviewButton = button("review", "Review", "review", { title: "Review pending edits", secondary: true });
  const reviewBadge = el("span", "pdf-tb-badge");
  reviewBadge.hidden = true;
  reviewButton.append(reviewBadge);

  const editRow = el("div", "pdf-tb-row pdf-tb-edit-row");
  editRow.dataset.fit = "full";
  editRow.setAttribute("role", "toolbar");
  editRow.setAttribute("aria-label", "PDF editing");
  editRow.hidden = true;
  editRow.append(toolGroup, group(undoButton, redoButton), actionsMenu, deleteButton, grow(), reviewButton);

  const rowButtons = [pagesButton, prevButton, nextButton, zoomOutButton, zoomInButton, findButton, editButton, ...toolButtons.values(), undoButton, redoButton, deleteButton, reviewButton];
  const element = el("div", "pdf-edit-toolbar pdf-toolbar");
  element.append(readRow, editRow);

  // Pressing a toolbar button must not take the PDF text selection with it.
  const onPress = (event: Event): void => {
    const target = event.target as Element | null;
    const pressed = target?.closest?.("button");
    if (!pressed || !element.contains(pressed)) return;
    event.preventDefault();
    const command = pressed.dataset.command as PdfToolbarCommand | "actions-menu" | undefined;
    if (command) options.onPress?.(command);
  };
  element.addEventListener("pointerdown", onPress);
  element.addEventListener("mousedown", onPress);

  // Each row tries presentations widest first and keeps the first that fits.
  const fitRow = (row: HTMLElement): void => {
    if (row.hidden) return;
    for (const presentation of FITS) {
      row.dataset.fit = presentation;
      if (row.scrollWidth <= row.clientWidth + 1) return;
    }
  };
  const fit = (): void => {
    fitRow(readRow);
    fitRow(editRow);
    // A status squeezed to a few characters reads as noise ("S…"); hide it visually
    // while it stays in the accessibility tree.
    const em =
      (typeof getComputedStyle === "function" && parseFloat(getComputedStyle(status).fontSize)) || 13;
    status.classList.toggle("is-cramped", status.clientWidth < em * 5);
  };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
  resize?.observe(element);

  const setDisabled = (node: HTMLButtonElement, disabled: boolean): void => {
    node.disabled = disabled;
  };
  const update = (state: PdfToolbarState): void => {
    const wasEditing = !editRow.hidden;
    lastPage = state.page;
    // Scrolling must not overwrite a page number being typed.
    if (doc.activeElement !== pageInput) pageInput.value = String(state.page);
    pageInput.disabled = state.pageCount === 0;
    pageCount.textContent = `/ ${state.pageCount}`;
    setDisabled(prevButton, state.page <= 1);
    setDisabled(nextButton, state.page >= state.pageCount);
    zoomText.textContent = state.zoomLabel;
    for (const [mode, item] of Object.entries(fitItems)) {
      item.element.setAttribute("aria-checked", String(state.fit === mode));
      item.element.classList.toggle("checked", state.fit === mode);
    }
    const actual = state.fit === null && Math.abs(state.zoom - 1) < 0.005;
    actualItem.element.setAttribute("aria-checked", String(actual));
    actualItem.element.classList.toggle("checked", actual);
    editRow.hidden = !state.editing;
    element.dataset.mode = state.editing ? "edit" : "read";
    editButton.classList.toggle("active", state.editing);
    editButton.setAttribute("aria-pressed", String(state.editing));
    pagesButton.classList.toggle("active", state.pagesOpen);
    pagesButton.setAttribute("aria-pressed", String(state.pagesOpen));
    setDisabled(pagesButton, !state.pagesReady);

    saveTrigger.disabled = state.saving;
    saveTrigger.classList.toggle("dirty", state.pending > 0);
    setDisabled(saveItem.element, state.saving || state.pending === 0);
    setDisabled(saveCopyItem.element, state.saving);

    const { total, lowConfidence } = state.ocrReview;
    ocrReviewItem.element.querySelector(".pdf-tb-item-label")!.textContent =
      total === 0
        ? "Review OCR Text"
        : lowConfidence > 0
          ? `Review OCR Text (${lowConfidence} of ${total} unsure)`
          : `Review OCR Text (${total})`;
    setDisabled(ocrReviewItem.element, total === 0);
    proofItem.element.querySelector(".pdf-tb-item-label")!.textContent = state.proofIssues
      ? `Check Text Edits (${state.proofIssues})`
      : "Check Text Edits";
    setDisabled(proofItem.element, state.saving || state.pending === 0);
    setDisabled(supportItem.element, !state.support);
    supportItem.element.querySelector(".pdf-tb-item-label")!.textContent = state.support?.limited
      ? "Editing Support (limited)"
      : "Editing Support";
    supportItem.element.title = state.support?.note ?? "";

    toolButtons.forEach((node, tool) => {
      node.classList.toggle("active", tool === state.tool);
      node.setAttribute("aria-pressed", String(tool === state.tool));
    });
    setDisabled(undoButton, state.saving || !state.canUndo);
    setDisabled(redoButton, state.saving || !state.canRedo);
    setDisabled(deleteButton, !state.hasSelectedEdit);
    setDisabled(deleteItem.element, !state.hasSelectedEdit);
    setDisabled(reflowItem.element, !state.canReflow);
    snapItem.element.setAttribute("aria-checked", String(state.snap));
    snapItem.element.classList.toggle("checked", state.snap);
    setDisabled(reviewButton, state.saving || state.pending === 0);
    annotationsButton.classList.toggle("active", state.openPanel === "annotations");
    annotationsButton.setAttribute("aria-pressed", String(state.openPanel === "annotations"));
    reviewButton.classList.toggle("active", state.openPanel === "review");
    reviewButton.setAttribute("aria-expanded", String(state.openPanel === "review"));
    reviewBadge.hidden = state.pending === 0;
    reviewBadge.textContent = String(state.pending);
    if (wasEditing !== state.editing) fit();
  };

  const focusCommand = (command: PdfToolbarCommand): void => {
    // offsetParent is null while CSS hides the button at this width.
    const direct = rowButtons.find(
      (node) => node.dataset.command === command && node.offsetParent !== null,
    );
    if (direct) {
      direct.focus({ preventScroll: true });
      return;
    }
    const holder = menus.find((record) => record.items.some((item) => item.command === command));
    (holder?.trigger ?? editButton).focus({ preventScroll: true });
  };

  return {
    element,
    status,
    update,
    closeMenu: () => closeMenu(true),
    focusCommand,
    destroy: () => {
      closeMenu(false);
      resize?.disconnect();
      element.removeEventListener("pointerdown", onPress);
      element.removeEventListener("mousedown", onPress);
    },
  };
}
