// Choose Note…: a filterable list of the folder's Markdown notes; resolves the picked
// relative path, or null.

const LIMIT = 200;

export function pickNote(doc: Document, files: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = doc.createElement("div");
    overlay.className = "capture-sheet-overlay capture-picker";
    const box = doc.createElement("div");
    box.className = "capture-picker-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Choose Note");
    const filter = doc.createElement("input");
    filter.placeholder = "Filter notes";
    filter.setAttribute("aria-label", "Filter notes");
    const list = doc.createElement("ul");
    list.setAttribute("role", "listbox");
    let shown: string[] = [];
    const finish = (value: string | null): void => { overlay.remove(); resolve(value); };
    const render = (): void => {
      const query = filter.value.trim().toLowerCase();
      shown = files.filter((file) => file.toLowerCase().includes(query)).slice(0, LIMIT);
      list.replaceChildren(...shown.map((file) => {
        const row = doc.createElement("li");
        row.setAttribute("role", "option");
        row.textContent = file;
        row.addEventListener("click", () => finish(file));
        return row;
      }));
    };
    filter.addEventListener("input", render);
    filter.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); if (shown[0]) finish(shown[0]); }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); finish(null); }
    });
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) finish(null); });
    box.append(filter, list);
    overlay.append(box);
    doc.body.append(overlay);
    render();
    filter.focus();
  });
}
