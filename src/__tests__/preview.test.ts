// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../preview";

describe("renderMarkdown", () => {
  it("hides frontmatter and keeps block line numbers", () => {
    const html = renderMarkdown("---\ntitle: Retro\ntags: [ retro ]\n---\n\n# Head\n");
    expect(html).not.toContain("title: Retro");
    expect(html).toContain('<h1 data-line="6" data-anchor="head">');
  });

  it("renders headings", () => {
    expect(renderMarkdown("# Hi")).toContain('<h1 data-line="1" data-anchor="hi">Hi</h1>');
  });

  it("anchors blocks and removes other data attributes", () => {
    const html = renderMarkdown('# Head\n\nParagraph\n\n<div data-other="x" onclick="evil()">Hi</div>');
    expect(html).toContain('<h1 data-line="1" data-anchor="head">');
    expect(html).toContain('<p data-line="3">');
    expect(html).not.toContain('data-other');
    expect(html).not.toContain('onclick');
  });

  it("renders GFM tables", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('<table data-line="1">');
  });

  it("autolinks bare urls", () => {
    expect(renderMarkdown("see https://example.com")).toContain('href="https://example.com"');
  });

  it("highlights fenced code", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("hljs");
  });

  it("passes through raw html", () => {
    expect(renderMarkdown("<section>hello</section>")).toContain(
      "<section>hello</section>",
    );
  });

  it("removes event handlers while preserving images", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).toContain("<img");
    expect(html).not.toContain("onerror");
  });

  it("removes script elements", () => {
    expect(renderMarkdown("<script>alert(1)</script>hi")).not.toContain("<script");
  });

  it("removes javascript links", () => {
    const html = renderMarkdown('[x](javascript:alert(1)) <a href="javascript:alert(1)">x</a>');
    expect(html).not.toMatch(/href=["']javascript:/i);
    expect(html).not.toContain('href="javascript:alert(1)"');
  });

  it("removes style elements", () => {
    expect(renderMarkdown("<style>body{display:none}</style>")).not.toContain("<style");
  });

  it("removes iframe elements", () => {
    expect(renderMarkdown('<iframe src="https://example.com"></iframe>')).not.toContain("<iframe");
  });

  it("preserves details and summary", () => {
    const html = renderMarkdown("<details><summary>s</summary>b</details>");
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>");
  });

  it("preserves math and Mermaid code", () => {
    expect(renderMarkdown("Math $x^2$")).toContain("katex");
    expect(renderMarkdown("```mermaid\ngraph TD; A-->B\n```")).toContain("language-mermaid");
  });
});
