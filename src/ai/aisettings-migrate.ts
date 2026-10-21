import type {
  AISettings,
  ApiProviderKind,
  CliTool,
  Connection,
  Engine,
  FeatureId,
  UseRow,
} from "./aisettings";

const BUILTIN_V1_PROVIDERS = [
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    api: "openai",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    api: "openai",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    api: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    api: "anthropic",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    api: "openai",
  },
] as const;

const FEATURES: readonly FeatureId[] = [
  "chat",
  "proofread",
  "rewrite",
  "summarize",
  "outline",
];
const QUICK_ACTIONS: readonly FeatureId[] = [
  "proofread",
  "rewrite",
  "summarize",
  "outline",
];

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function providerKind(baseUrl: string, api: unknown): ApiProviderKind {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // Invalid URLs are removed by the v2 parser after migration.
  }
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "api.openai.com") return "openai";
  if (host === "openrouter.ai") return "openrouter";
  if (api === "anthropic") return "anthropic-compatible";
  return "openai-compatible";
}

function isLocal(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function cliForCommand(value: unknown): CliTool | null {
  const provider = object(value);
  if (!provider || provider.type !== "command") return null;
  const command = string(provider.run).trimStart();
  if (/^claude(?:\s|$)/.test(command)) return "claude";
  if (/^codex(?:\s|$)/.test(command)) return "codex";
  if (/^pi(?:\s|$)/.test(command)) return "pi";
  return null;
}

function engineForV1Provider(
  provider: Record<string, unknown>,
  engines: Map<string, Engine>,
  connections: Connection[],
): Engine | null {
  const id = string(provider.id).trim().toLowerCase();
  if (!id) return null;
  if (provider.type === "http") {
    const baseUrl = string(provider.baseUrl);
    const model = string(provider.model);
    const name = string(provider.label);
    if (!baseUrl || !name || !id || id.startsWith("cli-")) return null;
    const connection: Connection = {
      id,
      name,
      provider: providerKind(baseUrl, provider.api),
      baseUrl,
      auth: isLocal(baseUrl) ? "none" : "bearer",
      textModel: model,
    };
    connections.push(connection);
    const engine: Engine = { kind: "api", connectionId: id };
    engines.set(id, engine);
    return engine;
  }
  const tool = cliForCommand(provider);
  if (tool) {
    const engine: Engine = { kind: "cli", tool };
    engines.set(id, engine);
    return engine;
  }
  return null;
}

function builtinConnection(id: string): Connection | null {
  const provider = BUILTIN_V1_PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) return null;
  return {
    id: provider.id,
    name: provider.label,
    provider: providerKind(provider.baseUrl, provider.api),
    baseUrl: provider.baseUrl,
    auth: isLocal(provider.baseUrl) ? "none" : "bearer",
    textModel: provider.model,
  };
}

function row(engine: Engine): UseRow {
  return { engine, model: "", effort: "" };
}

export function migrateV1(
  v1: Record<string, unknown>,
  savedKeyIds: ReadonlySet<string>,
): AISettings {
  const connections: Connection[] = [];
  const engines = new Map<string, Engine>();
  const explicitProviders = Array.isArray(v1.providers);
  if (explicitProviders) {
    for (const raw of v1.providers as unknown[]) {
      const provider = object(raw);
      if (provider) engineForV1Provider(provider, engines, connections);
    }
  } else {
    const ids: string[] = [];
    for (const id of ["ollama", "lmstudio", "openai", "anthropic", "openrouter"]) {
      if (savedKeyIds.has(id)) ids.push(id);
    }
    const oldDefault = string(v1.defaultProvider).toLowerCase();
    if (
      (oldDefault === "ollama" || oldDefault === "lmstudio") &&
      !ids.includes(oldDefault)
    ) {
      ids.push(oldDefault);
    }
    for (const id of ids) {
      const connection = builtinConnection(id);
      if (!connection) continue;
      connections.push(connection);
      engines.set(id, { kind: "api", connectionId: id });
    }
  }

  const firstEngine = [...engines.values()][0] ?? { kind: "none" as const };
  const requestedDefault = string(v1.defaultProvider).toLowerCase();
  let chatEngine = engines.get(requestedDefault) ?? firstEngine;
  if (!explicitProviders && !requestedDefault && engines.has("ollama")) {
    chatEngine = engines.get("ollama")!;
  }

  const uses: Partial<Record<FeatureId, UseRow>> = {};
  if (chatEngine.kind !== "none") uses.chat = row(chatEngine);
  const quickActionEngine = v1.quickActionProvider
    ? (engines.get(string(v1.quickActionProvider).toLowerCase()) ?? chatEngine)
    : chatEngine;
  if (quickActionEngine.kind !== "none")
    for (const feature of QUICK_ACTIONS) uses[feature] = row(quickActionEngine);

  const enabled = Object.fromEntries(FEATURES.map((feature) => [feature, true])) as
    AISettings["enabled"];
  const rawContext = Number(v1.maxContextChars);
  const maxContextChars = Number.isFinite(rawContext)
    ? Math.min(2_000_000, Math.max(4_000, Math.round(rawContext)))
    : 120_000;

  return {
    version: 2,
    connections: connections.filter(
      (connection, index) =>
        !connections.slice(0, index).some((item) => item.id === connection.id),
    ),
    enabled,
    uses,
    localCli: {
      claude: { configDir: "", executablePath: "", proxyBaseUrl: "" },
      codex: { codexHome: "", executablePath: "", proxyBaseUrl: "" },
      pi: { executablePath: "" },
    },
    maxContextChars,
  } as AISettings;
}
