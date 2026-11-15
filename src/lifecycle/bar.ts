// The Reading view bar for a replaced or overdue document (spec 4.1, mockup screen 5).
// Note names and paths are set with textContent.
import { reviewDue, shortDate, type Lifecycle } from "./model";

/** targetInFolder false: superseded_by is not a note in the open folder (a web address, a
 * path outside), so the bar shows it whole instead of its last segment. */
export type LifecycleBarInput = { lifecycle: Lifecycle; today: string; leftOutOfAI: boolean; targetInFolder?: boolean };
export type LifecycleBarDeps = { open: (target: string) => void };

const lastSegment = (target: string): string => target.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() || target;

/** null or nothing to show → host emptied and hidden. */
export function renderLifecycleBar(host: HTMLElement, input: LifecycleBarInput | null, deps: LifecycleBarDeps): void {
  host.replaceChildren();
  const doc = host.ownerDocument;
  const lines: HTMLElement[] = [];
  if (input?.lifecycle.status === "superseded") {
    const line = doc.createElement("div");
    line.className = "lifecycle-line is-superseded";
    const target = input.lifecycle.supersededBy;
    const text = doc.createElement("span");
    text.textContent = target ? `Superseded by ${input.targetInFolder === false ? target : lastSegment(target)}` : "Superseded";
    line.append(text);
    if (target) {
      const open = doc.createElement("button");
      open.type = "button";
      open.textContent = "Open";
      open.addEventListener("click", () => deps.open(target));
      line.append(open);
    }
    if (input.leftOutOfAI) {
      const note = doc.createElement("small");
      note.textContent = "Left out of AI folder search";
      line.append(note);
    }
    lines.push(line);
  }
  if (input && reviewDue(input.lifecycle.reviewBy, input.today)) {
    const line = doc.createElement("div");
    line.className = "lifecycle-line is-due";
    line.textContent = `Review was due ${shortDate(input.lifecycle.reviewBy!, input.today)}`;
    lines.push(line);
  }
  host.append(...lines);
  host.hidden = lines.length === 0;
}
