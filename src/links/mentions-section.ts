import type { IndexedNote } from "./index";
import { createMentionScan } from "./mention-scan";
import { mentionEdit, mentionTitle, type Mention } from "./mentions";
import type { NoteEdits } from "./rename-plan";
import { node } from "./insert-picker";

type MentionDeps = { notes(): IndexedNote[]; folder(): string | null; open(path: string, line: number): void; link(edits: NoteEdits[], batch: boolean): Promise<{ stale: number; failed: number }> };
export function createMentionsSection(deps: MentionDeps) {
  const scan = createMentionScan(), skipped = new Set<string>();
  let activePath = "", expanded = false, generation = 0;
  let details: HTMLDetailsElement | null = null, body: HTMLElement | null = null, summary: HTMLElement | null = null;
  let results: Mention[] = [], capped = false, scanned = false, stale = false;
  const key = (m: Mention) => `${m.path}\n${m.lineText}`;
  function cancel() { generation++; scan.cancel(); }
  function draw() {
    if (!body || !summary || !details) return;
    body.replaceChildren();
    const visible = results.filter(m => !skipped.has(key(m)));
    const paths = [...new Set(visible.map(m => m.path))];
    summary.textContent = "Unlinked mentions" + (scanned ? visible.length ? ` · ${visible.length} in ${paths.length} note${paths.length === 1 ? "" : "s"}` : " · none" : "");
    const title = mentionTitle(activePath);
    if (!title) { body.append(node("p", "Title too short to search.", "outline-empty")); return; }
    if (stale) {
      const message = node("p", "Changed since scan — ", "outline-empty"), refresh = node("button", "Refresh");
      refresh.onclick = () => start(); message.append(refresh); body.append(message);
    }
    if (scanned && !visible.length) body.append(node("p", `No other note mentions "${title}" without linking it.`, "outline-empty"));
    if (capped) body.append(node("p", "Showing the first 200 mentions.", "link-panel-note"));
    for (const path of paths) {
      const group = visible.filter(m => m.path === path), section = node("div", undefined, "mentions-group");
      const name = path.split(/[\\/]/).pop() ?? path, relative = path.slice((deps.folder() ?? "").replace(/[\\/]$/, "").length + 1);
      section.append(node("strong", name)); if (relative !== name) section.append(node("small", relative));
      if (group.length >= 2) {
        const all = node("button", "Link all in this note…");
        all.onclick = () => { const plan = mentionEdit(group[0], activePath); plan.edits = group.map(m => mentionEdit(m, activePath).edits[0]); void link([plan], true); };
        section.append(all);
      }
      for (const m of group) {
        const row = node("div", undefined, "link-panel-row mentions-row"), line = node("button", `Line ${m.line}`), excerpt = node("span");
        line.onclick = () => deps.open(m.path, m.line);
        excerpt.append(document.createTextNode(m.lineText.slice(0, m.column)), node("strong", m.text), document.createTextNode(m.lineText.slice(m.column + m.text.length)));
        const add = node("button", "Link", "primary"), skip = node("button", "Skip");
        add.onclick = () => { void link([mentionEdit(m, activePath)], false); };
        skip.onclick = () => { skipped.add(key(m)); draw(); };
        const actions = node("div", undefined, "mentions-actions"); actions.append(line, add, skip);
        row.append(excerpt, actions); section.append(row);
      }
      body.append(section);
    }
  }
  async function link(edits: NoteEdits[], batch: boolean) {
    const current = generation, result = await deps.link(edits, batch);
    if (current !== generation) return;
    if (result.stale || result.failed) { stale = true; draw(); } else start();
  }
  function start() {
    cancel(); stale = false; scanned = false; results = []; capped = false; draw();
    const title = mentionTitle(activePath); if (!title) return;
    const current = generation;
    scan.start(title, activePath, deps.notes(), result => {
      if (current !== generation) return;
      results = result.mentions; capped = result.capped; scanned = true; draw();
    });
  }
  return {
    mount(host: HTMLElement, note: { path: string } | null) {
      cancel(); if (!note) { activePath = ""; expanded = false; return; }
      if (activePath !== note.path) { expanded = false; activePath = note.path; }
      results = []; capped = false; scanned = false; stale = false;
      details = document.createElement("details"); details.className = "mentions"; details.open = expanded;
      summary = node("summary", "Unlinked mentions"); body = node("div"); details.append(summary, body); host.append(details);
      details.ontoggle = () => { if (!details) return; expanded = details.open; if (expanded) start(); else cancel(); };
      draw(); if (expanded) start();
    },
    cancel() { cancel(); details = null; body = null; summary = null; },
  };
}
