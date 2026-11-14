import { counts, shortDate } from "./format";
import type { Changes } from "./changes";
import type { ReviewAction, ReviewItem } from "./types";

export type ReviewBarDeps = {
  mark(action: ReviewAction): Promise<void>;
  showDiff(): void; explain(): void;
  step(direction: 1 | -1): void;
  canExplain(): boolean; dirty(): boolean;
  /** Number of marked blocks in the reading view; 0 hides Previous and Next. */
  marks?(): number;
};

export function barText(item: ReviewItem, changes: Changes | null, sections: number): string {
  if (item.reviewedAt === null) return "New file · not reviewed yet";
  const date = shortDate(item.reviewedAt);
  if (item.baseline) return `Changed since tracking began on ${date} · No reviewed version yet`;
  const parts = [`Changed since you reviewed it on ${date}`];
  if (sections > 0) parts.push(`${sections} section${sections === 1 ? "" : "s"}`);
  if (changes) parts.push(counts(changes));
  return parts.join(" · ");
}

function button(text: string, onClick: () => void, className = "review-btn"): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = text;
  node.addEventListener("click", onClick);
  return node;
}

/** The bar above a queued note in Reading view. A null item empties the host. */
export function renderReviewBar(host: HTMLElement, item: ReviewItem | null, changes: Changes | null, sections: number, deps: ReviewBarDeps): void {
  if (!item) { host.replaceChildren(); host.hidden = true; return; }
  const text = document.createElement("div");
  text.className = "review-bar-text";
  text.textContent = barText(item, changes, sections);
  const actions = document.createElement("div");
  actions.className = "review-bar-actions";
  if ((deps.marks?.() ?? 0) > 0) {
    actions.append(button("‹ Previous change", () => deps.step(-1)), button("Next change ›", () => deps.step(1)));
  }
  const diff = button("Show diff", () => deps.showDiff());
  if (!item.hasText) { diff.disabled = true; diff.title = "No reviewed version yet"; }
  actions.append(diff);
  if (item.hasText && deps.canExplain()) actions.append(button("Explain changes", () => deps.explain()));
  const spacer = document.createElement("span");
  spacer.className = "review-bar-space";
  const mark = button("Mark reviewed", () => void deps.mark("reviewed"), "review-btn review-primary");
  if (deps.dirty()) { mark.disabled = true; mark.title = "Save your changes first"; }
  else mark.title = "Records that you have read this version. It does not check facts.";
  actions.append(spacer, button("Later", () => void deps.mark("later")), mark);
  host.replaceChildren(text, actions);
  host.hidden = false;
}
