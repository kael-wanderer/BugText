// Static index of settings pages and rows, plus the pure search matcher.
// Every row a page renders carries data-setting="<entry id>" from this list.

import { KEYMAP_COMMANDS } from "../keymap";

export type SettingsPageId = "general" | "editing" | "theme" | "shortcuts" | "ai";

export const SETTINGS_PAGES: ReadonlyArray<{ id: SettingsPageId; label: string; keywords: string }> = [
  { id: "general", label: "General", keywords: "startup session updates version settings.json agent.json app icon" },
  { id: "editing", label: "Editing", keywords: "font size typeface wrap wrapping column editor explorer main sub" },
  { id: "theme", label: "Theme", keywords: "colors appearance dark light palette" },
  { id: "shortcuts", label: "Shortcuts", keywords: "keyboard keys keybindings hotkeys keymap" },
  { id: "ai", label: "AI", keywords: "agents models providers terminal console llm" },
];

/** One-line description under each page title. */
export const PAGE_LEDES: Record<SettingsPageId, string> = {
  general: "How BugText starts, updates, and where its settings live.",
  editing: "Fonts and text size for each area, and how long lines wrap.",
  theme: "Colors for the whole app, editor and preview included.",
  shortcuts: "Click a shortcut, then press the new keys. Backspace clears it, Esc cancels.",
  ai: "CLI agents, chat models, and the agent console. API keys stay in the macOS keychain.",
};

export type SettingEntry = { id: string; page: SettingsPageId; label: string; keywords: string };

/** Search entry id for a keymap command's row on the Shortcuts page. */
export function shortcutEntryId(commandId: string): string {
  return `key-${commandId}`;
}

export const SETTING_ENTRIES: SettingEntry[] = [
  { id: "restore-session", page: "general", label: "Restore last session", keywords: "reopen folder tabs split startup" },
  { id: "update-mode", page: "general", label: "Update checks", keywords: "updates automatic manual daily" },
  { id: "check-updates", page: "general", label: "Check for updates", keywords: "update version now" },
  { id: "settings-files", page: "general", label: "Edit as JSON", keywords: "settings files settings.json agent.json" },
  { id: "app-icon", page: "general", label: "App icon", keywords: "logo dock icon" },

  { id: "area", page: "editing", label: "Area", keywords: "explorer main sub zone" },
  { id: "font-family", page: "editing", label: "Font family", keywords: "typeface custom font" },
  { id: "font-size", page: "editing", label: "Font size", keywords: "text size px" },
  { id: "soft-wrap", page: "editing", label: "Soft wrap", keywords: "wrapping lines window guide off" },
  { id: "wrap-column", page: "editing", label: "Wrap column", keywords: "wrapping guide width" },

  { id: "theme-cards", page: "theme", label: "Theme", keywords: "color colors dark light system catppuccin everforest nord" },
  { id: "custom-theme", page: "theme", label: "Custom theme name", keywords: "theme css" },

  { id: "restore-default-keys", page: "shortcuts", label: "Restore Defaults", keywords: "reset shortcuts keys" },
  ...KEYMAP_COMMANDS.map((command) => ({
    id: shortcutEntryId(command.id),
    page: "shortcuts" as const,
    label: command.label,
    keywords: `${command.category} shortcut`,
  })),

  { id: "cli-agents", page: "ai", label: "CLI agents", keywords: "claude codex agent command" },
  { id: "models", page: "ai", label: "Models", keywords: "api key provider local remote hosted" },
  { id: "quick-actions-model", page: "ai", label: "Quick actions model", keywords: "proofread rewrite summarize outline" },
  { id: "max-context", page: "ai", label: "Max context characters", keywords: "context limit trim" },
  { id: "workspace-context", page: "ai", label: "Workspace context", keywords: "relevant files folder" },
  { id: "files-per-chat", page: "ai", label: "Files per chat", keywords: "workspace context count" },
  { id: "terminal", page: "ai", label: "Terminal", keywords: "terminal app agent console" },
  { id: "terminal-font", page: "ai", label: "Terminal font", keywords: "terminal font size" },
  { id: "agent-commands", page: "ai", label: "Agent commands", keywords: "agent console commands" },
];

export type SearchHit = { kind: "page" | "setting"; page: SettingsPageId; id: string; label: string };

function matches(query: string, label: string, keywords: string): boolean {
  return `${label} ${keywords}`.toLowerCase().includes(query);
}

/** Page hits first (page order), then setting hits by page order then entry order. */
export function searchSettings(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pageHits: SearchHit[] = SETTINGS_PAGES.filter((p) => matches(q, p.label, p.keywords)).map((p) => ({
    kind: "page",
    page: p.id,
    id: p.id,
    label: p.label,
  }));
  const settingHits: SearchHit[] = SETTINGS_PAGES.flatMap((p) =>
    SETTING_ENTRIES.filter((e) => e.page === p.id && matches(q, e.label, e.keywords)).map((e) => ({
      kind: "setting" as const,
      page: e.page,
      id: e.id,
      label: e.label,
    })),
  );
  return [...pageHits, ...settingHits];
}

/** Whether Esc should leave settings: not while typing in a field or recording a shortcut. */
export function shouldLeaveOnEscape(
  target: { tagName?: string; isContentEditable?: boolean } | null,
  recording: boolean,
): boolean {
  if (recording) return false;
  if (!target) return true;
  if (target.isContentEditable) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}
