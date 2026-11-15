import type { LinkIndex } from "../links/index";
import { inboxTasks, type InboxTask, type InboxFilter } from "./model";
import { organizeSheet, node, field, action } from "../notes/sheet";
import { dueGroup, DUE_LABELS, type DueGroup } from "./dates";
import { localToday, shortDate } from "../lifecycle/model";

const GROUP_ORDER: DueGroup[] = ["overdue", "today", "week", "later", "none"];

export function showTaskInbox(host: HTMLElement, deps: { index: LinkIndex; folder: () => string | null; open: (task: InboxTask) => Promise<void>; toggle: (task: InboxTask) => Promise<void>; today?: () => string }) {
  const sheet = organizeSheet(host, "Tasks in folder");
  const filter: InboxFilter = { state: "incomplete", tag: "", folder: "" };
  const status = node("p"); status.setAttribute("role", "status");
  const error = node("p"); error.className = "organize-error"; error.setAttribute("role", "alert");
  const state = node("select"); for (const [value, text] of [["incomplete", "Incomplete"], ["all", "All"], ["completed", "Completed"]]) { const o = node("option", text); o.value = value; state.append(o); }
  const tag = node("input"); tag.placeholder = "Any tag";
  const folder = node("input"); folder.placeholder = "Any subfolder (relative path)";
  const list = node("div");
  let busy = false, token = 0;
  const render = () => {
    if (sheet.closed) return;
    const root = deps.folder();
    if (!root) { list.replaceChildren(); status.textContent = "Open a folder to see its tasks."; return; }
    filter.folder = folder.value.trim() ? `${root}/${folder.value.trim().replace(/^\/+|\/+$/g, "")}` : "";
    const tasks = inboxTasks(deps.index.notes(), filter);
    list.replaceChildren();
    const today = (deps.today ?? localToday)();
    const groups = new Map<DueGroup, InboxTask[]>(GROUP_ORDER.map(g => [g, []]));
    for (const task of tasks) groups.get(dueGroup(task.due, today))!.push(task);
    status.textContent = `${tasks.length} tasks${deps.index.skipped.length ? ` · ${deps.index.skipped.length} files skipped` : ""}`;
    if (!tasks.length) list.append(node("p", "No matching tasks. Change the filter or add a Markdown checkbox."));
    for (const [group, members] of groups) {
      if (!members.length) continue;
      members.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "") || a.path.localeCompare(b.path) || a.line - b.line);
      list.append(node("h3", `${DUE_LABELS[group]} · ${members.length}`));
      for (const task of members) {
      const row = node("div"); row.className = "organize-task-row";
      const check = node("input"); check.type = "checkbox"; check.checked = task.checked; check.disabled = busy; check.setAttribute("aria-label", `Toggle ${task.text}`);
      check.addEventListener("change", () => { check.checked = task.checked; void toggle(task); });
      const text = node("span", task.text);
      const where = task.path.slice(root.length + 1) + (task.heading ? ` › ${task.heading}` : "");
      text.append(node("small", where));
      const due = node("span", task.due ? shortDate(task.due, today) : ""); due.className = "organize-task-due";
      row.append(check, text, due, action("Open", () => { sheet.close(); void deps.open(task); })); list.append(row);
      }
    }
  };
  const toggle = async (task: InboxTask) => {
    if (busy) return; busy = true; error.textContent = ""; render();
    try { await deps.toggle(task); } catch (e) { error.textContent = e instanceof Error ? e.message : "Could not change this task."; }
    finally { busy = false; render(); }
  };
  const refresh = async () => {
    const request = ++token; status.textContent = "Reading folder tasks…";
    try { await deps.index.ensure(deps.folder()); await deps.index.refresh(); if (request === token) render(); }
    catch { if (!sheet.closed) error.textContent = "Could not read folder tasks. Try Refresh."; }
  };
  state.addEventListener("change", () => { filter.state = state.value as InboxFilter["state"]; render(); });
  tag.addEventListener("input", () => { filter.tag = tag.value.trim().replace(/^#/, ""); render(); });
  folder.addEventListener("input", render);
  sheet.body.append(field("Show", state), field("Tag", tag), field("Folder", folder), action("Refresh", () => void refresh()), status, error, list, node("p", "Ticking a task in an open note changes it there; use Undo in that note. A closed note is saved after a Recovery snapshot."));
  sheet.cleanup(deps.index.subscribe(render)); sheet.cleanup(() => { token++; });
  void refresh(); return sheet;
}
