import { describe, expect, it } from "vitest";
import { history, undo } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { agentChangeTransaction } from "../editor";

describe("agent editor transaction", () => {
  it("maps the owner's cursor, accepts typing at the mapped position, and undoes one agent change", () => {
    const original = "first\nsecond\nthird";
    const initial = EditorState.create({
      doc: original,
      selection: { anchor: original.length },
      extensions: [history()],
    });
    const agentState = agentChangeTransaction(initial, [
      { from: 0, to: 0, insert: "agent\n" },
    ]).state;
    expect(agentState.selection.main.head).toBe(original.length + 6);
    const typed = agentState.update({
      changes: { from: agentState.selection.main.head, insert: " owner" },
      annotations: Transaction.userEvent.of("input.type"),
    }).state;
    expect(typed.doc.toString()).toBe("agent\nfirst\nsecond\nthird owner");

    const undoState = { current: agentState };
    const undoView = {
      get state() { return undoState.current; },
      dispatch(transaction: any) {
        undoState.current = undoState.current.update(transaction).state;
      },
    } as unknown as EditorView;
    expect(undo(undoView)).toBe(true);
    expect(undoState.current.doc.toString()).toBe(original);
  });
});
