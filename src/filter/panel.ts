import type { LinkIndex } from "../links/index";
import { filterNotes, skippedNotes, type FilterModel } from "../properties/filter-query";
import { tagAncestors, tagKey } from "../properties/tags";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
export function createFilterPanel(host: HTMLElement, index: LinkIndex, open: (path: string) => void) {
  const model: FilterModel = { tags: [], rows: [], folder: null, mode: "all" };
  let active = false; let tagSearch = ""; let lastFolder: string | null = null;
  const collapsed = new Set<string>(); let collapseInitialized = false;
  function render() {
    if (!active) return;
    host.replaceChildren();
    if (lastFolder !== index.folder) { lastFolder = index.folder; model.tags = []; model.rows = []; model.folder = null; tagSearch = ""; collapsed.clear(); collapseInitialized = false; }
    if (!index.folder) { host.append(element("p", "Open a folder to filter notes.", "outline-empty")); return; }
    if (!index.ready) { host.append(element("p", "Indexing notes…", "outline-empty")); void index.ensure().catch(() => { if (active) host.replaceChildren(element("p", "Could not index notes.", "outline-empty")); }); return; }
    const notes = index.notes();
    const root = index.folder.replace(/\/$/, "");
    const relative = (path: string) => path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
    const tags = new Map<string, { name: string; count: number }>();
    for (const note of [...notes].sort((a, b) => a.path.localeCompare(b.path))) {
      const seen = new Set<string>();
      for (const tag of note.tags.flatMap(tagAncestors)) {
        const key = tagKey(tag); if (seen.has(key)) continue; seen.add(key);
        const existing = tags.get(key); if (existing) existing.count++; else tags.set(key, { name: tag, count: 1 });
      }
    }
    const parents = new Set<string>();
    for (const key of tags.keys()) for (const parent of tagAncestors(key).slice(0, -1)) parents.add(parent);
    if (!collapseInitialized) { for (const parent of parents) collapsed.add(parent); collapseInitialized = true; }
    const controls = element("div", "", "filter-controls"); const chips = element("div", "", "filter-chips");
    for (const chip of model.tags) {
      const button = element("button", `${chip.exclude ? "−" : "#"}${tags.get(chip.key)?.name ?? chip.key} ×`, "properties-chip"); button.type = "button";
      button.addEventListener("click", () => { model.tags.splice(model.tags.indexOf(chip), 1); render(); }); chips.append(button);
    }
    controls.append(chips);
    const search = element("input"); search.placeholder = "Filter tags"; search.setAttribute("aria-label", "Filter tags"); search.value = tagSearch;
    const tagList = element("div", "", "filter-tags");
    function renderTags() {
      tagList.replaceChildren();
      for (const [key, tag] of [...tags].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!key.includes(tagSearch.toLowerCase())) continue;
        if (!tagSearch && tagAncestors(key).slice(0, -1).some(parent => collapsed.has(parent))) continue;
        const button = element("button", `${tag.name}  ${tag.count}`, "filter-tag"); button.type = "button";
        button.style.paddingInlineStart = `${8 + (tag.name.split("/").length - 1) * 12}px`;
        button.title = "Click to include; Shift-click to exclude";
        button.addEventListener("click", event => { if (!model.tags.some(t => t.key === key)) model.tags.push({ key, exclude: event.shiftKey }); render(); });
        if (parents.has(key)) {
          const toggle = element("button", collapsed.has(key) ? "▸" : "▾"); toggle.type = "button"; toggle.setAttribute("aria-label", `Toggle ${tag.name}`);
          toggle.addEventListener("click", () => { if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); renderTags(); }); tagList.append(toggle);
        }
        tagList.append(button);
      }
    }
    search.addEventListener("input", () => { tagSearch = search.value; renderTags(); }); renderTags(); controls.append(search, tagList);
    const keys = [...new Set(notes.flatMap(n => Object.keys(n.properties ?? {})))].sort();
    for (const row of model.rows) {
      const line = element("div", "", "filter-row");
      const key = element("select"); key.setAttribute("aria-label", "Property");
      for (const name of keys) { const option = element("option", name); option.value = name; key.append(option); } key.value = row.key;
      const op = element("select"); op.setAttribute("aria-label", "Operator");
      for (const name of ["is", "contains", "before", "after", "is set"] as const) { const option = element("option", name); option.value = name; op.append(option); } op.value = row.op;
      const value = element("input"); value.setAttribute("aria-label", "Value"); value.type = row.op === "before" || row.op === "after" ? "date" : "text"; value.value = row.value; value.hidden = row.op === "is set";
      key.addEventListener("change", () => { row.key = key.value; renderResults(); });
      op.addEventListener("change", () => { row.op = op.value as typeof row.op; value.type = row.op === "before" || row.op === "after" ? "date" : "text"; value.hidden = row.op === "is set"; renderResults(); });
      value.addEventListener("input", () => { row.value = value.value; renderResults(); });
      const remove = element("button", "×"); remove.type = "button"; remove.setAttribute("aria-label", "Remove property filter"); remove.addEventListener("click", () => { model.rows.splice(model.rows.indexOf(row), 1); render(); });
      line.append(key, op, value, remove); controls.append(line);
    }
    const add = element("button", "+ property"); add.type = "button"; add.disabled = keys.length === 0;
    add.addEventListener("click", () => { model.rows.push({ key: keys[0], op: "is", value: "" }); render(); }); controls.append(add);
    const mode = element("select"); mode.setAttribute("aria-label", "Match");
    for (const v of ["all", "any"] as const) { const option = element("option", v); option.value = v; mode.append(option); } mode.value = model.mode;
    mode.addEventListener("change", () => { model.mode = mode.value as "all" | "any"; renderResults(); });
    const folder = element("select"); folder.setAttribute("aria-label", "Folder"); const all = element("option", "All folders"); all.value = ""; folder.append(all);
    const folders = new Set<string>();
    for (const note of notes) { const parts = relative(note.path).split("/"); parts.pop(); while (parts.length) { folders.add(parts.join("/")); parts.pop(); } }
    for (const name of [...folders].sort()) { const option = element("option", name); option.value = `${root}/${name}`; folder.append(option); } folder.value = model.folder ?? "";
    folder.addEventListener("change", () => { model.folder = folder.value || null; renderResults(); });
    controls.append(mode, folder); host.append(controls);
    const results = element("div", "", "filter-results"); host.append(results);
    function renderResults() {
      results.replaceChildren(); const matches = filterNotes(notes, model);
      results.append(element("h4", `${matches.length} note${matches.length === 1 ? "" : "s"} · ${model.tags.length} tags on`));
      if (!matches.length) { const clear = element("button", "No notes match. Clear filter"); clear.type = "button"; clear.addEventListener("click", () => { model.tags = []; model.rows = []; model.folder = null; render(); }); results.append(clear); }
      for (const note of matches) {
        const button = element("button", "", "link-panel-row"); button.type = "button";
        button.append(element("strong", note.path.split("/").pop()?.replace(/\.(md|markdown)$/i, "") ?? ""), element("small", relative(note.path)));
        const meta = element("span", "", "filter-result-meta");
        for (const tag of note.tags) if (model.tags.some(t => !t.exclude && tagAncestors(tag).some(a => tagKey(a) === t.key))) meta.append(element("span", tag, "properties-chip"));
        for (const row of model.rows) { const value = note.properties?.[row.key]; if (value !== undefined && value !== null) meta.append(element("span", String(value), "properties-chip")); }
        button.append(meta); button.addEventListener("click", () => open(note.path)); results.append(button);
      }
      for (const skipped of skippedNotes(notes)) results.append(element("p", `${relative(skipped.path)}: ${skipped.message} (line ${skipped.line})`, "link-panel-note"));
    }
    renderResults();
  }
  index.subscribe(render);
  return { render, async show(on: boolean) { active = on; host.hidden = !on; if (!on) return; render(); try { await index.ensure(); render(); } catch { host.replaceChildren(element("p", "Could not index notes.", "outline-empty")); } } };
}
