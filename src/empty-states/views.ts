export type EmptyAction = { label: string; hint: string; run: () => void; primary?: boolean };
export function emptyState(title: string, detail: string | null, actions: EmptyAction[]): HTMLElement {
  const root = document.createElement("div"); root.className = "empty-state"; root.setAttribute("role", "status");
  const heading = document.createElement("p"); heading.textContent = title; root.append(heading);
  if (detail) { const note = document.createElement("p"); note.textContent = detail; root.append(note); }
  for (const action of actions) {
    const button = document.createElement("button"); button.type = "button"; button.className = action.primary ? "primary" : ""; button.textContent = action.label;
    if (action.hint) { const hint = document.createElement("kbd"); hint.textContent = action.hint; button.append(" ", hint); }
    button.addEventListener("click", action.run); root.append(button);
  }
  return root;
}
export function searchEmpty(query: string, globsActive: boolean, clearFilters: () => void, clearSearch: () => void): HTMLElement {
  return emptyState(`No matches for "${query}".`, globsActive ? "Files to include/exclude are narrowing this search." : null, [
    ...(globsActive ? [{ label: "Clear file filters", hint: "", run: clearFilters }] : []),
    { label: "Clear search", hint: "", run: clearSearch },
  ]);
}
