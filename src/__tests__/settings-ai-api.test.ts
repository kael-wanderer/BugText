import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { installTestDom } from "./setup";
import { DEFAULT_AI_SETTINGS, type Connection } from "../ai/aisettings";
import { DEFAULT_SETTINGS } from "../settings";
import { renderApi } from "../settings-screen/page-ai-api";
import { openConnectionEditor } from "../settings-screen/ai-connection-editor";
import { listModels } from "../ai/connections";
import type { ScreenDeps } from "../settings-screen/screen";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(true),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));
vi.mock("../ai/models-cache", () => ({
  loadModelsCache: vi.fn().mockResolvedValue({}),
  saveModels: vi.fn().mockResolvedValue(undefined),
  dropModels: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../ai/connections", async () => ({
  ...(await vi.importActual("../ai/connections")),
  listModels: vi.fn().mockResolvedValue({ ok: true, models: ["m"] }),
}));
const connection: Connection = {
  id: "local",
  name: "Local",
  provider: "openai-compatible",
  baseUrl: "http://localhost:1234/v1",
  auth: "bearer",
  textModel: "m",
};
let deps: ScreenDeps;
let settings: typeof DEFAULT_AI_SETTINGS;
let host: HTMLElement;
beforeEach(() => {
  installTestDom();
  vi.clearAllMocks();
  settings = structuredClone(DEFAULT_AI_SETTINGS);
  settings.connections = [{ ...connection }];
  host = document.createElement("div");
  deps = {
    getAISettings: () => settings,
    onAISettingsChange: vi.fn((next) => {
      settings = next;
    }),
    getClis: () => [],
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
function click(label: string) {
  const b = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  )!;
  expect(b).toBeTruthy();
  b.click();
}
it("verifies each connection automatically and reports status", async () => {
  renderApi(host, deps);
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "Connection verified. 1 models available.",
    ),
  );
  expect(listModels).toHaveBeenCalledWith(connection);
});
it("starts Anthropic fixed and never prefills saved keys", async () => {
  openConnectionEditor(host, null, settings, vi.fn());
  const address = host.querySelector(
    '[aria-label="Server address"]',
  ) as HTMLInputElement;
  expect(address.readOnly).toBe(true);
  const key = host.querySelector('[aria-label="API key"]') as HTMLInputElement;
  await Promise.resolve();
  expect(key.value).toBe("");
});
it("quick fills custom Ollama without authentication", () => {
  openConnectionEditor(host, null, settings, vi.fn());
  click("Custom (OpenAI-compatible)");
  click("Ollama");
  expect(
    (host.querySelector('[aria-label="Server address"]') as HTMLInputElement)
      .value,
  ).toBe("http://localhost:11434/v1");
  expect(
    (host.querySelector('[aria-label="Authentication"]') as HTMLSelectElement)
      .value,
  ).toBe("none");
});
it("clears key before saving changed address", async () => {
  renderApi(host, deps);
  await Promise.resolve();
  click("Edit…");
  const address = host.querySelector(
    '[aria-label="Server address"]',
  ) as HTMLInputElement;
  address.value = "https://new.example/v1";
  click("Save");
  await vi.waitFor(() => expect(deps.onAISettingsChange).toHaveBeenCalled());
  expect(invoke).toHaveBeenCalledWith("delete_secret", { id: "local" });
  const keyCall =
    vi.mocked(invoke).mock.invocationCallOrder[
      vi.mocked(invoke).mock.calls.findIndex((c) => c[0] === "delete_secret")
    ];
  expect(keyCall).toBeLessThan(
    vi.mocked(deps.onAISettingsChange).mock.invocationCallOrder[0],
  );
});
it("blocks a twenty-first connection in page and editor", () => {
  settings.connections = Array.from({ length: 20 }, (_, i) => ({
    ...connection,
    id: `c${i}`,
  }));
  renderApi(host, deps);
  expect(
    Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Add Connection…",
    )!.disabled,
  ).toBe(true);
  host.replaceChildren();
  const save = vi.fn();
  openConnectionEditor(host, null, settings, save);
  click("Save");
  expect(save).not.toHaveBeenCalled();
});
it("deletes the key before saving connection removal", async () => {
  renderApi(host, deps);
  click("Delete");
  await vi.waitFor(() => expect(deps.onAISettingsChange).toHaveBeenCalled());
  const index = vi
    .mocked(invoke)
    .mock.calls.findIndex((c) => c[0] === "delete_secret");
  expect(index).toBeGreaterThanOrEqual(0);
  expect(vi.mocked(invoke).mock.invocationCallOrder[index]).toBeLessThan(
    vi.mocked(deps.onAISettingsChange).mock.invocationCallOrder[0],
  );
  expect(settings.connections).toEqual([]);
});

it("keeps an existing saved key out of the input", async () => {
  vi.mocked(invoke).mockResolvedValue(true);
  openConnectionEditor(host, connection, settings, vi.fn());
  await Promise.resolve();
  expect(invoke).toHaveBeenCalledWith("has_secret", { id: connection.id });
  expect(
    (host.querySelector('[aria-label="API key"]') as HTMLInputElement).value,
  ).toBe("");
  expect(host.textContent).toContain("A key is saved");
});

it("shows untested, missing-key and failed local states", async () => {
  vi.mocked(listModels).mockImplementationOnce(() => new Promise(() => {}));
  vi.mocked(invoke).mockResolvedValue(false);
  renderApi(host, deps);
  expect(host.textContent).toContain("Needs API Key");
  settings.connections[0].auth = "none";
  const second = document.createElement("div");
  vi.mocked(listModels).mockImplementationOnce(() => new Promise(() => {}));
  renderApi(second, deps);
  expect(second.textContent).toContain("Not Tested");
  const third = document.createElement("div");
  vi.mocked(listModels).mockResolvedValueOnce({
    ok: false,
    message: "Could not reach the server.",
  });
  renderApi(third, deps);
  await vi.waitFor(() =>
    expect(third.textContent).toContain(
      "Could not reach localhost:1234 — is LM Studio running?",
    ),
  );
});
