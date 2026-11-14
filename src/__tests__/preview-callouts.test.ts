// @vitest-environment jsdom
import { it, expect } from "vitest";
import { renderMarkdown } from "../preview";
it("renders a marked quote as a callout with the default label", () => {
  const html = renderMarkdown("> [!WARNING]\n> Check the sync model.");
  expect(html).toContain('<blockquote class="callout callout-warning" data-line="1">');
  expect(html).toContain('<p class="callout-title">Warning</p>');
  expect(html).toContain("Check the sync model.");
  expect(html).not.toContain("[!WARNING]");
});
it("accepts lower case and a custom title", () => {
  const html = renderMarkdown("> [!tip] Read **this** first\n> Body");
  expect(html).toContain("callout-tip");
  expect(html).toContain('<p class="callout-title">Read <strong>this</strong> first</p>');
});
it.each(["note", "tip", "important", "warning", "caution"])("knows %s", (type) => {
  expect(renderMarkdown(`> [!${type.toUpperCase()}]\n> x`)).toContain(`callout-${type}`);
});
it("renders a marker with no body as a title-only callout", () => {
  const html = renderMarkdown("> [!NOTE]");
  expect(html).toContain('<p class="callout-title">Note</p>');
  expect(html).not.toContain("<p></p>");
});
it("leaves an unknown marker as a plain quote", () => {
  const html = renderMarkdown("> [!FOO]\n> x");
  expect(html).not.toContain("callout");
  expect(html).toContain("[!FOO]");
});
it("leaves a marker that is not on the first line alone", () => {
  expect(renderMarkdown("> intro\n> [!NOTE]")).not.toContain("callout");
});
it("only marks the quote that carries the marker", () => {
  const html = renderMarkdown("> outer\n>\n> > [!NOTE]\n> > inner");
  expect(html.match(/class="callout /g)).toHaveLength(1);
  expect(html.indexOf("<blockquote data-line")).toBeLessThan(html.indexOf("callout-note"));
});
it("sanitizes a title", () => {
  const html = renderMarkdown('> [!NOTE] <img src=x onerror="evil()">\n> x');
  expect(html).not.toContain("onerror");
});
it("requires whitespace between a callout marker and a custom title", () => {
  const ordinary = renderMarkdown("> [!note]body");
  expect(ordinary).not.toContain("callout");
  expect(ordinary).toContain("[!note]body");
  expect(renderMarkdown("> [!note] body")).toContain('<p class="callout-title">body</p>');
  expect(renderMarkdown("> [!note]")).toContain('<p class="callout-title">Note</p>');
});
it("maps the callout body to the line after the marker", () => {
  expect(renderMarkdown("> [!note]\n> a")).toContain('<p data-line="2">a</p>');
});
it("renders a list inside a callout without losing its source lines", () => {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdown("> [!note]\n>\n> - First\n> - Second");
  expect(root.querySelectorAll("blockquote.callout ul li")).toHaveLength(2);
  expect(root.querySelector("ul")!.getAttribute("data-line")).toBe("3");
});
it("keeps the following paragraph's correct source line", () => {
  const html = renderMarkdown("> [!note]\n> a\n\nAfter");
  expect(html).toContain('<p data-line="2">a</p>');
  expect(html).toContain('<p data-line="4">After</p>');
});
