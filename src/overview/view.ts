// The Project Overview tab (spec 4.4, mockup screen 6). Read-only except task checkboxes.
// Every name, title, summary and task text is set with textContent.
import "./overview.css";
import { counts } from "../review/format";
import { shortDate } from "../lifecycle/model";
import { overviewMarkdown, type OverviewTask, type ProjectOverview } from "./model";

export type OverviewDeps = {
  open: (path: string, line?: number) => void;
  toggle: (task: OverviewTask) => Promise<void>;
  copy: (markdown: string) => Promise<void>;
  openReview: () => void;
  today: string;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function renderOverview(host: HTMLElement, overview: ProjectOverview, deps: OverviewDeps): void {
  host.replaceChildren();
  let busy = false;
  const error = el("p", "", "overview-error");
  error.setAttribute("role", "alert");
  const boxes: HTMLInputElement[] = [];
  const link = (label: string, path: string, line?: number): HTMLButtonElement => {
    const button = el("button", label, "overview-link");
    button.type = "button";
    button.addEventListener("click", () => deps.open(path, line));
    return button;
  };
  const relative = (path: string): string => (path.startsWith(`${overview.folder}/`) ? path.slice(overview.folder.length + 1) : path);

  const header = el("header", undefined, "overview-header");
  const copy = el("button", "Copy as Markdown");
  copy.type = "button";
  copy.addEventListener("click", () => void deps.copy(overviewMarkdown(overview)));
  header.append(el("h1", overview.folder.split("/").pop() ?? overview.folder), copy);
  host.append(header, error);

  const section = (title: string, count: number, rows: HTMLElement[]): HTMLElement => {
    const box = el("section", undefined, "overview-section");
    const heading = el("h2", `${title} `);
    heading.append(el("span", String(count), "overview-count"));
    box.append(heading, ...(rows.length ? rows : [el("p", "None.", "overview-empty")]));
    return box;
  };
  const taskRow = (task: OverviewTask): HTMLElement => {
    const row = el("div", undefined, "overview-row overview-task");
    const check = el("input");
    check.type = "checkbox";
    check.checked = task.checked;
    check.setAttribute("aria-label", `Tick ${task.text}`);
    check.addEventListener("click", (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true; error.textContent = "";
      boxes.forEach((b) => { b.disabled = true; });
      deps.toggle(task)
        .catch((e: unknown) => { error.textContent = e instanceof Error ? e.message : "Could not change this task."; })
        .finally(() => { busy = false; boxes.forEach((b) => { b.disabled = false; }); });
    });
    boxes.push(check);
    const where = relative(task.path) + (task.heading ? ` › ${task.heading}` : "");
    row.append(check, link(task.text, task.path, task.line), el("small", where), el("span", task.due ? shortDate(task.due, deps.today) : "", "overview-date"));
    return row;
  };

  const keyRows = overview.keyDocs.map((doc) => {
    const row = el("div", undefined, "overview-row");
    row.append(link(doc.name, doc.path), el("span", doc.badge, `lifecycle-chip is-${doc.badge}`), el("small", doc.review));
    return row;
  });
  const decisionRows = overview.decisions.map((d) => {
    const row = el("div", undefined, "overview-row");
    row.append(link(d.title, d.path), el("span", d.date ? shortDate(d.date, deps.today) : "", "overview-date"), el("small", d.summary));
    return row;
  });
  const changedRows = overview.changed.map((item) => {
    const row = el("div", undefined, "overview-row");
    const absolute = overview.reviewRoot ? `${overview.reviewRoot}/${item.path}` : item.path;
    row.append(link(relative(absolute), absolute), el("small", item.state === "new" ? "(new)" : counts(item)));
    return row;
  });
  const review = el("button", "Open Review");
  review.type = "button";
  review.addEventListener("click", () => deps.openReview());
  const changed = section("Changed since review", overview.changed.length, changedRows);
  changed.append(review);

  host.append(
    section("Key documents", overview.keyDocs.length, keyRows),
    section("Decisions", overview.decisions.length, decisionRows),
    section("Open questions and blockers", overview.questions.length, overview.questions.map(taskRow)),
    section("Next actions", overview.next.length, overview.next.map(taskRow)),
    changed,
  );
}
