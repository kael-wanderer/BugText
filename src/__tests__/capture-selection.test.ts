// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { createEditor } from "../editor";
import { cleanQuote, editorPassage, previewPassage } from "../capture/selection";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

function block(tag: string, line: number, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.dataset.line = String(line);
  el.textContent = text;
  return el;
}

function pane(): { pane: HTMLElement; first: HTMLElement; second: HTMLElement } {
  const root = document.createElement("div");
  const first = block("p", 3, "First block text.");
  const list = block("ul", 7, "");
  const second = block("li", 8, "Second block text.");
  list.append(second);
  root.append(first, list);
  document.body.append(root);
  return { pane: root, first, second };
}

function select(start: Node, startOffset: number, end: Node, endOffset: number): Selection {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe("previewPassage", () => {
  it("leaves out the placeholder of a missing image", () => {
    const root = document.createElement("div");
    const p = block("p", 2, "Look ");
    const missing = document.createElement("span");
    missing.className = "img-missing";
    missing.textContent = "Image not found · x";
    p.append(missing, " and here.");
    root.append(p);
    document.body.append(root);
    const passage = previewPassage(root, select(p.firstChild!, 0, p.lastChild!, 10));
    expect(passage?.quote).toBe("Look and here.");
  });
  it("maps a preview selection to its block's data-line", () => {
    const { pane: p, second } = pane();
    const text = second.firstChild!;
    expect(previewPassage(p, select(text, 0, text, 6))).toEqual({ quote: "Second", line: 8, endLine: Infinity, source: "preview" });
  });
  it("uses the start block when the range spans blocks", () => {
    const { pane: p, first, second } = pane();
    expect(previewPassage(p, select(first.firstChild!, 6, second.firstChild!, 6))?.line).toBe(3);
  });
  it("ends at the line before the block after the selection's end block", () => {
    const { pane: p, first, second } = pane();
    expect(previewPassage(p, select(first.firstChild!, 0, first.firstChild!, 5))).toMatchObject({ line: 3, endLine: 6 });
    expect(previewPassage(p, select(first.firstChild!, 0, second.firstChild!, 5))).toMatchObject({ line: 3, endLine: Infinity });
  });
  it("returns null outside the pane, when collapsed, and for whitespace", () => {
    const { pane: p, first } = pane();
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.append(outside);
    expect(previewPassage(p, select(outside.firstChild!, 0, outside.firstChild!, 4))).toBeNull();
    expect(previewPassage(p, select(first.firstChild!, 2, first.firstChild!, 2))).toBeNull();
    const space = block("p", 9, "   ");
    p.append(space);
    expect(previewPassage(p, select(space.firstChild!, 0, space.firstChild!, 3))).toBeNull();
    expect(previewPassage(p, null)).toBeNull();
  });
});

describe("editorPassage", () => {
  it("returns the editor selection's first line", () => {
    expect(editorPassage("Sync model text", { from: 4, to: 6 })).toEqual({ quote: "Sync model text", line: 4, endLine: 6, source: "editor" });
    expect(editorPassage("  ", { from: 1, to: 1 })).toBeNull();
    expect(editorPassage("x", null)).toBeNull();
  });
  it("reads the line range of the editor selection", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const editor = createEditor(parent, vi.fn());
    editor.openState("n", "one\ntwo\nthree\nfour", "markdown");
    editor.switchTo("n");
    const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>(".cm-editor")!)!;
    expect(editor.selectionLines()).toBeNull();
    view.dispatch({ selection: { anchor: 5, head: 11 } });
    expect(editor.selectionLines()).toEqual({ from: 2, to: 3 });
  });
});

describe("cleanQuote", () => {
  it("trims and collapses runs of blank lines", () => {
    expect(cleanQuote("  a\n\n\n\nb  ")).toBe("a\n\nb");
  });
  it("caps long quotes at a word boundary", () => {
    const quote = cleanQuote(`${"word ".repeat(500)}end`);
    expect(quote.length).toBeLessThanOrEqual(2001);
    expect(quote.endsWith("word…")).toBe(true);
  });
});
