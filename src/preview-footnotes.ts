import type MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";

function reference(id: number, subId = 0): string {
  return `fnref-${id + 1}${subId > 0 ? `-${subId + 1}` : ""}`;
}

export function installFootnotes(md: MarkdownIt): void {
  md.use(footnote);
  md.renderer.rules.footnote_ref = (tokens, index) => {
    const { id, subId } = tokens[index].meta;
    return `<sup class="footnote-ref" data-anchor="${reference(id, subId)}"><a href="#fn-${id + 1}">${id + 1}</a></sup>`;
  };
  md.renderer.rules.footnote_block_open = () => '<section class="footnotes">\n<ol>\n';
  md.renderer.rules.footnote_open = (tokens, index) => `<li class="footnote-item" data-anchor="fn-${tokens[index].meta.id + 1}">`;
  md.renderer.rules.footnote_anchor = (tokens, index) => {
    const { id, subId } = tokens[index].meta;
    return ` <a href="#${reference(id, subId)}" class="footnote-backref">↩</a>`;
  };
}

const enhanced = new WeakSet<HTMLAnchorElement>();

export function enhanceFootnotes(root: HTMLElement): void {
  for (const link of root.querySelectorAll<HTMLAnchorElement>("sup.footnote-ref a, a.footnote-backref")) {
    if (enhanced.has(link)) continue;
    enhanced.add(link);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const name = (link.getAttribute("href") ?? "").slice(1);
      root.querySelector(`[data-anchor="${CSS.escape(name)}"]`)?.scrollIntoView({ block: "center" });
    });
  }
}
