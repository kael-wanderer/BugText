import {
  searchInFolder,
  type SearchHit,
  type SearchOptions,
} from "./filesys";
import { invoke } from "@tauri-apps/api/core";
import { SearchRun } from "./search-run";
import { searchPdf } from "./pdf-search";
import { firstSearchMatch, searchExpression } from "./search-match";
import { filterByGlobs, type ReplacePreview } from "./replace/plan";

export type SearchPanel = {
  focus: () => void;
  focusReplace: () => void;
  refresh: () => void;
  cancel: () => void;
};

export type SearchPanelDeps = {
  getFolder: () => string | null;
  getFiles: () => string[];
  previewReplace?: (query: string, replacement: string, options: SearchOptions, files: string[]) => Promise<ReplacePreview>;
  onReplacePreview?: (preview: ReplacePreview, query: string, replacement: string, options: SearchOptions) => void;
  onOpenHit: (path: string, line: number, page?: number) => void;
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
    ++token;
    cancellation = cancellation.then(() => invoke<void>("search_cancel")).catch(() => {});
  }

  function render(query: string): void {
    results.replaceChildren();
    status.textContent = state.status;
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
    if (state.skipped.length) {
      const details = document.createElement("details"); details.className = "search-note";
      const summary = document.createElement("summary"); summary.textContent = `${state.skipped.length} file${state.skipped.length === 1 ? "" : "s"} skipped`; details.append(summary);
      const list = document.createElement("ul");
      const reasons: Record<string, string> = { too_large: "over 2 MB", not_text: "not text", unreadable: "couldn't read", pdf: "PDF couldn't be opened" };
      for (const skipped of state.skipped.slice(0, 50)) { const item = document.createElement("li"); item.textContent = `${skipped.relative} — ${reasons[skipped.reason] ?? skipped.reason}`; list.append(item); }
      if (state.skipped.length > 50) { const item = document.createElement("li"); item.textContent = `and ${state.skipped.length - 50} more`; list.append(item); }
      details.append(list); notes.append(details);
    }
    const groups = new Map<string, SearchHit[]>();
    const allowed = new Set(filterByGlobs(state.hits.map(hit => hit.relative), include.value, exclude.value));
    for (const hit of state.hits) { if (replaceOpen && !allowed.has(hit.relative)) continue; const list = groups.get(hit.relative); if (list) list.push(hit); else groups.set(hit.relative, [hit]); }
    for (const [relative, fileHits] of groups) {
      const group = document.createElement("div");
      group.className = "search-group";
      const head = document.createElement("div");
      head.className = "search-file";
      head.textContent = `${relative}  ${fileHits.length}`;
      head.title = relative;
      group.appendChild(head);
      for (const hit of fileHits) {
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
        row.addEventListener("click", () =>
          deps.onOpenHit(hit.path, hit.line, hit.page),
        );
        group.appendChild(row);
      }
      results.appendChild(group);
    }
  }

  async function run(): Promise<void> {
    cancel();
    const current = token;
    const folder = deps.getFolder();
    const query = input.value.trim();
    state = new SearchRun(); progress.hidden = true; results.replaceChildren(); notes.replaceChildren(); input.removeAttribute("aria-invalid");
    if (!folder) { groupValid = false; updateButton(); status.textContent = "Open a folder to search its files."; return; }
    if (query.length < (replaceOpen ? 1 : 2)) { groupValid = false; updateButton(); status.textContent = query ? "Type at least 2 characters." : ""; return; }
    groupValid = false; groupError.textContent = ""; message = "";
    state.phase = "text"; render(query);
    if (replaceOpen) {
      try { await invoke("replace_check_groups", { query, options: { ...options }, replacement: replacement.value }); if (current !== token) return; groupValid = true; }
      catch (error) { if (current !== token) return; groupError.textContent = String(error); }
    }
    await cancellation;
    if (current !== token) return;
    try {
      const result = await searchInFolder(folder, query, options, current);
      if (current !== token || result.cancelled) return;
      state.text(result);
    } catch (error) {
      if (current !== token) return;
      if (options.regex) { state.phase = "error"; state.error = String(error).split(/\r?\n/)[0]; render(query); }
      else status.textContent = "Search failed.";
      return;
    }
    const pdfs = (replaceOpen ? [] : deps.getFiles()).filter((path) => path.toLowerCase().endsWith(".pdf"));
    state.pdfTotal = pdfs.length; state.phase = "pdf"; render(query);
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
      try { const hits = await searchPdf(path, relative, query, options, () => current === token); if (current !== token) return; state.add(hits); }
      catch { if (current !== token) return; state.pdfFailures++; state.skipped.push({ relative, reason: "pdf" }); }
      state.pdfDone++; render(query);
    }
    if (current !== token) return;
    state.phase = "done"; progress.hidden = true; render(query);
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
    cancel(); groupValid = false; updateButton();
    timer = window.setTimeout(() => void run(), 250);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      window.clearTimeout(timer);
      void run();
    }
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
    focusReplace: () => { setReplaceOpen(true); replacement.focus(); void run(); },
    refresh: () => void run(),
    cancel,
  };
}
