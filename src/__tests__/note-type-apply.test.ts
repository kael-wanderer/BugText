import { describe, expect, it } from "vitest";
import { applyPreset, singleChange } from "../note-types/model";

describe("apply note type bytes", () => {
  const withComment = "---\n# keep me\nstatus: draft\ntags: []\n---\n\n# Body line\n";
  const body = "\n# Body line\n";

  it("keeps comments in frontmatter", () => {
    const { text } = applyPreset(withComment, { category: "work" }, true);
    expect(text).toContain("# keep me\n");
  });

  it("keeps existing key order and appends new keys", () => {
    const { text } = applyPreset(withComment, { category: "work" }, true);
    const order = ["status:", "tags:", "category:"].map(k => text.indexOf(k));
    expect(order.every(i => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("missing-only keeps existing values", () => {
    const { text, added } = applyPreset(withComment, { status: "planned", category: "work" }, true);
    expect(text).toContain("status: draft");
    expect(text).not.toContain("planned");
    expect(added).toEqual(["category"]);
  });

  it("body after frontmatter is untouched", () => {
    const { text } = applyPreset(withComment, { category: "work" }, true);
    expect(text.endsWith(body)).toBe(true);
  });

  it("single change only touches frontmatter", () => {
    const { text } = applyPreset(withComment, { category: "work" }, true);
    const edit = singleChange(withComment, text);
    expect(edit.from).toBeLessThan(withComment.indexOf("# Body line"));
    expect(withComment.slice(0, edit.from)).toBe(text.slice(0, edit.from));
  });

  it("adds frontmatter to a note without any", () => {
    const { text, added } = applyPreset("# Plain\n", { status: "planned" }, true);
    expect(text.endsWith("# Plain\n")).toBe(true);
    expect(added).toEqual(["status"]);
  });

  it("invalid YAML throws and changes nothing", () => {
    expect(() => applyPreset("---\nstatus: [unclosed\n---\n\n# Body\n", { category: "x" }, true))
      .toThrow("Properties could not be read");
  });

  it("rejects unsafe key by throwing, not silently writing", () => {
    expect(() => applyPreset(withComment, { "bad\nkey": "x" }, false)).toThrow("Cannot safely change");
  });
});
