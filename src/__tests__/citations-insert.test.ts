import { expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { citationInsertion } from "../citations/picker";
import { citationCompletionSource, configureCitationCompletion } from "../citations/complete";
it("inserts a citation or appends inside a group", () => {
  expect(citationInsertion("hello", 5, 5, "x")).toEqual({ from: 5, to: 5, insert: "[@x]" });
  expect(citationInsertion("[@a]", 2, 2, "x")).toEqual({ from: 3, to: 3, insert: "; @x" });
});
it("completes citation keys while respecting code and settings", async () => {
  const entry = { key: "smith", title: "<img>", authors: ["Smith"], authorsFull: ["Smith"], type: "book", year: "2024", container: "" };
  configureCitationCompletion({ enabled: () => true, load: async () => ({ status: "ok", library: { path: "/r/x", entries: new Map([["smith", entry]]) } }) });
  const context = (doc: string) => new CompletionContext(EditorState.create({ doc }), doc.length, true);
  const result = await citationCompletionSource("x")(context("[@s")); expect(result?.options[0].apply).toBe("smith]"); expect(result?.options[0].info).toBe("<img>");
  expect(await citationCompletionSource("x")(context("```\n[@s"))).toBeNull();
  configureCitationCompletion({ enabled: () => false, load: async () => ({ status: "none" }) }); expect(await citationCompletionSource("x")(context("[@s"))).toBeNull();
});

it("keeps citation insertion in one undo step", async () => {
  const { history, undo } = await import("@codemirror/commands");
  const { agentChangeTransaction } = await import("../editor");
  const original = "[@a]";
  let state = EditorState.create({ doc: original, extensions: [history()] });
  state = agentChangeTransaction(state, [citationInsertion(original, 2, 2, "b")], { isolate: true }).state;
  expect(state.doc.toString()).toBe("[@a; @b]");
  expect(undo({ get state() { return state; }, dispatch: tr => { state = tr.state; } })).toBe(true);
  expect(state.doc.toString()).toBe(original);
});
