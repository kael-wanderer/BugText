import { scanMarkdownLines } from "../markdown-blocks";

export function tagKey(tag: string): string { return tag.toLowerCase(); }
export function tagAncestors(tag: string): string[] {
  const parts = tag.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}
export function frontMatterTags(props: Record<string, unknown> | null): string[] {
  const value = props?.tags;
  const tags = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.replace(/^#/, "")).filter(Boolean);
}
export function bodyTags(source: string): string[] {
  const tags: string[] = [];
  for (const line of scanMarkdownLines(source)) {
    if (line.code || /^ {0,3}#{1,6}(\s|$)/.test(line.text)) continue;
    const text = line.text.replace(/`[^`\n]*`/g, "");
    for (const match of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu)) {
      const tag = match[1].replace(/\/+$/, "");
      if (tag && /[^\d]/u.test(tag)) tags.push(tag);
    }
  }
  return tags;
}
