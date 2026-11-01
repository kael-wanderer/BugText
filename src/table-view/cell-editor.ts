import { parseCellInput, type CellKind } from "./cells";

export function createCellEditor(kind: CellKind, value: unknown, commit: (value: string | number | boolean | string[] | undefined) => void, cancel: () => void, move: (back: boolean) => void) {
  const root = document.createElement("span"), input = document.createElement("input"), error = document.createElement("small");
  let tokens = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const chips = document.createElement("span");
  function renderChips() { chips.replaceChildren(...tokens.map(token => { const chip = document.createElement("span"); chip.className = "table-chip"; chip.textContent = token; return chip; })); }
  function add() { const value = input.value.trim(); if (value && !tokens.includes(value)) tokens.push(value); input.value = ""; renderChips(); }
  function submit() {
    if (kind === "list" && input.value.trim()) add();
    const parsed = parseCellInput(kind, kind === "list" ? tokens : input.value);
    if (!parsed.ok) { error.textContent = parsed.message; input.focus(); return false; }
    commit(parsed.value); return true;
  }
  input.value = kind === "list" ? "" : value == null ? "" : String(value);
  input.setAttribute("aria-label", "Edit value");
  root.className = "table-cell-editor"; root.append(chips, input, error); renderChips();
  input.onkeydown = event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); cancel(); }
    else if (kind === "list" && (event.key === "," || (event.key === "Enter" && input.value.trim()))) { event.preventDefault(); add(); }
    else if (kind === "list" && event.key === "Backspace" && !input.value) { tokens.pop(); renderChips(); }
    else if (event.key === "Enter") { event.preventDefault(); submit(); }
    else if (event.key === "Tab") { event.preventDefault(); if (submit()) move(event.shiftKey); }
  };
  input.onblur = () => { submit(); };
  return { root, focus: () => input.focus() };
}
