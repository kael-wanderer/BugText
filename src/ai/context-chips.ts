export type ContextChipsState = { note: boolean; search: boolean; files: string[] };
export function parseContextChips(value: unknown): ContextChipsState {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { note: typeof raw.note === "boolean" ? raw.note : true, search: typeof raw.search === "boolean" ? raw.search : true, files: Array.isArray(raw.files) ? raw.files.filter((p): p is string => typeof p === "string") : [] };
}
export function renderContextChips(host: HTMLElement, options: {
  state: ContextChipsState; path: string; selection: boolean; folder: boolean; k: number;
  excluded: boolean; disabled: boolean; change(state: ContextChipsState): void; add(): void;
}): void {
  host.replaceChildren(); host.className = "ai-context-chips";
  function button(text: string, click: () => void, disabled = options.disabled): HTMLButtonElement {
    const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.disabled = disabled; b.addEventListener("click", click); host.append(b); return b;
  }
  const noteOn = options.state.note && !options.excluded;
  const label = options.selection ? "Selection" : "This note";
  const note = button(options.excluded ? `🔒 This note · ${options.path} is excluded` : `${noteOn ? "✓ " : ""}${label} · ${options.path}`, () => options.change({ ...options.state, note: !options.state.note }), options.disabled || options.excluded);
  note.setAttribute("aria-pressed", String(noteOn)); note.classList.toggle("excluded", options.excluded);
  if (options.folder) button(`${options.state.search ? "✓ " : ""}Folder search · ${options.k} excerpts`, () => options.change({ ...options.state, search: !options.state.search })).setAttribute("aria-pressed", String(options.state.search));
  for (const path of options.state.files) button(`📎 ${path.split(/[\\/]/).pop()} ×`, () => options.change({ ...options.state, files: options.state.files.filter(p => p !== path) }));
  button("＋ Add", options.add);
}
