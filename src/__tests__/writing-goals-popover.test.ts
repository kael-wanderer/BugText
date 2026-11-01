// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { openGoalPopover, type GoalPopoverOptions } from "../writing-goals/popover";
function setup(source: string, markdown = true, result = true) {
  const anchor = document.createElement("button"); document.body.append(anchor); const apply = vi.fn((_value: Parameters<GoalPopoverOptions["apply"]>[0]) => result);
  const close = openGoalPopover({ anchor, note: { source, markdown }, session: null, readingTime: false, apply });
  const panel = document.querySelector<HTMLElement>(".goal-popover")!;
  return { anchor, apply, close, panel, inputs: panel.querySelectorAll<HTMLInputElement>('input[type="number"]') };
}
it("builds a property edit and closes on Enter", () => {
  const source = "---\nword_goal: 1500\n---\nx", f = setup(source);
  expect(f.inputs[0].value).toBe("1500"); f.inputs[0].value = "2000"; document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  const edit = f.apply.mock.calls[0][0].noteEdit!; expect(source.slice(0,edit.from) + edit.insert + source.slice(edit.to)).toContain("word_goal: 2000"); expect(f.panel.isConnected).toBe(false);
});
it("validates, refuses changed notes, and Escape cancels", () => {
  const f = setup("hello", true, false); f.inputs[1].value = "12.5"; f.panel.querySelectorAll("button")[1].click();
  expect(f.panel.textContent).toContain("Enter a whole number of words."); expect(f.apply).not.toHaveBeenCalled();
  f.inputs[1].value = "500"; f.panel.querySelectorAll("button")[1].click(); expect(f.panel.textContent).toContain("The note changed. Try again.");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); expect(f.panel.isConnected).toBe(false);
});
it("handles plain text, invalid YAML and hostile values", () => {
  let f = setup("hello", false); expect(f.inputs[0].disabled).toBe(true); expect(f.panel.textContent).toContain("Plain-text files have no properties"); f.close();
  f = setup("---\na: [\n---\n"); expect(f.inputs[0].readOnly).toBe(true); expect(f.panel.textContent).toContain("Fix the note's properties to set a goal"); f.close();
  f = setup("---\nword_goal: <img src=x>\n---\n"); expect(f.panel.querySelector("img")).toBeNull(); expect(f.panel.textContent).toContain("word_goal in this note's properties is not a whole number."); f.close();
});
