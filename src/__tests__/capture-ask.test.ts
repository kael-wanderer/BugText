import { describe, expect, it } from "vitest";
import { askRange } from "../capture/ask";

const text = "# T\n\n## H\n\nUse `code` and **bold** here.\nSecond line.\n\nNext para.\n";

describe("askRange", () => {
  it("selects the exact passage when the source holds it as written", () => {
    const [from, to] = askRange(text, { quote: "Second line.", line: 5, endLine: 7, source: "preview" });
    expect(text.slice(from, to)).toBe("Second line.");
  });
  it("selects whole lines when inline Markdown makes the rendered text differ", () => {
    const [from, to] = askRange(text, { quote: "Use code and bold here. Second line.", line: 5, endLine: 7, source: "preview" });
    expect(text.slice(from, to)).toBe("Use `code` and **bold** here.\nSecond line.");
  });
  it("runs to the end of the note for the last block", () => {
    const [from, to] = askRange(text, { quote: "Next **para**", line: 8, endLine: Infinity, source: "preview" });
    expect(text.slice(from, to)).toBe("Next para.");
  });
});
