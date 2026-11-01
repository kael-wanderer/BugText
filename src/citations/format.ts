import type { CitationStyle, Entry } from "./csl-json";

export type CitationItem = { entry?: Entry; key: string; locator: string; prefix: string; suppress: boolean };
export function parseSource(source: string): CitationItem[] {
  const bracket = source.startsWith("[");
  const body = bracket ? source.slice(1, -1) : source;
  return (bracket ? body.split(";") : [body]).flatMap((part) => {
    const match = /(-?)@(?:\{([^}\n]+)\}|([\w](?:[\w:.#$%&+?<>~/-]*[\w])?))/.exec(part);
    if (!match) return [];
    let locator = part.slice(match.index + match[0].length).trim();
    if (locator.startsWith(",")) locator = locator.slice(1).trim();
    else if (!bracket && locator.startsWith("[") && locator.endsWith("]")) locator = locator.slice(1, -1).trim();
    return [{ key: match[2] ?? match[3], locator, prefix: part.slice(0, match.index).trim(), suppress: !!match[1] }];
  });
}
function names(entry: Entry, style: CitationStyle): string {
  const a = entry.authors;
  if (!a.length) return entry.title || entry.key;
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} ${style === "apa" ? "&" : "and"} ${a[1]}`;
  return `${a[0]} et al.`;
}
function locatorText(locator: string, style: CitationStyle): string {
  if (!locator) return "";
  if (style === "chicago") return locator.replace(/^p(?:p)?\.\s*/i, "");
  return /^\d/.test(locator) ? `p. ${locator}` : locator;
}
export function inText(items: CitationItem[], style: CitationStyle, bare: boolean, number: (key: string) => number): string {
  const parts = items.map((item) => {
    const { entry, key, prefix, suppress } = item;
    if (!entry) return `?${key}`;
    const loc = locatorText(item.locator, style);
    let content: string;
    if (style === "ieee") content = `${number(key)}${loc ? `, ${loc}` : ""}`;
    else {
      const author = suppress ? "" : names(entry, style);
      const year = entry.year || "n.d.";
      content = `${author}${author ? style === "apa" ? ", " : " " : ""}${year}${loc ? `, ${loc}` : ""}`;
      if (bare && author) content = `${author} (${year}${loc ? `, ${loc}` : ""})`;
    }
    return `${prefix ? `${prefix} ` : ""}${content}`;
  });
  if (bare && style !== "ieee" && items[0]?.entry && !items[0].suppress) return parts.join("; ");
  return style === "ieee" ? `[${parts.join("; ")}]` : `(${parts.join("; ")})`;
}
export function referenceLine(entry: Entry, style: CitationStyle): string {
  const authors = entry.authorsFull.join(style === "apa" ? ", & " : ", ");
  const year = entry.year || "n.d.";
  return [authors, style === "apa" ? `(${year}).` : `${year}.`, entry.title ? `${entry.title}.` : "", entry.container ? `${entry.container}.` : ""].filter(Boolean).join(" ");
}
export function sortForStyle(keys: string[], entries: Map<string, Entry>, style: CitationStyle): string[] {
  return style === "ieee" ? [...keys] : [...keys].sort((a, b) => (entries.get(a)?.authorsFull[0] || entries.get(a)?.title || a).localeCompare(entries.get(b)?.authorsFull[0] || entries.get(b)?.title || b) || a.localeCompare(b));
}
