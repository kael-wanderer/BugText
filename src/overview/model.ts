// Project Overview (spec 4.4): built from the link index and the review queue each time
// it renders. Nothing is stored. Pure: no DOM, no I/O.
import type { IndexedNote } from "../links/index";
import type { ReviewItem } from "../review/types";
import { ago, counts } from "../review/format";
import { findFrontMatter } from "../properties/frontmatter";
import { lifecycleOf } from "../lifecycle/model";
import { noteTasks, type InboxTask } from "../task-inbox/model";

export type OverviewInput = { folder: string; reviewRoot: string | null; notes: IndexedNote[]; review: ReviewItem[]; today: string; now: number };
export type KeyDoc = { path: string; name: string; badge: "current" | "pinned"; review: string };
export type Decision = { path: string; title: string; date: string | null; summary: string };
export type OverviewTask = InboxTask;
export type ProjectOverview = { folder: string; reviewRoot: string | null; keyDocs: KeyDoc[]; decisions: Decision[]; questions: OverviewTask[]; next: OverviewTask[]; changed: ReviewItem[] };

const NEXT_LIMIT = 10;
const SUMMARY_LIMIT = 200;
const fileName = (path: string): string => path.split("/").pop() ?? path;
const stem = (path: string): string => fileName(path).replace(/\.[^.]+$/, "");
const trimSlash = (path: string): string => path.replace(/\/+$/, "");

/** First body paragraph that is not a heading, on one line, cut at 200 characters. */
function summaryOf(source: string): string {
  const front = findFrontMatter(source);
  const body = front ? source.slice(front.end) : source;
  const block = body.split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((line) => !/^ {0,3}#{1,6}(\s|$)/.test(line)).join("\n").trim())
    .find(Boolean) ?? "";
  const line = block.replace(/\s+/g, " ").trim();
  if (line.length <= SUMMARY_LIMIT) return line;
  const cut = line.slice(0, SUMMARY_LIMIT);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const hasTag = (text: string, tags: string[]): boolean =>
  tags.some((tag) => new RegExp(`(^|\\s)#${tag}(?![\\w/-])`, "i").test(text));

export function buildOverview(input: OverviewInput): ProjectOverview {
  const folder = trimSlash(input.folder);
  const notes = input.notes.filter((n) => n.path.startsWith(`${folder}/`)).sort((a, b) => a.path.localeCompare(b.path));
  const root = input.reviewRoot ? trimSlash(input.reviewRoot) : null;
  const relativeFolder = root === null ? null : folder === root ? "" : folder.startsWith(`${root}/`) ? folder.slice(root.length + 1) : null;
  const changed = relativeFolder === null ? [] : input.review.filter((i) => relativeFolder === "" || i.path.startsWith(`${relativeFolder}/`));
  const queued = new Map(changed.map((i) => [`${root}/${i.path}`, i]));

  const keyDocs: KeyDoc[] = [];
  const decisions: Decision[] = [];
  for (const note of notes) {
    const props = note.propertyError ? null : note.properties;
    if (!props) continue;
    const current = lifecycleOf(props).status === "current";
    if (current || props.pinned === true) {
      const item = queued.get(note.path);
      const review = !item ? "" : `${item.state === "new" ? "New" : "Changed"} ${ago(item.changedAt, input.now)} · not reviewed`;
      keyDocs.push({ path: note.path, name: fileName(note.path), badge: current ? "current" : "pinned", review });
    }
    if (typeof props.type === "string" && props.type.trim().toLowerCase() === "decision") {
      const date = typeof props.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(props.date.trim()) ? props.date.trim() : null;
      const title = note.headings.find((h) => h.level === 1)?.text || stem(note.path);
      decisions.push({ path: note.path, title, date, summary: summaryOf(note.source) });
    }
  }
  keyDocs.sort((a, b) => a.name.localeCompare(b.name));
  decisions.sort((a, b) => (a.date === b.date ? 0 : a.date === null ? 1 : b.date === null ? -1 : b.date.localeCompare(a.date)));

  const open = notes.flatMap(noteTasks).filter((t) => !t.checked);
  const questions = open.filter((t) => hasTag(t.text, ["question", "blocker"]));
  const dated = open.filter((t) => t.due).sort((a, b) => a.due!.localeCompare(b.due!));
  const next = [...dated, ...open.filter((t) => !t.due)].slice(0, NEXT_LIMIT);
  return { folder, reviewRoot: root, keyDocs, decisions, questions, next, changed };
}

/** Copy as Markdown: a snapshot with links relative to the overview's folder. */
export function overviewMarkdown(overview: ProjectOverview): string {
  const rel = (path: string): string => {
    const relative = path.startsWith(`${overview.folder}/`) ? path.slice(overview.folder.length + 1) : path;
    return /[\s()<>]/.test(relative) ? `<${relative}>` : relative;
  };
  const link = (path: string, label = fileName(path)): string => `[${label.replace(/[[\]]/g, "")}](${rel(path)})`;
  const section = (title: string, lines: string[]): string => `## ${title}\n\n${lines.length ? lines.join("\n") : "None."}\n`;
  // A plain bullet, not "- [ ]": pasted into a note in the folder, a checkbox would become a new open task.
  const task = (t: OverviewTask): string => `- ${t.text.replace(/^\[/, "\\[")} — ${link(t.path)}`;
  const changedLine = (i: ReviewItem): string => `- ${link(overview.reviewRoot ? `${overview.reviewRoot}/${i.path}` : i.path)} ${i.state === "new" ? "(new)" : counts(i)}`.trimEnd();
  return [
    `# Overview — ${fileName(overview.folder)}\n`,
    section("Key documents", overview.keyDocs.map((d) => `- ${link(d.path)} · ${d.badge}${d.review ? ` · ${d.review}` : ""}`)),
    section("Decisions", overview.decisions.map((d) => `- ${link(d.path, d.title)}${d.date ? ` · ${d.date}` : ""}${d.summary ? ` — ${d.summary}` : ""}`)),
    section("Open questions and blockers", overview.questions.map(task)),
    section("Next actions", overview.next.map(task)),
    section("Changed since review", overview.changed.map(changedLine)),
  ].join("\n");
}
