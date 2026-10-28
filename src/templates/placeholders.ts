// Template headers and {{placeholder}} substitution. Pure text in, text out:
// no evaluation, no includes, nothing read from disk.

export type DateFormat = "YYYY-MM-DD" | "DD-MM-YYYY" | "MM/DD/YYYY";

export const DATE_FORMATS: DateFormat[] = ["YYYY-MM-DD", "DD-MM-YYYY", "MM/DD/YYYY"];

export interface TemplateHeader {
  folder?: string;
  name?: string;
  body: string;
}

export interface Placeholders {
  title: string;
  date: string;
  time: string;
  weekday: string;
  year: string;
  month: string;
  day: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function formatDate(date: Date, format: DateFormat): string {
  const y = pad(date.getFullYear(), 4);
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (format === "DD-MM-YYYY") return `${d}-${m}-${y}`;
  if (format === "MM/DD/YYYY") return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;
}

export function placeholderValues(now: Date, title: string, format: DateFormat): Placeholders {
  return {
    title,
    date: formatDate(now, format),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekday: now.toLocaleDateString(undefined, { weekday: "long" }),
    year: pad(now.getFullYear(), 4),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
  };
}

const HEADER = /^<!--[ \t]*template[ \t]*\r?\n([\s\S]*?)-->[ \t]*(?:\r?\n|$)/;

/** First-line `<!-- template … -->` comment with `folder:` / `name:` keys; otherwise plain text. */
export function parseHeader(text: string): TemplateHeader {
  const match = HEADER.exec(text);
  if (!match) return { body: text };
  const header: TemplateHeader = { body: text.slice(match[0].length) };
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "folder") header.folder = value;
    else if (key === "name") header.name = value;
  }
  return header;
}

/** Single pass, so a title containing `{{date}}` stays literal. Unknown keys are kept. */
export function fillTemplate(text: string, values: Placeholders): { text: string; cursor: number } {
  let out = "";
  let last = 0;
  let cursor = -1;
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    const key = m[1];
    let replacement: string;
    if (key === "cursor") {
      if (cursor >= 0) continue;
      replacement = "";
    } else if (Object.prototype.hasOwnProperty.call(values, key)) {
      replacement = values[key as keyof Placeholders];
    } else {
      continue;
    }
    out += text.slice(last, m.index);
    if (key === "cursor") cursor = out.length;
    out += replacement;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { text: out, cursor: cursor >= 0 ? cursor : out.length };
}
