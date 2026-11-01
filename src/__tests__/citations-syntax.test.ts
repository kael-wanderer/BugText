// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../preview";
import { scanCitations } from "../citations/syntax";

describe("citation syntax", () => {
  it("wraps bracketed and bare citations and preserves escaped source", () => {
    const host = document.createElement("div");
    host.innerHTML = renderMarkdown('[see @smith2024, ch. 2; -@lee2023, p. "12"] and @smith2024 [p. 3] and @{odd key}');
    const spans = host.querySelectorAll(".bugtext-cite");
    expect(spans).toHaveLength(3);
    expect(spans[0].getAttribute("data-keys")).toBe("smith2024 lee2023");
    expect(spans[0].getAttribute("data-source")).toContain('"12"');
    expect(spans[1].getAttribute("data-bare")).toBe("1");
    expect(spans[2].textContent).toBe("@{odd key}");
  });
  it("leaves links, email and code alone", () => {
    const html = renderMarkdown('[@x](https://example.com) a@b.com `[@code]`\n\n```\n[@block]\n```');
    expect(html).not.toContain("bugtext-cite");
    expect(html).toContain('href="https://example.com"');
  });
  it("scans source order excluding code and frontmatter", () => {
    expect(scanCitations('---\nx: "@no"\n---\n[@one; @two] `@no`\n```\n@no\n```\n@three')).toEqual(["one", "two", "three"]);
  });
});
