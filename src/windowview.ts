import { countWords } from "./status-bar/model";
import type { FilePosition } from "./workspaces/layout";
import { applyTextPosition, applyPdfPosition, captureTextPosition } from "./workspaces/positions";
import { bindPreviewLinks } from "./links/follow";
import { createScrollGuard, lineToOffset, offsetToLine, type ScrollAnchor } from "./scroll-sync";
import { capturePreviewPlace, restorePreviewPlace, shiftedLine } from "./preview-place";
import { createEditor, type EditorHandle } from "./editor";
import { resolvePreviewImages } from "./preview-images";
import { enhancePreviewTasks } from "./preview-tasks";
import { invoke } from "@tauri-apps/api/core";
import {
  documentViewModes,
  fileLanguageInfo,
  htmlPreviewBaseHref,
  htmlPreviewLayout,
  htmlWithBaseHref,
  htmlWithPreviewZoom,
  isHtmlFile,
  isMarkdownFile,
  isPdfFile,
  isSqlFile,
  normalizeDocumentViewMode,
} from "./document-kind";
import { glyphs } from "./glyphs";
import { renderMarkdown } from "./preview";
import { enhancePreview } from "./render-extras";
import { getWindow, getState } from "./store";
import { rewriteLastQuote } from "./pdf-annotations/quote";
import { parentPath } from "./paths";
import type { ViewMode } from "./state";
import type { MarkdownFormat } from "./markdown-format";
import { THEME_OPTIONS, type ThemeName } from "./settings";
import {
  PDF_FIND_EVENT,
  PDF_ANNOTATIONS_EVENT,
  PDF_COPY_QUOTE_EVENT,
  PDF_ZOOM_EVENT,
  PDF_EDIT_EVENT,
  PDF_SAVE_AS_EVENT,
  PDF_SAVE_EVENT,
  renderPdf,
  type PdfFindHandle,
} from "./pdfview";
import type { PdfFitMode } from "./pdf-navigation";
import { FILE_ICON_TEXT, fileIcon } from "./icons";
import {
  activateTextMatch,
  clearTextHighlights,
  highlightText,
} from "./preview-find";

export type WindowHandlers = {
  livePreviewEnabled?: () => boolean;
  onStatusChange?: () => void;
  onWordCount?: (tabId: string, count: number) => void;
  onKeepTab?: (windowId: string, tabId: string) => void;
  onActivateTab: (windowId: string, tabId: string) => void;
  onCloseTab: (windowId: string, tabId: string) => void;
  onTabContextMenu: (
    windowId: string,
    tabId: string,
    x: number,
    y: number,
  ) => void;
  onSetMode: (windowId: string, mode: ViewMode) => void;
  onToggleLineNumbers: () => void;
  onToggleSub: () => void;
  onFocusWindow: (windowId: string) => void;
  onNavigation: (windowId: string) => void;
  onMarkdownFocus?: (windowId: string, tabId: string) => void;
  onExportAnnotations?: (items: import("./pdf-annotations/model").Annotation[], title: string, path: string) => void;
  getReadingPosition?: (tabId: string) => FilePosition | undefined;
  onReadingPosition?: (tabId: string, position: FilePosition) => void;
  syncScrollEnabled: () => boolean;
  onDocChange: (windowId: string, tabId: string, text: string) => void;
  onPdfEditDirtyChange: (windowId: string, tabId: string, dirty: boolean) => void;
  onSave: (windowId: string) => void;
  onOpen: (windowId: string) => void;
  onThemeChange: (theme: ThemeName) => void;
  getTheme: () => ThemeName;
  onEditorContextMenu: (windowId: string, x: number, y: number) => void;
  /** Image files pasted into the editor; true when the paste was taken over. */
  onPasteImages: (windowId: string, tabId: string, files: File[]) => boolean;
  /** Clipboard text pasted into a document; returns a replacement (a table) or null. */
  onPasteText: (windowId: string, tabId: string, html: string, text: string, inCode: boolean) => string | null;
  /** The format bar's table button while the cursor is in a table. */
  onTableMenu: (windowId: string, x: number, y: number) => void;
};

export type WindowView = {
  id: string;
  editor: EditorHandle;
  render: () => void;
  activateDocument: (tabId: string) => void;
  captureReadingPosition: () => void;
  restoreReadingPosition: () => Promise<void>;
  renderPreview: (text: string, pathOrName?: string | null) => void;
  jumpToLine: (line: number) => void;
  navigationLine: () => number;
  adjustFocusedZoom: (delta: number) => void;
  resetFocusedZoom: () => void;
  requestMeasure: () => void;
  focus: () => void;
  destroy: () => void;
  setLineNumbersFlag: (on: boolean) => void;
  setLivePreviewFlag: (on: boolean) => void;
  openPdfPage: (page: number, annotation?: string) => void;
  annotationCommand: (command: "panel" | "copy") => boolean;
  savePdf: () => boolean;
  savePdfAs: () => boolean;
  /** Toggles Edit PDF when a PDF is open; false otherwise. */
  togglePdfEdit: () => boolean;
  /** Re-checks the shown PDF against the file on disk. */
  checkPdfDisk: () => Promise<void>;
  openFind: () => boolean;
};

export { countWords } from "./status-bar/model";

export function createWindowView(
  host: HTMLElement,
  windowId: string,
  isMain: boolean,
  h: WindowHandlers
): WindowView {
  const root = document.createElement("div");
  root.className = "window";
  root.dataset.windowId = windowId;
  root.innerHTML = `
    <div class="editor-header">
      <div class="tabbar"></div>
      <div class="window-toolbar">
        <div class="wt-group wt-modes">
          <button class="wt-btn" data-mode="editor" type="button" title="Editor (⌘E)">${glyphs.editor}</button>
          <button class="wt-btn" data-mode="preview" type="button" title="Read">${glyphs.read}</button>
          <button class="wt-btn" data-mode="split" type="button" title="Editor + Preview">${glyphs.split}</button>
        </div>
        <div class="wt-group preview-zoom-group">
          <button class="wt-btn wt-preview-zoom" data-preview-zoom="out" type="button" title="Zoom preview out (⌘−)">−</button>
          <button class="wt-btn wt-preview-reset" data-preview-zoom="reset" type="button" title="Reset preview zoom (⌘0)">100%</button>
          <button class="wt-btn wt-preview-zoom" data-preview-zoom="in" type="button" title="Zoom preview in (⌘+)">+</button>
        </div>
        <button class="wt-btn wt-icon wt-lines" type="button" title="Line numbers">${glyphs.lineNumbers}</button>
        ${
          isMain
            ? `<button class="wt-btn wt-icon wt-sub" type="button" title="Toggle Sub window">${glyphs.subToggle}</button>`
            : `<button class="wt-btn wt-icon wt-subclose" type="button" title="Close Sub window">${glyphs.subClose}</button>`
        }
      </div>
    </div>
    <div class="window-panes">
      <div class="pane pane-editor">
        <div class="format-toolbar" role="toolbar" aria-label="Markdown formatting">
          <button type="button" data-format="bold" title="Bold" aria-label="Bold"><strong>B</strong></button>
          <button type="button" data-format="italic" title="Italic" aria-label="Italic"><em>I</em></button>
          <button type="button" data-format="heading" title="Cycle heading" aria-label="Cycle heading">H</button>
          <button type="button" data-format="link" title="Link" aria-label="Link">↗</button>
          <button type="button" data-format="code" title="Inline code" aria-label="Inline code">&lt;/&gt;</button>
          <button type="button" data-format="quote" title="Quote" aria-label="Quote">❯</button>
          <button type="button" data-format="bullet" title="Bullet list" aria-label="Bullet list">•</button>
          <button type="button" data-format="task" title="Task list" aria-label="Task list">☑</button>
          <button type="button" data-format="table" title="Insert table" aria-label="Insert table">▦</button>
          <button type="button" data-format="rule" title="Horizontal rule" aria-label="Horizontal rule">—</button>
        </div>
        <div class="properties-card" hidden></div>
        <div class="editor-surface"></div>
      </div>
      <div class="seam"></div>
      <div class="pane pane-preview"></div>
      <div class="preview-find hidden" role="search">
        <input type="text" aria-label="Find in reading view" placeholder="Find" />
        <span class="preview-find-status">0/0</span>
        <button type="button" data-find="previous" title="Previous match">↑</button>
        <button type="button" data-find="next" title="Next match">↓</button>
        <button type="button" data-find="close" title="Close">×</button>
      </div>
    </div>
    <div class="window-status">
      <span class="ws-name"></span>
      <div class="ws-right">
        <select class="ws-theme" aria-label="Theme" title="Quick theme"></select>
        <span class="ws-words">0 words</span>
        <span class="ws-cursor">Ln 1, Col 1</span>
        <span class="ws-language">
          <span class="ws-file-icon"></span>
          <span class="ws-language-label">Plain text</span>
        </span>
      </div>
    </div>`;
  host.appendChild(root);

  const tabbarEl = root.querySelector<HTMLElement>(".tabbar")!;
  const editorPane = root.querySelector<HTMLElement>(".pane-editor")!;
  const editorSurface = root.querySelector<HTMLElement>(".editor-surface")!;
  const formatToolbar = root.querySelector<HTMLElement>(".format-toolbar")!;
  const contextAction = document.createElement("button"); contextAction.type = "button";
  contextAction.textContent = "Context actions"; contextAction.disabled = true;
  contextAction.className = "editor-context-action"; formatToolbar.append(contextAction);
  let imageRange: { from: number; to: number } | null = null;
  function refreshContextAction(): void {
    const w = getWindow(windowId); const tab = w?.tabs.find(t => t.id === w.activeTabId);
    imageRange = null;
    if (!tab || !isMarkdownFile(tab.path ?? tab.name)) { contextAction.disabled = true; return; }
    if (editor.tableContext()) { contextAction.disabled = false; contextAction.textContent = "Table actions"; return; }
    const source = editor.getText(tab.id); const at = editor.cursorOffset(tab.id);
    const start = source.lastIndexOf("\n", at - 1) + 1; const end = source.indexOf("\n", at);
    const line = source.slice(start, end < 0 ? source.length : end);
    const match = /!\[[^\]\n]*\]\([^\n]*\)/.exec(line);
    if (match && at >= start + match.index && at <= start + match.index + match[0].length) imageRange = { from: start + match.index, to: start + match.index + match[0].length };
    contextAction.disabled = !imageRange; contextAction.textContent = imageRange ? "Edit image source" : "Context actions";
  }
  contextAction.addEventListener("mousedown", event => event.preventDefault());
  contextAction.addEventListener("click", () => {
    if (imageRange) editor.selectRange(imageRange.from, imageRange.to);
    else if (editor.tableContext()) { const rect = contextAction.getBoundingClientRect(); h.onTableMenu(windowId, rect.left, rect.bottom); }
  });
  const previewPane = root.querySelector<HTMLElement>(".pane-preview")!;
  previewPane.tabIndex = -1;
  const wsName = root.querySelector<HTMLElement>(".ws-name")!;
  const wsWords = root.querySelector<HTMLElement>(".ws-words")!;
  const wsCursor = root.querySelector<HTMLElement>(".ws-cursor")!;
  const wsFileIcon = root.querySelector<HTMLElement>(".ws-file-icon")!;
  const wsLanguage = root.querySelector<HTMLElement>(".ws-language")!;
  const wsLanguageLabel = root.querySelector<HTMLElement>(".ws-language-label")!;
  const themeSelect = root.querySelector<HTMLSelectElement>(".ws-theme")!;
  for (const theme of THEME_OPTIONS) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.label;
    themeSelect.appendChild(option);
  }
  themeSelect.addEventListener("change", () => {
    h.onThemeChange(themeSelect.value as ThemeName);
  });

  let lineNums = true;
  let focusedPane: "editor" | "preview" = "editor";
  let cursorLine = 1;
  let displayedTabId: string | null = null;
  let restoringPosition = false;
  let positionGeneration = 0;
  let previewDocumentId: string | null = null;
  let previewLineCount = 0;
  let placeObserver: ResizeObserver | null = null;
  let editorZoom = 1;
  let previewZoom = 1;
  // PDF zoom follows a fit mode until the user picks an explicit zoom.
  let pdfFit: PdfFitMode | null = "auto";
  let previewText = "";
  let previewPathOrName: string | null = null;
  let pendingAnnotation: string | undefined;
  let pdfTargetPage: number | undefined;
  // Scroll position to return to when the open PDF reloads from disk.
  let pdfReloadScroll: { top: number; left: number } | null = null;
  let pdfFind: PdfFindHandle | null = null;
  let textFindMatches: HTMLElement[] = [];
  let textFindIndex = -1;
  let previewFrame: HTMLIFrameElement | null = null;
  // Identifies this pane's HTML document in the native preview:// store.
  const previewSlot = crypto.randomUUID();
  let previewCanvas: HTMLElement | null = null;
  let htmlPreviewContentSize: { width: number; height: number } | null = null;
  let lastMode: ViewMode | null = null;
  let previewRenderToken = 0;
  const findBar = root.querySelector<HTMLElement>(".preview-find")!;
  const findInput = findBar.querySelector<HTMLInputElement>("input")!;
  const findStatus =
    findBar.querySelector<HTMLElement>(".preview-find-status")!;

  const updateFindStatus = (count: number, active: number): void => {
    findStatus.textContent = `${active}/${count}`;
  };
  const runFind = (): void => {
    if (pdfFind) {
      const count = pdfFind.setQuery(findInput.value);
      updateFindStatus(count, count ? 1 : 0);
      return;
    }
    const article = previewPane.querySelector<HTMLElement>("article.doc");
    textFindMatches = article ? highlightText(article, findInput.value) : [];
    textFindIndex = textFindMatches.length ? 0 : -1;
    const result = activateTextMatch(textFindMatches, textFindIndex);
    updateFindStatus(result.count, result.active);
  };
  const moveFind = (delta: number): void => {
    if (pdfFind) {
      const result = pdfFind.move(delta);
      updateFindStatus(result.count, result.active);
      return;
    }
    if (!textFindMatches.length) return;
    textFindIndex =
      (textFindIndex + delta + textFindMatches.length) %
      textFindMatches.length;
    const result = activateTextMatch(textFindMatches, textFindIndex);
    updateFindStatus(result.count, result.active);
  };
  const closeFind = (): void => {
    findBar.classList.add("hidden");
    pdfFind?.clear();
    const article = previewPane.querySelector<HTMLElement>("article.doc");
    if (article) clearTextHighlights(article);
    textFindMatches = [];
    textFindIndex = -1;
    previewPane.focus();
  };
  findInput.addEventListener("input", runFind);
  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveFind(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFind();
    }
  });
  findBar.querySelector('[data-find="previous"]')!.addEventListener(
    "click",
    () => moveFind(-1),
  );
  findBar.querySelector('[data-find="next"]')!.addEventListener(
    "click",
    () => moveFind(1),
  );
  findBar.querySelector('[data-find="close"]')!.addEventListener(
    "click",
    closeFind,
  );

  root.addEventListener("mousedown", () => h.onFocusWindow(windowId));
  editorPane.addEventListener("mousedown", () => {
    focusedPane = "editor";
  });
  previewPane.addEventListener("mousedown", () => {
    focusedPane = "preview";
    h.onNavigation(windowId);
  });
  editorPane.addEventListener("focusin", () => { focusedPane = "editor"; const tab = getWindow(windowId)?.tabs.find((t) => t.id === getWindow(windowId)?.activeTabId); if (tab && isMarkdownFile(tab.path ?? tab.name)) h.onMarkdownFocus?.(windowId, tab.id); h.onNavigation(windowId); });
  previewPane.addEventListener("focusin", () => { focusedPane = "preview"; h.onNavigation(windowId); });

  root.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => h.onSetMode(windowId, btn.dataset.mode as ViewMode))
  );
  root.querySelector(".wt-lines")!.addEventListener("click", () => h.onToggleLineNumbers());
  root.querySelector(".wt-sub")?.addEventListener("click", () => h.onToggleSub());
  root.querySelector(".wt-subclose")?.addEventListener("click", () => h.onToggleSub());

  const seam = root.querySelector<HTMLElement>(".seam")!;
  seam.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const panes = root.querySelector<HTMLElement>(".window-panes")!;
    document.body.classList.add("resizing-panes");
    const onMove = (moveEvent: MouseEvent): void => {
      const rect = panes.getBoundingClientRect();
      const ratio = Math.max(
        0.2,
        Math.min(0.8, (moveEvent.clientX - rect.left) / rect.width),
      );
      editorPane.style.flex = `0 0 ${ratio * 100}%`;
      previewPane.style.flex = "1 1 0";
      editor.requestMeasure();
    };
    const onUp = (): void => {
      document.body.classList.remove("resizing-panes");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      editor.requestMeasure();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  let cardTab: string | null = null;
  let cardMarkdown = false;
  // The card loads with the YAML code it needs, so that code stays out of the startup bundle.
  let card: { render(): void; reset(): void } | null = null;
  void import("./properties/card").then(({ createPropertiesCard }) => {
    card = createPropertiesCard(root.querySelector<HTMLElement>(".properties-card")!, () => {
      const w = getWindow(windowId);
      const tab = w?.tabs.find(t => t.id === w.activeTabId);
      return tab && isMarkdownFile(tab.path ?? tab.name) ? editor.getText(tab.id) : null;
    }, () => { editor.gotoLine(1); }, (source, edit) => {
      const w = getWindow(windowId);
      const tab = w?.tabs.find(t => t.id === w.activeTabId);
      if (!tab || !isMarkdownFile(tab.path ?? tab.name) || editor.getText(tab.id) !== source) return false;
      editor.applyPropertyEdit(tab.id, edit);
      clearTimeout(cardTimer);
      return true;
    }, () => getWindow(windowId)?.activeTabId ?? null);
    card.render();
  });
  const editor = createEditor(
    editorSurface,
    (tabId, text) => {
      h.onDocChange(windowId, tabId, text);
      if (getWindow(windowId)?.activeTabId === tabId) {
        clearTimeout(cardTimer); cardTimer = setTimeout(() => card?.render(), 150);
      }
    },
    ({ line, column }) => {
      wsCursor.textContent = `Ln ${line}, Col ${column}`;
      h.onStatusChange?.();
      cursorLine = line;
      queueMicrotask(refreshContextAction);
      captureReadingPosition();
      h.onNavigation(windowId);
    },
    (tabId, files) => h.onPasteImages(windowId, tabId, files),
    (tabId, html, text, inCode) => h.onPasteText(windowId, tabId, html, text, inCode),
    tabId => {
      captureReadingPosition();
      restoringPosition = true;
      positionGeneration += 1;
      displayedTabId = tabId;
    },
    (tabId, text) => {
      const tab = getWindow(windowId)?.tabs.find((entry) => entry.id === tabId);
      const folder = getState().folder;
      if (!tab?.path || !folder || !isMarkdownFile(tab.path) || !(tab.path === folder || tab.path.startsWith(`${folder}/`))) return null;
      return rewriteLastQuote(text, parentPath(tab.path));
    },
  );
  function captureReadingPosition(): void {
    if (!displayedTabId || restoringPosition || isPdfFile(previewPathOrName)) return;
    h.onReadingPosition?.(displayedTabId, captureTextPosition({
      cursor: () => editor.cursorOffset(displayedTabId!),
      topLine: () => lastMode === "preview" && isMarkdownFile(previewPathOrName)
        ? offsetToLine(previewPane.scrollTop, anchors()) : editor.visibleTopLine(),
    }));
  }
  function activateDocument(tabId: string): void {
    editor.switchTo(tabId);
  }
  async function restoreReadingPosition(): Promise<void> {
    const tabId = displayedTabId;
    const generation = ++positionGeneration;
    const position = tabId ? h.getReadingPosition?.(tabId) : undefined;
    if (isPdfFile(previewPathOrName)) {
      restoringPosition = false;
      if (position?.page !== undefined) {
        pdfTargetPage = position.page;
        if (pdfFind) h.onReadingPosition?.(tabId!, applyPdfPosition(position, pdfFind.pageCount(), pdfFind.goToPage));
      }
      return;
    }
    // Wait for the tab's layout before scrolling; caret reveal must finish first.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (generation !== positionGeneration || !tabId) return;
    applyTextPosition(position ?? {}, {
      cursor: () => editor.cursorOffset(tabId), topLine: () => editor.visibleTopLine(),
      text: () => editor.getText(tabId), setCursor: offset => editor.setCursor(tabId, offset),
      scrollLineToTop: line => {
        editor.scrollLineToTop(line, false);
        if (getWindow(windowId)?.mode !== "editor") previewPane.scrollTop = lineToOffset(line, anchors());
      },
    });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (generation !== positionGeneration) return;
    restoringPosition = false;
    captureReadingPosition();
  }
  const unbindLinks = bindPreviewLinks(previewPane, () => {
    const w = getWindow(windowId);
    const tab = w?.tabs.find((t) => t.id === w.activeTabId);
    if (!tab || !isMarkdownFile(tab.path ?? tab.name)) return null;
    return { path: tab.path ?? `${getState().folder}/untitled.md`, text: editor.getText(tab.id), folder: getState().folder };
  });
  const guard = createScrollGuard();
  // Anchor offsets are measured once per layout: scrolling only moves the pane, and
  // a re-render, image load, zoom or resize changes the scroll height or width.
  let anchorCache: { article: Element | null; height: number; width: number; anchors: ScrollAnchor[] } | null = null;
  function anchors(): ScrollAnchor[] {
    const article = previewPane.firstElementChild;
    if (anchorCache && anchorCache.article === article && anchorCache.height === previewPane.scrollHeight
      && anchorCache.width === previewPane.clientWidth) return anchorCache.anchors;
    const top = previewPane.getBoundingClientRect().top;
    const result: ScrollAnchor[] = [];
    for (const element of previewPane.querySelectorAll<HTMLElement>("[data-line]")) {
      const line = Number(element.dataset.line);
      const offset = element.getBoundingClientRect().top - top + previewPane.scrollTop;
      if (line > 0 && (!result.length || (line > result[result.length - 1].line && offset >= result[result.length - 1].offset))) result.push({ line, offset });
    }
    anchorCache = { article, height: previewPane.scrollHeight, width: previewPane.clientWidth, anchors: result };
    return result;
  }
  function navigationLine(): number {
    const mode = getWindow(windowId)?.mode;
    return mode === "preview" || (mode === "split" && focusedPane === "preview")
      ? offsetToLine(previewPane.scrollTop, anchors()) : cursorLine;
  }
  function jumpToLine(line: number): void {
    const mode = getWindow(windowId)?.mode;
    if (mode !== "preview") { guard.ignore("editor"); editor.scrollLineToTop(line); }
    if (mode !== "editor") {
      let target: HTMLElement | null = null;
      for (const element of previewPane.querySelectorAll<HTMLElement>("[data-line]")) {
        if (Number(element.dataset.line) <= line) target = element;
      }
      if (target) {
        guard.ignore("preview");
        previewPane.scrollTop += target.getBoundingClientRect().top - previewPane.getBoundingClientRect().top;
        target.classList.add("outline-jump");
        window.setTimeout(() => target?.classList.remove("outline-jump"), 900);
      }
    }
    h.onNavigation(windowId);
  }
  editor.onScroll(() => {
    captureReadingPosition();
    if (!h.syncScrollEnabled() || getWindow(windowId)?.mode !== "split" || !guard.drive("editor")) return;
    guard.ignore("preview");
    previewPane.scrollTop = lineToOffset(editor.visibleTopLine(), anchors());
  });
  let navigationFrame = 0;
  previewPane.addEventListener("scroll", () => {
    if (!navigationFrame) navigationFrame = requestAnimationFrame(() => { navigationFrame = 0; captureReadingPosition(); h.onNavigation(windowId); });
    if (!h.syncScrollEnabled() || getWindow(windowId)?.mode !== "split" || !guard.drive("preview")) return;
    guard.ignore("editor");
    editor.scrollLineToTop(offsetToLine(previewPane.scrollTop, anchors()), false);
  });
  editorSurface.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    editor.placeCaretAtPoint(event.clientX, event.clientY);
    h.onEditorContextMenu(windowId, event.clientX, event.clientY);
  });
  formatToolbar
    .querySelectorAll<HTMLButtonElement>("[data-format]")
    .forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (button.dataset.format === "table" && editor.tableContext()) {
          const rect = button.getBoundingClientRect();
          h.onTableMenu(windowId, rect.left, rect.bottom + 4);
          return;
        }
        editor.applyMarkdownFormat(
          button.dataset.format as MarkdownFormat,
        );
      });
    });

  function render(): void {
    const w = getWindow(windowId);
    if (!w) return;
    editor.setLivePreview(h.livePreviewEnabled?.() ?? false);
    queueMicrotask(refreshContextAction);
    const active = w.tabs.find((tab) => tab.id === w.activeTabId);
    const activeName = active?.path ?? active?.name;
    const markdownCard = !!active && isMarkdownFile(activeName);
    if (cardTab !== (active?.id ?? null) || cardMarkdown !== markdownCard) {
      cardTab = active?.id ?? null; cardMarkdown = markdownCard; clearTimeout(cardTimer); card?.reset();
    }
    const modes = documentViewModes(activeName);
    const effectiveMode = normalizeDocumentViewMode(activeName, w.mode);
    const language = fileLanguageInfo(activeName);
    // mode class
    root.classList.remove(
      "window-mode-editor",
      "window-mode-preview",
      "window-mode-split",
    );
    root.classList.add(`window-mode-${effectiveMode}`);
    // Drop any seam-resize inline flex outside split mode so the single visible
    // pane fills the row instead of keeping its split width.
    if (effectiveMode !== "split") {
      editorPane.style.flex = "";
      previewPane.style.flex = "";
    }
    if (
      lastMode !== null &&
      lastMode !== effectiveMode &&
      isHtmlFile(previewPathOrName)
    ) {
      renderPreview(previewText, previewPathOrName);
    }
    lastMode = effectiveMode;
    root.classList.toggle("active", getState().activeWindowId === windowId);
    // toolbar active states
    root.querySelectorAll<HTMLElement>("[data-mode]").forEach((btn) => {
      const mode = btn.dataset.mode as "editor" | "preview" | "split";
      btn.hidden = !modes.includes(mode);
      btn.classList.toggle("active", mode === effectiveMode);
    });
    // A single available mode (PDF) needs no switcher.
    root.querySelector<HTMLElement>(".wt-modes")!.hidden = modes.length < 2;
    // PDFs carry their own zoom controls in the PDF toolbar.
    root.querySelector<HTMLElement>(".preview-zoom-group")!.hidden =
      (!modes.includes("preview") && !modes.includes("split")) ||
      isPdfFile(active?.path ?? active?.name);
    root.querySelector<HTMLElement>(".wt-lines")!.hidden =
      !modes.includes("editor") && !modes.includes("split");
    wsWords.hidden = !active;
    wsCursor.hidden =
      !active || (!modes.includes("editor") && !modes.includes("split"));
    wsLanguage.hidden = !active;
    root.querySelector(".wt-lines")!.classList.toggle("active", lineNums);
    const sub = root.querySelector(".wt-sub");
    if (sub) sub.classList.toggle("active", getState().windows.length > 1);
    formatToolbar.classList.toggle(
      "hidden",
      !active || !isMarkdownFile(active.path ?? active.name),
    );
    wsName.textContent = active?.path ?? active?.name ?? "";
    const detectedIcon = activeName ? fileIcon(activeName, false) : "file";
    const iconType = detectedIcon === "file" ? language.icon : detectedIcon;
    wsFileIcon.className = `ws-file-icon type-${iconType}`;
    wsFileIcon.textContent = FILE_ICON_TEXT[iconType] ?? "·";
    wsLanguageLabel.textContent = language.label;
    themeSelect.value = h.getTheme();
    // tabs
    tabbarEl.innerHTML = "";
    tabbarEl.classList.toggle("empty", w.tabs.length === 0);
    for (const t of w.tabs) {
      const tab = document.createElement("div");
      tab.className =
        "tab" +
        (t.id === w.activeTabId ? " active" : "") +
        (t.pinned ? " pinned" : "") + (t.temporary ? " temporary" : "");
      tab.addEventListener("dblclick", () => h.onKeepTab?.(windowId, t.id));
      tab.addEventListener("click", () => h.onActivateTab(windowId, t.id));
      tab.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        h.onTabContextMenu(
          windowId,
          t.id,
          event.clientX,
          event.clientY,
        );
      });
      const dot = document.createElement("span");
      dot.className =
        "tab-dot" +
        (t.dirty ? " dirty" : "") +
        (t.pinned ? " pinned" : "");
      dot.textContent = t.pinned ? "•" : "";
      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = t.name;
      const detectedTabIcon = fileIcon(t.path ?? t.name, false);
      const tabIconType =
        detectedTabIcon === "file"
          ? fileLanguageInfo(t.path ?? t.name).icon
          : detectedTabIcon;
      const tabIcon = document.createElement("span");
      tabIcon.className = `tab-file-icon type-${tabIconType}`;
      tabIcon.textContent = FILE_ICON_TEXT[tabIconType] ?? "·";
      const close = document.createElement("button");
      close.className = "tab-close";
      close.type = "button";
      close.textContent = "×";
      close.addEventListener("click", (e) => { e.stopPropagation(); h.onCloseTab(windowId, t.id); });
      if (t.temporary) {
        tab.setAttribute("aria-label", `${t.name}, temporary preview`);
        const keep = document.createElement("button"); keep.type = "button"; keep.className = "tab-keep";
        keep.textContent = "Keep"; keep.title = "Keep open"; keep.setAttribute("aria-label", `Keep ${t.name} open`);
        keep.addEventListener("click", event => { event.stopPropagation(); h.onKeepTab?.(windowId, t.id); });
        tab.append(keep);
      }
      tab.append(dot, tabIcon, name, close);
      tabbarEl.appendChild(tab);
    }
  }

  function renderPreview(
    text: string,
    pathOrName: string | null = null,
  ): void {
    const documentId = getWindow(windowId)?.activeTabId ?? null;
    const count = countWords(text);
    wsWords.textContent = `${count} ${count === 1 ? "word" : "words"}`;
    if (documentId) h.onWordCount?.(documentId, count);
    const place = documentId && documentId === previewDocumentId && getWindow(windowId)?.mode !== "editor"
      ? capturePreviewPlace(previewPane) : null;
    const lineCount = text.split("\n").length;
    const placeLine = place ? shiftedLine(place.line, lineCount - previewLineCount, cursorLine) : 0;
    if (documentId !== previewDocumentId) {
      pendingAnnotation = undefined;
      pdfTargetPage = documentId ? h.getReadingPosition?.(documentId)?.page : undefined;
    }
    previewDocumentId = documentId;
    previewLineCount = lineCount;
    placeObserver?.disconnect();
    placeObserver = null;
    const restorePlace = (): void => {
      if (place && documentId === previewDocumentId) restorePreviewPlace(previewPane, place, placeLine);
    };
    // Reset zoom to 100% on a document switch (new file), but not on the frequent
    // edit-debounce re-renders of the same document — otherwise a manual zoom would
    // snap back while typing.
    if (pathOrName !== previewPathOrName) {
      previewZoom = 1;
      pdfFit = "auto";
    }
    previewText = text;
    previewPathOrName = pathOrName;
    if (isPdfFile(pathOrName)) {
      const pdfTabId = getWindow(windowId)?.activeTabId;
      const token = ++previewRenderToken;
      const restoreScroll = pdfReloadScroll;
      pdfReloadScroll = null;
      previewFrame = null;
      previewCanvas = null;
      htmlPreviewContentSize = null;
      pdfFind?.destroy();
      pdfFind = null;
      previewPane.innerHTML = '<div class="preview-loading">Loading PDF…</div>';
      wsWords.textContent = "PDF";
      void renderPdf(previewPane, pathOrName!, {
        initialPage: pdfTargetPage,
        folder: getState().folder,
        onExportAnnotations: h.onExportAnnotations,
        onEditDirtyChange: (dirty) => {
          if (pdfTabId) h.onPdfEditDirtyChange(windowId, pdfTabId, dirty);
        },
        onPageChange: (page, count) => {
          if (token !== previewRenderToken) return;
          if (pdfFind && pdfTabId) { pdfTargetPage = page; h.onReadingPosition?.(pdfTabId, { page }); }
          wsWords.textContent = count ? `Page ${page} of ${count}` : "PDF";
        },
        onReloadRequest: () => {
          pdfReloadScroll = { top: previewPane.scrollTop, left: previewPane.scrollLeft };
          renderPreview(previewText, pathOrName);
        },
        isCurrent: () => token === previewRenderToken,
      })
        .then((handle) => {
          if (token !== previewRenderToken) {
            handle.destroy();
            return;
          }
          pdfFind = handle;
          if (pendingAnnotation) { handle.flashAnnotation(pendingAnnotation); pendingAnnotation = undefined; }
          const position = applyPdfPosition({ page: pdfTargetPage }, handle.pageCount(), handle.goToPage);
          if (pdfTabId) h.onReadingPosition?.(pdfTabId, position);
          if (pdfFit) applyPdfFit(pdfFit);
          else setPreviewZoom(previewZoom);
          if (restoreScroll) {
            previewPane.scrollTop = restoreScroll.top;
            previewPane.scrollLeft = restoreScroll.left;
          }
          if (!findBar.classList.contains("hidden") && findInput.value) runFind();
        })
        .catch((error) => {
          if (token !== previewRenderToken) return;
          previewPane.textContent =
            error instanceof Error ? error.message : String(error);
        });
      return;
    }
    previewRenderToken += 1;
    previewFrame = null;
    previewCanvas = null;
    htmlPreviewContentSize = null;
    pdfFind?.destroy();
    pdfFind = null;
    previewPane.replaceChildren();
    if (!isMarkdownFile(pathOrName) && !isHtmlFile(pathOrName)) {
      if (isSqlFile(pathOrName)) {
        // Reading view: same syntax highlighting as the editor, read-only.
        // Reuse the markdown preview's hljs pipeline via a fenced code block.
        const article = document.createElement("article");
        article.className = "doc";
        article.style.zoom = String(previewZoom);
        article.innerHTML = renderMarkdown(`\`\`\`sql\n${text}\n\`\`\``);
        previewPane.appendChild(article);
      }
      return;
    }
    if (isHtmlFile(pathOrName)) {
      const frame = document.createElement("iframe");
      frame.className = "html-preview-frame";
      frame.title = `Preview of ${pathOrName ?? "HTML document"}`;
      // allow-scripts (opaque origin, no allow-same-origin) lets interactive HTML
      // run its own JS — buttons, etc. — while staying isolated: the iframe cannot
      // reach window.parent or the Tauri IPC. Trade-off: contentDocument is now
      // cross-origin/unreadable, so zoom-fit falls back to pane-size measurement.
      frame.setAttribute("sandbox", "allow-scripts");
      // Keep the iframe document at native scale. Preview zoom is applied to the
      // already-painted iframe surface so WebKit does not relayout a large HTML/SVG
      // document and flash white on every zoom step.
      const doc = htmlWithPreviewZoom(text, 1);
      const baseHref = pathOrName ? htmlPreviewBaseHref(pathOrName) : null;
      // The document is served from preview:// rather than srcdoc so it gets
      // its own Content-Security-Policy instead of inheriting the app's.
      const show = (html: string) =>
        invoke<string>("preview_set_doc", { slot: previewSlot, html })
          .then((url) => {
            if (previewFrame === frame) frame.src = url;
          })
          .catch(() => {
            frame.srcdoc = html;
          });
      if (baseHref && pathOrName) {
        // Register the file's folder with the preview:// protocol first so
        // relative scripts/styles/images resolve when the document loads.
        invoke("preview_allow", { path: pathOrName })
          .then(() => show(htmlWithBaseHref(doc, baseHref)))
          .catch(() => show(doc));
      } else {
        void show(doc);
      }
      frame.addEventListener("focus", () => {
        focusedPane = "preview";
      });
      frame.addEventListener("load", () => {
        if (frame.contentDocument) bindHtmlPreviewNav(frame.contentDocument);
        requestAnimationFrame(() => {
          measureHtmlPreview();
          applyHtmlZoom(previewZoom);
        });
      });
      const canvas = document.createElement("div");
      canvas.className = "html-preview-canvas";
      canvas.appendChild(frame);
      previewPane.appendChild(canvas);
      previewFrame = frame;
      previewCanvas = canvas;
    } else {
      const article = document.createElement("article");
      article.className = "doc";
      article.style.zoom = String(previewZoom);
      article.innerHTML = renderMarkdown(text);
      resolvePreviewImages(article, pathOrName?.startsWith("/") ? pathOrName : null);
      // Ticking a box edits that source line. A preview older than the text
      // (typing still debounced) could point at the wrong line, so it only
      // re-renders.
      enhancePreviewTasks(article, documentId ? (line) => {
        const current = editor.getText(documentId);
        if (current === text && editor.toggleTaskAt(documentId, line)) return true;
        renderPreview(current, pathOrName);
        return false;
      } : null);
      previewPane.appendChild(article);
      restorePlace();
      const token = previewRenderToken;
      let restoredScroll = previewPane.scrollTop;
      const restoreIfUnmoved = (): void => {
        if (token !== previewRenderToken || Math.abs(previewPane.scrollTop - restoredScroll) > 1) {
          placeObserver?.disconnect();
          return;
        }
        restorePlace();
        restoredScroll = previewPane.scrollTop;
      };
      if (place) {
        placeObserver = new ResizeObserver(restoreIfUnmoved);
        placeObserver.observe(article);
      }
      void enhancePreview(previewPane).then(restoreIfUnmoved);
      h.onNavigation(windowId);
    }
  }

  function updateZoomLabel(): void {
    root.querySelector<HTMLElement>(".wt-preview-reset")!.textContent =
      `${Math.round(previewZoom * 100)}%`;
  }

  // The HTML iframe swallows wheel events, so forward them to the outer pane (the
  // scroll surface) so the wheel scrolls a zoomed-in document.
  function bindHtmlPreviewNav(doc: Document): void {
    doc.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.metaKey) return; // leave zoom gestures alone
        previewPane.scrollTop += event.deltaY;
        previewPane.scrollLeft += event.deltaX;
        event.preventDefault();
      },
      { passive: false },
    );
  }

  function measureHtmlPreview(): void {
    if (!previewFrame || !previewCanvas) return;
    const paneWidth = Math.max(1, previewPane.clientWidth);
    const paneHeight = Math.max(1, previewPane.clientHeight);
    previewFrame.style.transform = "scale(1)";
    previewFrame.style.width = `${paneWidth}px`;
    previewFrame.style.height = `${paneHeight}px`;
    previewCanvas.style.width = `${paneWidth}px`;
    previewCanvas.style.height = `${paneHeight}px`;

    // contentDocument is null/unreadable under the opaque-origin sandbox; the
    // iframe scrolls its own content, so fall back to the pane size for zoom.
    const doc = previewFrame.contentDocument;
    const rootEl = doc?.documentElement;
    if (!rootEl) {
      htmlPreviewContentSize = { width: paneWidth, height: paneHeight };
      return;
    }
    const body = doc.body;
    htmlPreviewContentSize = {
      width: Math.max(
        1,
        rootEl.scrollWidth,
        body?.scrollWidth ?? 0,
        paneWidth,
      ),
      height: Math.max(
        1,
        rootEl.scrollHeight,
        body?.scrollHeight ?? 0,
        paneHeight,
      ),
    };
  }

  // Scale the already-painted iframe surface. This stays on the compositor path,
  // avoiding the multi-second document reflow/repaint caused by CSS `zoom`.
  function applyHtmlZoom(zoom: number): void {
    if (!previewFrame || !previewCanvas) return;
    if (!htmlPreviewContentSize) measureHtmlPreview();
    const size = htmlPreviewContentSize;
    if (!size) return;
    const scaled = htmlPreviewLayout(size.width, size.height, zoom);
    previewFrame.style.transform = scaled.transform;
    previewFrame.style.width = scaled.width;
    previewFrame.style.height = scaled.height;
    previewCanvas.style.width = scaled.canvasWidth;
    previewCanvas.style.height = scaled.canvasHeight;
  }

  function setPreviewZoom(next: number, fit: PdfFitMode | null = null): void {
    previewZoom = Math.max(0.25, Math.min(3, next));
    updateZoomLabel();
    if (isPdfFile(previewPathOrName)) {
      // Scale the rendered pages; the pane scrolls when they overflow.
      pdfFit = fit;
      const container = previewPane.querySelector<HTMLElement>(".pdf-document");
      const apply = (): void => {
        if (container) container.style.zoom = String(previewZoom);
      };
      if (pdfFind) pdfFind.keepAnchor(apply);
      else apply();
      pdfFind?.setZoomState(previewZoom, pdfFit);
      return;
    }
    // HTML preview: scale the painted iframe surface (compositor path, no reflow).
    if (isHtmlFile(previewPathOrName) && previewFrame) {
      applyHtmlZoom(previewZoom);
      return;
    }
    // Markdown: scale the rendered article in place (avoids a full re-render).
    const article = previewPane.querySelector<HTMLElement>("article.doc");
    if (article) {
      article.style.zoom = String(previewZoom);
      return;
    }
    renderPreview(previewText, previewPathOrName);
  }

  function applyPdfFit(mode: PdfFitMode): void {
    const zoom = pdfFind?.fitZoom(mode);
    if (zoom == null) {
      pdfFit = mode;
      return;
    }
    setPreviewZoom(zoom, mode);
  }

  // Reset means the default fit for a PDF and 100% elsewhere.
  function resetPreviewZoom(): void {
    if (isPdfFile(previewPathOrName)) applyPdfFit("auto");
    else setPreviewZoom(1);
  }

  function setEditorZoom(next: number): void {
    editorZoom = Math.max(0.5, Math.min(2, next));
    root.style.setProperty("--editor-zoom", String(editorZoom));
    editor.requestMeasure();
  }

  // Which surface the zoom shortcuts act on. PDF has no editor, and reading
  // (preview-only) mode hides it, so zoom must target the preview there regardless of
  // the last-focused pane (which defaults to "editor"). In split, follow the focus.
  function zoomTarget(): "editor" | "preview" {
    if (isPdfFile(previewPathOrName)) return "preview";
    const mode = getWindow(windowId)?.mode;
    if (mode === "preview") return "preview";
    if (mode === "editor") return "editor";
    return focusedPane;
  }

  // Keeps a fit mode fitted when the room for the pages changes.
  function refitPdf(): void {
    if (!pdfFit) return;
    // Ignore sub-pixel changes so a scrollbar appearing cannot loop the fit.
    const zoom = pdfFind?.fitZoom(pdfFit);
    if (zoom != null && Math.abs(zoom - previewZoom) > 0.002) setPreviewZoom(zoom, pdfFit);
  }

  const previewResizeObserver = new ResizeObserver(() => {
    if (isPdfFile(previewPathOrName) && pdfFit) {
      refitPdf();
      return;
    }
    if (isHtmlFile(previewPathOrName) && previewFrame) {
      measureHtmlPreview();
      applyHtmlZoom(previewZoom);
    }
  });
  previewResizeObserver.observe(previewPane);

  root
    .querySelectorAll<HTMLElement>("[data-preview-zoom]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.previewZoom;
        if (action === "in") {
          setPreviewZoom(previewZoom + 0.1);
        } else if (action === "out") {
          setPreviewZoom(previewZoom - 0.1);
        } else {
          resetPreviewZoom();
        }
      });
    });

  const openFind = (): boolean => {
    const state = getWindow(windowId);
    const tab = state?.tabs.find((item) => item.id === state.activeTabId);
    const effectiveMode = normalizeDocumentViewMode(
      tab?.path ?? tab?.name,
      state?.mode ?? "editor",
    );
    if (
      !isPdfFile(previewPathOrName) &&
      effectiveMode !== "preview" &&
      focusedPane !== "preview"
    ) {
      return false;
    }
    if (!isPdfFile(previewPathOrName) && !isMarkdownFile(previewPathOrName)) {
      return false;
    }
    findBar.classList.remove("hidden");
    findInput.focus();
    findInput.select();
    if (findInput.value) runFind();
    return true;
  };
  previewPane.addEventListener(PDF_FIND_EVENT, () => {
    openFind();
  });
  previewPane.addEventListener(PDF_ZOOM_EVENT, (event) => {
    const command = (event as CustomEvent<string>).detail;
    if (command === "zoom-in") setPreviewZoom(previewZoom + 0.1);
    else if (command === "zoom-out") setPreviewZoom(previewZoom - 0.1);
    else if (command === "zoom-actual") setPreviewZoom(1);
    else if (command === "refit") refitPdf();
    else if (command === "fit-auto" || command === "fit-width" || command === "fit-page") {
      applyPdfFit(command.slice(4) as PdfFitMode);
    }
  });

  return {
    id: windowId,
    activateDocument,
    captureReadingPosition,
    restoreReadingPosition,
    editor,
    render,
    renderPreview,
    jumpToLine,
    navigationLine,
    adjustFocusedZoom: (delta) => {
      if (zoomTarget() === "editor") {
        setEditorZoom(editorZoom + delta);
      } else {
        setPreviewZoom(previewZoom + delta);
      }
    },
    resetFocusedZoom: () => {
      if (zoomTarget() === "editor") {
        setEditorZoom(1);
      } else {
        resetPreviewZoom();
      }
    },
    requestMeasure: () => editor.requestMeasure(),
    focus: () => {
      focusedPane = "editor";
      editor.focus();
    },
    destroy: () => {
      captureReadingPosition();
      clearTimeout(cardTimer);
      positionGeneration += 1;
      unbindLinks();
      previewRenderToken += 1;
      previewResizeObserver.disconnect();
      placeObserver?.disconnect();
      root.remove();
    },
    setLineNumbersFlag: (on: boolean) => {
      lineNums = on;
    },
    setLivePreviewFlag: (on: boolean) => editor.setLivePreview(on),
    openPdfPage: (page: number, annotation?: string) => {
      pdfTargetPage = page; pendingAnnotation = annotation;
      if (pdfFind) {
        pdfTargetPage = applyPdfPosition({ page }, pdfFind.pageCount(), pdfFind.goToPage).page;
        if (annotation) { pdfFind.flashAnnotation(annotation); pendingAnnotation = undefined; }
      }
    },
    annotationCommand: (command) => {
      if (!isPdfFile(previewPathOrName) || !pdfFind) return false;
      previewPane.dispatchEvent(new Event(command === "panel" ? PDF_ANNOTATIONS_EVENT : PDF_COPY_QUOTE_EVENT));
      return true;
    },
    savePdf: () => {
      if (!isPdfFile(previewPathOrName)) return false;
      previewPane.dispatchEvent(new Event(PDF_SAVE_EVENT));
      return true;
    },
    savePdfAs: () => {
      if (!isPdfFile(previewPathOrName)) return false;
      previewPane.dispatchEvent(new Event(PDF_SAVE_AS_EVENT));
      return true;
    },
    togglePdfEdit: () => {
      if (!isPdfFile(previewPathOrName)) return false;
      previewPane.dispatchEvent(new Event(PDF_EDIT_EVENT));
      return true;
    },
    checkPdfDisk: async () => {
      if (isPdfFile(previewPathOrName)) await pdfFind?.checkDisk();
    },
    openFind,
  };
}
