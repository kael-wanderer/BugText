// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createEditor } from "../editor";
import { configureLinks } from "../links/follow";
import { createLinkIndex } from "../links/index";
import { manualSnapshot } from "../recovery";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
describe("editor links integration", () => {
  it("applies several rename replacements as one undo step", () => {
    const parent = document.createElement("div"); document.body.append(parent);
    const editor = createEditor(parent, vi.fn()); const source = "[a](b.md) [b](b.md)";
    editor.openState("rename", source);
    editor.applyChanges("rename", [{ from: 4, to: 8, insert: "c.md" }, { from: 14, to: 18, insert: "c.md" }]);
    expect(editor.getText("rename")).toBe("[a](c.md) [b](c.md)");
    const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>(".cm-editor")!)!;
    undo(view); expect(editor.getText("rename")).toBe(source);
    view.destroy(); parent.remove();
  });
  it("follows editor command clicks and leaves a plain click for editing", async () => {
    const parent = document.createElement("div"); document.body.append(parent);
    const editor = createEditor(parent, vi.fn()); editor.openState("click", "[a](b.md)");
    const open = vi.fn().mockResolvedValue(undefined);
    configureLinks({ index: createLinkIndex(), context: () => ({ path: "/r/a.md", text: "[a](b.md)", folder: "/r" }), open, read: async () => "", jump: vi.fn(), create: vi.fn(), toast: vi.fn() });
    const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>(".cm-editor")!)!;
    const point = vi.spyOn(view, "posAtCoords").mockReturnValue(5);
    view.contentDOM.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(open).not.toHaveBeenCalled();
    view.contentDOM.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, metaKey: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(open).toHaveBeenCalledWith("/r/b.md", false);
    point.mockRestore(); view.destroy(); parent.remove();
  });
  it("propagates required Recovery failures but keeps normal snapshots best effort", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("snapshot unavailable"));
    await expect(manualSnapshot("/r/a.md", "original", "Before updating links", true)).rejects.toThrow("snapshot unavailable");
    await expect(manualSnapshot("/r/a.md", "original")).resolves.toBeUndefined();
  });
});
