import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_SETTINGS, parseSettings } from "../settings";
import { mcpPage, appendMcpActivity, getMcpActivity } from "../settings-screen/page-ai-mcp";

beforeEach(() => {
  installTestDom();
});

it("renders the switch with its registry id and saves the flipped setting", () => {
  let settings = { ...DEFAULT_SETTINGS, mcp: { enabled: false } };
  const save = vi.fn((next) => { settings = next; });
  const host = document.createElement("div");
  mcpPage.render(host, {
    getSettings: () => settings,
    onSettingsChange: save,
    getStatus: () => ({ enabled: false, connected: 0, roots: [] }),
    getClientStatus: async (client) => ({ found: false, registered: false, command: client }),
    register: vi.fn(), unregister: vi.fn(), copy: vi.fn(),
  });
  const toggle = host.querySelector('[data-setting="mcp-enabled"]')?.querySelector("input") as HTMLInputElement;
  expect(toggle).not.toBeNull();
  toggle.checked = true;
  toggle.dispatchEvent(new Event("change"));
  expect(settings.mcp.enabled).toBe(true);
  expect(save).toHaveBeenCalled();
});

it("renders command text literally and hides Register when registered", async () => {
  const host = document.createElement("div");
  mcpPage.render(host, {
    getSettings: () => ({ ...DEFAULT_SETTINGS, mcp: { enabled: false } }),
    onSettingsChange: vi.fn(),
    getStatus: () => ({ enabled: false, connected: 0, roots: [] }),
    getClientStatus: async (client) => ({ found: true, registered: client === "claude", command: "<b>literal</b>" }),
    register: vi.fn(), unregister: vi.fn(), copy: vi.fn(),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(host.querySelectorAll(".st-mcp-client-card")).toHaveLength(2);
  expect(host.querySelector("b")?.textContent).not.toBe("literal");
  expect(host.textContent).toContain("<b>literal</b>");
  const claude = host.querySelector('[data-client="claude"]')!;
  expect(claude.querySelector('[data-action="register"]')).toBeNull();
});

it("caps recent activity at 50 entries", () => {
  for (let i = 0; i < 55; i += 1) appendMcpActivity({ time: i, client: "Codex", text: `event ${i}` });
  expect(getMcpActivity()).toHaveLength(50);
  expect(getMcpActivity()[0].text).toBe("event 5");
});

it("defaults MCP settings off when missing", () => {
  expect(parseSettings("{}").mcp).toEqual({ enabled: false });
});
