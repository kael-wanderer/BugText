// Static index of settings pages and rows, plus the pure search matcher.
// Every row a page renders carries data-setting="<entry id>" from this list.

import { KEYMAP_COMMANDS } from "../keymap";

export type AiSubPage = "use-for" | "local-cli" | "api" | "mcp";

export type SettingsPageId =
  "general" | "editing" | "theme" | "shortcuts" | "ai";

export const SETTINGS_PAGES: ReadonlyArray<{
  id: SettingsPageId;
  label: string;
  keywords: string;
}> = [
  {
    id: "general",
    label: "General",
    keywords:
      "interface font size sidebar explorer startup session updates version settings.json agent.json app icon",
  },
  {
    id: "editing",
    label: "Editing",
    keywords:
      "font size typeface wrap wrapping column editor explorer main sub",
  },
  {
    id: "theme",
    label: "Themes",
    keywords: "colors appearance dark light palette",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    keywords: "keyboard keys keybindings hotkeys keymap",
  },
  {
    id: "ai",
    label: "AI",
    keywords: "agents models providers connections local cli llm",
  },
];

/** One-line description under each page title. */
export const PAGE_LEDES: Record<SettingsPageId, string> = {
  general: "Interface text, file explorer, startup and updates.",
  editing: "Fonts and text size for each area, and how long lines wrap.",
  theme: "The colours the app itself is drawn in.",
  shortcuts:
    "Click a shortcut, then press the new keys. Backspace clears it, Esc cancels.",
  ai: "Which engine each AI feature uses, and the connections and local tools it can call.\nAPI keys are stored on this Mac.",
};

export type SettingEntry = {
  sub?: AiSubPage;
  id: string;
  page: SettingsPageId;
  label: string;
  keywords: string;
};

/** Search entry id for a keymap command's row on the Shortcuts page. */
export function shortcutEntryId(commandId: string): string {
  return `key-${commandId}`;
}

export const SETTING_ENTRIES: SettingEntry[] = [
  { id: "main-text-size", page: "general", label: "Editor Font Size", keywords: "right panel main document editor reading preview text size" },
  { id: "sub-text-size", page: "general", label: "Sub Editor Font Size", keywords: "second panel split document editor reading preview text size" },
  { id: "interface-size", page: "general", label: "Font Size", keywords: "interface text size scale" },
  { id: "interface-font", page: "general", label: "Font Family", keywords: "interface typeface font" },
  { id: "explorer-size", page: "general", label: "File Explorer Font Size", keywords: "sidebar file folder text size readability" },
  { id: "explorer-font", page: "general", label: "File Explorer Font Family", keywords: "sidebar font typeface" },
  { id: "dark-theme", page: "theme", label: "Dark Theme", keywords: "appearance theme search" },
  { id: "light-theme", page: "theme", label: "Light Theme", keywords: "appearance theme search" },
  { id: "sidebar-look", page: "theme", label: "Left Sidebar Appearance", keywords: "match panel tinted default" },
  {
    id: "restore-session",
    page: "general",
    label: "Restore last session",
    keywords: "reopen folder tabs split startup",
  },
  {
    id: "update-mode",
    page: "general",
    label: "Update checks",
    keywords: "updates automatic manual daily",
  },
  {
    id: "check-updates",
    page: "general",
    label: "Check for updates",
    keywords: "update version now",
  },
  {
    id: "settings-files",
    page: "general",
    label: "Edit as JSON",
    keywords: "settings files settings.json agent.json",
  },
  {
    id: "app-icon",
    page: "general",
    label: "App icon",
    keywords: "logo dock icon",
  },

  {
    id: "area",
    page: "editing",
    label: "Area",
    keywords: "explorer main sub zone",
  },
  {
    id: "font-family",
    page: "editing",
    label: "Font family",
    keywords: "typeface custom font",
  },
  {
    id: "font-size",
    page: "editing",
    label: "Font size",
    keywords: "text size px",
  },
  {
    id: "soft-wrap",
    page: "editing",
    label: "Soft wrap",
    keywords: "wrapping lines window guide off",
  },
  {
    id: "wrap-column",
    page: "editing",
    label: "Wrap column",
    keywords: "wrapping guide width",
  },

  {
    id: "theme-mode",
    page: "theme",
    label: "Appearance",
    keywords: "theme css",
  },

  {
    id: "restore-default-keys",
    page: "shortcuts",
    label: "Restore Defaults",
    keywords: "reset shortcuts keys",
  },
  ...KEYMAP_COMMANDS.map((command) => ({
    id: shortcutEntryId(command.id),
    page: "shortcuts" as const,
    label: command.label,
    keywords: `${command.category} shortcut`,
  })),

  {
    id: "use-chat",
    page: "ai",
    label: "Chat",
    sub: "use-for",
    keywords: "search summarize write",
  },
  {
    id: "use-proofread",
    page: "ai",
    label: "Proofread",
    sub: "use-for",
    keywords: "quick action",
  },
  {
    id: "use-rewrite",
    page: "ai",
    label: "Rewrite",
    sub: "use-for",
    keywords: "quick action",
  },
  {
    id: "use-summarize",
    page: "ai",
    label: "Summarize",
    sub: "use-for",
    keywords: "quick action",
  },
  {
    id: "use-outline",
    page: "ai",
    label: "Generate outline",
    sub: "use-for",
    keywords: "quick action",
  },
  {
    id: "context-chars",
    page: "ai",
    label: "Max context characters",
    sub: "use-for",
    keywords: "context limit",
  },
  {
    id: "context-files",
    page: "ai",
    label: "Files per chat",
    sub: "use-for",
    keywords: "workspace context count",
  },
  {
    id: "cli-claude",
    page: "ai",
    label: "Claude Code",
    sub: "local-cli",
    keywords: "account proxy executable",
  },
  {
    id: "cli-codex",
    page: "ai",
    label: "Codex CLI",
    sub: "local-cli",
    keywords: "proxy executable",
  },
  {
    id: "cli-pi",
    page: "ai",
    label: "Pi",
    sub: "local-cli",
    keywords: "executable",
  },
  {
    id: "cli-rescan",
    page: "ai",
    label: "Rescan",
    sub: "local-cli",
    keywords: "scan tools",
  },
  {
    id: "api-connections",
    page: "ai",
    label: "Connections",
    sub: "api",
    keywords: "api key provider models",
  },
  {
    id: "api-add",
    page: "ai",
    label: "Add Connection",
    sub: "api",
    keywords: "api server",
  },
  { id: "mcp-enabled", page: "ai", label: "MCP server", sub: "mcp", keywords: "agents socket notes bridge" },
  { id: "mcp-claude", page: "ai", label: "Claude Code", sub: "mcp", keywords: "register connect cli" },
  { id: "mcp-codex", page: "ai", label: "Codex CLI", sub: "mcp", keywords: "register connect cli" },
  { id: "mcp-activity", page: "ai", label: "Recent agent activity", sub: "mcp", keywords: "history events" },
];

export type SearchHit = {
  sub?: AiSubPage;
  kind: "page" | "setting";
  page: SettingsPageId;
  id: string;
  label: string;
};

function matches(query: string, label: string, keywords: string): boolean {
  return `${label} ${keywords}`.toLowerCase().includes(query);
}

/** Page hits first (page order), then setting hits by page order then entry order. */
export function searchSettings(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pageHits: SearchHit[] = SETTINGS_PAGES.filter((p) =>
    matches(q, p.label, p.keywords),
  ).map((p) => ({
    kind: "page",
    page: p.id,
    id: p.id,
    label: p.label,
  }));
  const settingHits: SearchHit[] = SETTINGS_PAGES.flatMap((p) =>
    SETTING_ENTRIES.filter(
      (e) => e.page === p.id && matches(q, e.label, e.keywords),
    ).map((e) => ({
      kind: "setting" as const,
      page: e.page,
      id: e.id,
      label: e.label,
      ...(e.sub ? { sub: e.sub } : {}),
    })),
  );
  return [...pageHits, ...settingHits];
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "password",
  "number",
  "tel",
]);

/** Whether Esc should leave settings: not while typing text or recording a shortcut. */
export function shouldLeaveOnEscape(
  target: {
    tagName?: string;
    isContentEditable?: boolean;
    type?: string;
  } | null,
  recording: boolean,
): boolean {
  if (recording) return false;
  if (!target) return true;
  if (target.isContentEditable) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return false;
  if (tag === "INPUT")
    return !TEXT_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
  return true;
}
