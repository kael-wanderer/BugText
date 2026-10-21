import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
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
  applyChanges(id: string, changes: { from: number; to: number; insert: string }[]): void;
  getSelection(): { from: number; to: number; text: string };
  replaceRange(from: number, to: number, text: string): void;
  setText(text: string): void;
  setTextFor(id: string, text: string): void;
  setSoftWrap(on: boolean): void;
  setSoftWrapMode(mode: SoftWrapMode, column: number): void;
  setLineNumbers(on: boolean): void;
  requestMeasure(): void;
  gotoLine(line: number): void;
  focus(): void;
};

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

function languageExtension(kind: EditorDocumentKind): Extension {
  if (kind === "html") return html({ autoCloseTags: true });
  if (kind === "typescript") return javascript({ typescript: true, jsx: true });
  if (kind === "javascript") return javascript({ jsx: true });
  if (kind === "json") return json();
  if (kind === "yaml") return yaml();
  if (kind === "sql") return sql();
  if (kind === "plain") return [];
  return markdown({ codeLanguages: languages });
}

export function createEditor(
  parent: HTMLElement,
  onChange: (id: string, text: string) => void,
  onCursorChange: (position: CursorPosition) => void = () => {},
): EditorHandle {
  const states = new Map<string, EditorState>();
  let activeId: string | null = null;
  let softWrapMode: SoftWrapMode = "window";
  let wrapColumn = 80;
  let lineNums = true;

  const reportCursor = (state: EditorState): void => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    onCursorChange({ line: line.number, column: head - line.from + 1 });
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
    history(),
    drawSelection(),
    highlightActiveLine(),
    keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    search({ top: true }),
    language.of(languageExtension(kind)),
    syntaxHighlighting(editorHighlight, { fallback: true }),
    wrap.of(wrapExtension()),
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(id, update.state.doc.toString());
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
      ],
    });
  };

  const handle: EditorHandle = {
    openState(id, text, kind = "markdown") {
      states.set(
        id,
        EditorState.create({ doc: text, extensions: baseExtensions(id, kind) }),
      );
      handle.switchTo(id);
    },
    switchTo(id) {
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
      states.delete(id);
      if (activeId === id) {
        activeId = null;
        view.setState(EditorState.create({ doc: "", extensions: baseExtensions("") }));
        reapplyToggles();
      }
    },
    setDocumentKind(id, kind) {
      if (id === activeId) {
        view.dispatch({
          effects: language.reconfigure(languageExtension(kind)),
        });
        return;
      }
      const state = states.get(id);
      if (!state) return;
      states.set(
        id,
        state.update({
          effects: language.reconfigure(languageExtension(kind)),
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
      onChange(id, updated.doc.toString());
    },
    getSelection() {
      const selection = view.state.selection.main;
      return {
        from: selection.from,
        to: selection.to,
        text: view.state.sliceDoc(selection.from, selection.to),
      };
    },
    replaceRange(from, to, text) {
      view.dispatch({ changes: { from, to, insert: text } });
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
      states.set(
        id,
        state.update({
          changes: { from: 0, to: state.doc.length, insert: text },
        }).state,
      );
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
    setLineNumbers(on) {
      lineNums = on;
      reapplyToggles();
    },
    requestMeasure() {
      view.requestMeasure();
    },
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
    focus() {
      view.focus();
    },
  };

  return handle;
}
