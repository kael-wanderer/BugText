import { headingAnchors } from "./links/parse";
import { markdownOutline } from "./outline";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import "katex/dist/katex.min.css";
import { sanitizeHtml } from "./sanitize";
import { findFrontMatter } from "./properties/frontmatter";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang): string {
    if (lang === "mermaid") return md.utils.escapeHtml(code);
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(code, { language: lang }).value;
        return `<pre class="hljs"><code>${out}</code></pre>`;
      } catch {
        /* fall through to plain escaping */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
  },
});

// Source maps attach navigation anchors to rendered block elements.
md.core.ruler.push("source_lines", (state) => {
  const headings = headingAnchors(markdownOutline(state.src));
  for (const token of state.tokens) {
    if (token.map && token.block && token.nesting === 1) {
      token.attrSet("data-line", String(token.map[0] + 1));
      if (token.type === "heading_open") {
        const heading = headings.find((h) => h.line === token.map![0] + 1);
        if (heading) token.attrSet("data-anchor", heading.anchor);
      }
    }
  }
});
// List items starting with `[ ]` / `[x]` are tasks; their boxes are added after
// sanitizing (`preview-tasks.ts`), since the sanitizer forbids form controls.
md.core.ruler.push("task_items", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (tokens[i].type !== "list_item_open" || tokens[i + 1].type !== "paragraph_open") continue;
    if (/^\[[ xX]\](?:\s|$)/.test(tokens[i + 2].content)) tokens[i].attrJoin("class", "task");
  }
});
for (const name of ["fence", "code_block"] as const) {
  const render = md.renderer.rules[name]!;
  md.renderer.rules[name] = (tokens, index, options, env, renderer) => {
    const html = render(tokens, index, options, env, renderer);
    const line = tokens[index].map?.[0];
    return line === undefined ? html : html.replace("<pre", `<pre data-line="${line + 1}"`);
  };
}

md.inline.ruler.after("escape", "math", (state, silent) => {
  const source = state.src.slice(state.pos);
  const display = source.startsWith("$$");
  const fence = display ? "$$" : "$";
  if (!source.startsWith(fence)) return false;
  const end = source.indexOf(fence, fence.length);
  if (end < 0) return false;
  const tex = source.slice(fence.length, end);
  if (!tex.trim()) return false;
  if (!silent) {
    const token = state.push("math", "", 0);
    token.content = tex;
    token.meta = { display };
  }
  state.pos += end + fence.length;
  return true;
});

md.renderer.rules.math = (tokens, index) => {
  const token = tokens[index];
  try {
    return katex.renderToString(token.content, {
      displayMode: Boolean(token.meta?.display),
      throwOnError: false,
    });
  } catch {
    return `<code>${md.utils.escapeHtml(token.content)}</code>`;
  }
};

export function findMathSpans(
  text: string,
): { display: boolean; tex: string }[] {
  const output: { display: boolean; tex: string }[] = [];
  const displayPattern = /\$\$([\s\S]+?)\$\$/g;
  let match: RegExpExecArray | null;
  while ((match = displayPattern.exec(text))) {
    output.push({ display: true, tex: match[1].trim() });
  }
  const withoutDisplay = text.replace(/\$\$([\s\S]+?)\$\$/g, "");
  const inlinePattern = /\$([^$\n]+?)\$/g;
  while ((match = inlinePattern.exec(withoutDisplay))) {
    output.push({ display: false, tex: match[1].trim() });
  }
  return output;
}

export function renderMarkdown(src: string): string {
  const front = findFrontMatter(src);
  // The properties card shows frontmatter; blank it here but keep its newlines so data-line anchors stay true.
  const body = front ? "\n".repeat(src.slice(0, front.end).split("\n").length - 1) + src.slice(front.end) : src;
  return sanitizeHtml(md.render(body));
}
