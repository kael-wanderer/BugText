// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createEditor } from "../editor";

// jsdom has no layout; CodeMirror only needs these to exist.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

function setup(text: string, cursor: number) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const onChange = vi.fn();
  const editor = createEditor(parent, onChange);
  editor.openState("note", text, "markdown");
  editor.switchTo("note");
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>(".cm-editor")!)!;
  view.dispatch({ selection: { anchor: cursor } });
  return { editor, view, onChange };
}

describe("editor tasks and tables", () => {
  it("tracks revisions of active and inactive documents", () => {
    const { editor } = setup("one", 0);
    const before = editor.revision("note");
    editor.setText("two");
    expect(editor.revision("note")).toBe(before + 1);
    editor.openState("other-revision-test", "other");
    editor.setTextFor("note", "three");
    expect(editor.revision("note")).toBe(before + 2);
    expect(editor.revision("other-revision-test")).toBe(0);
  });
  it("toggles a task from the preview without moving the cursor, undone in one step", () => {
    const text = "- [ ] a\n- [ ] b";
    const { editor, view } = setup(text, 2);
    expect(editor.toggleTaskAt("note", 2)).toBe(true);
    expect(view.state.doc.toString()).toBe("- [ ] a\n- [x] b");
    expect(view.state.selection.main.head).toBe(2);
    expect(editor.toggleTaskAt("note", 9)).toBe(false);
    undo(view);
    expect(view.state.doc.toString()).toBe(text);
  });

  it("toggles tasks across the selection as one undo step", () => {
    const text = "one\n- two\n- [x] three";
    const { editor, view } = setup(text, 0);
    view.dispatch({ selection: { anchor: 0, head: text.length } });
    editor.toggleTasks();
    expect(view.state.doc.toString()).toBe("- [ ] one\n- [ ] two\n- [ ] three");
    undo(view);
    expect(view.state.doc.toString()).toBe(text);
  });

  it("runs a table command as one undo step and reports the cell", () => {
    const text = "| a | b |\n| - | - |\n| 1 | 2 |";
    const { editor, view } = setup(text, text.length - 3);
    expect(editor.tableContext()).toMatchObject({ row: 1, column: 1, columns: 2 });
    expect(editor.runTableCommand("row_below")).toBe(true);
    expect(view.state.doc.lines).toBe(4);
    undo(view);
    expect(view.state.doc.toString()).toBe(text);
  });

  it("keeps typing after a table command in a separate undo step", () => {
    const text = "| a | b |\n| - | - |\n| 1 | 2 |";
    const { editor, view } = setup(text, text.length - 7);
    editor.runTableCommand("next");
    const afterTab = view.state.doc.toString();
    view.dispatch(view.state.replaceSelection("9"), { userEvent: "input.type" });
    expect(view.state.doc.toString()).not.toBe(afterTab);
    undo(view);
    expect(view.state.doc.toString()).toBe(afterTab);
  });

  it("leaves text outside a table alone when Insert Row Below runs without focus", () => {
    const { editor, view } = setup("plain", 2);
    expect(editor.tableContext()).toBeNull();
    expect(editor.runTableCommand("row_below")).toBe(false);
    expect(view.state.doc.toString()).toBe("plain");
  });
});
