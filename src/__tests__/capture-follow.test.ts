// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { captureQuote, findQuote, findQuoteInSource } from "../capture/follow";
import { configureLinks, followLink } from "../links/follow";
import { createLinkIndex } from "../links/index";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

function block<K extends keyof HTMLElementTagNameMap>(tag: K, line: number, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.dataset.line = String(line);
  node.append(...children);
  return node;
}
function link(text: string, href = "a.md#h"): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.textContent = text;
  return a;
}

describe("captureQuote", () => {
  it("reads the quote of an excerpt link", () => {
    const a = link("Doc · H");
    const quote = block("blockquote", 3,
      block("p", 3, "a\nb"), "\n",
      block("p", 6, "c\n— ", a, " · 2026-11-14"));
    document.body.append(quote);
    expect(captureQuote(a)).toBe("a\nb\nc");
  });
  it("reads the quote of a task source link", () => {
    const a = link("source");
    const item = block("li", 11, "[ ] Verify x (", a, ")");
    item.className = "task";
    document.body.append(item);
    expect(captureQuote(a)).toBe("Verify x");
  });
  it("ignores ordinary links", () => {
    const inText = link("Doc");
    document.body.append(block("p", 1, "see ", inText, " here"));
    const quoted = link("Doc");
    document.body.append(block("blockquote", 2, block("p", 2, "a quoted ", quoted, " link")));
    const plainItem = link("source");
    document.body.append(block("li", 4, "Item (", plainItem, ")"));
    expect(captureQuote(inText)).toBeNull();
    expect(captureQuote(quoted)).toBeNull();
    expect(captureQuote(plainItem)).toBeNull();
  });
});

describe("findQuote", () => {
  function pane(): HTMLElement {
    const root = document.createElement("div");
    root.append(
      block("h2", 1, "One"),
      block("p", 2, "The same words appear."),
      block("h2", 4, "Two"),
      block("p", 5, "Here ", Object.assign(document.createElement("em"), { textContent: "the same" }), "\n   words appear."),
    );
    return root;
  }
  it("finds the first match at or after the heading line", () => {
    const root = pane();
    const range = findQuote(root, "the same words", 4)!;
    expect(range.toString()).toBe("the same\n   words");
    expect(range.startContainer.parentElement?.tagName).toBe("EM");
    expect(findQuote(root, "same words", 1)!.startContainer.parentElement?.dataset.line).toBe("2");
  });
  it("matches across line breaks and extra spaces", () => {
    const root = pane();
    expect(findQuote(root, "same   words\nappear", 1)?.toString()).toBe("same words appear");
    expect(findQuoteInSource("x\n\nOne  two\nthree", "one two three".replace("one", "One"), 0)).toEqual([3, 17]);
    expect(findQuoteInSource("ab ab", "ab", 1)).toEqual([3, 5]);
  });
  it("returns null when the passage is gone", () => {
    expect(findQuote(pane(), "words that were never here", 1)).toBeNull();
    expect(findQuote(pane(), "   ", 1)).toBeNull();
    expect(findQuoteInSource("abc", "xyz", 0)).toBeNull();
  });
});

describe("followLink with a quote", () => {
  function setup(opened: string | void) {
    const open = vi.fn().mockResolvedValue(opened), jump = vi.fn(), toast = vi.fn();
    const highlight = vi.fn().mockResolvedValue(false);
    const read = vi.fn().mockResolvedValue("# H\n\ntext");
    const index = createLinkIndex(async () => ({ notes: [], skipped: [] }));
    configureLinks({ index, open, jump, toast, read, highlight, create: vi.fn(), context: () => null });
    return { open, jump, toast, highlight };
  }
  const context = { path: "/r/notes.md", text: "", folder: "/r" };
  it("followLink toasts when highlight fails", async () => {
    const s = setup(undefined);
    await followLink("a.md#h", context, false, "text");
    expect(s.highlight).toHaveBeenCalledWith("text", 1);
    expect(s.toast).toHaveBeenCalledWith("This passage changed after it was saved.");
    s.toast.mockClear();
    await followLink("a.md#gone", context, false, "text");
    expect(s.toast.mock.calls.map((call) => call[0])).toEqual(["Heading not found: #gone", "This passage changed after it was saved."]);
  });
  it("followLink jumps in the window it opened", async () => {
    const s = setup("sub");
    s.highlight.mockResolvedValue(true);
    await followLink("a.md#h", context, true, "text");
    expect(s.open).toHaveBeenCalledWith("/r/a.md", true);
    expect(s.jump).toHaveBeenCalledWith(1, "sub");
    expect(s.highlight).toHaveBeenCalledWith("text", 1, "sub");
    expect(s.toast).not.toHaveBeenCalled();
  });
});
