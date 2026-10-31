// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { showContextMenu } from "../contextmenu";
import { replaceMisspelling, spellMenuItems } from "../spell/menu";

it("builds suggestions, actions, separators and the empty state", () => {
  const h = { replace: vi.fn(), ignore: vi.fn(), learn: vi.fn() };
  const items = spellMenuItems("recieve", ["receive", "relieve"], h);
  expect(items.map(item => item === "separator" ? item : item.label)).toEqual(["receive", "relieve", "separator", "Ignore Spelling", "Learn Spelling", "separator"]);
  expect(spellMenuItems("x", [], h)[0]).toMatchObject({ label: "No Guesses Found", disabled: true });
  expect(spellMenuItems("x", ["1", "2", "3", "4", "5", "6"], h)).toHaveLength(9);
});
it("renders hostile suggestions as text", () => {
  const text = '<img src=x onerror=alert(1)>';
  showContextMenu(0, 0, spellMenuItems("x", [text], { replace() {}, ignore() {}, learn() {} }));
  expect(document.querySelector(".ctx-menu")?.textContent).toContain(text);
  expect(document.querySelector(".ctx-menu img")).toBeNull();
});
it("only replaces a still-matching word", () => {
  const editor = { getText: vi.fn(() => "recieve"), replaceRange: vi.fn() };
  const hit = { from: 0, to: 7, word: "recieve" };
  replaceMisspelling(editor, "a", hit, "receive"); expect(editor.replaceRange).toHaveBeenCalledWith(0, 7, "receive");
  editor.replaceRange.mockClear(); editor.getText.mockReturnValue("changed");
  replaceMisspelling(editor, "a", hit, "receive"); expect(editor.replaceRange).not.toHaveBeenCalled();
});

it("replaces a suggestion in one undo step", async () => {
  const { EditorState } = await import("@codemirror/state");
  const { EditorView } = await import("@codemirror/view");
  const { history, undo } = await import("@codemirror/commands");
  const view = new EditorView({ state: EditorState.create({ doc: "recieve", extensions: history() }), parent: document.body });
  const editor = { getText: () => view.state.doc.toString(), replaceRange: (from: number, to: number, text: string) => view.dispatch({ changes: { from, to, insert: text } }) };
  replaceMisspelling(editor, "a", { from: 0, to: 7, word: "recieve" }, "receive");
  expect(view.state.doc.toString()).toBe("receive"); undo(view); expect(view.state.doc.toString()).toBe("recieve"); view.destroy();
});
