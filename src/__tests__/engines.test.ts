import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS, type AISettings, type CliTool, type Engine } from "../ai/aisettings";
import {
  effortLevels,
  engineKey,
  engineOptions,
  modelOptions,
  onEngineChange,
  resolveUse,
  type CliInfo,
} from "../ai/engines";

function cli(tool: CliTool, found = true, models: string[] = []): CliInfo {
  return {
    tool,
    found,
    path: found ? `/usr/local/bin/${tool}` : "",
    version: found ? "1.0.0" : "",
    accounts: [],
    models,
  };
}

function settings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    connections: [
      {
        id: "local",
        name: "Local API",
        provider: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        auth: "none",
        textModel: "m1",
      },
    ],
    ...overrides,
  };
}

describe("effortLevels", () => {
  it("lists supported CLI effort values and none for API or no engine", () => {
    expect(effortLevels({ kind: "cli", tool: "claude" })).toEqual([
      "low", "medium", "high", "xhigh", "max",
    ]);
    expect(effortLevels({ kind: "cli", tool: "codex" })).toEqual([
      "minimal", "low", "medium", "high",
    ]);
    expect(effortLevels({ kind: "cli", tool: "pi" })).toEqual([
      "off", "minimal", "low", "medium", "high", "xhigh",
    ]);
    expect(effortLevels({ kind: "api", connectionId: "local" })).toEqual([]);
    expect(effortLevels({ kind: "none" })).toEqual([]);
  });
});

describe("engineOptions", () => {
  it("orders None, found CLIs, and connections, retaining a missing current choice", () => {
    const current: Engine = { kind: "cli", tool: "pi" };
    const options = engineOptions(
      settings(),
      [cli("codex"), cli("claude"), cli("pi", false)],
      current,
    );
    expect(options.map((option) => option.value)).toEqual([
      "none", "cli:claude", "cli:codex", "cli:pi", "api:local",
    ]);
    expect(options.find((option) => option.value === "cli:pi")?.missing).toBe(true);
  });

  it("retains a deleted current API connection as missing", () => {
    const options = engineOptions(
      settings({ connections: [] }),
      [],
      { kind: "api", connectionId: "gone" },
    );
    expect(options[options.length - 1]).toMatchObject({ value: "api:gone", missing: true });
  });
});

describe("modelOptions", () => {
  it("offers Claude aliases with CLI default and a custom option", () => {
    const options = modelOptions(
      { kind: "cli", tool: "claude" }, settings(), [cli("claude")], {}, "",
    );
    expect(options[0]).toEqual({ value: "", label: "CLI default" });
    expect(options).toContainEqual({ value: "opus", label: "Opus (alias)" });
    expect(options).toContainEqual({ value: "sonnet", label: "Sonnet (alias)" });
    expect(options).toContainEqual({ value: "haiku", label: "Haiku (alias)" });
    expect(options[options.length - 1]).toEqual({ value: "__custom", label: "Custom (type below)…" });
  });

  it("uses the API default and cached models and marks a stale current value", () => {
    const options = modelOptions(
      { kind: "api", connectionId: "local" },
      settings(),
      [],
      { local: ["m1", "m2"] },
      "gone",
    );
    expect(options[0]).toEqual({ value: "", label: "Connection default (m1)" });
    expect(options).toContainEqual({ value: "m2", label: "m2" });
    expect(options).toContainEqual({ value: "gone", label: "gone (not in list)" });
    expect(options[options.length - 1]).toEqual({ value: "__custom", label: "Custom (type below)…" });
  });

  it("returns no model choices when the engine is None", () => {
    expect(modelOptions({ kind: "none" }, settings(), [], {}, "")).toEqual([]);
  });
});

describe("resolveUse", () => {
  it("returns explicit rows and falls missing quick-action rows back to Chat", () => {
    const chat = { engine: { kind: "cli", tool: "codex" } as Engine, model: "m", effort: "high" };
    const value = settings({ uses: { chat } });
    expect(resolveUse(value, "chat", [])).toEqual(chat);
    expect(resolveUse(value, "rewrite", [])).toEqual(chat);
  });

  it("defaults Chat to the first found CLI, or None when none are found", () => {
    expect(resolveUse(settings(), "chat", [cli("pi"), cli("codex"), cli("claude")])).toEqual({
      engine: { kind: "cli", tool: "claude" }, model: "", effort: "",
    });
    expect(resolveUse(settings(), "chat", [])).toEqual({
      engine: { kind: "none" }, model: "", effort: "",
    });
  });
});

describe("engine changes", () => {
  it("resets the model and keeps effort only when supported by the new engine", () => {
    const row = { engine: { kind: "cli", tool: "claude" } as Engine, model: "opus", effort: "low" };
    expect(onEngineChange(row, { kind: "cli", tool: "codex" })).toEqual({
      engine: { kind: "cli", tool: "codex" }, model: "", effort: "low",
    });
    expect(onEngineChange(row, { kind: "api", connectionId: "local" })).toEqual({
      engine: { kind: "api", connectionId: "local" }, model: "", effort: "",
    });
  });
});

describe("engineKey", () => {
  it("creates stable engine identifiers", () => {
    expect(engineKey({ kind: "none" })).toBe("none");
    expect(engineKey({ kind: "cli", tool: "codex" })).toBe("cli:codex");
    expect(engineKey({ kind: "api", connectionId: "local" })).toBe("api:local");
  });
});
