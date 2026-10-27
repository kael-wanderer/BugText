import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import "katex/dist/katex.min.css";
import { sanitizeHtml } from "./sanitize";

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
  return sanitizeHtml(md.render(src));
}
