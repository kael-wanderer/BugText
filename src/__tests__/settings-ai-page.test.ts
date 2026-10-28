import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_AI_SETTINGS, type AISettings } from "../ai/aisettings";
import { DEFAULT_SETTINGS } from "../settings";
import { renderUseFor } from "../settings-screen/page-ai-use-for";
import { aiPage } from "../settings-screen/page-ai";
import {
  createSettingsScreen,
  type ScreenDeps,
} from "../settings-screen/screen";
import type { AiPageDeps } from "../settings-screen/page-ai";
let settings: AISettings;
let deps: ScreenDeps & AiPageDeps;
beforeEach(() => {
  installTestDom();
  settings = structuredClone(DEFAULT_AI_SETTINGS);
  settings.connections = [
    {
      id: "evil",
      name: "<img onerror>",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      auth: "bearer",
      textModel: "m",
    },
  ];
  settings.uses.rewrite = {
    engine: { kind: "api", connectionId: "evil" },
    model: "custom",
    effort: "",
  };
  deps = {
    getSettings: () => DEFAULT_SETTINGS,
    getAISettings: () => settings,
    onAISettingsChange: vi.fn((next) => {
      settings = next;
    }),
    onSettingsChange: vi.fn(),
    getClis: () => [],
    rescan: vi.fn(),
    getModelsCache: () => ({}),
    onOpenSettingsFile: vi.fn(),
    onOpenAISettingsFile: vi.fn(),
    onCheckForUpdates: vi.fn(),
    getActiveTabName: () => null,
    getAppVersion: async () => "1",
    setDockIcon: async () => {},
    isMac: true,
  };
});
it("renders five aligned feature rows and safe connection text", () => {
  const host = document.createElement("div");
  renderUseFor(host, deps);
  const rows = host.querySelectorAll(".st-use-row");
  expect(
    Array.from(rows).map((r) => (r as HTMLElement).dataset.setting),
  ).toEqual([
    "use-chat",
    "use-proofread",
    "use-rewrite",
    "use-summarize",
    "use-outline",
  ]);
  for (const r of rows)
    expect((r as HTMLElement).style.gridTemplateColumns).toBeFalsy();
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain("<img onerror>");
});
it("toggles rewrite and resets model when its engine changes", () => {
  const host = document.createElement("div");
  renderUseFor(host, deps);
  const toggle = host.querySelector(
    '[aria-label="Enable Rewrite"]',
  ) as HTMLInputElement;
  toggle.checked = false;
  toggle.dispatchEvent(new Event("change"));
  expect(settings.enabled.rewrite).toBe(false);
  const engine = host.querySelector(
    '[aria-label="Rewrite engine"]',
  ) as HTMLSelectElement;
  engine.value = "none";
  engine.dispatchEvent(new Event("change"));
  expect(settings.uses.rewrite?.model).toBe("");
});
it("disables effort for API engines", () => {
  const host = document.createElement("div");
  renderUseFor(host, deps);
  const effort = host.querySelector(
    '[aria-label="Rewrite effort"]',
  ) as HTMLSelectElement;
  expect(effort.disabled).toBe(true);
  expect(effort.textContent).toContain("No effort");
});
it("shows rail subitems in order", () => {
  for (const id of ["settings-rail", "settings-pane", "ab-settings"]) {
    const el = document.createElement("div");
    el.id = id;
    document.body.append(el);
  }
  const screen = createSettingsScreen(deps, [aiPage]);
  screen.open("ai");
  const items = document
    .getElementById("settings-rail")!
    .querySelectorAll(".st-sub-nav");
  expect(Array.from(items).map((x) => x.textContent)).toEqual([
    "Use for",
    "Actions",
    "Context",
    "Local CLI",
    "API providers",
    "MCP server",
  ]);
});

it("puts every feature control on the shared control grid", () => {
  const host = document.createElement("div");
  renderUseFor(host, deps);
  const grids = host.querySelectorAll(".st-use-controls-grid");
  expect(grids).toHaveLength(5);
  expect(Array.from(grids).every((grid) => grid.classList.contains("st-use-controls-grid"))).toBe(true);
});

it("keeps the engine badge outside the select text area", () => {
  settings.uses.chat = { engine: { kind: "cli", tool: "claude" }, model: "", effort: "" };
  const host = document.createElement("div");
  renderUseFor(host, deps);
  const control = host.querySelector(".st-engine-control")!;
  const badge = control.querySelector(".st-engine-badge")!;
  expect(badge.classList.contains("st-engine-badge-inline")).toBe(true);
  expect(control.children[0]).toBe(badge);
});
