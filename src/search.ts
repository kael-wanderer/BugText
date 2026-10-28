import {
  searchInFolder,
  type SearchHit,
  type SearchOptions,
} from "./filesys";
import { invoke } from "@tauri-apps/api/core";
import { SearchRun } from "./search-run";
import { searchPdf } from "./pdf-search";
import { firstSearchMatch } from "./search-match";

export type SearchPanel = {
  focus: () => void;
  refresh: () => void;
  cancel: () => void;
};

export type SearchPanelDeps = {
  getFolder: () => string | null;
  getFiles: () => string[];
  onOpenHit: (path: string, line: number, page?: number) => void;
};

export function createSearchPanel(
  host: HTMLElement,
  deps: SearchPanelDeps,
): SearchPanel {
  host.innerHTML = `
    <div class="search-title"><span>SEARCH</span></div>
    <div class="search-input-row">
      <input class="search-input" type="text" placeholder="Search in folder…" spellcheck="false" />
      <button type="button" class="search-option" data-option="caseSensitive" title="Match case" aria-label="Match case" aria-pressed="false">Aa</button>
      <button type="button" class="search-option" data-option="wholeWord" title="Match whole word" aria-label="Match whole word" aria-pressed="false">ab</button>
      <button type="button" class="search-option" data-option="regex" title="Use regular expression" aria-label="Use regular expression" aria-pressed="false">.*</button>
    </div>
    <div class="search-progress" hidden></div>
    <div class="search-status"></div>
    <div class="search-notes"></div>
    <div class="search-results"></div>`;
  const input = host.querySelector<HTMLInputElement>(".search-input")!;
  const status = host.querySelector<HTMLElement>(".search-status")!;
  const results = host.querySelector<HTMLElement>(".search-results")!;
  const progress = host.querySelector<HTMLElement>(".search-progress")!;
  const notes = host.querySelector<HTMLElement>(".search-notes")!;
  let state = new SearchRun();
  let timer: number | undefined;
  let token = 0;
  const options: SearchOptions = {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  };

  function cancel(): void {
    window.clearTimeout(timer);
    ++token;
    void invoke("search_cancel").catch(() => {});
  }

  function render(query: string): void {
    results.replaceChildren();
    status.textContent = state.status;
    status.classList.toggle("search-error", state.phase === "error");
    input.setAttribute("aria-invalid", String(state.phase === "error"));
    notes.replaceChildren();
    for (const text of state.notes) {
      const note = document.createElement("div"); note.className = "search-note"; note.textContent = text; notes.append(note);
    }
    if (state.skipped.length) {
      const details = document.createElement("details"); details.className = "search-note";
      const summary = document.createElement("summary"); summary.textContent = `${state.skipped.length} files skipped`; details.append(summary);
      const list = document.createElement("ul");
      const reasons: Record<string, string> = { too_large: "over 2 MB", not_text: "not text", unreadable: "couldn't read", pdf: "PDF couldn't be opened" };
      for (const skipped of state.skipped.slice(0, 50)) { const item = document.createElement("li"); item.textContent = `${skipped.relative} — ${reasons[skipped.reason] ?? skipped.reason}`; list.append(item); }
      if (state.skipped.length > 50) { const item = document.createElement("li"); item.textContent = `and ${state.skipped.length - 50} more`; list.append(item); }
      details.append(list); notes.append(details);
    }
    const groups = new Map<string, SearchHit[]>();
    for (const hit of state.hits) { const list = groups.get(hit.relative); if (list) list.push(hit); else groups.set(hit.relative, [hit]); }
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
        const highlighted = firstSearchMatch(hit.snippet, query, options) ?? {
          start: hit.match_start,
          end: hit.match_end,
        };
        const before = document.createTextNode(
          hit.snippet.slice(0, highlighted.start),
        );
        const mark = document.createElement("mark");
        mark.textContent = hit.snippet.slice(highlighted.start, highlighted.end);
        const after = document.createTextNode(hit.snippet.slice(highlighted.end));
        snippet.append(before, mark, after);
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
    if (!folder) { status.textContent = "Open a folder to search its files."; return; }
    if (query.length < 2) { status.textContent = query ? "Type at least 2 characters." : ""; return; }
    state.phase = "text"; render(query);
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
    const pdfs = deps.getFiles().filter((path) => path.toLowerCase().endsWith(".pdf"));
    state.pdfTotal = pdfs.length; state.phase = "pdf"; render(query);
    for (const relative of pdfs) {
      if (current !== token || state.hitLimit) break;
      progress.hidden = false; progress.replaceChildren();
      const label = document.createElement("span"); label.textContent = `Searching PDFs · ${state.pdfDone + 1} of ${state.pdfTotal} · ${relative}`;
      const meter = document.createElement("progress"); meter.max = state.pdfTotal; meter.value = state.pdfDone;
      const stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Stop";
      stop.addEventListener("click", () => { cancel(); state.phase = "stopped"; progress.hidden = true; render(query); });
      progress.append(label, meter, stop);
      const separator = folder.includes("\\") ? "\\" : "/";
      const path = `${folder.replace(/[\\/]$/, "")}${separator}${relative}`;
      try { const hits = await searchPdf(path, relative, query, options, () => current === token); if (current !== token) return; state.add(hits); }
      catch { if (current !== token) return; state.pdfFailures++; state.skipped.push({ relative, reason: "pdf" }); }
      state.pdfDone++; render(query);
    }
    if (current !== token) return;
    state.phase = "done"; progress.hidden = true; render(query);
  }

  input.addEventListener("input", () => {
    cancel();
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

  return {
    focus: () => {
      input.focus();
      input.select();
    },
    refresh: () => void run(),
    cancel,
  };
}
