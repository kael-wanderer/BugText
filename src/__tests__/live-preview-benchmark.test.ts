import { expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { liveDecorations } from "../editor-live-preview/extension";

it("bounds decoration work to the visible range on larger sources", () => {
  const line = "## Heading\nSome **bold** and *emphasis* with [a note](note.md).\n\n";
  for (const size of [10_000, 100_000, 1_000_000]) {
    const doc = line.repeat(Math.ceil(size / line.length)).slice(0, size);
    const started = performance.now();
    const state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: markdown() });
    const initialized = performance.now();
    const decorations = liveDecorations(state, 0, 2000);
    const finished = performance.now();
    console.log(`live-preview ${size} chars: state ${(initialized-started).toFixed(2)}ms; first 2000-char viewport ${(finished-initialized).toFixed(2)}ms`);
    expect(decorations.size).toBeGreaterThan(0);
    expect(decorations.size).toBeLessThan(1000);
    expect(state.doc.length).toBe(size);
  }
});
