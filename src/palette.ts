import { rankItems } from "./fuzzy";
import { cleanFileQuery, rankFiles } from "./file-rank";

export type PaletteItem = {
  id: string;
  label: string;
  kind: "command" | "file" | "symbol";
  run: () => void;
  /** Files only: open the file at a 1-based line (from a pasted `path:42`). */
  openAt?: (line: number) => void;
};

type Row = { item: PaletteItem; hits?: number[]; exact?: boolean };

export type PaletteProvider = () => PaletteItem[];

export function createPalette(
  provider: PaletteProvider,
  options: { folder?: () => string | null } = {},
): { open: () => void } {
  const overlay = document.createElement("div");
  overlay.id = "palette";
  overlay.className = "palette hidden";
  overlay.innerHTML = `
    <div class="palette-box" role="dialog" aria-label="Command palette">
      <input class="palette-input" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Search files or run a command…" />
      <div class="palette-list" role="listbox"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector<HTMLInputElement>(".palette-input")!;
  const list = overlay.querySelector<HTMLElement>(".palette-list")!;

  let items: PaletteItem[] = [];
  let filtered: Row[] = [];
  let line: number | null = null;
  let active = 0;

  const close = (): void => {
    overlay.classList.add("hidden");
  };

  const run = (row: Row | undefined): void => {
    if (!row) return;
    close();
    if (line !== null && row.item.openAt) row.item.openAt(line);
    else row.item.run();
  };

  const fileRow = (row: HTMLElement, item: PaletteItem, hits: number[], exact: boolean): void => {
    const slash = item.label.lastIndexOf("/");
    const name = item.label.slice(slash + 1);
    const label = row.querySelector<HTMLElement>(".palette-label")!;
    label.classList.add("palette-file-name");
    const marked = new Set(hits);
    let plain = "";
    const flush = (): void => { if (plain) label.append(plain); plain = ""; };
    for (let i = 0; i < name.length; i++) {
      if (!marked.has(i)) { plain += name[i]; continue; }
      flush();
      const hit = document.createElement("span");
      hit.className = "palette-hit";
      hit.textContent = name[i];
      label.append(hit);
    }
    flush();
    if (slash > 0) {
      const dir = document.createElement("span");
      dir.className = "palette-detail";
      const inner = document.createElement("bdi");
      inner.textContent = item.label.slice(0, slash);
      dir.append(inner);
      row.append(dir);
    }
    if (exact) {
      const badge = document.createElement("span");
      badge.className = "palette-badge";
      badge.textContent = "exact";
      row.append(badge);
    }
  };

  const renderList = (): void => {
    list.replaceChildren();
    let previousKind: PaletteItem["kind"] | null = null;
    filtered.forEach(({ item, hits, exact }, index) => {
      if (item.kind !== previousKind) {
        const heading = document.createElement("div");
        heading.className = "palette-heading";
        heading.textContent =
          item.kind === "file"
            ? line !== null ? `Files · opens at line ${line}` : "Files"
            : item.kind === "symbol"
              ? "Outline"
              : "Commands";
        list.appendChild(heading);
        previousKind = item.kind;
      }

      const row = document.createElement("div");
      row.className = `palette-row${index === active ? " active" : ""}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === active));
      row.innerHTML = `<span class="palette-kind ${item.kind}">${
        item.kind === "command" ? "›" : item.kind === "symbol" ? "#" : ""
      }</span><span class="palette-label"></span>`;
      if (item.kind === "file") fileRow(row, item, hits ?? [], exact ?? false);
      else row.querySelector(".palette-label")!.textContent = item.label;
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        run(filtered[index]);
      });
      list.appendChild(row);
    });
  };

  const refilter = (): void => {
    const query = input.value.trim();
    const cleaned = cleanFileQuery(query, options.folder?.() ?? null);
    line = cleaned.line;
    const fileItems = new Map(items.filter((item) => item.kind === "file").map((item) => [item.label, item]));
    const files: Row[] = rankFiles(cleaned.query, [...fileItems.keys()])
      .map((file) => ({ item: fileItems.get(file.path)!, hits: file.hits, exact: file.exact }));
    const commands = rankItems(
      query,
      items.filter((item) => item.kind === "command"),
      (item) => item.label,
    );
    const symbols = rankItems(
      query,
      items.filter((item) => item.kind === "symbol"),
      (item) => item.label,
    );
    filtered = [...files, ...symbols.map((item) => ({ item })), ...commands.map((item) => ({ item }))];
    active = 0;
    renderList();
  };

  input.addEventListener("input", refilter);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(active + 1, Math.max(0, filtered.length - 1));
      renderList();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(active - 1, 0);
      renderList();
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(filtered[active]);
    }
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });

  return {
    open: () => {
      items = provider();
      input.value = "";
      overlay.classList.remove("hidden");
      refilter();
      input.focus();
    },
  };
}
