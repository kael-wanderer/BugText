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
  const account = host.querySelector('[aria-label="Claude Code Account"]');
  expect(account).not.toBeNull();
  // The label and its menu sit in one spaced row, not run together.
  const row = account!.parentElement;
  expect(row?.tagName).toBe("LABEL");
  expect(row?.className).toBe("st-cli-account");
  expect(row?.querySelector(".st-cli-account-name")?.textContent).toBe("Account");
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

it("describes Pi as answer-only", async () => {
  const host = await render();
  expect(host.querySelector('[data-setting="cli-pi"]')?.textContent).toContain(
    "Answers only — never changes files",
  );
});
it("deletes the Claude CLI key when its proxy URL changes", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  const host = await render();
  const input = host.querySelector(
    '[aria-label="Claude Code Proxy base URL"]',
  ) as HTMLInputElement;
  input.value = "https://proxy.example/v1";
  input.dispatchEvent(new Event("blur"));
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("delete_secret", { id: "cli-claude" }),
  );
});
it("saves a Claude Code sign-in token in its own Keychain entry", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  const host = await render();
  const input = host.querySelector(
    '[aria-label="Claude Code sign-in token"]',
  ) as HTMLInputElement;
  expect(input.type).toBe("password");
  expect(host.textContent).toContain("claude setup-token");
  input.value = "sk-ant-oat01-abc";
  input.dispatchEvent(new Event("blur"));
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("set_secret", {
      id: "cli-claude-token",
      secret: "sk-ant-oat01-abc",
    }),
  );
  expect(input.value).toBe("");
});
it("keeps the sign-in token when the proxy URL changes", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  const host = await render();
  const input = host.querySelector(
    '[aria-label="Claude Code Proxy base URL"]',
  ) as HTMLInputElement;
  input.value = "https://proxy.example/v1";
  input.dispatchEvent(new Event("blur"));
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("delete_secret", { id: "cli-claude" }),
  );
  expect(invoke).not.toHaveBeenCalledWith("delete_secret", { id: "cli-claude-token" });
});
