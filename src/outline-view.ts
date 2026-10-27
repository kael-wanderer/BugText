import type { OutlineHeading } from "./outline";

export function createOutlineView(host: HTMLElement, jump: (line: number) => void, escape: () => void) {
  const header = document.createElement("div");
  header.className = "outline-header";
  const title = document.createElement("span");
  title.textContent = "OUTLINE";
  const collapse = document.createElement("button");
  collapse.title = collapse.ariaLabel = "Collapse all";
  collapse.textContent = "−";
  const expand = document.createElement("button");
  expand.title = expand.ariaLabel = "Expand all";
  expand.textContent = "+";
  header.append(title, collapse, expand);
  const filter = document.createElement("input");
  filter.placeholder = "Filter headings";
  filter.setAttribute("aria-label", "Filter headings");
  const tree = document.createElement("div");
  tree.className = "outline-tree";
  tree.setAttribute("role", "tree");
  host.append(header, filter, tree);
  const collapsed = new Map<string, Set<number>>();
  let key = "";
  let headings: OutlineHeading[] = [];
  let markdown = true;
  let active = -1;
  let parents: number[] = [];
  let children: boolean[] = [];
  const folds = () => {
    if (!collapsed.has(key)) collapsed.set(key, new Set());
    return collapsed.get(key)!;
  };
  function render(): void {
    tree.replaceChildren();
    if (!markdown || !headings.length) {
      const empty = document.createElement("p");
      empty.className = "outline-empty";
      empty.textContent = markdown ? "No headings yet. Lines starting with # appear here." : "Outline is available for Markdown notes.";
      tree.append(empty);
      return;
    }
    const query = filter.value.trim().toLocaleLowerCase();
    const matches = new Set<number>();
    headings.forEach((heading, i) => {
      if (query && heading.text.toLocaleLowerCase().includes(query)) {
        for (let n = i; n >= 0; n = parents[n]) matches.add(n);
      }
    });
    headings.forEach((heading, i) => {
      if (query && !matches.has(i)) return;
      if (!query) {
        for (let n = parents[i]; n >= 0; n = parents[n]) if (folds().has(headings[n].line)) return;
      }
      const row = document.createElement("div");
      row.className = "outline-row";
      row.classList.toggle("active", i === active);
      row.style.paddingInlineStart = `${8 + (heading.level - 1) * 14}px`;
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", String(heading.level));
      row.tabIndex = 0;
      row.dataset.index = String(i);
      if (children[i]) row.setAttribute("aria-expanded", String(!folds().has(heading.line)));
      const caret = document.createElement("button");
      caret.className = "outline-caret";
      caret.tabIndex = -1;
      caret.textContent = children[i] ? (folds().has(heading.line) && !query ? "▸" : "▾") : "";
      caret.setAttribute("aria-label", "Toggle section");
      caret.addEventListener("click", (event) => { event.stopPropagation(); toggle(i); });
      const text = document.createElement("span");
      text.textContent = heading.text;
      row.append(caret, text);
      row.addEventListener("click", () => jump(heading.line));
      tree.append(row);
    });
  }
  function toggle(index: number): void {
    if (!children[index]) return;
    const line = headings[index].line;
    if (folds().has(line)) folds().delete(line); else folds().add(line);
    render();
    tree.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
  }
  collapse.addEventListener("click", () => { headings.forEach((h, i) => { if (children[i]) folds().add(h.line); }); render(); });
  expand.addEventListener("click", () => { folds().clear(); render(); });
  filter.addEventListener("input", render);
  host.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { escape(); event.preventDefault(); return; }
    const row = (event.target as HTMLElement).closest<HTMLElement>(".outline-row");
    if (!row) return;
    const index = Number(row.dataset.index);
    const rows = [...tree.querySelectorAll<HTMLElement>(".outline-row")];
    const position = rows.indexOf(row);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") rows[position + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
    else if (event.key === "ArrowLeft" && children[index] && !folds().has(headings[index].line)) toggle(index);
    else if (event.key === "ArrowRight" && children[index] && folds().has(headings[index].line)) toggle(index);
    else if (event.key === "Enter") jump(headings[index].line);
    else return;
    event.preventDefault();
  });
  return {
    update(documentKey: string, items: OutlineHeading[], isMarkdown: boolean) {
      key = documentKey; headings = items; markdown = isMarkdown;
      parents = []; children = Array(items.length).fill(false);
      const stack: number[] = [];
      items.forEach((h, i) => {
        while (stack.length && items[stack[stack.length - 1]].level >= h.level) stack.pop();
        parents[i] = stack[stack.length - 1] ?? -1;
        if (parents[i] >= 0) children[parents[i]] = true;
        stack.push(i);
      });
      render();
    },
    setActive(line: number) {
      let next = -1;
      headings.forEach((h, i) => { if (h.line <= line) next = i; });
      if (next === active) return;
      active = next; render();
      tree.querySelector<HTMLElement>(".outline-row.active")?.scrollIntoView?.({ block: "nearest" });
    },
  };
}
