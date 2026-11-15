// Cleans a fetched web page before Pandoc sees it. The page is parsed into an
// inert DOMParser document (no browsing context: nothing runs, nothing loads),
// trimmed to its content, and returned as HTML that holds only plain elements,
// a few safe attributes, resolved links and https images.

export type Cleaned = { html: string; title: string; webImages: number };

const REMOVED =
  "script, style, noscript, template, nav, header, footer, aside, form, iframe, frame, object, embed, " +
  "canvas, svg, dialog, button, input, select, textarea, link, meta, base, [hidden], [aria-hidden='true']";
const KEPT_ATTRIBUTES = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "lang"]);
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const MAX_TITLE = 120;

function squash(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function resolve(value: string, baseUrl: string): URL | null {
  try {
    return new URL(value, baseUrl);
  } catch {
    return null;
  }
}

function pageTitle(doc: Document): string {
  const title = squash(doc.querySelector("title")?.textContent) || squash(doc.querySelector("h1")?.textContent);
  return Array.from(title).slice(0, MAX_TITLE).join("");
}

function unwrap(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

function removeComments(root: Node, doc: Document): void {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);
}

function keptRoot(doc: Document): Element {
  const mains = doc.body.querySelectorAll("main");
  if (mains.length === 1) return mains[0];
  const articles = doc.body.querySelectorAll("article");
  if (mains.length === 0 && articles.length === 1) return articles[0];
  return doc.body;
}

export function cleanPage(html: string, baseUrl: string): Cleaned {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = pageTitle(doc);
  for (const base of Array.from(doc.querySelectorAll("base"))) base.remove();
  for (const element of Array.from(doc.querySelectorAll(REMOVED))) element.remove();
  removeComments(doc, doc);
  const root = keptRoot(doc);
  let webImages = 0;
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const name of element.getAttributeNames()) {
      if (!KEPT_ATTRIBUTES.has(name)) element.removeAttribute(name);
    }
    const tag = element.tagName.toLowerCase();
    const href = element.getAttribute("href");
    if (href !== null) {
      const url = resolve(href, baseUrl);
      if (url && LINK_PROTOCOLS.has(url.protocol)) element.setAttribute("href", url.href);
      else if (tag === "a") {
        unwrap(element);
        continue;
      } else element.removeAttribute("href");
    }
    const src = element.getAttribute("src");
    if (src !== null) {
      const url = resolve(src, baseUrl);
      if (tag === "img" && url?.protocol === "https:") {
        element.setAttribute("src", url.href);
      } else if (tag === "img") {
        element.remove();
        continue;
      } else element.removeAttribute("src");
    }
    if (tag === "img") webImages += 1;
  }
  return { html: root.innerHTML, title, webImages };
}
