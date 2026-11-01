import type { Settings } from "../settings";

/** Refresh previews when a settings save changes citation style. */
export function refreshOnCitationStyleChange(previous: Settings, next: Settings, refresh: () => void): void {
  if (previous.export.citationStyle !== next.export.citationStyle) refresh();
}
