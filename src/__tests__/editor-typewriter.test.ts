import { expect, it } from "vitest";
import { Compartment, EditorState } from "@codemirror/state";
import { history, undoDepth } from "@codemirror/commands";
import { typewriterExtension } from "../editor-typewriter";
it("centers user edits and keyboard selections without scrolling pointer or programmatic selections", () => {
  const compartment = new Compartment(); let state = EditorState.create({ doc: "abc", extensions: [history(), compartment.of(typewriterExtension())] });
  const insert = state.update({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
  const effect = insert.effects[0]; expect(effect).toBeDefined(); expect((effect!.value as { y: string }).y).toBe("center");
  state = insert.state; expect(undoDepth(state)).toBe(1);
  expect(state.update({ selection: { anchor: 1 }, userEvent: "select" }).effects.length > 0).toBe(true);
  expect(state.update({ selection: { anchor: 1 }, userEvent: "select.pointer" }).effects.length > 0).toBe(false);
  expect(state.update({ selection: { anchor: 1 } }).effects.length > 0).toBe(false);
  state = state.update({ effects: compartment.reconfigure([]) }).state;
  expect(state.update({ selection: { anchor: 1 }, userEvent: "select" }).effects.length > 0).toBe(false);
  expect(undoDepth(state)).toBe(1);
});
