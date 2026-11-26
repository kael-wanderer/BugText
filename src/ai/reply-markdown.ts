// Assistant replies are shown as Markdown. The model's text is untrusted: raw HTML is
// escaped, images are not loaded (a reply could otherwise send context to a remote
// address), and the result still goes through sanitizeHtml.
import MarkdownIt from "markdown-it";
import { sanitizeHtml } from "../sanitize";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.disable("image");

/** The Markdown each rendered reply came from; textContent would lose it. */
const sources = new WeakMap<object, string>();

export function replyHtml(text: string): string {
  return sanitizeHtml(md.render(text));
}

/** Sets a reply's text: Markdown for a bubble element, plain text for anything else. */
export function writeReply(node: { textContent: string | null }, text: string): void {
  sources.set(node, text);
  if (typeof HTMLElement !== "undefined" && node instanceof HTMLElement) {
    node.classList.add("ai-md");
    node.innerHTML = replyHtml(text);
  } else node.textContent = text;
}

/** The reply's Markdown source, as written with writeReply. */
export function readReply(node: { textContent: string | null }): string {
  return sources.get(node) ?? node.textContent ?? "";
}

/**
 * Opens a link from a reply: web addresses in the browser, a relative path as a note inside
 * `folder`. Anything else, or a path that leaves the folder, does nothing.
 */
export function openReplyLink(href: string, folder: string | null, openNote: (path: string) => void, openWeb: (url: string) => void): void {
  if (/^https?:\/\//i.test(href)) { openWeb(href); return; }
  if (!folder || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return;
  let relative: string;
  try { relative = decodeURIComponent(href.split("#")[0]); } catch { return; }
  const parts: string[] = [];
  for (const part of relative.split(/[\\/]/)) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return; parts.pop(); } else parts.push(part);
  }
  if (parts.length) openNote(`${folder.replace(/[\\/]+$/, "")}/${parts.join("/")}`);
}
