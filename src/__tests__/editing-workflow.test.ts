import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { liveDecorations } from "../editor-live-preview/extension";
import { promoteTab, reusablePreviewTab, restorableTabs } from "../tabops";

describe("temporary tab safety", () => {
  const clean = { id: "a", path: "/a.md", name: "a", dirty: false, temporary: true };
  it("never reuses dirty or pinned previews", () => {
    expect(reusablePreviewTab([{ ...clean, dirty: true }, { ...clean, pinned: true }])).toBeUndefined();
    expect(reusablePreviewTab([clean])).toBe(clean);
    expect(promoteTab(clean).temporary).toBe(false);
  });
  it("excludes clean previews while retaining recovery candidates", () => {
    expect(restorableTabs([clean, { ...clean, id: "dirty", dirty: true }]).map(t => t.id)).toEqual(["dirty"]);
  });
});

describe("source-preserving live preview", () => {
  const doc = "# Heading\n\n**bold** and *italic* and `code` and [label](note.md)\n\nend";
  it("decorates inactive Markdown without changing document bytes", () => {
    const state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: markdown() });
    const ranges = liveDecorations(state); expect(ranges.size).toBeGreaterThan(4);
    expect(state.doc.toString()).toBe(doc);
  });
  it("leaves selected syntax literal and ignores code fences", () => {
    const state = EditorState.create({ doc: "**bold**", selection: { anchor: 3 }, extensions: markdown() });
    expect(liveDecorations(state).size).toBe(0);
    const fenced = EditorState.create({ doc: "```\n**bold**\n```\nend", selection: { anchor: 20 }, extensions: markdown() });
    expect(liveDecorations(fenced).size).toBe(0);
  });
});
