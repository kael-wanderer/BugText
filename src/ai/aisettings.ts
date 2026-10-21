export type HttpProvider = {
  id: string;
  label: string;
  type: "http";
  baseUrl: string;
  model: string;
  api?: "openai" | "anthropic";
  maxTokens?: number;
};

export type CommandProvider = {
  id: string;
  label: string;
  type: "command";
  run: string;
  bypassRun?: string;
  permissionProfiles?: PermissionProfile[];
};

export type PermissionProfile = {
  id: string;
  label: string;
  run: string;
  confirmEachRun?: boolean;
};

export type Provider = HttpProvider | CommandProvider;

export type TerminalEntry = {
  id: string;
  label: string;
  run: string;
};

export type TerminalApp = "embedded" | "terminal" | "ghostty" | "cmux";

export type AISettings = {
  providers: Provider[];
  terminals: TerminalEntry[];
  defaultProvider: string;
  defaultTerminal: string;
  permissionMode: PermissionMode;
  terminalFont: string;
  terminalFontSize: number;
  terminalApp: TerminalApp;
  quickActionProvider?: string;
  maxContextChars: number;
};

export type PermissionMode = string;

export const DEFAULT_AI_SETTINGS: AISettings = {
  providers: [
    {
      id: "ollama",
      label: "Ollama (local)",
      type: "http",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
    },
    {
      id: "lmstudio",
      label: "LM Studio",
      type: "http",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
    },
    {
      id: "openai",
      label: "OpenAI",
      type: "http",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
    },
    {
      id: "anthropic",
      label: "Anthropic",
      type: "http",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-6",
      api: "anthropic",
      maxTokens: 4096,
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      type: "http",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4.1-mini",
    },
    {
      id: "claude",
      label: "Claude Code",
      type: "command",
      run: "claude -p {prompt}",
      bypassRun: "claude --dangerously-skip-permissions -p {prompt}",
    },
    {
      id: "codex",
      label: "Codex",
      type: "command",
      run: "codex exec {prompt}",
      bypassRun:
        "codex exec --dangerously-bypass-approvals-and-sandbox {prompt}",
    },
    {
      id: "opencode",
      label: "OpenCode",
      type: "command",
      run: "opencode run {prompt}",
    },
    { id: "pi", label: "Pi", type: "command", run: "pi {prompt}" },
  ],
  terminals: [
    { id: "claude-term", label: "Claude Code", run: "claude" },
    { id: "codex-term", label: "Codex", run: "codex" },
    { id: "opencode-term", label: "OpenCode", run: "opencode" },
    { id: "pi-term", label: "Pi", run: "pi" },
    { id: "shell-term", label: "Shell", run: "zsh" },
  ],
  defaultProvider: "ollama",
  defaultTerminal: "claude-term",
  permissionMode: "ask",
  terminalFont: "",
  terminalFontSize: 13,
  terminalApp: "embedded",
  maxContextChars: 120_000,
};

export const DEFAULT_AI_SETTINGS_JSON = JSON.stringify(
  DEFAULT_AI_SETTINGS,
  null,
  2,
);

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseProvider(raw: unknown): Provider | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.label !== "string") {
    return null;
  }

  if (value.type === "http") {
    if (
      typeof value.baseUrl !== "string" ||
      typeof value.model !== "string"
    ) {
      return null;
    }
    const api =
      value.api === "anthropic" || value.api === "openai"
        ? value.api
        : "openai";
    const rawMaxTokens = Number(value.maxTokens);
    const maxTokens =
      Number.isFinite(rawMaxTokens) && rawMaxTokens > 0
        ? Math.round(rawMaxTokens)
        : undefined;
    return {
      id: value.id,
      label: value.label,
      type: "http",
      baseUrl: value.baseUrl,
      model: value.model,
      api,
      maxTokens,
    };
  }

  if (value.type === "command" && typeof value.run === "string") {
    const permissionProfiles = Array.isArray(value.permissionProfiles)
      ? value.permissionProfiles
          .map(parsePermissionProfile)
          .filter((profile): profile is PermissionProfile => Boolean(profile))
      : undefined;
    return {
      id: value.id,
      label: value.label,
      type: "command",
      run: value.run,
      bypassRun:
        typeof value.bypassRun === "string" ? value.bypassRun : undefined,
      permissionProfiles: permissionProfiles?.length
        ? permissionProfiles
        : undefined,
    };
  }

  return null;
}

function parsePermissionProfile(raw: unknown): PermissionProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.run !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    label: value.label,
    run: value.run,
    confirmEachRun:
      typeof value.confirmEachRun === "boolean"
        ? value.confirmEachRun
        : undefined,
  };
}

function parseTerminal(raw: unknown): TerminalEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.run !== "string"
  ) {
    return null;
  }
  return { id: value.id, label: value.label, run: value.run };
}

export function tryParseAISettings(raw: string): AISettings | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  } catch {
    return null;
  }
  return parseAISettings(raw);
}

export function parseAISettings(raw: string): AISettings {
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_AI_SETTINGS };
    }
    data = parsed as Record<string, unknown>;
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }

  const parsedProviders = Array.isArray(data.providers)
    ? (data.providers.map(parseProvider).filter(Boolean) as Provider[])
    : DEFAULT_AI_SETTINGS.providers;
  const parsedTerminals = Array.isArray(data.terminals)
    ? (data.terminals.map(parseTerminal).filter(Boolean) as TerminalEntry[])
    : DEFAULT_AI_SETTINGS.terminals;
  const providers = parsedProviders.length
    ? parsedProviders
    : DEFAULT_AI_SETTINGS.providers;
  const terminals = parsedTerminals.length
    ? parsedTerminals
    : DEFAULT_AI_SETTINGS.terminals;
  if (!terminals.some((terminal) => terminal.id === "pi-term")) {
    terminals.push({ id: "pi-term", label: "Pi", run: "pi" });
  }
  const requestedProvider = stringValue(data.defaultProvider);
  const requestedTerminal = stringValue(data.defaultTerminal);
  const rawSize = Number(data.terminalFontSize);
  const terminalFontSize = Number.isFinite(rawSize)
    ? Math.min(32, Math.max(8, Math.round(rawSize)))
    : DEFAULT_AI_SETTINGS.terminalFontSize;
  const terminalApp: TerminalApp = [
    "embedded",
    "terminal",
    "ghostty",
    "cmux",
  ].includes(String(data.terminalApp))
    ? (data.terminalApp as TerminalApp)
    : "embedded";
  const requestedQuickProvider = stringValue(data.quickActionProvider);
  const quickActionProvider = providers.some(
    (provider) => provider.id === requestedQuickProvider,
  )
    ? requestedQuickProvider
    : undefined;
  const rawContextChars = Number(data.maxContextChars);
  const maxContextChars = Number.isFinite(rawContextChars)
    ? Math.min(2_000_000, Math.max(4_000, Math.round(rawContextChars)))
    : DEFAULT_AI_SETTINGS.maxContextChars;

  return {
    providers,
    terminals,
    defaultProvider: providers.some(
      (provider) => provider.id === requestedProvider,
    )
      ? requestedProvider
      : providers[0].id,
    defaultTerminal: terminals.some(
      (terminal) => terminal.id === requestedTerminal,
    )
      ? requestedTerminal
      : terminals[0].id,
    // Bypass is a single-run choice and never restored from agent.json.
    permissionMode: "ask",
    terminalFont: stringValue(data.terminalFont),
    terminalFontSize,
    terminalApp,
    quickActionProvider,
    maxContextChars,
  };
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
  if (!data || typeof data !== "object") {
    return { cleaned: raw, keys: [] };
  }

  const object = data as Record<string, unknown>;
  const providers = Array.isArray(object.providers) ? object.providers : [];
  const keys: { id: string; secret: string }[] = [];
  let changed = false;

  for (const entry of providers) {
    if (!entry || typeof entry !== "object") continue;
    const provider = entry as Record<string, unknown>;
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
