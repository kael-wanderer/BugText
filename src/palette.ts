import { rankItems } from "./fuzzy";

export type PaletteItem = {
  id: string;
  label: string;
  kind: "command" | "file" | "symbol";
  run: () => void;
};

export type PaletteProvider = () => PaletteItem[];

export function createPalette(provider: PaletteProvider): { open: () => void } {
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
  let filtered: PaletteItem[] = [];
  let active = 0;

  const close = (): void => {
    overlay.classList.add("hidden");
  };

  const run = (item: PaletteItem | undefined): void => {
    if (!item) return;
    close();
    item.run();
  };

  const renderList = (): void => {
    list.replaceChildren();
    let previousKind: PaletteItem["kind"] | null = null;
    filtered.forEach((item, index) => {
      if (item.kind !== previousKind) {
        const heading = document.createElement("div");
        heading.className = "palette-heading";
        heading.textContent =
          item.kind === "file"
            ? "Files"
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
      row.querySelector(".palette-label")!.textContent = item.label;
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        run(item);
      });
      list.appendChild(row);
    });
  };

  const refilter = (): void => {
    const query = input.value.trim();
    const files = rankItems(
      query,
      items.filter((item) => item.kind === "file"),
      (item) => item.label,
    );
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
    filtered = [...files, ...symbols, ...commands];
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
