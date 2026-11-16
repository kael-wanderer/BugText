import type { AiSubPage, SettingsPageId } from "../settings-screen/registry";

/**
 * Where the app sends someone for the full user guide. The guide is written in
 * `docs/guide/` and published by kael.io.vn at `<GUIDE_BASE_URL>/<slug>`.
 * Help ▸ BugText Guide Online opens the guide's home page; each Settings page
 * links to the guide page that explains it.
 *
 * A slug is permanent once published, so a link in an installed build keeps
 * working after the guide is edited. The guide test checks every slug here
 * against `docs/guide/published-slugs.txt`.
 */
export const GUIDE_BASE_URL = "https://kael.io.vn/projects/bugtext/docs";

const SETTINGS_PAGE_GUIDE: Record<SettingsPageId, string> = {
  general: "reference/settings",
  editing: "writing/editor-basics",
  export: "writing/export",
  git: "notes/history-and-git",
  theme: "reference/settings",
  shortcuts: "reference/keyboard-shortcuts",
  ai: "ai/set-up-ai",
};

const AI_SUB_PAGE_GUIDE: Partial<Record<AiSubPage, string>> = {
  actions: "ai/actions-and-recipes",
  mcp: "ai/mcp-server",
};

/** The guide page that explains a Settings page (and AI sub-page). */
export function settingsGuideSlug(page: SettingsPageId, sub?: AiSubPage): string {
  return (page === "ai" && sub && AI_SUB_PAGE_GUIDE[sub]) || SETTINGS_PAGE_GUIDE[page];
}

/** Every guide slug the app links to. */
export const LINKED_GUIDE_SLUGS: readonly string[] = [
  ...new Set([...Object.values(SETTINGS_PAGE_GUIDE), ...Object.values(AI_SUB_PAGE_GUIDE)]),
];

/** The guide's home page, or one page of it. Only slugs from this file reach here. */
export function guideUrl(slug = ""): string {
  return slug ? `${GUIDE_BASE_URL}/${slug}` : GUIDE_BASE_URL;
}
