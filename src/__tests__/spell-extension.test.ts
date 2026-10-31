// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { spellExtension, misspellingAt } from "../spell/extension";
import { spellCache } from "../spell/cache";

const checker = vi.fn(async (text: string): Promise<[number, number][]> => [...text.matchAll(/recieves?/g)].map(m => [m.index!, m[0].length]));
afterEach(() => { vi.useRealTimers(); spellCache.clear(); checker.mockClear(); });
const tick = async () => { await vi.advanceTimersByTimeAsync(350); };

it("marks prose, maps edits, suppresses typing at the caret and restores after movement", async () => {
  vi.useFakeTimers(); const compartment = new Compartment();
  const view = new EditorView({ state: EditorState.create({ doc: "recieve `recieve` end", extensions: [markdown(), compartment.of(spellExtension("markdown", checker))] }), parent: document.body });
  await tick();
  expect(view.dom.querySelectorAll(".cm-misspelled")).toHaveLength(1);
  expect(misspellingAt(view.state, 2)).toEqual({ from: 0, to: 7, word: "recieve" });
  view.dispatch({ changes: { from: 0, insert: "x " }, selection: { anchor: 2 } });
  expect(misspellingAt(view.state, 3)).toEqual({ from: 2, to: 9, word: "recieve" });
  view.dispatch({ changes: { from: 9, insert: "s" }, selection: { anchor: 10 }, userEvent: "input.type" });
  expect(misspellingAt(view.state, 3)).toBeNull(); await tick();
  expect(view.dom.querySelectorAll(".cm-misspelled")).toHaveLength(0);
  view.dispatch({ selection: { anchor: 0 } }); await tick();
  expect(view.dom.querySelectorAll(".cm-misspelled")).toHaveLength(1);
  view.dispatch({ effects: compartment.reconfigure([]) }); expect(view.dom.querySelectorAll(".cm-misspelled")).toHaveLength(0);
  view.dispatch({ effects: compartment.reconfigure(spellExtension("markdown", checker)) }); await tick();
  expect(view.dom.querySelectorAll(".cm-misspelled")).toHaveLength(1); view.destroy();
});

it("checks only changed lines in a large document and tolerates rejection", async () => {
  vi.useFakeTimers(); const doc = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
  const view = new EditorView({ state: EditorState.create({ doc, extensions: spellExtension("plain", checker) }), parent: document.body });
  await tick(); checker.mockClear();
  view.dispatch({ changes: { from: 0, insert: "x" }, userEvent: "input.type" }); await tick();
  expect(checker).toHaveBeenCalledOnce(); expect(checker.mock.calls[0]![0]).toBe("xline 0"); view.destroy();
  spellCache.clear(); const reject = vi.fn().mockRejectedValue(new Error("failed"));
  const other = new EditorView({ state: EditorState.create({ doc: "recieve", extensions: spellExtension("plain", reject) }), parent: document.body });
  await tick(); expect(other.dom.querySelector(".cm-misspelled")).toBeNull(); other.destroy();
});

it("does not repopulate a cleared cache with an in-flight result", async () => {
  vi.useFakeTimers();
  let finish!: (ranges: [number, number][]) => void;
  const delayed = vi.fn(() => new Promise<[number, number][]>(resolve => { finish = resolve; }));
  const view = new EditorView({ state: EditorState.create({ doc: "recieve", extensions: spellExtension("plain", delayed) }), parent: document.body });
  await tick(); spellCache.clear(); finish([[0, 7]]); await Promise.resolve();
  expect(spellCache.get("recieve")).toBeUndefined(); expect(view.dom.querySelector(".cm-misspelled")).toBeNull(); view.destroy();
});
