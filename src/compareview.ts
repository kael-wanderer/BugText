import { lineDiff, type DiffLine } from "./ai/diff";

export type ComparisonRow = {
  left: DiffLine | null;
  right: DiffLine | null;
};

export function comparisonRows(leftText: string, rightText: string): ComparisonRow[] {
  const diff = lineDiff(leftText, rightText);
  const rows: ComparisonRow[] = [];
  let index = 0;
  while (index < diff.length) {
    const line = diff[index];
    if (line.type === "same") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const deleted: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < diff.length && diff[index].type !== "same") {
      const changed = diff[index];
      if (changed.type === "del") deleted.push(changed);
      else added.push(changed);
      index += 1;
    }
    const count = Math.max(deleted.length, added.length);
    for (let row = 0; row < count; row += 1) {
      rows.push({
        left: deleted[row] ?? null,
        right: added[row] ?? null,
      });
    }
  }
  return rows;
}

export function showComparison(
  host: HTMLElement,
  left: { name: string; path: string; text: string },
  right: { name: string; path: string; text: string },
  actions?: { label: string; primary?: boolean; run: () => void }[],
): void {
  host.querySelector(".compare-view")?.remove();
  const view = document.createElement("section");
  view.className = "compare-view";
  view.innerHTML = `
    <header class="compare-header">
      <div><strong></strong><small></small></div>
      <span>compared with</span>
      <div><strong></strong><small></small></div>
      <button type="button" aria-label="Close comparison">×</button>
    </header>
    <div class="compare-columns">
      <div class="compare-column compare-left"></div>
      <div class="compare-column compare-right"></div>
    </div>`;
  const headers = view.querySelectorAll<HTMLElement>(".compare-header > div");
  headers[0].querySelector("strong")!.textContent = left.name;
  headers[0].querySelector("small")!.textContent = left.path;
  headers[1].querySelector("strong")!.textContent = right.name;
  headers[1].querySelector("small")!.textContent = right.path;
  const leftColumn = view.querySelector<HTMLElement>(".compare-left")!;
  const rightColumn = view.querySelector<HTMLElement>(".compare-right")!;

  for (const row of comparisonRows(left.text, right.text)) {
    for (const [column, line] of [
      [leftColumn, row.left],
      [rightColumn, row.right],
    ] as const) {
      const element = document.createElement("div");
      element.className = `compare-line ${line?.type ?? "blank"}`;
      element.textContent = line?.text ?? "";
      column.appendChild(element);
    }
  }
  const syncScroll = (source: HTMLElement, target: HTMLElement): void => {
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
  };
  leftColumn.addEventListener("scroll", () => syncScroll(leftColumn, rightColumn));
  rightColumn.addEventListener("scroll", () => syncScroll(rightColumn, leftColumn));
  view.querySelector("button")!.addEventListener("click", () => { view.remove(); actions?.find((action) => action.label === "Close")?.run(); });
  if (actions) {
    const footer = document.createElement("footer");
    footer.className = "compare-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.primary) button.className = "primary";
      button.addEventListener("click", () => { view.remove(); action.run(); });
      footer.append(button);
    }
    view.append(footer);
  }
  host.appendChild(view);
}
