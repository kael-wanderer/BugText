// Full-window settings screen: a rail over the explorer column and a pane over
// the editor area, laid on top of the workbench. Opening only toggles a body
// class; the workbench grid and editor size never change, so tabs, unsaved
// text, scroll and split come back exactly as they were.

import { glyphs } from "../glyphs";
import type { AiPageDeps } from "./page-ai";
import type { AiSubPage } from "./registry";
import type { AISettings } from "../ai/aisettings";
import type { AppIconId, Settings } from "../settings";
import { pageHeader } from "./controls";
import {
  SETTINGS_PAGES,
  searchSettings,
  shouldLeaveOnEscape,
  type SearchHit,
  type SettingsPageId,
} from "./registry";
import "./settings-screen.css";

// Controls in document order under a node; used to find "the same control" again
// after a page is rebuilt.
function focusableControls(root: Element): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const child of Array.from(root.children)) {
    if (/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(child.tagName)) found.push(child as HTMLElement);
    found.push(...focusableControls(child));
  }
  return found;
}

function settingRowOf(node: Element, pane: Element): HTMLElement | null {
  for (let at: Element | null = node; at && at !== pane; at = at.parentElement) {
    if ((at as HTMLElement).dataset?.setting) return at as HTMLElement;
  }
  return null;
}

export type FocusKey = { setting: string; index: number };

/** Names the focused control as its settings row plus its position in that row. */
export function settingFocusKey(pane: Element, active: Element | null): FocusKey | null {
  if (!active || active === pane || !pane.contains(active)) return null;
  const row = settingRowOf(active, pane);
  if (!row) return null;
  const index = focusableControls(row).indexOf(active as HTMLElement);
  return index < 0 ? null : { setting: row.dataset.setting!, index };
}

/** Focuses the control a key names in a rebuilt page; false when it is gone. */
export function restoreSettingFocus(pane: Element, key: FocusKey | null): boolean {
  if (!key) return false;
  const row = pane.querySelector<HTMLElement>(`[data-setting="${CSS.escape(key.setting)}"]`);
  const control = row ? focusableControls(row)[key.index] : undefined;
  control?.focus({ preventScroll: true });
  return Boolean(control);
}

export type ScreenDeps = AiPageDeps & {
  openAiPage?: (sub: AiSubPage) => void;
  /** Shows another settings page and scrolls to one of its rows. */
  openPage?: (id: SettingsPageId, entryId?: string) => void;
  getSettings: () => Settings;
  getAISettings: () => AISettings;
  onSettingsChange: (settings: Settings) => void;
  onAISettingsChange: (settings: AISettings) => void;
  onOpenSettingsFile: () => void;
  onManageWorkspaces?: () => void;
  onOpenAISettingsFile: () => void;
  onCheckForUpdates: () => void;
  /** Template folder helpers; absent in contexts that cannot reach the app. */
  templates?: {
    resolveFolder: (custom: string) => Promise<string>;
    chooseFolder: () => Promise<string | null>;
    openFolder: () => Promise<void>;
    newTemplate: () => Promise<void>;
  };
} & {
  getActiveTabName(): string | null;
  getAppVersion(): Promise<string>;
  setDockIcon(id: AppIconId): Promise<void>;
  isMac: boolean;
};

export type SettingsPage = {
  id: SettingsPageId;
  render(host: HTMLElement, deps: ScreenDeps, sub?: AiSubPage): void | Promise<void>;
  /** True while the page owns Esc (e.g. recording a shortcut). */
  blocksEscape?(): boolean;
};

export type SettingsScreen = {
  open(page?: SettingsPageId, sub?: AiSubPage): void;
  close(): void;
  isOpen(): boolean;
  refresh(): void;
  toggle(): void;
};

// Static SVG markup only (no user data).
const PAGE_ICONS: Record<SettingsPageId, string> = {
  general:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  editing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  theme:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  shortcuts:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/></svg>',
  ai: glyphs.ai,
};
const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>';

const FLASH_MS = 1200;

// Last page shown, remembered for the session only.
let lastPage: SettingsPageId = "general";
let lastSub: AiSubPage = "use-for";

function pageLabel(id: SettingsPageId): string {
  return SETTINGS_PAGES.find((p) => p.id === id)?.label ?? id;
}

export function createSettingsScreen(
  deps: ScreenDeps,
  pages: SettingsPage[],
): SettingsScreen {
  const rail = document.getElementById("settings-rail")!;
  const pane = document.getElementById("settings-pane")!;
  const gear = document.getElementById("ab-settings");
  pane.tabIndex = -1;

  let open = false;
  let query = "";
  let returnFocus: HTMLElement | null = null;
  let flashTimer: number | undefined;

  // ---- Rail ----
  rail.replaceChildren();
  const title = document.createElement("div");
  title.className = "st-rail-title";
  title.textContent = "Settings";

  const searchBox = document.createElement("label");
  searchBox.className = "st-search";
  searchBox.innerHTML = SEARCH_ICON;
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Search";
  searchInput.spellcheck = false;
  searchInput.setAttribute("aria-label", "Search settings");
  searchBox.append(searchInput);

  const nav = document.createElement("nav");
  nav.className = "st-nav";
  nav.setAttribute("aria-label", "Settings pages");
  const navButtons = new Map<SettingsPageId, HTMLButtonElement>();
  const subButtons = new Map<AiSubPage, HTMLButtonElement>();
  for (const page of SETTINGS_PAGES) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = PAGE_ICONS[page.id];
    b.append(document.createTextNode(page.label));
    b.addEventListener("click", () => showPage(page.id));
    navButtons.set(page.id, b);
    nav.append(b);
    if (page.id === "ai") {
      for (const [sub, label, section] of [
        ["use-for", "Use for", "FEATURES"],
        ["actions", "Actions", ""],
        ["context", "Context", ""],
        ["local-cli", "Local CLI", "ENGINES"],
        ["api", "API providers", ""],
        ["mcp", "MCP server", "AGENTS"],
      ] as const) {
        if (section) {
          const heading = document.createElement("div");
          heading.className = "st-nav-caption";
          heading.textContent = section;
          nav.append(heading);
        }
        const item = document.createElement("button");
        item.type = "button";
        item.className = "st-sub-nav";
        item.textContent = label;
        item.addEventListener("click", () => showPage("ai", sub));
        subButtons.set(sub, item);
        nav.append(item);
      }
    }
  }

  const back = document.createElement("button");
  back.type = "button";
  back.className = "st-back";
  const backLabel = document.createElement("span");
  backLabel.className = "st-back-label";
  const backHint = document.createElement("small");
  backHint.textContent = "Esc";
  back.append(backLabel, backHint);
  back.addEventListener("click", () => close());

  rail.append(title, searchBox, nav, back);

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    render();
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (!searchInput.value) return;
    searchInput.value = "";
    query = "";
    render();
  });

  // Wait for lazy pages before revealing a search hit or restoring control focus.
  let pageReady: Promise<void> | null = null;
  let renderVersion = 0;
  function afterPage(run: () => void): void {
    const version = renderVersion;
    if (pageReady) void pageReady.then(() => { if (open && version === renderVersion) run(); });
    else run();
  }

  // ---- Pane ----
  function renderPage(id: SettingsPageId): void {
    const page = pages.find((p) => p.id === id);
    const section = document.createElement("section");
    section.className = "st-page";
    section.dataset.page = id;
    if (page) {
      const ready = page.render(
        section,
        {
          ...deps,
          openAiPage: (sub) => showPage("ai", sub),
          openPage: (target, entryId) => {
            showPage(target);
            if (entryId) revealSetting(entryId);
          },
        },
        lastSub,
      );
      pageReady = ready ? ready.catch(() => { section.textContent = "Could not load settings page."; }) : null;
    } else pageHeader(section, id);
    pane.replaceChildren(section);
  }

  function renderResults(): void {
    const hits = searchSettings(query);
    const section = document.createElement("section");
    section.className = "st-page st-results-view";
    const heading = document.createElement("h2");
    heading.className = "st-title";
    heading.textContent = "Search";
    const count = document.createElement("p");
    count.className = "st-lede";
    count.textContent = hits.length
      ? `${hits.length} match${hits.length === 1 ? "" : "es"}`
      : `Nothing in Settings matches “${query.trim()}”.`;
    const list = document.createElement("ul");
    list.className = "st-results";
    for (const hit of hits) list.append(resultItem(hit));
    section.append(heading, count, list);
    pane.replaceChildren(section);
  }

  function resultItem(hit: SearchHit): HTMLLIElement {
    const item = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    const label = document.createElement("strong");
    label.textContent = hit.label;
    const where = document.createElement("small");
    where.textContent = hit.kind === "page" ? "Page" : pageLabel(hit.page);
    b.append(label, where);
    b.addEventListener("click", () => {
      showPage(hit.page, hit.sub);
      if (hit.kind === "setting") revealSetting(hit.id);
    });
    item.append(b);
    return item;
  }

  function revealSetting(id: string): void {
    afterPage(() => {
      const target = pane.querySelector<HTMLElement>(
        `[data-setting="${CSS.escape(id)}"]`,
      );
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      pane
        .querySelectorAll(".flash")
        .forEach((node) => node.classList.remove("flash"));
      target.classList.add("flash");
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(
        () => target.classList.remove("flash"),
        FLASH_MS,
      );
    });
  }

  function syncRail(): void {
    const searching = query.trim() !== "";
    for (const [id, b] of navButtons) {
      if (!searching && id === lastPage) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    for (const [sub, b] of subButtons) {
      if (!searching && lastPage === "ai" && lastSub === sub)
        b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    const name = deps.getActiveTabName();
    backLabel.textContent = name ? `‹ ${name}` : "‹ Back";
    back.title = name ? `Back to ${name} (Esc)` : "Back (Esc)";
  }

  function render(): void {
    renderVersion++;
    pageReady = null;
    syncRail();
    if (query.trim()) renderResults();
    else renderPage(lastPage);
  }

  function showPage(id: SettingsPageId, sub: AiSubPage = "use-for"): void {
    if (id === "ai") lastSub = sub;
    lastPage = id;
    query = "";
    searchInput.value = "";
    render();
    pane.scrollTop = 0;
  }

  // ---- Open / close ----
  function setOpen(next: boolean): void {
    open = next;
    document.body.classList.toggle("settings-active", next);
    rail.hidden = !next;
    pane.hidden = !next;
    gear?.classList.toggle("active", next);
    gear?.setAttribute("aria-pressed", String(next));
  }

  function openScreen(page?: SettingsPageId, sub?: AiSubPage): void {
    if (!open) {
      const active = document.activeElement;
      returnFocus =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      setOpen(true);
    }
    if (page) showPage(page, sub);
    else render();
    // Take focus off the (now hidden) editor so typing cannot reach it.
    pane.focus({ preventScroll: true });
  }

  function close(): void {
    if (!open) return;
    window.clearTimeout(flashTimer);
    setOpen(false);
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  // Refreshes arrive after every save (and from other windows); keep the
  // keyboard user on the control they were using.
  function refresh(): void {
    if (!open) return;
    const scroll = pane.scrollTop;
    const focus = settingFocusKey(pane, document.activeElement);
    render();
    afterPage(() => {
      pane.scrollTop = scroll;
      restoreSettingFocus(pane, focus);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (!open || event.defaultPrevented) return;
    const recording = pages.some((p) => p.blocksEscape?.() ?? false);
    if (event.key === "Escape") {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const info = target && {
        tagName: target.tagName,
        isContentEditable: target.isContentEditable,
        type: target instanceof HTMLInputElement ? target.type : undefined,
      };
      if (!shouldLeaveOnEscape(info, recording)) return;
      event.preventDefault();
      close();
      return;
    }
    const mod = deps.isMac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    if (
      event.key === "[" &&
      mod &&
      !event.shiftKey &&
      !event.altKey &&
      !recording
    ) {
      event.preventDefault();
      close();
    }
  });

  return {
    open: openScreen,
    close,
    isOpen: () => open,
    refresh,
    toggle: () => (open ? close() : openScreen()),
  };
}
