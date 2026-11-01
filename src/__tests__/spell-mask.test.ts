import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { spellMask } from "../spell/mask";
import { createLineCache } from "../spell/cache";

const state = (doc: string) => EditorState.create({ doc, extensions: markdown() });

describe("spell masking", () => {
  it("preserves offsets and checks prose and link text only", () => {
    const doc = '---\ntitle: recieve\n---\nrecieve [recieve](docs/recieve.md)\n```\nrecieve\n```\n\n    recieve\n\n`recieve` https://recieve.example <span title="recieve"> <!-- recieve -->\n$recieve$\n$$\nrecieve\n$$\ncosts $5 and $6';
    const result = spellMask(state(doc), 0, doc.length, "markdown")!;
    expect(result.length).toBe(doc.length);
    expect(result.match(/recieve/g)).toHaveLength(2);
    expect(result).toContain("costs $5 and $6");
  });
  it("does not mask plain text and preserves late slices", () => {
    const doc = '---\nrecieve\n---\n' + 'ordinary line\n'.repeat(210) + 'recieve';
    const s = state(doc); const from = doc.lastIndexOf('recieve');
    expect(spellMask(s, 0, doc.length, "plain")).toBe(doc);
    expect(spellMask(s, from, doc.length, "markdown")).toBe("recieve");
  });
});

describe("line cache", () => {
  it("evicts least recently used entries and clears", () => {
    const cache = createLineCache(2);
    cache.set("a", [[0, 1]]); cache.set("b", []); cache.get("a"); cache.set("c", []);
    expect(cache.get("b")).toBeUndefined(); expect(cache.get("a")).toEqual([[0, 1]]);
    cache.clear(); expect(cache.get("a")).toBeUndefined(); expect(cache.get("c")).toBeUndefined();
  });
});
