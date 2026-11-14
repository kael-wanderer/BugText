// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { watchSelections } from "../capture/trigger";

Range.prototype.getBoundingClientRect = () => new DOMRect(10, 100, 40, 16);

function setup(markdown = true) {
  const pane = document.createElement("div");
  const p = document.createElement("p");
  p.textContent = "Some passage";
  pane.append(p);
  const editorDom = document.createElement("div");
  const other = document.createElement("p");
  other.textContent = "Elsewhere text";
  document.body.append(pane, editorDom, other);
  const show = vi.fn();
  const hide = vi.fn();
  const stop = watchSelections(document, () => ({ pane, editorDom, markdown }), show, hide);
  const select = (node: Node, from: number, to: number) => {
    const range = document.createRange();
    range.setStart(node, from); range.setEnd(node, to);
    const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup"));
  };
  return { p, other, show, hide, stop, select };
}

describe("watchSelections", () => {
  it("shows the menu for a selection in the preview of a Markdown tab", () => {
    const { p, show, stop, select } = setup();
    select(p.firstChild!, 0, 4);
    expect(show).toHaveBeenCalledWith(new DOMRect(10, 100, 40, 16));
    stop();
  });
  it("hides for a selection outside the note or in another kind of tab", () => {
    const a = setup();
    a.select(a.other.firstChild!, 0, 4);
    expect(a.show).not.toHaveBeenCalled();
    expect(a.hide).toHaveBeenCalled();
    a.stop();
    const b = setup(false);
    b.select(b.p.firstChild!, 0, 4);
    expect(b.show).not.toHaveBeenCalled();
    b.stop();
  });
  it("hides for a collapsed or blank selection", () => {
    const { p, show, hide, stop, select } = setup();
    select(p.firstChild!, 2, 2);
    expect(show).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
    stop();
  });
  it("stops listening", () => {
    const { p, show, stop, select } = setup();
    stop();
    select(p.firstChild!, 0, 4);
    expect(show).not.toHaveBeenCalled();
  });
});
