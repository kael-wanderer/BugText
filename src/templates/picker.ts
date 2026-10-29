// New from Template sheet. Template names, contents and titles are untrusted:
// everything is written with textContent / .value, and the preview is plain text.

import { planNote } from "./plan";
import type { DateFormat } from "./placeholders";
import { parseHeader } from "./placeholders";
import type { TemplateInfo } from "./library";

export type PickerDeps = {
  host: HTMLElement;
  /** The open folder, or null when none is open. */
  folder: string | null;
  /** Explorer-clicked folder relative to the open folder; replaces the header's. */
  targetDir: string | null;
  format: DateFormat;
  defaultFolder: string;
  lastUsed: string;
  now: () => Date;
  list: () => Promise<TemplateInfo[]>;
  read: (path: string) => Promise<string>;
  create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>;
  onCreated: (path: string, cursor: number) => void;
  onUntitled: (text: string, cursor: number) => void;
  onUsed: (name: string) => void;
  openTemplatesFolder: () => void;
  newTemplate: () => void;
  onNoteTypes?: () => void;
};

type Entry = { info: TemplateInfo; text: string | null; error: string | null };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, run: () => void, primary = false): HTMLButtonElement {
  const node = el("button", primary ? "tpl-btn primary" : "tpl-btn", label);
  node.type = "button";
  node.addEventListener("click", run);
  return node;
}

async function load(deps: PickerDeps): Promise<Entry[]> {
  const infos = await deps.list();
  return Promise.all(infos.map(async (info): Promise<Entry> => {
    try {
      return { info, text: await deps.read(info.path), error: null };
    } catch (error) {
      return { info, text: null, error: typeof error === "string" ? error : "Could not read the template." };
    }
  }));
}

export async function showTemplatePicker(deps: PickerDeps): Promise<void> {
  const existing = deps.host.querySelector<HTMLElement>(".tpl-scrim");
  if (existing) { existing.querySelector<HTMLInputElement>(".tpl-title")?.focus(); return; }
  let entries: Entry[];
  try { entries = await load(deps); } catch { entries = []; }

  const previous = document.activeElement as HTMLElement | null;
  const scrim = el("div", "tpl-scrim");
  const sheet = el("section", "tpl-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "New from Template");
  scrim.append(sheet);
  const close = (): void => { scrim.remove(); previous?.focus(); };
  scrim.addEventListener("click", (event) => { if (event.target === scrim) close(); });
  scrim.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
  deps.host.append(scrim);

  const head = el("div", "tpl-head");
  head.append(el("h3", undefined, "New from Template"));
  if (deps.onNoteTypes) head.append(button("Note types…", () => { close(); deps.onNoteTypes!(); }));
  sheet.append(head);

  if (!entries.length) {
    const empty = el("div", "tpl-empty");
    empty.append(el("strong", undefined, "No templates yet"), el("p", undefined, "Add a Markdown file to the templates folder."));
    const actions = el("div", "tpl-acts");
    actions.append(
      button("Open templates folder", () => { close(); deps.openTemplatesFolder(); }),
      button("New template", () => { close(); deps.newTemplate(); }, true),
    );
    empty.append(actions);
    sheet.append(empty);
    actions.querySelector("button")?.focus();
    return;
  }

  const filter = el("input", "tpl-filter");
  filter.placeholder = "Filter templates…";
  filter.setAttribute("aria-label", "Filter templates");
  const list = el("div", "tpl-list");
  list.setAttribute("role", "listbox");
  const preview = el("pre", "tpl-preview");
  const pick = el("div", "tpl-pick");
  const left = el("div", "tpl-left");
  left.append(filter, list);
  pick.append(left, preview);

  const title = el("input", "tpl-title");
  title.setAttribute("aria-label", "Title");
  const dest = el("div", "tpl-dest");
  const create = button("Create", () => void submit(), true);
  const foot = el("div", "tpl-foot");
  const label = el("label", undefined, "Title");
  const field = el("div", "tpl-field");
  field.append(title, dest);
  const acts = el("div", "tpl-acts");
  acts.append(button("Cancel", close), create);
  foot.append(label, field, acts);
  sheet.append(pick, foot);

  let shown: Entry[] = entries;
  let selected = entries.find((entry) => entry.info.name === deps.lastUsed) ?? entries[0];
  let busy = false;

  const current = () => {
    if (!selected.text) return null;
    return planNote(selected.text, { title: title.value, now: deps.now(), format: deps.format, defaultFolder: deps.defaultFolder, targetDir: deps.targetDir });
  };

  function hint(entry: Entry): string {
    if (entry.text === null) return entry.error ?? "";
    if (deps.targetDir !== null) return "";
    const folder = parseHeader(entry.text).folder ?? deps.defaultFolder;
    return folder ? `→ ${folder}/` : "→ top level";
  }

  function renderList(): void {
    list.replaceChildren();
    for (const entry of shown) {
      const row = el("div", entry === selected ? "tpl-item sel" : "tpl-item");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(entry === selected));
      row.append(el("span", "tpl-name", entry.info.name), el("small", undefined, hint(entry)));
      row.addEventListener("click", () => { selected = entry; refresh(); title.focus(); });
      list.append(row);
    }
    if (!shown.length) list.append(el("div", "tpl-none", "No matching templates"));
  }

  function refresh(): void {
    renderList();
    const plan = current();
    dest.classList.remove("err");
    dest.removeAttribute("role");
    if (!plan) {
      preview.textContent = selected.error ?? "";
      dest.textContent = selected.error ?? "";
      dest.classList.add("err");
      create.disabled = true;
      return;
    }
    preview.textContent = `${plan.text.slice(0, plan.cursor)}▍${plan.text.slice(plan.cursor)}`;
    if ("error" in plan.destination) {
      dest.textContent = plan.destination.error;
      dest.classList.add("err");
      dest.setAttribute("role", "alert");
      create.disabled = true;
    } else {
      dest.textContent = deps.folder ? plan.destination.path : "Not saved yet — no folder open";
      create.disabled = busy;
    }
  }

  function move(delta: number): void {
    if (!shown.length) return;
    const index = Math.max(0, shown.indexOf(selected));
    selected = shown[(index + delta + shown.length) % shown.length];
    refresh();
  }

  async function submit(): Promise<void> {
    const plan = current();
    if (!plan || "error" in plan.destination || busy) return;
    busy = true;
    create.disabled = true;
    deps.onUsed(selected.info.name);
    if (!deps.folder) {
      close();
      deps.onUntitled(plan.text, plan.cursor);
      return;
    }
    try {
      const path = await deps.create({ folder: deps.folder, relativeDir: plan.destination.dir, stem: plan.destination.stem, contents: plan.text });
      close();
      deps.onCreated(path, plan.cursor);
    } catch (error) {
      busy = false;
      refresh();
      dest.textContent = typeof error === "string" && error ? error : "Could not create the note.";
      dest.classList.add("err");
      dest.setAttribute("role", "alert");
    }
  }

  filter.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    shown = entries.filter((entry) => entry.info.name.toLowerCase().includes(query));
    if (!shown.includes(selected) && shown.length) selected = shown[0];
    refresh();
  });
  title.addEventListener("input", refresh);
  const keys = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void submit(); }
  };
  title.addEventListener("keydown", keys);
  filter.addEventListener("keydown", keys);

  refresh();
  title.focus();
}
