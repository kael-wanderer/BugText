import { searchEmpty } from "./empty-states/views";
import { createSearchPreview, resolveHitLine } from "./search-preview";
import { looksLikePath, searchFileMatches, type FileMatches } from "./search-files";
import {
  searchInFolder,
  type SearchHit,
  type SearchOptions,
} from "./filesys";
import { invoke } from "@tauri-apps/api/core";
import { SearchRun, searchOperatorFiles } from "./search-run";
import { hasOperators, hasMetadataOperators, parseSearchOperators, pathMatches } from "./search-operators";
import type { LinkIndex } from "./links/index";
import { searchPdf } from "./pdf-search";
import { firstSearchMatch, searchExpression } from "./search-match";
import { filterByGlobs, type ReplacePreview } from "./replace/plan";

export type SearchPanel = {
  focus: () => void;
  focusReplace: () => void;
  refresh: () => void;
  cancel: () => void;
  getQuery: () => string;
  setQuery: (query: string) => void;
};

export type SearchPanelDeps = {
  getFolder: () => string | null;
  getFiles: () => string[];
  index?: LinkIndex;
  previewReplace?: (query: string, replacement: string, options: SearchOptions, files: string[]) => Promise<ReplacePreview>;
  onReplacePreview?: (preview: ReplacePreview, query: string, replacement: string, options: SearchOptions) => void;
  /** `match` is the matched text, selected on the line after opening. */
  onOpenHit: (path: string, line: number, page?: number, match?: string) => void;
  /** Opens a folder-relative path, confined to the folder; works for files the scan left out. */
  onOpenFile?: (relative: string) => void;
  /** Right-click on a result: `open` is what a click does; `line` is set for a content hit. */
  onResultMenu?: (x: number, y: number, target: { path: string; relative: string; line?: number; open: () => void }) => void;
  /** Shows every file match, in the palette. */
  onShowAllFiles?: (query: string) => void;
  readPreview?: (path: string) => Promise<string>;
  onOpenBeside?: (path: string, line: number, page?: number) => void;
};

export function createSearchPanel(
  host: HTMLElement,
  deps: SearchPanelDeps,
): SearchPanel {
  host.innerHTML = `
    <div class="search-title"><span>SEARCH</span></div>
    <div class="search-input-row">
      <button type="button" class="search-replace-toggle" aria-label="Toggle Replace" aria-expanded="false">▸</button>
      <input class="search-input" type="text" placeholder="Search in folder…" spellcheck="false" />
      <button type="button" class="search-option" data-option="caseSensitive" title="Match case" aria-label="Match case" aria-pressed="false">Aa</button>
      <button type="button" class="search-option" data-option="wholeWord" title="Match whole word" aria-label="Match whole word" aria-pressed="false">ab</button>
      <button type="button" class="search-option" data-option="regex" title="Use regular expression" aria-label="Use regular expression" aria-pressed="false">.*</button>
    </div>
    <div class="search-replace-fields" hidden>
      <input class="search-replacement search-input" placeholder="Replace" aria-label="Replace" />
      <div class="search-group-error search-error" role="alert"></div>
      <input class="search-include search-input" placeholder="Files to include" aria-label="Files to include" />
      <input class="search-exclude search-input" placeholder="Files to exclude" aria-label="Files to exclude" />
      <button type="button" class="search-preview-replace">Preview replace…</button>
    </div>
    <div class="search-progress" hidden></div>
    <div class="search-status"></div>
    <div class="search-notes"></div>
    <div class="search-results"></div>`;
  const input = host.querySelector<HTMLInputElement>(".search-input")!;
  const toggle = host.querySelector<HTMLButtonElement>(".search-replace-toggle")!;
  const fields = host.querySelector<HTMLElement>(".search-replace-fields")!;
  const replacement = host.querySelector<HTMLInputElement>(".search-replacement")!;
  const include = host.querySelector<HTMLInputElement>(".search-include")!;
  const exclude = host.querySelector<HTMLInputElement>(".search-exclude")!;
  const groupError = host.querySelector<HTMLElement>(".search-group-error")!;
  const previewButton = host.querySelector<HTMLButtonElement>(".search-preview-replace")!;
  let replaceOpen = false, groupValid = false, previewBusy = false, message = "";
  const updateButton = () => { previewButton.disabled = !replaceOpen || !input.value.trim() || state.phase === "text" || state.phase === "pdf" || state.phase === "error" || !groupValid || previewBusy; };
  const setReplaceOpen = (open: boolean) => { replaceOpen = open; fields.hidden = !open; toggle.textContent = open ? "▾" : "▸"; toggle.setAttribute("aria-expanded", String(open)); };
  const status = host.querySelector<HTMLElement>(".search-status")!;
  const results = host.querySelector<HTMLElement>(".search-results")!;
  const progress = host.querySelector<HTMLElement>(".search-progress")!;
  const notes = host.querySelector<HTMLElement>(".search-notes")!;
  const previewHost = document.createElement("section"); previewHost.className = "search-preview"; previewHost.hidden = true; host.append(previewHost);
  const preview = createSearchPreview(previewHost, { read: deps.readPreview, open: deps.onOpenHit, openBeside: deps.onOpenBeside });
  let selectedKey = ""; const hitKey = (hit: SearchHit) => `${hit.path}:${hit.page ?? ""}:${hit.line}`;
  // Outside Replace, rows open on one click; `selectedKey` is the keyboard selection, `lastOpenedKey` marks where you left off.
  let fileMatches: FileMatches = { query: "", rows: [], total: 0 };
  let lastOpenedKey = "", lastQuery = "";
  const collapsed = new Set<string>();
  const openers = new Map<string, () => void>();
  const rowKeys = (): string[] => [...results.querySelectorAll<HTMLElement>("[data-row-key]")].map(row => row.dataset.rowKey!);
  const currentKey = (): string => { const keys = rowKeys(); return keys.includes(selectedKey) ? selectedKey : keys[0] ?? ""; };
  function markSelection(): void {
    const key = replaceOpen ? "" : currentKey();
    for (const row of results.querySelectorAll<HTMLElement>("[data-row-key]")) {
      row.classList.toggle("selected", row.dataset.rowKey === key);
      row.classList.toggle("last-opened", row.dataset.rowKey === lastOpenedKey);
    }
  }
  function openKey(key: string): boolean {
    const open = openers.get(key); if (!open) return false;
    selectedKey = key; lastOpenedKey = key; markSelection(); open(); return true;
  }
  function moveSelection(step: number): void {
    const keys = rowKeys(); if (!keys.length) return;
    const index = keys.indexOf(currentKey());
    selectedKey = keys[Math.max(0, Math.min(keys.length - 1, index + step))];
    markSelection();
    [...results.querySelectorAll<HTMLElement>("[data-row-key]")].find(row => row.dataset.rowKey === selectedKey)?.scrollIntoView?.({ block: "nearest" });
  }
  async function openHit(hit: SearchHit, match: string): Promise<void> {
    if (hit.page || !deps.readPreview) { deps.onOpenHit(hit.path, hit.line, hit.page, match); return; }
    let line: number | null = null;
    try { line = resolveHitLine(await deps.readPreview(hit.path), hit); } catch { line = null; }
    if (line === null) { message = "This result changed since the search. Search again to open it."; render(lastQuery); return; }
    deps.onOpenHit(hit.path, line, undefined, match);
  }
  let state = new SearchRun();
  let timer: number | undefined;
  let token = 0;
  let cancellation = Promise.resolve();
  const options: SearchOptions = {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  };

  function cancel(): void {
    window.clearTimeout(timer);
    ++token; preview.clear();
    cancellation = cancellation.then(() => invoke<void>("search_cancel")).catch(() => {});
  }

  function render(query: string): void {
    const scrollTop = results.scrollTop;
    results.replaceChildren();
    status.classList.toggle("search-error", state.phase === "error");
    if (state.phase === "error") status.setAttribute("role", "alert"); else status.removeAttribute("role");
    input.setAttribute("aria-invalid", String(state.phase === "error"));
    notes.replaceChildren();
    updateButton();
    if (replaceOpen) { const note = document.createElement("div"); note.className = "search-note"; note.textContent = "Replace searches text files only."; notes.append(note); }
    if (message) { const note = document.createElement("div"); note.className = "search-note search-error"; note.textContent = message; notes.append(note); }
    for (const text of state.notes) {
      const note = document.createElement("div"); note.className = "search-note"; note.textContent = text; notes.append(note);
    }
    openers.clear();
    if (!replaceOpen && fileMatches.rows.length) results.append(filesGroup());
    const groups = new Map<string, SearchHit[]>();
    const allowed = new Set(filterByGlobs(state.hits.map(hit => hit.relative), include.value, exclude.value));
    for (const hit of state.hits) { if (replaceOpen && !allowed.has(hit.relative)) continue; const list = groups.get(hit.relative); if (list) list.push(hit); else groups.set(hit.relative, [hit]); }
    status.textContent = state.statusFor([...groups.values()].flat());
    if (!replaceOpen && groups.size) {
      const heading = document.createElement("div"); heading.className = "search-section";
      heading.textContent = "In files"; results.append(heading);
    }
    for (const [relative, fileHits] of groups) {
      const group = document.createElement("div");
      group.className = "search-group";
      const head = document.createElement(replaceOpen ? "div" : "button");
      head.className = "search-file";
      head.title = relative;
      const folded = !replaceOpen && collapsed.has(relative);
      if (!replaceOpen) {
        const twisty = document.createElement("span"); twisty.className = "search-twisty";
        twisty.textContent = folded ? "▸" : "▾"; twisty.setAttribute("role", "button");
        twisty.setAttribute("aria-label", folded ? "Show matches" : "Hide matches"); twisty.setAttribute("aria-expanded", String(!folded));
        twisty.addEventListener("click", event => { event.stopPropagation(); toggleGroup(relative); });
        head.append(twisty);
      }
      appendFileName(head, relative, []);
      const count = document.createElement("span"); count.className = "search-count"; count.textContent = String(fileHits.length); head.append(count);
      if (!replaceOpen) {
        (head as HTMLButtonElement).type = "button";
        const key = `head:${relative}`; head.dataset.rowKey = key;
        const first = fileHits[0];
        openers.set(key, () => void openHit(first, matchedText(first, query)));
        head.addEventListener("click", () => openKey(key));
        withMenu(head, key, first.path, relative);
      }
      group.appendChild(head);
      for (const hit of folded ? [] : fileHits) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "search-hit";
        const ln = document.createElement("span");
        ln.className = "search-line";
        ln.textContent = hit.page ? `p${hit.page}` : String(hit.line);
        const snippet = document.createElement("span");
        snippet.className = "search-snippet";
        const inlineQuery = replaceOpen && options.regex ? query.replace(/\(\?P</g, "(?<") : query;
        const highlighted = firstSearchMatch(hit.snippet, inlineQuery, options) ?? {
          start: hit.match_start,
          end: hit.match_end,
        };
        const before = document.createTextNode(
          hit.snippet.slice(0, highlighted.start),
        );
        const mark = document.createElement(replaceOpen ? "del" : "mark");
        mark.textContent = hit.snippet.slice(highlighted.start, highlighted.end);
        const after = document.createTextNode(hit.snippet.slice(highlighted.end));
        snippet.append(before, mark);
        if (replaceOpen) {
          const inserted = document.createElement("ins");
          const expression = searchExpression(inlineQuery, options);
          if (options.regex && expression) {
            const match = expression.exec(hit.snippet);
            inserted.textContent = match ? replacement.value.replace(/\$\$|\$\{([^}]+)\}|\$([A-Za-z_0-9]+)/g, (whole, braced: string, bare: string) => {
              if (whole === "$$") return "$";
              const key = braced ?? bare; return /^\d+$/.test(key) ? (match[Number(key)] ?? "") : (match.groups?.[key] ?? "");
            }) : replacement.value;
          } else inserted.textContent = replacement.value;
          snippet.append(inserted);
        }
        snippet.append(after);
        row.append(ln, snippet);
        row.dataset.hitKey = hitKey(hit);
        if (replaceOpen) {
          // Replace reviews each change in the excerpt box before anything is written.
          row.setAttribute("aria-pressed", String(selectedKey === hitKey(hit)));
          const select = () => { selectedKey = hitKey(hit); for (const other of results.querySelectorAll(".search-hit")) other.setAttribute("aria-pressed", String((other as HTMLElement).dataset.hitKey === selectedKey)); void preview.show(hit); };
          row.addEventListener("click", select);
          row.addEventListener("dblclick", () => void preview.open(hit));
          row.addEventListener("keydown", event => {
            if (event.key === "Enter") { event.preventDefault(); void preview.open(hit); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const rows = [...results.querySelectorAll<HTMLButtonElement>(".search-hit")]; const next = rows[rows.indexOf(row) + (event.key === "ArrowDown" ? 1 : -1)]; next?.focus(); next?.click(); }
          });
        } else {
          const key = `hit:${hitKey(hit)}`; row.dataset.rowKey = key;
          const match = hit.snippet.slice(highlighted.start, highlighted.end);
          openers.set(key, () => void openHit(hit, match));
          row.addEventListener("click", () => openKey(key));
          if (!hit.page) withMenu(row, key, hit.path, relative, hit.line);
        }
        group.appendChild(row);
      }
      results.appendChild(group);
    }
    const skipped = state.skipped.filter(item => item.reason !== "not_text");
    if (skipped.length) {
      const details = document.createElement("details"); details.className = "search-note search-skipped";
      const summary = document.createElement("summary"); summary.textContent = `${skipped.length} file${skipped.length === 1 ? "" : "s"} not searched`; details.append(summary);
      const list = document.createElement("ul");
      const reasons: Record<string, string> = { too_large: "over 2 MB", unreadable: "couldn't read", pdf: "PDF couldn't be opened" };
      for (const item of skipped.slice(0, 50)) { const li = document.createElement("li"); li.textContent = `${item.relative} — ${reasons[item.reason] ?? item.reason}`; list.append(li); }
      if (skipped.length > 50) { const li = document.createElement("li"); li.textContent = `and ${skipped.length - 50} more`; list.append(li); }
      details.append(list); results.append(details);
    }
    if ((state.phase === "done" || state.phase === "stopped") && query.length >= 2 && groups.size === 0 && (replaceOpen || !fileMatches.rows.length)) {
      results.append(searchEmpty(query, replaceOpen && !!(include.value.trim() || exclude.value.trim()), () => { include.value = ""; exclude.value = ""; void run(); }, () => { input.value = ""; cancel(); state = new SearchRun(); render(""); }));
      // The empty state already says there are no matches.
      if (state.phase === "done") status.textContent = "";
    }
    results.scrollTop = scrollTop;
    markSelection();
    if (replaceOpen && selectedKey && state.phase === "done" && ![...results.querySelectorAll<HTMLElement>(".search-hit")].some(row => row.dataset.hitKey === selectedKey)) {
      const first = results.querySelector<HTMLButtonElement>(".search-hit"); if (first) first.click(); else { selectedKey = ""; preview.clear(); }
    }
  }

  function joinFolder(relative: string): string {
    const folder = deps.getFolder() ?? "";
    const separator = folder.includes("\\") ? "\\" : "/";
    return `${folder.replace(/[\\/]$/, "")}${separator}${relative}`;
  }

  function withMenu(row: HTMLElement, key: string, path: string, relative: string, line?: number): void {
    if (!deps.onResultMenu) return;
    row.addEventListener("contextmenu", event => {
      event.preventDefault();
      selectedKey = key; markSelection();
      deps.onResultMenu?.(event.clientX, event.clientY, { path, relative, line, open: () => openKey(key) });
    });
  }

  function toggleGroup(relative: string, open?: boolean): void {
    const fold = open === undefined ? !collapsed.has(relative) : !open;
    if (fold) collapsed.add(relative); else collapsed.delete(relative);
    // A hidden hit can't stay selected; the selection moves to its file.
    if (fold && selectedKey.startsWith("hit:") && results.querySelector(`.search-hit.selected`)?.closest(".search-group")?.querySelector<HTMLElement>(".search-file")?.title === relative) selectedKey = `head:${relative}`;
    render(lastQuery);
  }

  function matchedText(hit: SearchHit, query: string): string {
    const found = firstSearchMatch(hit.snippet, query, options);
    return found ? hit.snippet.slice(found.start, found.end) : hit.snippet.slice(hit.match_start, hit.match_end);
  }

  function appendFileName(target: HTMLElement, relative: string, hits: number[]): void {
    const slash = relative.lastIndexOf("/");
    const name = document.createElement("span"); name.className = "search-file-name";
    const marked = new Set(hits); let plain = "";
    const text = relative.slice(slash + 1);
    for (let i = 0; i < text.length; i++) {
      if (!marked.has(i)) { plain += text[i]; continue; }
      if (plain) { name.append(plain); plain = ""; }
      const hit = document.createElement("span"); hit.className = "search-name-hit"; hit.textContent = text[i]; name.append(hit);
    }
    if (plain) name.append(plain);
    target.append(name);
    if (slash > 0) { const dir = document.createElement("span"); dir.className = "search-file-dir"; dir.textContent = relative.slice(0, slash); target.append(dir); }
  }

  function filesGroup(): HTMLElement {
    const group = document.createElement("div"); group.className = "search-files";
    const heading = document.createElement("div"); heading.className = "search-section";
    heading.textContent = `Files · ${fileMatches.total}`; group.append(heading);
    for (const file of fileMatches.rows) {
      const row = document.createElement("button"); row.type = "button"; row.className = "search-file-match";
      row.title = file.path;
      const key = `file:${file.path}`; row.dataset.rowKey = key;
      appendFileName(row, file.path, file.hits);
      if (file.exact) { const badge = document.createElement("span"); badge.className = "search-exact"; badge.textContent = "exact"; row.append(badge); }
      openers.set(key, () => deps.onOpenFile?.(file.path));
      row.addEventListener("click", () => openKey(key));
      withMenu(row, key, joinFolder(file.path), file.path);
      group.append(row);
    }
    if (fileMatches.total > fileMatches.rows.length && deps.onShowAllFiles) {
      const all = document.createElement("button"); all.type = "button"; all.className = "search-show-all";
      all.textContent = `Show all ${fileMatches.total} in ⌘K`;
      all.addEventListener("click", () => deps.onShowAllFiles?.(fileMatches.query));
      group.append(all);
    }
    return group;
  }

  /** Enter outside Replace: open the selected row, else the first; a pasted path the scan left out still opens. */
  function openSelected(): void {
    if (openKey(currentKey())) return;
    const query = fileMatches.query || input.value.trim();
    if (query && looksLikePath(query) && deps.onOpenFile) deps.onOpenFile(query);
  }

  async function run(): Promise<void> {
    cancel();
    const current = token;
    const folder = deps.getFolder();
    const query = input.value.trim();
    state = new SearchRun(); progress.hidden = true; results.replaceChildren(); notes.replaceChildren(); input.removeAttribute("aria-invalid");
    if (query !== lastQuery) { selectedKey = ""; lastOpenedKey = ""; lastQuery = query; collapsed.clear(); }
    fileMatches = { query: "", rows: [], total: 0 };
    if (!folder) { groupValid = false; updateButton(); status.textContent = "Open a folder to search its files."; return; }
    if (query.length < (replaceOpen ? 1 : 2)) { groupValid = false; updateButton(); status.textContent = query ? "Type at least 2 characters." : ""; return; }
    groupValid = false; groupError.textContent = ""; message = "";
    const ops = parseSearchOperators(query);
    const useOperators = !replaceOpen && hasOperators(ops) && !!deps.index;
    const textQuery = useOperators ? ops.text : query;
    // File names match at once from the list in memory, before the content search answers.
    if (!replaceOpen && !options.regex && !useOperators) fileMatches = searchFileMatches(query, deps.getFiles(), folder);
    state.phase = "text"; render(textQuery);
    if (replaceOpen) {
      try { await invoke("replace_check_groups", { query, options: { ...options }, replacement: replacement.value }); if (current !== token) return; groupValid = true; }
      catch (error) { if (current !== token) return; groupError.textContent = String(error); }
    }
    await cancellation;
    if (current !== token) return;
    try {
      if (useOperators) await deps.index!.ensure(folder);
      if (current !== token) return;
      const result = useOperators ? await searchOperatorFiles(folder, deps.getFiles(), deps.index!, ops, options, () => current === token) : await searchInFolder(folder, query, options, current);
      if (current !== token || result.cancelled) return;
      state.text(result);
    } catch (error) {
      if (current !== token) return;
      if (options.regex) { state.phase = "error"; state.error = String(error).split(/\r?\n/)[0]; render(textQuery); }
      else status.textContent = "Search failed.";
      return;
    }
    const pdfs = (replaceOpen || (useOperators && (!ops.text || hasMetadataOperators(ops))) ? [] : deps.getFiles()).filter((path) => path.toLowerCase().endsWith(".pdf") && (!useOperators || pathMatches(path, ops.path)));
    state.pdfTotal = pdfs.length; state.phase = "pdf"; render(textQuery);
    for (const relative of pdfs) {
      if (current !== token || state.hitLimit) break;
      progress.hidden = false; progress.replaceChildren();
      const spinner = document.createElement("span"); spinner.className = "search-spinner"; spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span"); label.textContent = `Searching PDFs · ${state.pdfDone + 1} of ${state.pdfTotal} · ${relative}`;
      const meter = document.createElement("progress"); meter.max = state.pdfTotal; meter.value = state.pdfDone;
      const stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Stop";
      stop.addEventListener("click", () => { cancel(); state.phase = "stopped"; progress.hidden = true; render(query); });
      progress.append(spinner, label, meter, stop);
      const separator = folder.includes("\\") ? "\\" : "/";
      const path = `${folder.replace(/[\\/]$/, "")}${separator}${relative}`;
      try { const hits = await searchPdf(path, relative, textQuery, options, () => current === token); if (current !== token) return; state.add(hits); }
      catch { if (current !== token) return; state.pdfFailures++; state.skipped.push({ relative, reason: "pdf" }); }
      state.pdfDone++; render(textQuery);
    }
    if (current !== token) return;
    state.phase = "done"; progress.hidden = true; render(textQuery);
  }

  toggle.addEventListener("click", () => { setReplaceOpen(!replaceOpen); void run(); });
  for (const field of [replacement, include, exclude]) field.addEventListener("input", () => { cancel(); groupValid = false; updateButton(); timer = window.setTimeout(() => void run(), 250); });
  previewButton.addEventListener("click", async () => {
    if (!deps.previewReplace || previewButton.disabled) return;
    previewBusy = true; message = ""; updateButton();
    const query = input.value.trim(), value = replacement.value, selectedOptions = { ...options }, current = token;
    try {
      const preview = await deps.previewReplace(query, value, selectedOptions, filterByGlobs(deps.getFiles(), include.value, exclude.value));
      if (current !== token || preview.cancelled) return;
      if (preview.too_many) message = "Too many matches (over 5,000). Narrow the search with Files to include.";
      else deps.onReplacePreview?.(preview, query, value, selectedOptions);
    } catch (error) { if (current === token) message = String(error).includes("empty_match") ? "This pattern can match empty text; replace needs at least one character." : String(error); }
    finally { previewBusy = false; render(input.value.trim()); }
  });
  input.addEventListener("input", () => {
    results.replaceChildren();
    cancel(); groupValid = false; updateButton();
    timer = window.setTimeout(() => void run(), 250);
  });
  input.addEventListener("keydown", (event) => {
    if (replaceOpen) {
      if (event.key === "Enter") { window.clearTimeout(timer); void run(); }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveSelection(event.key === "ArrowDown" ? 1 : -1); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    // A query typed or pasted just now hasn't run yet; run() fills the Files group before its first await.
    if (input.value.trim() !== lastQuery) { window.clearTimeout(timer); void run(); }
    openSelected();
  });
  results.addEventListener("keydown", event => {
    if (replaceOpen) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const relative = results.querySelector<HTMLElement>(".selected")?.closest(".search-group")?.querySelector<HTMLElement>(".search-file")?.title;
      if (relative) { event.preventDefault(); toggleGroup(relative, event.key === "ArrowRight"); results.querySelector<HTMLElement>(".selected")?.focus(); }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault(); moveSelection(event.key === "ArrowDown" ? 1 : -1);
    results.querySelector<HTMLElement>(".selected")?.focus();
  });
  host.querySelectorAll<HTMLButtonElement>(".search-option").forEach((button) => {
    button.addEventListener("click", () => {
      const option = button.dataset.option as keyof SearchOptions;
      options[option] = !options[option];
      button.classList.toggle("active", options[option]);
      button.setAttribute("aria-pressed", String(options[option]));
      void run();
    });
  });

  updateButton();
  return {
    focus: () => {
      input.focus();
      input.select();
    },
    getQuery: () => input.value,
    setQuery: query => { input.value = query; setReplaceOpen(false); void run(); },
    focusReplace: () => { setReplaceOpen(true); replacement.focus(); void run(); },
    refresh: () => void run(),
    cancel,
  };
}
