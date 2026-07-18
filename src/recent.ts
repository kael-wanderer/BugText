export type RecentItems = {
  files: string[];
  folders: string[];
};

export function addRecent(list: string[], path: string, limit = 12): string[] {
  return [path, ...list.filter((item) => item !== path)].slice(0, limit);
}

const DEFAULT_RECENT_KEY = "mdflow.recent";
const LEGACY_RECENT_KEY = "mdflow.recent";

export function loadRecent(key = DEFAULT_RECENT_KEY): RecentItems {
  try {
    const raw =
      localStorage.getItem(key) ??
      (key === DEFAULT_RECENT_KEY ? localStorage.getItem(LEGACY_RECENT_KEY) : null);
    const value = JSON.parse(raw ?? "{}");
    return {
      files: Array.isArray(value.files) ? value.files : [],
      folders: Array.isArray(value.folders) ? value.folders : [],
    };
  } catch {
    return { files: [], folders: [] };
  }
}

export function saveRecent(items: RecentItems, key = DEFAULT_RECENT_KEY): void {
  localStorage.setItem(key, JSON.stringify(items));
}
