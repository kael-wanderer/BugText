/** Turns an AI reply into the text of the output note. Pure. */
import { formatLinkTarget } from "../links/parse";
import type { PropertiesModule } from "../properties/loader";

const INVALID = "The AI reply was not valid properties.";
const pad = (n: number) => String(n).padStart(2, "0");

/** Removes one surrounding ``` fence (any info string) from a whole reply. */
function unfence(reply: string): string {
  const match = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(reply);
  return match ? match[1] : reply;
}

function set(text: string, key: string, value: unknown, props: PropertiesModule): string {
  const edit = props.setProperty(text, key, value);
  return edit ? text.slice(0, edit.from) + edit.insert + text.slice(edit.to) : text;
}

export function generatedNote(
  reply: string,
  meta: { name: string; now: Date; outputRelative: string; sourceRelatives: string[] },
  props: PropertiesModule,
): string {
  let text = unfence(reply).trim();
  const { now } = meta;
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // A reply whose own front matter does not parse is kept as body under fresh properties.
  const read = props.readProperties(text);
  if (read && !read.ok) text = `---\n---\n${text}`;
  text = set(text, "generated_by", meta.name, props);
  text = set(text, "generated_at", at, props);
  return set(text, "sources", meta.sourceRelatives.map(s => formatLinkTarget(meta.outputRelative, s)), props);
}

export function propertiesReply(reply: string, noteText: string, props: PropertiesModule): { text: string } | { error: string } {
  let yaml = unfence(reply).trim();
  const lines = yaml.split("\n");
  if (/^---\s*$/.test(lines[0] ?? "")) {
    const close = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line));
    if (close < 0 || lines.slice(close + 1).some(line => line.trim())) return { error: INVALID };
    yaml = lines.slice(1, close).join("\n").trim();
  }
  if (!yaml || yaml.split("\n").some(line => /^(---|\.\.\.)\s*$/.test(line))) return { error: INVALID };
  const front = `---\n${yaml}\n---\n`;
  const read = props.readProperties(front);
  if (!read?.ok || props.findFrontMatter(front)?.end !== front.length) return { error: INVALID };
  const existing = props.findFrontMatter(noteText);
  return { text: front + noteText.slice(existing?.end ?? 0) };
}
