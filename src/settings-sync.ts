export const SETTINGS_CHANGED_EVENT = "bugtext://settings-changed";

export type SettingsFile = "settings" | "agent" | "ai-actions" | "workspaces";
export type SettingsChange = { file: SettingsFile; from: string };

/** Returns the file to reload, or null for our own window or a malformed payload. */
export function shouldReload(change: unknown, selfLabel: string): SettingsFile | null {
  if (!change || typeof change !== "object") return null;
  const { file, from } = change as Record<string, unknown>;
  if (file !== "settings" && file !== "agent" && file !== "ai-actions" && file !== "workspaces") return null;
  if (typeof from !== "string" || from === selfLabel) return null;
  return file;
}
