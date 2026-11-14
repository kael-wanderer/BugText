// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { renderMarkdown } from "../preview";
import { enhanceFootnotes } from "../preview-footnotes";
// jsdom has no CSS.escape; generated footnote anchors contain only letters, digits and hyphens.
vi.stubGlobal("CSS", { escape: (name: string) => name });
afterEach(() => { document.body.replaceChildren(); });
const SRC = "Alpha[^a] beta[^b] again[^a].\n\n[^a]: First note.\n[^b]: Second note.";

it("renders numbered references and a list, anchored without ids", () => {
  const html = renderMarkdown(SRC);
  expect(html).toContain('<sup class="footnote-ref" data-anchor="fnref-1"><a href="#fn-1">1</a></sup>');
  expect(html).toContain('data-anchor="fnref-1-2"');
  expect(html).toContain('<li class="footnote-item" data-anchor="fn-2">');
  expect(html).toContain('href="#fnref-1" class="footnote-backref"');
  expect(html).not.toMatch(/\sid="/);
  expect(html).not.toContain("[^a]");
});
it("leaves a reference without a definition as text", () => {
  const html = renderMarkdown("Lonely[^x].");
  expect(html).toContain("[^x]");
  expect(html).not.toContain("footnotes");
});
it("sanitizes a definition", () => {
  const html = renderMarkdown('A[^a]\n\n[^a]: <img src=x onerror="evil()"><script>evil()</script>');
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("<script");
});
it("jumps both ways and keeps the click from other handlers", () => {
  const root = document.createElement("article");
  root.innerHTML = renderMarkdown(SRC);
  document.body.appendChild(root);
  const outer = vi.fn();
  root.addEventListener("click", outer);
  const scrolled: Element[] = [];
  Element.prototype.scrollIntoView = function () { scrolled.push(this); };
  enhanceFootnotes(root);
  root.querySelector<HTMLElement>('sup[data-anchor="fnref-1"] a')!.click();
  expect(scrolled[0]).toBe(root.querySelector('[data-anchor="fn-1"]'));
  root.querySelector<HTMLElement>('[data-anchor="fn-2"] .footnote-backref')!.click();
  expect(scrolled[1]).toBe(root.querySelector('[data-anchor="fnref-2"]'));
  expect(outer).not.toHaveBeenCalled();
});
