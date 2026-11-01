import type MarkdownIt from "markdown-it";
import { scanMarkdownLines } from "../markdown-blocks";

// Pandoc keys can contain punctuation internally, but not at their end.
const keyPattern = /@(?:\{([^}\n]+)\}|([\w](?:[\w:.#$%&+?<>~/-]*[\w])?))/g;

type Match = { source: string; keys: string[]; bare: boolean };
function citationAt(text: string, pos: number): Match | null {
  if (text[pos] === "[") {
    const end = text.indexOf("]", pos + 1);
    if (end < 0 || /[\n]/.test(text.slice(pos, end)) || /[([]/.test(text[end + 1] ?? "")) return null;
    const source = text.slice(pos, end + 1);
    const parts = source.slice(1, -1).split(";");
    const keys: string[] = [];
    for (const part of parts) {
      keyPattern.lastIndex = 0;
      const match = keyPattern.exec(part);
      if (!match || keyPattern.exec(part)) return null;
      keys.push(match[1] ?? match[2]);
    }
    return { source, keys, bare: false };
  }
  if (text[pos] !== "@" || (pos > 0 && !/[\s(]/.test(text[pos - 1]))) return null;
  keyPattern.lastIndex = pos;
  const match = keyPattern.exec(text);
  if (!match || match.index !== pos) return null;
  let end = keyPattern.lastIndex;
  const locator = /^\s+\[[^\]\n]+\]/.exec(text.slice(end));
  if (locator) end += locator[0].length;
  return { source: text.slice(pos, end), keys: [match[1] ?? match[2]], bare: true };
}

export function installCitationSyntax(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "citation", (state, silent) => {
    const match = citationAt(state.src, state.pos);
    if (!match) return false;
    if (!silent) {
      const token = state.push("citation", "", 0);
      token.content = match.source;
      token.meta = match;
    }
    state.pos += match.source.length;
    return true;
  });
  md.renderer.rules.citation = (tokens, index) => {
    const { source, keys, bare } = tokens[index].meta as Match;
    const escape = md.utils.escapeHtml;
    return `<span class="bugtext-cite" data-source="${escape(source)}" data-keys="${escape(keys.join(" "))}"${bare ? ' data-bare="1"' : ""}>${escape(source)}</span>`;
  };
}

/** Citation keys in source order, excluding code and front matter. */
export function scanCitations(markdown: string): string[] {
  const keys: string[] = [];
  for (const line of scanMarkdownLines(markdown)) {
    if (line.code) continue;
    const text = line.text.replace(/(`+)([\s\S]*?)\1/g, (s) => " ".repeat(s.length));
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\\") { i++; continue; }
      const match = citationAt(text, i);
      if (match) { keys.push(...match.keys); i += match.source.length - 1; }
    }
  }
  return keys;
}
