import { cursorPosition } from "./status-bar/model";
import { applyPropertyEdit } from "./properties/write";
import type { PropertyEdit } from "./properties/edit";
import { linkCompletion } from "./links/complete";
import { followEditorLink } from "./links/follow";
import { defaultKeymap, history, historyKeymap, indentWithTab, insertBlankLine } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import {
  search,
  gotoLine as openGotoLine,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, Transaction, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  applyMarkdownFormat,
  type MarkdownFormat,
} from "./markdown-format";
import { scanMarkdownLines } from "./markdown-blocks";
import { runTableCommand, tableContextAt, tableKeymap } from "./table-keys";
import type { TableCommand, TableContext } from "./table";
import { taskToggleChange, toggleTaskChanges } from "./tasks";

export type EditorDocumentKind =
  | "markdown"
  | "html"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "sql"
  | "plain";

export type CursorPosition = {
  column: number;
  line: number;
};

export type SoftWrapMode = "off" | "window" | "guide";

export type EditorHandle = {
  openState(id: string, text: string, kind?: EditorDocumentKind): void;
  switchTo(id: string): void;
  closeState(id: string): void;
  setDocumentKind(id: string, kind: EditorDocumentKind): void;
  applyMarkdownFormat(format: MarkdownFormat): void;
  getText(id: string): string;
  revision(id: string): number;
  applyPropertyEdit(id: string, edit: PropertyEdit): void;
  applyChanges(id: string, changes: { from: number; to: number; insert: string }[]): void;
  getSelection(): { from: number; to: number; text: string };
  replaceRange(from: number, to: number, text: string): void;
  selectRange(from: number, to: number): void;
  /** Document position under a viewport point, or null when outside the text. */
  posAtPoint(x: number, y: number): number | null;
  /** Right-click: moves the caret to the point unless it falls inside the selection. */
  placeCaretAtPoint(x: number, y: number): void;
  /**
   * Inserts text into a document (at `at`, or over the selection) as one undo
   * step, then puts the cursor `cursor` characters into the inserted text.
   */
  insertText(id: string, text: string, at?: number, cursor?: number): void;
  /** Appends text at the end of a document as one undo step, leaving cursor and focus alone. */
  appendText(id: string, text: string): void;
  cursorOffset(id: string): number;
  /** Puts the cursor at `offset` of a document and scrolls it into view. */
  setCursor(id: string, offset: number): void;
  setText(text: string): void;
  setTextFor(id: string, text: string): void;
  setSoftWrap(on: boolean): void;
  setSoftWrapMode(mode: SoftWrapMode, column: number): void;
  setLineNumbers(on: boolean): void;
  setLivePreview(on: boolean): void;
  requestMeasure(): void;
  gotoLine(line: number): void;
  openGoToLine(): void;
  cursorPosition(): CursorPosition;
  scrollLineToTop(line: number, cursor?: boolean): void;
  visibleTopLine(): number;
  onScroll(callback: () => void): void;
  /** Toggle Task on every line touched by the selection; one undo step. */
  toggleTasks(): boolean;
  /**
   * Flips the task on 1-based `line` of a document without moving the cursor
   * or scroll; false when that line is no longer a task.
   */
  toggleTaskAt(id: string, line: number): boolean;
  /** The table cell under the cursor, or null outside a table. */
  tableContext(): TableContext | null;
  runTableCommand(command: TableCommand): boolean;
  focus(): void;
};

/** Clipboard text offered to the document; returns what to insert instead, or null. */
export type PasteTextHandler = (id: string, html: string, text: string, inCode: boolean) => string | null;

export function agentChangeTransaction(
  state: EditorState,
  changes: { from: number; to: number; insert: string }[],
): Transaction {
  return state.update({
    changes,
    annotations: Transaction.userEvent.of("input.agent"),
  });
}

const theme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "transparent", color: "var(--text)" },
    ".cm-scroller": {
      fontFamily: "var(--win-font, var(--font-mono))",
      fontSize: "calc(var(--win-size, 15px) * var(--editor-zoom, 1))",
      lineHeight: "1.65",
      padding: "var(--pane-pad) 0",
    },
    ".cm-content": { caretColor: "var(--accent)", paddingRight: "var(--pane-pad)" },
    ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "8px", paddingRight: "12px" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--selection)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--faint)",
      border: "none",
      paddingLeft: "12px",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.025)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--muted)" },
  },
  { dark: true },
);

const editorHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--tok-func)", fontWeight: "bold" },
  { tag: [tags.keyword, tags.modifier], color: "var(--tok-keyword)" },
  {
    tag: [tags.string, tags.special(tags.string), tags.link, tags.url],
    color: "var(--tok-string)",
  },
  {
    tag: [tags.comment, tags.quote],
    color: "var(--tok-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.tagName, tags.typeName, tags.className, tags.namespace],
    color: "var(--tok-type)",
  },
  {
    tag: [
      tags.attributeName,
      tags.propertyName,
      tags.definition(tags.propertyName),
    ],
    color: "var(--tok-property)",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.definition(tags.variableName),
      tags.labelName,
    ],
    color: "var(--tok-func)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.regexp],
    color: "var(--tok-number)",
  },
  {
    tag: [tags.operator, tags.logicOperator, tags.compareOperator],
    color: "var(--tok-operator)",
  },
  {
    tag: [
      tags.angleBracket,
      tags.brace,
      tags.squareBracket,
      tags.paren,
      tags.separator,
    ],
    color: "var(--tok-punctuation)",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.monospace, color: "var(--tok-string)" },
]);

const wrap = new Compartment();
const gutter = new Compartment();
const language = new Compartment();

function languageExtension(kind: EditorDocumentKind, id = ""): Extension {
  if (kind === "html") return html({ autoCloseTags: true });
  if (kind === "typescript") return javascript({ typescript: true, jsx: true });
  if (kind === "javascript") return javascript({ jsx: true });
  if (kind === "json") return json();
  if (kind === "yaml") return yaml();
  if (kind === "sql") return sql();
  if (kind === "plain") return [];
  return [markdown({ codeLanguages: languages }), tableKeymap(), linkCompletion(id)];
}

const revisions = new Map<string, number>();

export function createEditor(
  parent: HTMLElement,
  onChange: (id: string, text: string) => void,
  onCursorChange: (position: CursorPosition) => void = () => {},
  /** Image files pasted into a document; return true to take over the paste. */
  onPasteFiles: (id: string, files: File[]) => boolean = () => false,
  onPasteText: PasteTextHandler = () => null,
  onBeforeSwitch: (id: string | null) => void = () => {},
  onPasteQuote: (id: string, text: string) => string | null = () => null,
): EditorHandle {
  const states = new Map<string, EditorState>();
  const changed = (id: string, text: string): void => {
    revisions.set(id, (revisions.get(id) ?? 0) + 1);
    onChange(id, text);
  };
  let activeId: string | null = null;
  let softWrapMode: SoftWrapMode = "window";
  let wrapColumn = 80;
  let lineNums = true;
  let livePreview = false;
  // Loaded on first use so the live-preview code stays out of the startup bundle.
  let livePreviewModule: typeof import("./editor-live-preview/extension") | null = null;
  const livePreviewExt = (): Extension => (livePreviewModule ? livePreviewModule.livePreviewExtension() : []);
  const live = new Compartment();
  const kinds = new Map<string, EditorDocumentKind>();

  const reportCursor = (state: EditorState): void => {
    onCursorChange(cursorPosition(state));
  };

  function wrapExtension(): Extension {
    if (softWrapMode === "off") return [];
    if (softWrapMode === "window") return EditorView.lineWrapping;
    return [
      EditorView.lineWrapping,
      EditorView.theme({
        ".cm-content": {
          backgroundImage: `linear-gradient(to right, transparent calc(${wrapColumn}ch), var(--faint, rgba(128,128,128,0.25)) calc(${wrapColumn}ch), var(--faint, rgba(128,128,128,0.25)) calc(${wrapColumn}ch + 1px), transparent calc(${wrapColumn}ch + 1px))`,
        },
      }),
    ];
  }

  const baseExtensions = (
    id: string,
    kind: EditorDocumentKind = "markdown",
  ): Extension[] => [
    gutter.of(lineNums ? lineNumbers() : []),
    live.of(livePreview && kind === "markdown" ? livePreviewExt() : []),
    history(),
    drawSelection(),
    highlightActiveLine(),
    keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    search({ top: true }),
    language.of(languageExtension(kind, id)),
    syntaxHighlighting(editorHighlight, { fallback: true }),
    wrap.of(wrapExtension()),
    theme,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!event.metaKey && !event.ctrlKey) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null || !followEditorLink(id, view.state.doc.toString(), pos)) return false;
        event.preventDefault(); return true;
      },
      paste(event, view) {
        const data = event.clipboardData;
        if (!data) return false;
        const text = data.getData("text/plain");
        if (text) {
          const quote = onPasteQuote(id, text);
          if (quote !== null) {
            event.preventDefault();
            view.dispatch(view.state.replaceSelection(quote), { scrollIntoView: true, userEvent: "input.paste" });
            return true;
          }
          const html = data.getData("text/html");
          // Only tables are replaced; ordinary paste skips the document scan.
          if (view.state.selection.ranges.length > 1 || (!text.includes("\t") && !/<table/i.test(html))) return false;
          const head = view.state.selection.main.head;
          const line = view.state.doc.lineAt(head).number;
          const inCode = scanMarkdownLines(view.state.doc.toString())[line - 1]?.code ?? false;
          const replacement = onPasteText(id, html, text, inCode);
          if (replacement === null) return false;
          event.preventDefault();
          view.dispatch(view.state.replaceSelection(replacement), { scrollIntoView: true, userEvent: "input.paste" });
          return true;
        }
        const files = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
        if (!files.length || !onPasteFiles(id, files)) return false;
        event.preventDefault();
        return true;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) changed(id, update.state.doc.toString());
      if (update.docChanged || update.selectionSet) reportCursor(update.state);
    }),
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: "", extensions: baseExtensions("") }),
  });

  const reapplyToggles = (): void => {
    view.dispatch({
      effects: [
        wrap.reconfigure(wrapExtension()),
        gutter.reconfigure(lineNums ? lineNumbers() : []),
        live.reconfigure(livePreview && activeId && kinds.get(activeId) === "markdown" ? livePreviewExt() : []),
      ],
    });
  };

  const handle: EditorHandle = {
    openState(id, text, kind = "markdown") {
      kinds.set(id, kind);
      states.set(
        id,
        EditorState.create({ doc: text, extensions: baseExtensions(id, kind) }),
      );
      handle.switchTo(id);
    },
    switchTo(id) {
      if (id !== activeId) onBeforeSwitch(id);
      if (activeId && states.has(activeId)) {
        states.set(activeId, view.state);
      }
      const target = states.get(id);
      if (!target) return;
      activeId = id;
      view.setState(target);
      reapplyToggles();
      reportCursor(view.state);
    },
    closeState(id) {
      if (id === activeId) onBeforeSwitch(null);
      states.delete(id);
      kinds.delete(id);
      if (activeId === id) {
        activeId = null;
        view.setState(EditorState.create({ doc: "", extensions: baseExtensions("") }));
        reapplyToggles();
      }
    },
    setDocumentKind(id, kind) {
      kinds.set(id, kind);
      if (id === activeId) {
        view.dispatch({
          effects: [language.reconfigure(languageExtension(kind, id)), live.reconfigure(livePreview && kind === "markdown" ? livePreviewExt() : [])],
        });
        return;
      }
      const state = states.get(id);
      if (!state) return;
      states.set(
        id,
        state.update({
          effects: [language.reconfigure(languageExtension(kind, id)), live.reconfigure(livePreview && kind === "markdown" ? livePreviewExt() : [])],
        }).state,
      );
    },
    applyMarkdownFormat(format) {
      if (!activeId) return;
      const selection = view.state.selection.main;
      const result = applyMarkdownFormat(
        view.state.doc.toString(),
        selection.from,
        selection.to,
        format,
      );
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: result.text,
        },
        selection: { anchor: result.anchor, head: result.head },
        scrollIntoView: true,
      });
      view.focus();
    },
    revision(id) { return revisions.get(id) ?? 0; },
    getText(id) {
      if (id === activeId) return view.state.doc.toString();
      return states.get(id)?.doc.toString() ?? "";
    },
    applyChanges(id, changes) {
      if (id === activeId) {
        view.dispatch(agentChangeTransaction(view.state, changes));
        return;
      }
      const state = states.get(id);
      if (!state) return;
      const updated = agentChangeTransaction(state, changes).state;
      states.set(id, updated);
      changed(id, updated.doc.toString());
    },
    getSelection() {
      const selection = view.state.selection.main;
      return {
        from: selection.from,
        to: selection.to,
        text: view.state.sliceDoc(selection.from, selection.to),
      };
    },
    selectRange(from, to) {
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); view.focus();
    },
    replaceRange(from, to, text) {
      view.dispatch({ changes: { from, to, insert: text } });
    },
    posAtPoint(x, y) {
      return view.posAtCoords({ x, y });
    },
    placeCaretAtPoint(x, y) {
      const pos = view.posAtCoords({ x, y });
      if (pos === null) return;
      if (view.state.selection.ranges.some((range) => !range.empty && range.from <= pos && pos <= range.to)) return;
      view.dispatch({ selection: { anchor: pos } });
    },
    insertText(id, text, at, cursor = text.length) {
      const state = id === activeId ? view.state : states.get(id);
      if (!state) return;
      const length = state.doc.length;
      const range = at === undefined
        ? state.selection.main
        : { from: Math.min(at, length), to: Math.min(at, length) };
      const spec = {
        changes: { from: range.from, to: range.to, insert: text },
        selection: { anchor: range.from + cursor },
        scrollIntoView: true,
      };
      if (id === activeId) {
        view.dispatch(spec);
        view.focus();
        return;
      }
      const updated = state.update(spec).state;
      states.set(id, updated);
      changed(id, updated.doc.toString());
    },
    appendText(id, text) {
      const state = id === activeId ? view.state : states.get(id);
      if (!state) return;
      const spec = { changes: { from: state.doc.length, insert: text } };
      if (id === activeId) {
        view.dispatch(spec);
        return;
      }
      const updated = state.update(spec).state;
      states.set(id, updated);
      changed(id, updated.doc.toString());
    },
    applyPropertyEdit(id, edit) { if (id === activeId) applyPropertyEdit(view, edit); },
    cursorOffset(id) { return (id === activeId ? view.state : states.get(id))?.selection.main.head ?? 0; },
    setCursor(id, offset) {
      const state = id === activeId ? view.state : states.get(id);
      if (!state) return;
      const spec = { selection: { anchor: Math.min(Math.max(0, offset), state.doc.length) }, scrollIntoView: true };
      if (id === activeId) view.dispatch(spec);
      else states.set(id, state.update(spec).state);
    },
    setText(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    setTextFor(id, text) {
      if (id === activeId) {
        handle.setText(text);
        return;
      }
      const state = states.get(id);
      if (!state) return;
      const transaction = state.update({ changes: { from: 0, to: state.doc.length, insert: text } });
      states.set(id, transaction.state);
      if (transaction.docChanged) changed(id, transaction.state.doc.toString());
    },
    setSoftWrap(on) {
      softWrapMode = on ? "window" : "off";
      reapplyToggles();
    },
    setSoftWrapMode(mode, column) {
      softWrapMode = mode;
      wrapColumn = column;
      reapplyToggles();
    },
    setLivePreview(on) {
      if (livePreview === on) return;
      livePreview = on; reapplyToggles();
      if (on && !livePreviewModule) {
        void import("./editor-live-preview/extension").then((mod) => { livePreviewModule = mod; reapplyToggles(); });
      }
    },
    setLineNumbers(on) {
      lineNums = on;
      reapplyToggles();
    },
    requestMeasure() {
      view.requestMeasure();
    },
    cursorPosition: () => cursorPosition(view.state),
    openGoToLine: () => { openGotoLine(view); },
    gotoLine(line) {
      const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
      const info = view.state.doc.line(clamped);
      view.dispatch({
        selection: { anchor: info.from },
        effects: EditorView.scrollIntoView(info.from, { y: "center" }),
        scrollIntoView: true,
      });
      view.focus();
    },
    scrollLineToTop(line, cursor = true) {
      const info = view.state.doc.line(Math.min(Math.max(Math.round(line), 1), view.state.doc.lines));
      view.dispatch({ ...(cursor ? { selection: { anchor: info.from } } : {}), effects: EditorView.scrollIntoView(info.from, { y: "start" }) });
      if (cursor) view.focus();
    },
    visibleTopLine() {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      return view.state.doc.lineAt(block.from).number;
    },
    onScroll(callback) { view.scrollDOM.addEventListener("scroll", callback); },
    toggleTasks() {
      if (!activeId) return false;
      const { state } = view;
      const lines = new Set<number>();
      for (const range of state.selection.ranges) {
        const first = state.doc.lineAt(range.from).number;
        // A selection ending at the start of a line does not include that line.
        const lastPos = range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to;
        for (let n = first; n <= state.doc.lineAt(lastPos).number; n++) lines.add(n);
      }
      const changes = toggleTaskChanges(state.doc.toString(), [...lines]);
      if (!changes.length) return false;
      view.dispatch({ changes, userEvent: "input.task" });
      view.focus();
      return true;
    },
    toggleTaskAt(id, line) {
      const state = id === activeId ? view.state : states.get(id);
      if (!state || line < 1 || line > state.doc.lines) return false;
      const info = state.doc.line(line);
      const change = taskToggleChange(info.text, info.from);
      if (!change) return false;
      if (id === activeId) {
        view.dispatch({ changes: change, userEvent: "input.task" });
        return true;
      }
      const updated = state.update({ changes: change, userEvent: "input.task" }).state;
      states.set(id, updated);
      changed(id, updated.doc.toString());
      return true;
    },
    tableContext() {
      return activeId ? tableContextAt(view.state) : null;
    },
    runTableCommand(command) {
      if (!activeId) return false;
      // ⌘Enter is Insert Row Below; outside a table it keeps the editor's
      // usual "new line below" behavior, but only while the editor has focus.
      const done = runTableCommand(view, command) || (command === "row_below" && view.hasFocus && insertBlankLine(view));
      if (done) view.focus();
      return done;
    },
    focus() {
      view.focus();
    },
  };

  return handle;
}
