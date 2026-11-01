import "./organizer.css";
import { initialPlan, movePages, rotatePages, deletePages, insertPages, historyPush, historyUndo, historyRedo, isChanged, MAX_PLAN_PAGES, type History, type Inserted, type PagePlan } from "./plan";
import { createThumbs } from "./thumbs";
import { confirmClose } from "./sheets";

export type OrganizerDeps = {
  selfCount: number; fileName: string;
  thumb(source: "self" | Inserted, index: number, width: number): Promise<HTMLCanvasElement | null>;
  pickInsert(): Promise<string | null>; readInsert(path: string): Promise<Inserted | { error: string }>;
  save(plan: PagePlan): Promise<boolean>; saveCopy(plan: PagePlan): Promise<void>; extract(plan: PagePlan, keys: string[]): Promise<void>;
  close(): void; readOnly: string | null;
};
export type Organizer = { element: HTMLElement; dropFiles(paths: string[], clientX: number, clientY: number): void; requestClose(): Promise<boolean>; destroy(): void };
export function createOrganizer(doc: Document, deps: OrganizerDeps): Organizer {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, value = "") => { const el = doc.createElement(tag); el.textContent = value; return el; };
  const element = make("div"), toolbar = make("div"), grid = make("div"), status = make("div"), message = make("span");
  element.className = "pdf-organizer"; toolbar.className = "pdf-organizer-toolbar"; grid.className = "pdf-organizer-grid"; status.className = "pdf-organizer-status";
  toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", "Organize pages"); grid.setAttribute("role", "listbox"); grid.setAttribute("aria-label", "Pages"); grid.setAttribute("aria-multiselectable", "true"); message.setAttribute("role", "status");
  const counter = make("span"); status.append(counter, message); element.append(toolbar, grid, status);
  let history: History = { past: [], present: initialPlan(deps.selfCount), future: [] }; let selected = new Set<string>(); let focus = 0, anchor = 0, dragging: string[] = []; let busy = false, destroyed = false;
  const thumbs = createThumbs(async key => { const page = history.present.pages.find(p => p.key === key); if (!page) return null; const source = page.source === "self" ? "self" : history.present.inserts.get(page.source); return source ? deps.thumb(source, page.index, 120) : null; });
  const keys = () => history.present.pages.filter(p => selected.has(p.key)).map(p => p.key);
  function notify(text: string) { message.textContent = text; }
  function apply(plan: PagePlan) { history = historyPush(history, plan); selected = new Set(keys()); render(); }
  function action(fn: () => void) { if (!deps.readOnly && !busy) fn(); }
  function move(delta: number) { const indices = history.present.pages.flatMap((p, i) => selected.has(p.key) ? [i] : []); if (!indices.length) return; apply(movePages(history.present, keys(), delta < 0 ? indices[0] - 1 : indices[indices.length - 1] + 2)); }
  function rotate(delta: 90 | -90) { apply(rotatePages(history.present, keys(), delta)); }
  function remove() { const next = deletePages(history.present, keys()); if ("error" in next) notify(next.error); else { apply(next); selected.clear(); render(); } }
  async function add(paths: string[], index: number) {
    if (deps.readOnly || busy) return;
    if (paths.some(path => !/\.pdf$/i.test(path))) { notify("Only PDF files can be inserted."); return; }
    busy = true;
    try { for (const path of paths) {
      const insert = await deps.readInsert(path); if ("error" in insert) { notify(insert.error); continue; }
      if (history.present.pages.length + insert.pageCount > MAX_PLAN_PAGES) { notify("The result would have more than 2,000 pages."); continue; }
      apply(insertPages(history.present, insert, index)); index += insert.pageCount;
    } } finally { busy = false; render(); }
  }
  async function save(): Promise<boolean> { if (busy || deps.readOnly) return false; busy = true; try { return await deps.save(history.present); } finally { busy = false; } }
  async function requestClose(): Promise<boolean> {
    if (busy) return false;
    if (!isChanged(history.present)) return true;
    const answer = await confirmClose(history.past.length);
    if (answer === "cancel") return false;
    return answer === "discard" || await save();
  }
  async function close() { if (await requestClose()) deps.close(); }
  function button(label: string, run: () => void, disabled: () => boolean = () => false) { const el = make("button", label); el.type = "button"; el.onclick = run; toolbar.append(el); return { el, disabled }; }
  const controls = [
    button("Rotate Left", () => action(() => rotate(-90)), () => !selected.size), button("Rotate Right", () => action(() => rotate(90)), () => !selected.size),
    button("Delete", () => action(remove), () => !selected.size),
    button("Insert from PDF…", () => { void (async () => { const path = await deps.pickInsert(); if (path) { const indices = history.present.pages.flatMap((p, i) => selected.has(p.key) ? [i] : []); await add([path], indices.length ? indices[indices.length - 1] + 1 : history.present.pages.length); } })(); }),
    button("Extract…", () => { if (!deps.readOnly) void deps.extract(history.present, keys()); }, () => !selected.size),
    button("Undo", () => action(() => { history = historyUndo(history); render(); }), () => !history.past.length),
    button("Redo", () => action(() => { history = historyRedo(history); render(); }), () => !history.future.length),
  ];
  button("Close", () => { void close(); });
  const copy = button("Save as Copy…", () => { if (!deps.readOnly) void deps.saveCopy(history.present); });
  const saveButton = button("Save", () => { void (async () => { if (await save()) deps.close(); })(); });
  controls.push(copy, saveButton);
  function select(index: number, meta: boolean, shift: boolean) {
    const pages = history.present.pages; if (shift) { selected.clear(); for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i++) selected.add(pages[i].key); }
    else if (meta) { const key = pages[index].key; if (selected.has(key)) selected.delete(key); else selected.add(key); anchor = index; }
    else { selected = new Set([pages[index].key]); anchor = index; }
    focus = index; render(true);
  }
  function render(restoreFocus = false) {
    if (destroyed) return;
    focus = Math.max(0, Math.min(focus, history.present.pages.length - 1));
    selected = new Set(keys()); grid.replaceChildren();
    for (const [i, page] of history.present.pages.entries()) {
      const slot = make("div"), preview = make("div"), wrap = make("div"), label = make("div");
      slot.className = "pdf-organizer-slot"; slot.dataset.index = String(i); preview.className = "pdf-organizer-preview"; wrap.className = "pdf-organizer-thumb";
      preview.setAttribute("role", "option"); preview.setAttribute("aria-selected", String(selected.has(page.key))); preview.tabIndex = i === focus ? 0 : -1;
      const insert = page.source === "self" ? null : history.present.inserts.get(page.source);
      preview.setAttribute("aria-label", `Page ${i + 1}, ${insert ? `from ${insert.name}` : `original page ${page.index + 1}`}${page.rotation ? `, rotated ${page.rotation}°` : ""}`);
      preview.draggable = !deps.readOnly; wrap.style.transform = `rotate(${page.rotation}deg)`; if (page.rotation % 180) preview.classList.add("landscape");
      preview.append(wrap); slot.append(preview); thumbs.observe(wrap, page.key);
      label.textContent = `${i + 1}${!insert && page.index !== i ? ` (was ${page.index + 1})` : ""}`; slot.append(label);
      if (page.rotation) { const badge = make("span", `${page.rotation}°`); badge.className = "pdf-organizer-badge"; slot.append(badge); }
      if (insert) { const badge = make("span", insert.name); badge.className = "pdf-organizer-source"; badge.title = insert.path; slot.append(badge); }
      preview.onclick = e => select(i, e.metaKey || e.ctrlKey, e.shiftKey);
      preview.ondragstart = e => { if (!selected.has(page.key)) { selected = new Set([page.key]); } dragging = keys(); e.dataTransfer?.setData("text/plain", "pages"); };
      slot.ondragover = e => { e.preventDefault(); slot.classList.add("drop-before"); };
      slot.ondragleave = () => slot.classList.remove("drop-before");
      slot.ondrop = e => { e.preventDefault(); slot.classList.remove("drop-before"); if (dragging.length) action(() => apply(movePages(history.present, dragging, i))); dragging = []; };
      grid.append(slot);
    }
    const tail = make("div"); tail.className = "pdf-organizer-tail"; tail.dataset.index = String(history.present.pages.length);
    tail.ondragover = e => { e.preventDefault(); tail.classList.add("drop-before"); }; tail.ondragleave = () => tail.classList.remove("drop-before");
    tail.ondrop = e => { e.preventDefault(); tail.classList.remove("drop-before"); if (dragging.length) action(() => apply(movePages(history.present, dragging, history.present.pages.length))); dragging = []; }; grid.append(tail);
    counter.textContent = `${history.present.pages.length} pages · ${selected.size} selected · ${history.past.length} ${history.past.length === 1 ? "change" : "changes"}`;
    if (deps.readOnly) notify(deps.readOnly);
    for (const control of controls) control.el.disabled = !!deps.readOnly || control.disabled();
    if (restoreFocus) grid.querySelectorAll<HTMLElement>('[role="option"]')[focus]?.focus();
  }
  grid.onkeydown = e => {
    const pages = history.present.pages, mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (selected.size) { selected.clear(); render(true); } else void close(); return; }
    if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); selected = new Set(pages.map(p => p.key)); render(true); return; }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); action(() => { history = e.shiftKey ? historyRedo(history) : historyUndo(history); render(true); }); return; }
    if (mod && (e.key === "[" || e.key === "]")) { e.preventDefault(); action(() => rotate(e.key === "[" ? -90 : 90)); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); action(remove); return; }
    if (e.key === " ") { e.preventDefault(); select(focus, true, false); return; }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault(); if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { action(() => move(e.key === "ArrowLeft" ? -1 : 1)); return; }
      const columns = Math.max(1, Math.floor(grid.clientWidth / 140)); const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -columns : columns;
      const next = Math.max(0, Math.min(pages.length - 1, focus + step)); if (e.shiftKey) select(next, false, true); else { focus = next; anchor = next; render(true); }
    }
  };
  render();
  return { element, requestClose, destroy() { destroyed = true; thumbs.destroy(); element.remove(); }, dropFiles(paths, x, y) { const target = doc.elementFromPoint(x, y)?.closest<HTMLElement>("[data-index]"); const index = target && grid.contains(target) ? Number(target.dataset.index) : history.present.pages.length; void add(paths, index); } };
}
