import {
  searchInFolder,
  type SearchHit,
  type SearchOptions,
} from "./filesys";
import { searchPdf } from "./pdf-search";
import { firstSearchMatch } from "./search-match";

export type SearchPanel = {
  focus: () => void;
  refresh: () => void;
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
    <div class="search-status"></div>
    <div class="search-results"></div>`;
  const input = host.querySelector<HTMLInputElement>(".search-input")!;
  const status = host.querySelector<HTMLElement>(".search-status")!;
  const results = host.querySelector<HTMLElement>(".search-results")!;
  let timer: number | undefined;
  let token = 0;
  const options: SearchOptions = {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  };

  async function run(): Promise<void> {
    const current = ++token;
    const folder = deps.getFolder();
    const query = input.value.trim();
    results.replaceChildren();
    if (!folder) {
      status.textContent = "Open a folder to search its files.";
      return;
    }
    if (query.length < 2) {
      status.textContent = query ? "Type at least 2 characters." : "";
      return;
    }
    status.textContent = "Searching…";
    let hits: SearchHit[];
    try {
      const textHits = (await searchInFolder(folder, query, options, current)).hits;
      const pdfHits: SearchHit[] = [];
      for (const relative of deps
        .getFiles()
        .filter((path) => path.toLowerCase().endsWith(".pdf"))) {
        if (current !== token || textHits.length + pdfHits.length >= 500) break;
        const separator = folder.includes("\\") ? "\\" : "/";
        const path = `${folder.replace(/[\\/]$/, "")}${separator}${relative}`;
        try {
          pdfHits.push(...(await searchPdf(path, relative, query, options)));
        } catch {
          // Ignore one unreadable PDF and continue searching the folder.
        }
      }
      hits = [...textHits, ...pdfHits].slice(0, 500);
    } catch {
      if (current === token) status.textContent = "Search failed.";
      return;
    }
    if (current !== token) return;

    const groups = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const list = groups.get(hit.relative);
      if (list) list.push(hit);
      else groups.set(hit.relative, [hit]);
    }
    if (!hits.length) {
      status.textContent = "No results.";
      return;
    }
    const capped = hits.length >= 500 ? "+" : "";
    status.textContent = `${hits.length}${capped} result${
      hits.length === 1 ? "" : "s"
    } in ${groups.size} file${groups.size === 1 ? "" : "s"}`;

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

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
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
  };
}
