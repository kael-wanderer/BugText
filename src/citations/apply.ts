import type { CitationStyle, LibraryResult } from "./csl-json";
import { inText, parseSource, referenceLine, sortForStyle } from "./format";

export function applyCitations(host: HTMLElement, result: LibraryResult, style: CitationStyle, options: { references: boolean; onJump?: (key: string) => void }): { cited: string[]; missing: string[] } {
  const cited: string[] = [], missing: string[] = [];
  const numbers = new Map<string, number>();
  const number = (key: string) => { if (!numbers.has(key)) numbers.set(key, numbers.size + 1); return numbers.get(key)!; };
  for (const span of host.querySelectorAll<HTMLElement>("span.bugtext-cite")) {
    const source = span.getAttribute("data-source") ?? span.textContent ?? "";
    const items = parseSource(source);
    const bare = span.hasAttribute("data-bare");
    if (result.status !== "ok" || (bare && !result.library.entries.has(items[0]?.key))) { span.replaceWith(document.createTextNode(source)); continue; }
    const entries = result.library.entries;
    for (const item of items) {
      item.entry = entries.get(item.key);
      const list = item.entry ? cited : missing;
      if (!list.includes(item.key)) list.push(item.key);
    }
    span.textContent = inText(items, style, bare, number);
    span.classList.toggle("missing", items.some((item) => !item.entry));
    span.setAttribute("title", items.map((item) => item.entry?.title ?? `Not in bibliography: ${item.key}`).join("\n"));
    span.tabIndex = 0;
    const jump = () => {
      const key = items.find((item) => item.entry)?.key; if (!key) return;
      options.onJump?.(key);
      const target = Array.from(host.querySelectorAll<HTMLElement>(".bugtext-references li")).find((el) => el.getAttribute("data-key") === key);
      target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      if (target) { target.classList.add("bugtext-ref-flash"); setTimeout(() => target.classList.remove("bugtext-ref-flash"), 1500); }
    };
    span.addEventListener("click", jump);
    span.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); jump(); } });
  }
  if (result.status === "ok" && options.references && cited.length) {
    const block = document.createElement("div"); block.className = "bugtext-references";
    const heading = document.createElement("h2"); heading.textContent = "References"; block.append(heading);
    const list = document.createElement(style === "ieee" ? "ol" : "ul");
    for (const key of sortForStyle(cited, result.library.entries, style)) {
      const li = document.createElement("li"); li.setAttribute("data-key", key); li.textContent = referenceLine(result.library.entries.get(key)!, style); list.append(li);
    }
    block.append(list); host.append(block);
  }
  return { cited, missing };
}
