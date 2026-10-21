import { describe, expect, it } from "vitest";
import { migrateV1 } from "../ai/aisettings-migrate";

describe("migrateV1", () => {
  it("converts HTTP providers while preserving ids and connection details", () => {
    const migrated = migrateV1(
      {
        providers: [
          {
            id: "anthropic",
            label: "Anthropic",
            type: "http",
            baseUrl: "https://api.anthropic.com/v1",
            api: "anthropic",
            model: "m",
          },
        ],
      },
      new Set(),
    );
    expect(migrated.connections).toContainEqual({
      id: "anthropic",
      name: "Anthropic",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      auth: "bearer",
      textModel: "m",
    });
  });

  it("recognizes built-in and compatible provider kinds", () => {
    const migrated = migrateV1(
      {
        providers: [
          { id: "o", label: "O", type: "http", baseUrl: "https://api.openai.com/v1", model: "m" },
          { id: "r", label: "R", type: "http", baseUrl: "https://openrouter.ai/api/v1", model: "m" },
          { id: "custom-anthropic", label: "Custom A", type: "http", baseUrl: "https://ai.example/v1", api: "anthropic", model: "m" },
          { id: "local", label: "Local", type: "http", baseUrl: "http://localhost:11434/v1", model: "m" },
        ],
      },
      new Set(),
    );
    expect(migrated.connections.map(({ id, provider, auth }) => ({ id, provider, auth }))).toEqual([
      { id: "o", provider: "openai", auth: "bearer" },
      { id: "r", provider: "openrouter", auth: "bearer" },
      { id: "custom-anthropic", provider: "anthropic-compatible", auth: "bearer" },
      { id: "local", provider: "openai-compatible", auth: "none" },
    ]);
  });

  it("converts supported command providers and drops other commands", () => {
    const migrated = migrateV1(
      {
        providers: [
          { id: "claude", label: "Claude", type: "command", run: "claude -p {prompt}" },
          { id: "codex", label: "Codex", type: "command", run: "codex exec {prompt}" },
          { id: "pi", label: "Pi", type: "command", run: "pi -p" },
          { id: "open", label: "Other", type: "command", run: "opencode run" },
        ],
      },
      new Set(),
    );
    expect(migrated.uses.chat?.engine).toEqual({ kind: "cli", tool: "claude" });
    expect(migrated.connections).toEqual([]);
  });

  it("maps the default provider to the chat use", () => {
    const api = migrateV1(
      {
        providers: [
          { id: "anthropic", label: "Anthropic", type: "http", baseUrl: "https://api.anthropic.com/v1", model: "m" },
        ],
        defaultProvider: "anthropic",
      },
      new Set(),
    );
    expect(api.uses.chat?.engine).toEqual({ kind: "api", connectionId: "anthropic" });

    const cli = migrateV1(
      {
        providers: [
          { id: "claude", label: "Claude", type: "command", run: "claude -p {prompt}" },
        ],
        defaultProvider: "claude",
      },
      new Set(),
    );
    expect(cli.uses.chat?.engine).toEqual({ kind: "cli", tool: "claude" });
  });

  it("uses quickActionProvider for all quick actions or copies chat", () => {
    const migrated = migrateV1(
      {
        providers: [
          { id: "anthropic", label: "Anthropic", type: "http", baseUrl: "https://api.anthropic.com/v1", model: "m" },
          { id: "openai", label: "OpenAI", type: "http", baseUrl: "https://api.openai.com/v1", model: "m" },
        ],
        defaultProvider: "anthropic",
        quickActionProvider: "openai",
      },
      new Set(),
    );
    for (const feature of ["proofread", "rewrite", "summarize", "outline"] as const) {
      expect(migrated.uses[feature]?.engine).toEqual({ kind: "api", connectionId: "openai" });
    }

    const copied = migrateV1(
      {
        providers: [
          { id: "anthropic", label: "Anthropic", type: "http", baseUrl: "https://api.anthropic.com/v1", model: "m" },
        ],
        defaultProvider: "anthropic",
      },
      new Set(),
    );
    expect(copied.uses.proofread?.engine).toEqual(copied.uses.chat?.engine);
  });

  it("restores keyed built-ins and the prior local default when providers are absent", () => {
    const migrated = migrateV1(
      { defaultProvider: "ollama" },
      new Set(["openai"]),
    );
    expect(migrated.connections.map(({ id }) => id)).toEqual(["openai", "ollama"]);
    expect(migrated.uses.chat?.engine).toEqual({ kind: "api", connectionId: "ollama" });
  });

  it("drops removed terminal and permission settings", () => {
    const migrated = migrateV1(
      {
        providers: [],
        terminals: [{ id: "t", label: "Terminal", run: "zsh" }],
        terminalApp: "terminal",
        permissionMode: "bypass",
      },
      new Set(),
    );
    for (const key of ["terminals", "terminalApp", "permissionMode"]) {
      expect(migrated).not.toHaveProperty(key);
    }
  });
});

it("omits none-engine uses so resolution can fall back to an installed CLI", () => {
  const migrated = migrateV1({ providers: [] }, new Set());
  expect(migrated.uses).toEqual({});
});
