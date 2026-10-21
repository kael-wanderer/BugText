import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
import { DEFAULT_SETTINGS } from "../settings";
import { renderLocalCli } from "../settings-screen/page-ai-local-cli";
import { runCli } from "../ai/cli-runner";
import type { ScreenDeps } from "../settings-screen/screen";
import type { CliInfo } from "../ai/engines";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(false),
}));
vi.mock("../ai/cli-runner", () => ({
  runCli: vi.fn(async (o) => o.onChunk("ok")),
}));
let deps: ScreenDeps;
let clis: CliInfo[];
beforeEach(() => {
  installTestDom();
  vi.clearAllMocks();
  const settings = structuredClone(DEFAULT_AI_SETTINGS);
  settings.uses.rewrite = {
    engine: { kind: "cli", tool: "codex" },
    model: "m",
    effort: "high",
  };
  clis = [
    {
      tool: "claude",
      found: true,
      path: "/bin/claude",
      version: "1",
      accounts: [{ label: "default", dir: "/home/.claude" }],
      models: [],
    },
    {
      tool: "codex",
      found: true,
      path: "/bin/codex",
      version: "2",
      accounts: [],
      models: [],
    },
    {
      tool: "pi",
      found: false,
      path: "",
      version: "",
      accounts: [],
      models: [],
    },
  ];
  deps = {
    getAISettings: () => settings,
    onAISettingsChange: vi.fn((next) => Object.assign(settings, next)),
    getClis: () => clis,
    rescan: vi.fn(async () => {}),
    getModelsCache: () => ({}),
    getSettings: () => DEFAULT_SETTINGS,
    onSettingsChange: vi.fn(),
    onOpenSettingsFile: vi.fn(),
    onOpenAISettingsFile: vi.fn(),
    onCheckForUpdates: vi.fn(),
    getActiveTabName: () => null,
    getAppVersion: async () => "1",
    setDockIcon: async () => {},
    isMac: true,
  };
});
async function render() {
  const host = document.createElement("div");
  renderLocalCli(host, deps);
  await vi.waitFor(() => expect(deps.rescan).toHaveBeenCalled());
  await Promise.resolve();
  return host;
}
it("renders cards in order, missing Pi and Rewrite usage", async () => {
  const host = await render();
  expect(
    Array.from(host.querySelectorAll("fieldset")).map((e) => e.dataset.setting),
  ).toEqual(["cli-claude", "cli-codex", "cli-pi"]);
  const pi = host.querySelector('[data-setting="cli-pi"]')!;
  expect(pi.textContent).toContain("Not found on PATH");
  expect(
    Array.from(pi.querySelectorAll("button")).some((b) =>
      b.textContent?.startsWith("Test"),
    ),
  ).toBe(false);
  expect(
    host.querySelector('[data-setting="cli-codex"]')!.textContent,
  ).toContain("Rewrite");
});
it("shows Account only with multiple Claude accounts", async () => {
  let host = await render();
  expect(host.querySelector('[aria-label="Claude Code Account"]')).toBeNull();
  clis[0].accounts.push({ label: "work", dir: "/home/.claude-work" });
  host = await render();
  expect(
    host.querySelector('[aria-label="Claude Code Account"]'),
  ).not.toBeNull();
});
it("rejects unsafe proxy without saving", async () => {
  const host = await render();
  const input = host.querySelector(
    '[aria-label="Claude Code Proxy base URL"]',
  ) as HTMLInputElement;
  input.value = "http://evil.com";
  input.dispatchEvent(new Event("blur"));
  expect(deps.onAISettingsChange).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Use HTTPS");
});
it("tests answer-only with feature model and effort", async () => {
  const host = await render();
  const test = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === "Test Codex CLI",
  )!;
  test.click();
  await vi.waitFor(() => expect(host.textContent).toContain("It answered: ok"));
  expect(runCli).toHaveBeenCalledWith(
    expect.objectContaining({
      tool: "codex",
      model: "m",
      effort: "high",
      write: false,
      folder: null,
    }),
  );
});
