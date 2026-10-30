import { describe, expect, it } from "vitest";
import { countWords } from "../windowview";
import { countWords as statusCount } from "../status-bar/model";

describe("countWords", () => {
  it("shares the status count for frontmatter and code blocks", () => {
    const source = '---\ntitle: A note\n---\nHello world\n```js\nconst x = 1;\n```';
    expect(countWords(source)).toBe(13);
    expect(statusCount(source)).toBe(countWords(source));
  });
  it("counts whitespace-separated words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords(" one \n two\tthree ")).toBe(3);
  });
});
