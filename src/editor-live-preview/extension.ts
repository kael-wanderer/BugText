import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

/** View-only syntax presentation. Active source ranges always remain literal. */
export function liveDecorations(state: EditorState, from = 0, to = state.doc.length): DecorationSet {
  const ranges: { from: number; to: number; decoration: Decoration }[] = [];
  const selected = (start: number, end: number) => state.selection.ranges.some(range => range.from <= end && range.to >= start);
  syntaxTree(state).iterate({ from, to, enter(node) {
    const kind = node.name;
    if (!["StrongEmphasis", "Emphasis", "InlineCode", "Link"].includes(kind) && !/^ATXHeading[1-6]$/.test(kind)) return;
    if (selected(node.from, node.to)) return false;
    const className = kind === "StrongEmphasis" ? "cm-live-strong" : kind === "Emphasis" ? "cm-live-emphasis" : kind === "InlineCode" ? "cm-live-code" : kind === "Link" ? "cm-live-link" : "cm-live-heading";
    ranges.push({ from: node.from, to: node.to, decoration: Decoration.mark({ class: className }) });
    for (let child = node.node.firstChild; child; child = child.nextSibling) {
      if (["EmphasisMark", "CodeMark", "HeaderMark", "LinkMark", "URL"].includes(child.name)) {
        // Never replace a line break; block widgets need a separate layout-safe stage.
        if (!state.sliceDoc(child.from, child.to).includes("\n")) ranges.push({ from: child.from, to: child.to, decoration: Decoration.replace({}) });
      }
    }
  }});
  return Decoration.set(ranges.map(range => range.decoration.range(range.from, range.to)), true);
}

export function livePreviewExtension(): Extension {
  return [ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    composing = false;
    destroyed = false;
    destroy() { this.destroyed = true; }
    constructor(view: EditorView) { this.decorations = this.build(view); }
    build(view: EditorView): DecorationSet {
      if (this.composing || view.composing) return Decoration.none;
      return liveDecorations(view.state, view.viewport.from, view.viewport.to);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.transactions.length) this.decorations = this.build(update.view);
    }
  }, { decorations: value => value.decorations, eventHandlers: {
    compositionstart(_event, view) { this.composing = true; view.dispatch({}); return false; },
    compositionend(_event, view) { this.composing = false; queueMicrotask(() => { if (!this.destroyed) view.dispatch({}); }); return false; },
  } }), EditorView.baseTheme({
    ".cm-live-strong": { fontWeight: "700" },
    ".cm-live-emphasis": { fontStyle: "italic" },
    ".cm-live-code": { backgroundColor: "var(--selection)", borderRadius: "3px" },
    ".cm-live-link": { color: "var(--accent)", textDecoration: "underline" },
    ".cm-live-heading": { fontWeight: "700" },
  })];
}
