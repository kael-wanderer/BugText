import { migrateV1 } from "./aisettings-migrate";

export type ApiProviderKind =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "openai-compatible"
  | "anthropic-compatible";
export type Connection = {
  id: string;
  name: string;
  provider: ApiProviderKind;
  baseUrl: string;
  auth: "none" | "bearer";
  textModel: string;
};
export type CliTool = "claude" | "codex" | "pi";
export type Engine =
  | { kind: "api"; connectionId: string }
  | { kind: "cli"; tool: CliTool }
  | { kind: "none" };
export type FeatureId =
  "chat" | "proofread" | "rewrite" | "summarize" | "outline";
export const FEATURE_IDS: readonly FeatureId[] = [
  "chat",
  "proofread",
  "rewrite",
  "summarize",
  "outline",
];
export type UseRow = { engine: Engine; model: string; effort: string };
export type LocalCli = {
  claude: { configDir: string; executablePath: string; proxyBaseUrl: string };
  codex: { codexHome: string; executablePath: string; proxyBaseUrl: string };
  pi: { executablePath: string };
};
export type AISettings = {
  version: 2;
  connections: Connection[];
  enabled: Record<FeatureId, boolean>;
  uses: Partial<Record<FeatureId, UseRow>>;
  localCli: LocalCli;
  maxContextChars: number;
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  version: 2,
  connections: [],
  enabled: {
    chat: true,
    proofread: true,
    rewrite: true,
    summarize: true,
    outline: true,
  },
  uses: {},
  localCli: {
    claude: { configDir: "", executablePath: "", proxyBaseUrl: "" },
    codex: { codexHome: "", executablePath: "", proxyBaseUrl: "" },
    pi: { executablePath: "" },
  },
  maxContextChars: 120_000,
};

export const DEFAULT_AI_SETTINGS_JSON = JSON.stringify(
  {
    version: DEFAULT_AI_SETTINGS.version,
    connections: DEFAULT_AI_SETTINGS.connections,
    enabled: DEFAULT_AI_SETTINGS.enabled,
    uses: DEFAULT_AI_SETTINGS.uses,
    localCli: DEFAULT_AI_SETTINGS.localCli,
    maxContextChars: DEFAULT_AI_SETTINGS.maxContextChars,
  },
  null,
  2,
);

export const BUILTIN_V1_IDS: readonly string[] = [
  "ollama",
  "lmstudio",
  "openai",
  "anthropic",
  "openrouter",
];

const API_PROVIDERS: readonly ApiProviderKind[] = [
  "anthropic",
  "openai",
  "openrouter",
  "openai-compatible",
  "anthropic-compatible",
];
const CLI_TOOLS: readonly CliTool[] = ["claude", "codex", "pi"];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

function parseConnection(raw: unknown): Connection | null {
  const value = record(raw);
  if (!value) return null;
  const id = text(value.id).trim().toLowerCase();
  const name = text(value.name);
  const provider = value.provider;
  const baseUrl = text(value.baseUrl);
  const auth = value.auth;
  const textModel = value.textModel;
  if (
    !id ||
    id.startsWith("cli-") ||
    !name ||
    !API_PROVIDERS.includes(provider as ApiProviderKind) ||
    !baseUrl ||
    !validBaseUrl(baseUrl) ||
    (auth !== "none" && auth !== "bearer") ||
    typeof textModel !== "string"
  ) {
    return null;
  }
  return {
    id,
    name,
    provider: provider as ApiProviderKind,
    baseUrl,
    auth,
    textModel,
  };
}

function parseEngine(raw: unknown): Engine | null {
  const value = record(raw);
  if (!value) return null;
  if (value.kind === "none") return { kind: "none" };
  if (value.kind === "api" && typeof value.connectionId === "string") {
    return { kind: "api", connectionId: value.connectionId };
  }
  if (value.kind === "cli" && CLI_TOOLS.includes(value.tool as CliTool)) {
    return { kind: "cli", tool: value.tool as CliTool };
  }
  return null;
}

function parseUseRow(raw: unknown): UseRow | null {
  const value = record(raw);
  if (!value) return null;
  const engine = parseEngine(value.engine);
  if (!engine) return null;
  return { engine, model: text(value.model), effort: text(value.effort) };
}

function parseLocalCli(raw: unknown): LocalCli {
  const value = record(raw) ?? {};
  const claude = record(value.claude) ?? {};
  const codex = record(value.codex) ?? {};
  const pi = record(value.pi) ?? {};
  return {
    claude: {
      configDir: text(claude.configDir),
      executablePath: text(claude.executablePath),
      proxyBaseUrl: text(claude.proxyBaseUrl),
    },
    codex: {
      codexHome: text(codex.codexHome),
      executablePath: text(codex.executablePath),
      proxyBaseUrl: text(codex.proxyBaseUrl),
    },
    pi: { executablePath: text(pi.executablePath) },
  };
}

function parseV2(data: Record<string, unknown>): AISettings {
  const connections: Connection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(data.connections)) {
    for (const raw of data.connections) {
      const connection = parseConnection(raw);
      if (!connection || seen.has(connection.id)) continue;
      connections.push(connection);
      seen.add(connection.id);
      if (connections.length === 20) break;
    }
  }

  const enabled = { ...DEFAULT_AI_SETTINGS.enabled };
  const rawEnabled = record(data.enabled);
  if (rawEnabled) {
    for (const feature of FEATURE_IDS) {
      if (typeof rawEnabled[feature] === "boolean") {
        enabled[feature] = rawEnabled[feature] as boolean;
      }
    }
  }

  const uses: Partial<Record<FeatureId, UseRow>> = {};
  const rawUses = record(data.uses);
  if (rawUses) {
    for (const feature of FEATURE_IDS) {
      const row = parseUseRow(rawUses[feature]);
      if (row) uses[feature] = row;
    }
  }

  const rawContextChars = Number(data.maxContextChars);
  const maxContextChars = Number.isFinite(rawContextChars)
    ? Math.min(2_000_000, Math.max(4_000, Math.round(rawContextChars)))
    : DEFAULT_AI_SETTINGS.maxContextChars;

  return {
    version: 2,
    connections,
    enabled,
    uses,
    localCli: parseLocalCli(data.localCli),
    maxContextChars,
  };
}

export function tryParseAISettings(
  raw: string,
  savedKeyIds: ReadonlySet<string> = new Set(),
): AISettings | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const value = record(parsed);
    if (!value) return null;
    if (Object.prototype.hasOwnProperty.call(value, "version") && value.version !== 2) return null;
  } catch {
    return null;
  }
  return parseAISettings(raw, savedKeyIds);
}

export function parseAISettings(
  raw: string,
  savedKeyIds: ReadonlySet<string> = new Set(),
): AISettings {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    const parsedRecord = record(parsed);
    if (!parsedRecord) return { ...DEFAULT_AI_SETTINGS };
    data = parsedRecord;
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
  if (Object.prototype.hasOwnProperty.call(data, "version") && data.version !== 2) {
    return { ...DEFAULT_AI_SETTINGS };
  }
  if (!Object.prototype.hasOwnProperty.call(data, "version")) {
    return parseV2(
      migrateV1(data, savedKeyIds) as unknown as Record<string, unknown>,
    );
  }
  return parseV2(data);
}

export function extractLegacyKeys(raw: string): {
  cleaned: string;
  keys: { id: string; secret: string }[];
} {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { cleaned: raw, keys: [] };
  }
  const object = record(data);
  if (!object) return { cleaned: raw, keys: [] };
  const providers = Array.isArray(object.providers) ? object.providers : [];
  const keys: { id: string; secret: string }[] = [];
  let changed = false;
  for (const entry of providers) {
    const provider = record(entry);
    if (!provider) continue;
    if (
      provider.type === "http" &&
      typeof provider.key === "string" &&
      provider.key !== "" &&
      typeof provider.id === "string"
    ) {
      keys.push({ id: provider.id, secret: provider.key });
    }
    if (Object.prototype.hasOwnProperty.call(provider, "key")) {
      delete provider.key;
      changed = true;
    }
  }
  return {
    cleaned: changed ? JSON.stringify(object, null, 2) : raw,
    keys,
  };
}
