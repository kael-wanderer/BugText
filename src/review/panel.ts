import { showToast } from "../toast";
import { ago, counts, routeLabel } from "./format";
import type { ReviewAction, ReviewItem, ReviewSnapshot, ReviewState } from "./types";

export type ReviewPanelDeps = {
  open(relativePath: string): void;
  mark(action: ReviewAction, paths: string[]): Promise<string[]>;
  confirm(message: string): Promise<boolean>;
  reset(): Promise<void>;
  now(): number;
  /** Why there is no snapshot when there is no error either. */
  reason?(): "no-folder" | "off" | null;
};

const GROUPS: [ReviewState, string][] = [["changed", "Changed"], ["new", "New"], ["later", "Later"]];
const MARK_TITLE = "Records that you have read this version. It does not check facts.";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(text: string, onClick: () => void, className = "review-btn"): HTMLButtonElement {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", event => { event.stopPropagation(); onClick(); });
  return node;
}

const split = (path: string): [string, string] => {
  const at = path.lastIndexOf("/");
  return at < 0 ? ["", path] : [path.slice(0, at + 1), path.slice(at + 1)];
};

/** The Review sidebar. Every name is set with textContent. */
export function createReviewPanel(host: HTMLElement, deps: ReviewPanelDeps) {
  host.classList.add("review-panel");

  async function act(action: ReviewAction, paths: string[]): Promise<void> {
    const stale = await deps.mark(action, paths);
    if (stale.length) {
      const n = stale.length;
      showToast(`${n} file${n === 1 ? "" : "s"} changed again and ${n === 1 ? "was" : "were"} not marked.`);
    }
  }

  async function markAll(items: ReviewItem[]): Promise<void> {
    const n = items.length;
    if (!(await deps.confirm(`Mark ${n} file${n === 1 ? "" : "s"} as reviewed? This records that you have read them.`))) return;
    await act("reviewed", items.map(i => i.path));
  }

  function row(item: ReviewItem): HTMLElement {
    const [dir, name] = split(item.path);
    const node = el("div", `review-row review-${item.state}`);
    node.tabIndex = 0;
    node.dataset.path = item.path;
    node.addEventListener("click", () => deps.open(item.path));
    node.addEventListener("keydown", event => {
      if (event.target === node && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); deps.open(item.path); }
    });
    const meta = el("div", "review-meta");
    meta.append(el("span", "review-dir", dir), el("span", "review-ago", ago(item.changedAt, deps.now())));
    const count = counts(item);
    if (count) meta.append(el("span", "review-counts", count));
    meta.append(el("span", "review-route", routeLabel(item.route)));
    const mark = button("Mark reviewed", () => void act("reviewed", [item.path]), "review-btn review-primary");
    mark.title = MARK_TITLE;
    mark.setAttribute("aria-label", `Mark reviewed: ${name}`);
    const later = item.state === "later"
      ? button("Move back", () => void act("restore", [item.path]))
      : button("Later", () => void act("later", [item.path]));
    later.setAttribute("aria-label", `${later.textContent}: ${name}`);
    const dismiss = button("Dismiss", () => void act("dismiss", [item.path]));
    dismiss.setAttribute("aria-label", `Dismiss: ${name}`);
    const actions = el("div", "review-actions");
    actions.append(mark, later, dismiss);
    node.append(el("div", "review-name", name), meta, actions);
    return node;
  }

  function message(text: string): HTMLElement { return el("p", "review-empty", text); }

  function render(snapshot: ReviewSnapshot | null, error: string | null): void {
    const header = el("div", "review-header");
    header.append(el("h3", "review-title", "Review"));
    const body = el("div", "review-body");
    if (error) {
      body.append(message(error), button("Reset Review Data…", async () => {
        if (await deps.confirm("Start over? Every note is treated as reviewed from now. The old review data is kept as a backup file.")) await deps.reset();
      }));
    } else if (!snapshot) {
      body.append(message(deps.reason?.() === "off"
        ? "The review queue is off. Turn it on in Settings ▸ General."
        : "Open a folder to see what changed."));
    } else if (snapshot.items.length === 0) {
      body.append(message("Nothing to review. Notes changed by an AI tool or another app appear here."));
    } else {
      header.append(button("Mark All Reviewed…", () => void markAll(snapshot.items), "review-btn review-link"));
      for (const [state, title] of GROUPS) {
        const items = snapshot.items.filter(i => i.state === state);
        if (!items.length) continue;
        const group = el("section", "review-group");
        group.append(el("h4", "review-group-title", `${title} · ${items.length}`), ...items.map(row));
        body.append(group);
      }
    }
    host.replaceChildren(header, body);
  }

  return {
    render,
    focus(): void { (host.querySelector<HTMLElement>(".review-row, .review-body button") ?? host).focus(); },
  };
}
