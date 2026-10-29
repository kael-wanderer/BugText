// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createEditor } from "../editor";
import { removeProperty, setProperty, type PropertyEdit } from "../properties/edit";
import { readProperties } from "../properties/parse";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

function apply(source: string, edit: PropertyEdit | null): string {
  return edit ? source.slice(0, edit.from) + edit.insert + source.slice(edit.to) : source;
}

describe("property edits", () => {
  it("preserves comments, unrelated bytes and the body", () => {
    const source = "---\n# leading\nstatus: draft # keep\nunknown:  [ a,  b ]\ntags: [a, b]\n---\nBody\n";
    expect(apply(source, setProperty(source, "status", "done"))).toBe(source.replace("draft", "done"));
    const result = apply(source, setProperty(source, "tags", ["a", "c"]));
    expect(result.replace(/tags:.*\n/, "tags: [a, b]\n")).toBe(source);
    expect(readProperties(result)).toMatchObject({ ok: true, props: { tags: ["a", "c"] } });
  });
  it("adds, removes and rejects unsafe input", () => {
    const created = apply("body", setProperty("body", "status", "draft"));
    expect(created).toBe("---\nstatus: draft\n---\nbody");
    expect(apply(created, removeProperty(created, "status"))).toBe("body");
    expect(setProperty("---\nx: [\n---\nbody", "x", "ok")).toBeNull();
    expect(setProperty("---\nx: [", "x", "ok")).toBeNull();
    expect(setProperty("body", "bad\nkey", "x")).toBeNull();
    expect(removeProperty("---\nx: a # keep\n---\n", "x")).toBeNull();
    expect(setProperty("---\ntags:\n  - a # keep\n---\n", "tags", ["b"])).toBeNull();
  });
  it("dispatches one isolated undo step through the editor", () => {
    const source = "---\nstatus: draft\n---\nbody";
    const parent = document.createElement("div"); document.body.append(parent);
    const onChange = vi.fn(); const editor = createEditor(parent, onChange);
    editor.openState("one", source, "markdown"); editor.switchTo("one");
    const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>(".cm-editor")!)!;
    const dispatch = vi.spyOn(view, "dispatch"); const edit = setProperty(source, "status", "done")!;
    editor.applyPropertyEdit("one", edit);
    expect(dispatch).toHaveBeenCalledOnce(); expect(onChange).toHaveBeenCalledOnce();
    expect(editor.getText("one")).toContain("status: done");
    undo(view); expect(editor.getText("one")).toBe(source);
  });
});

it("adds a property from the card to a note without frontmatter", async () => {
  const { createPropertiesCard } = await import("../properties/card");
  let source = "body"; const host = document.createElement("div");
  const card = createPropertiesCard(host, () => source, vi.fn(), (_snapshot, edit) => { source = apply(source, edit); return true; });
  card.render(); host.querySelector("button")!.click();
  const buttons = [...host.querySelectorAll("button")]; buttons.find(button => button.textContent === "+ add")!.click();
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Property name"]')!;
  input.value = "status"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(source).toBe('---\nstatus: ""\n---\nbody');
});
