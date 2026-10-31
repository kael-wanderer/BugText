// Static index of settings pages and rows, plus the pure search matcher.
// Every row a page renders carries data-setting="<entry id>" from this list.

import { KEYMAP_COMMANDS } from "../keymap";

export type AiSubPage = "use-for" | "context" | "actions" | "local-cli" | "api" | "mcp";

export type SettingsPageId =
  "general" | "editing" | "export" | "git" | "theme" | "shortcuts" | "ai";

export const SETTINGS_PAGES: ReadonlyArray<{
  id: SettingsPageId;
  label: string;
  keywords: string;
}> = [
  {
    id: "general",
    label: "General",
    keywords:
      "typography interface font size typeface sidebar explorer editor sub startup session updates version settings.json agent.json app icon",
  },
  {
    id: "editing",
    label: "Editing",
    keywords:
      "wrap wrapping column soft lines",
  },
  { id: "export", label: "Export", keywords: "presets tools pandoc typst pdf word" },
  { id: "git", label: "Git", keywords: "source control backup sync version path" },
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
  general: "Typography, startup and updates.",
  editing: "How lines wrap, how links and tables behave, where pasted images go, and where templates and quick notes live.",
  export: "Tools and presets for PDF and Word export.",
  git: "Source Control and installed Git.",
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
  { id: "git.path", page: "git", label: "Git path", keywords: "git executable" },
  { id: "git.version", page: "git", label: "Git version", keywords: "git version" },
  { id: "git.show", page: "git", label: "Show Source Control", keywords: "sidebar git" },
  { id: "export-preset", page: "export", label: "Export preset", keywords: "presets" },
  { id: "export-page-size", page: "export", label: "Page size", keywords: "paper pdf" },
  { id: "export-margins", page: "export", label: "Margins", keywords: "page pdf mm" },
  { id: "export-page-numbers", page: "export", label: "Page numbers", keywords: "export preset" },
  { id: "export-font", page: "export", label: "Body font", keywords: "export preset" },
  { id: "export-font-size", page: "export", label: "Font size", keywords: "export preset" },
  { id: "export-line-spacing", page: "export", label: "Line spacing", keywords: "export preset" },
  { id: "export-title", page: "export", label: "Title block", keywords: "export preset" },
  { id: "export-author", page: "export", label: "Author", keywords: "export preset" },
  { id: "export-date", page: "export", label: "Date", keywords: "export preset" },
  { id: "export-toc", page: "export", label: "Table of contents", keywords: "export preset" },
  { id: "export-depth", page: "export", label: "Contents depth", keywords: "export preset" },
  { id: "export-numbered", page: "export", label: "Numbered sections", keywords: "export preset" },
  { id: "export-pandoc", page: "export", label: "Pandoc", keywords: "export tool install" },
  { id: "export-typst", page: "export", label: "Typst", keywords: "export tool install" },
  { id: "large-folders", page: "general", label: "Large folders", keywords: "performance refresh slow many files notes index" },
  { id: "interface-size", page: "general", label: "App Font Size", keywords: "interface text size scale toolbar tabs pdf chrome" },
  { id: "interface-font", page: "general", label: "App Font", keywords: "interface font family typeface custom" },
  { id: "explorer-size", page: "general", label: "File Explorer Font Size", keywords: "sidebar file folder text size readability" },
  { id: "explorer-font", page: "general", label: "File Explorer Font", keywords: "sidebar font family typeface custom" },
  { id: "explorer-hidden", page: "general", label: "Show Hidden Files", keywords: "dot files dotfiles folders sidebar explorer git env invisible" },
  { id: "main-text-size", page: "general", label: "Editor Font Size", keywords: "right panel main document editor reading preview text size px" },
  { id: "main-font", page: "general", label: "Editor Font", keywords: "main editor font family typeface custom" },
  { id: "sub-text-size", page: "general", label: "Sub Editor Font Size", keywords: "second panel split document editor reading preview text size px" },
  { id: "sub-font", page: "general", label: "Sub Editor Font", keywords: "second panel split font family typeface custom" },
  { id: "dark-theme", page: "theme", label: "Dark Theme", keywords: "appearance theme search" },
  { id: "light-theme", page: "theme", label: "Light Theme", keywords: "appearance theme search" },
  { id: "sidebar-look", page: "theme", label: "Left Sidebar Appearance", keywords: "match panel tinted default" },
  {
    id: "restore-session",
    page: "general",
    label: "Restore last session",
    keywords: "reopen folder tabs split startup",
  },
  { id: "reopen-workspace-windows", page: "general", label: "Reopen workspace windows", keywords: "session startup secondary windows" },
  { id: "manage-workspaces", page: "general", label: "Manage workspaces", keywords: "session switch workspaces" },
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
    id: "editing-fonts",
    page: "editing",
    label: "Fonts and sizes",
    keywords: "font typeface in general",
  },
  { id: "links-hover-preview", page: "editing", label: "Preview links on hover", keywords: "note link hover tooltip preview" },
  { id: "links-complete", page: "editing", label: "Suggest notes while typing links", keywords: "links completion notes markdown" },
  { id: "links-on-rename", page: "editing", label: "When renaming or moving notes", keywords: "links rename move backlinks ask never" },
  { id: "focus-width", page: "editing", label: "Focus width", keywords: "zen writing column narrow wide" },
  { id: "typewriter-scrolling", page: "editing", label: "Typewriter scrolling", keywords: "caret center typing scroll" },
  { id: "show-status-bar", page: "editing", label: "Show status bar", keywords: "cursor words reading time save" },
  { id: "sync-scroll", page: "editing", label: "Sync scroll", keywords: "navigation preview editor" },
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
    id: "table-format-on-edit",
    page: "editing",
    label: "Format tables while editing",
    keywords: "tables markdown align pipes columns",
  },
  {
    id: "table-paste",
    page: "editing",
    label: "Paste spreadsheet cells as a table",
    keywords: "tables paste excel numbers sheets spreadsheet csv tsv",
  },
  {
    id: "image-folder",
    page: "editing",
    label: "Image folder",
    keywords: "images paste drop assets attachments screenshot",
  },
  {
    id: "image-paste-name",
    page: "editing",
    label: "Pasted image name",
    keywords: "images paste screenshot file name",
  },
  { id: "templates-folder", page: "editing", label: "Templates folder", keywords: "templates new from template note folder choose reset" },
  { id: "templates-default-folder", page: "editing", label: "Default folder for new notes", keywords: "templates new note folder location" },
  { id: "templates-date-format", page: "editing", label: "Date format", keywords: "templates date placeholder year month day" },
  { id: "quick-note-target", page: "editing", label: "Quick notes go to", keywords: "quick note capture daily journal inbox" },
  { id: "quick-note-inbox", page: "editing", label: "Inbox file", keywords: "quick note capture inbox" },
  { id: "templates-manage", page: "editing", label: "Manage templates", keywords: "templates open folder new template" },
  {
    id: "image-drop-mode",
    page: "editing",
    label: "Drop images into editor",
    keywords: "images drag drop copy link open",
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
    id: "my-actions", page: "ai", label: "My actions", sub: "actions", keywords: "saved prompts built-in instruction edit answer panel",
  },
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
    id: "context-exclude", page: "ai", sub: "context", label: "Never send to AI", keywords: "exclude glob private patterns",
  },
  {
    id: "context-chars",
    page: "ai",
    label: "Maximum context characters",
    sub: "context",
    keywords: "context limit",
  },
  {
    id: "context-files",
    page: "ai",
    label: "Folder search excerpts",
    sub: "context",
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
