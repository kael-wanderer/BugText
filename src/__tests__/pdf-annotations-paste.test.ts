// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createEditor } from "../editor";
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
it("rewrites matching quote paste and inserts export in one undo step", () => {
  const parent = document.createElement("div"); document.body.append(parent);
  const editor = createEditor(parent, vi.fn(), undefined, undefined, undefined, undefined, (_id, text) => text === "quote" ? "rewritten" : null);
  editor.openState("note", "hello", "markdown"); editor.switchTo("note");
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>(".cm-editor")!)!;
  view.dispatch({ selection: { anchor: 5 } });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: (type: string) => type === "text/plain" ? "quote" : "", files: [] } });
  view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(view.state.doc.toString()).toBe("hellorewritten");
  undo(view); expect(view.state.doc.toString()).toBe("hello");
  editor.applyChanges("note", [{ from: 5, to: 5, insert: "export" }]);
  expect(view.state.doc.toString()).toBe("helloexport"); undo(view); expect(view.state.doc.toString()).toBe("hello");
});
