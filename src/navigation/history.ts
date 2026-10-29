export type NavigationLocation = { path: string; line?: number; anchor?: string; page?: number; selection?: { anchor: number; head: number }; scrollTop?: number; search?: { query: string; scrollTop: number } };
export const NAVIGATION_HISTORY_LIMIT = 100;
export function createNavigationHistory(limit = NAVIGATION_HISTORY_LIMIT) {
  let entries: NavigationLocation[] = [], cursor = -1;
  const copy = (v: NavigationLocation) => structuredClone(v);
  return {
    get canBack() { return cursor > 0; }, get canForward() { return cursor >= 0 && cursor < entries.length - 1; },
    get current() { return cursor < 0 ? null : copy(entries[cursor]); },
    target(direction: "back" | "forward") { const index = cursor + (direction === "back" ? -1 : 1); return index >= 0 && index < entries.length ? copy(entries[index]) : null; },
    capture(location: NavigationLocation) { if (cursor >= 0 && entries[cursor].path === location.path) entries[cursor] = copy(location); },
    visit(location: NavigationLocation) { if (entries[cursor]?.path === location.path) { entries[cursor] = copy(location); return; } entries = entries.slice(0, cursor + 1); entries.push(copy(location)); if (entries.length > limit) entries.shift(); cursor = entries.length - 1; },
    back(): NavigationLocation | null { return cursor > 0 ? copy(entries[--cursor]) : null; },
    forward(): NavigationLocation | null { return cursor < entries.length - 1 ? copy(entries[++cursor]) : null; },
    rename(oldPath: string, newPath: string) { for (const entry of entries) if (entry.path === oldPath || entry.path.startsWith(oldPath + "/")) entry.path = newPath + entry.path.slice(oldPath.length); },
    clear() { entries = []; cursor = -1; },
  };
}
