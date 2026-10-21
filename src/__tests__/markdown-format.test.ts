import { describe, expect, it } from "vitest";
import { applyMarkdownFormat } from "../markdown-format";

describe("applyMarkdownFormat", () => {
  it("wraps and unwraps inline selections", () => {
    const bold = applyMarkdownFormat("hello world", 6, 11, "bold");
    expect(bold.text).toBe("hello **world**");
    expect(bold.text.slice(bold.anchor, bold.head)).toBe("world");

    const plain = applyMarkdownFormat(bold.text, bold.anchor, bold.head, "bold");
    expect(plain.text).toBe("hello world");
  });

  it("inserts a selected placeholder when there is no selection", () => {
    const result = applyMarkdownFormat("", 0, 0, "italic");
    expect(result.text).toBe("*italic text*");
    expect(result.text.slice(result.anchor, result.head)).toBe("italic text");
  });

  it("creates links and selects the URL for selected text", () => {
    const result = applyMarkdownFormat("BugText", 0, 7, "link");
    expect(result.text).toBe("[BugText](url)");
    expect(result.text.slice(result.anchor, result.head)).toBe("url");
  });

  it("toggles quote and bullet prefixes across selected lines", () => {
    const quoted = applyMarkdownFormat("one\ntwo", 0, 7, "quote");
    expect(quoted.text).toBe("> one\n> two");
    expect(
      applyMarkdownFormat(quoted.text, quoted.anchor, quoted.head, "quote").text,
    ).toBe("one\ntwo");

    expect(applyMarkdownFormat("one\ntwo", 0, 7, "bullet").text).toBe(
      "- one\n- two",
    );
  });

  it("cycles headings from H1 through H3 and plain", () => {
    const h1 = applyMarkdownFormat("Title", 0, 5, "heading");
    const h2 = applyMarkdownFormat(h1.text, h1.anchor, h1.head, "heading");
    const h3 = applyMarkdownFormat(h2.text, h2.anchor, h2.head, "heading");
    const plain = applyMarkdownFormat(h3.text, h3.anchor, h3.head, "heading");
    expect([h1.text, h2.text, h3.text, plain.text]).toEqual([
      "# Title",
      "## Title",
      "### Title",
      "Title",
    ]);
  });

  it("inserts a horizontal rule on its own line", () => {
    expect(applyMarkdownFormat("before", 6, 6, "rule").text).toBe("before\n---");
  });

  it("toggles task-list prefixes", () => {
    const task = applyMarkdownFormat("one\ntwo", 0, 7, "task");
    expect(task.text).toBe("- [ ] one\n- [ ] two");
    expect(applyMarkdownFormat(task.text, task.anchor, task.head, "task").text)
      .toBe("one\ntwo");
  });

  it("inserts a pipe table", () => {
    const table = applyMarkdownFormat("", 0, 0, "table");
    expect(table.text).toContain("| Column 1 | Column 2 | Column 3 |");
    expect(table.text).toContain("| --- | --- | --- |");
  });
});
