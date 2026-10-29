// Outline sidebar: the active note's headings as a foldable, filterable tree.
import { glyphs } from "./glyphs";
import type { OutlineHeading } from "./outline";

export function createOutlineView(host: HTMLElement, jump: (line: number) => void, escape: () => void, onTab: (tab: "outline" | "links" | "filter") => void = () => {}) {
  const header = document.createElement("div");
  header.className = "explorer-title outline-header";
  const title = document.createElement("span");
  const outlineTab = document.createElement("button"); outlineTab.textContent = "Outline";
  const linksTab = document.createElement("button"); linksTab.textContent = "Links";
  const filterTab = document.createElement("button"); filterTab.textContent = "Filter";
  title.className = "outline-tabs"; title.append(outlineTab, linksTab, filterTab);
  const linksHost = document.createElement("div"); linksHost.className = "links-panel"; linksHost.hidden = true;
  const filterHost = document.createElement("div"); filterHost.className = "filter-panel"; filterHost.hidden = true;
  function selectTab(tab: "outline" | "links" | "filter") {
    const links = tab === "links";
    const filtering = tab === "filter";
    filter.hidden = links || filtering; tree.hidden = links || filtering; actions.hidden = links || filtering; linksHost.hidden = !links; filterHost.hidden = !filtering;
    outlineTab.setAttribute("aria-pressed", String(tab === "outline")); linksTab.setAttribute("aria-pressed", String(links)); filterTab.setAttribute("aria-pressed", String(filtering));
    onTab(tab);
  }
  outlineTab.onclick = () => selectTab("outline"); linksTab.onclick = () => selectTab("links"); filterTab.onclick = () => selectTab("filter");
  const iconButton = (label: string, glyph: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ex-icon";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = glyphs[glyph];
    return button;
  };
  const collapse = iconButton("Collapse all", "collapseAll");
  const expand = iconButton("Expand all", "expandAll");
  const actions = document.createElement("div");
  actions.className = "outline-actions";
  actions.append(collapse, expand);
  header.append(title, actions);
  const filter = document.createElement("input");
  filter.placeholder = "Filter headings";
  filter.setAttribute("aria-label", "Filter headings");
  const tree = document.createElement("div");
  tree.className = "outline-tree";
  tree.setAttribute("role", "tree");
  host.append(header, filter, tree, linksHost, filterHost);
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
      const caret = document.createElement(children[i] ? "button" : "span");
      caret.className = "outline-caret";
      if (children[i]) {
        caret.tabIndex = -1;
        caret.textContent = folds().has(heading.line) && !query ? "▸" : "▾";
        caret.setAttribute("aria-label", "Toggle section");
        caret.addEventListener("click", (event) => { event.stopPropagation(); toggle(i); });
      }
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
    linksHost, filterHost, selectTab,
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
      // Scroll the list only: scrollIntoView would also scroll the sidebar and hide the header.
      const row = tree.querySelector<HTMLElement>(".outline-row.active");
      if (!row) return;
      const top = row.offsetTop - tree.offsetTop;
      if (top < tree.scrollTop) tree.scrollTop = top;
      else if (top + row.offsetHeight > tree.scrollTop + tree.clientHeight) tree.scrollTop = top + row.offsetHeight - tree.clientHeight;
    },
  };
}
