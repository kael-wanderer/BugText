import {
  type AISettings,
  type CliTool,
  type Engine,
  type FeatureId,
  type UseRow,
} from "./aisettings";

export type CliInfo = {
  tool: CliTool;
  found: boolean;
  path: string;
  version: string;
  accounts: { label: string; dir: string }[];
  models: string[];
};

export const CLI_LABELS: Record<CliTool, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  pi: "Pi",
};

/** The model name shown under a reply: the row's model, else the connection's or tool's default. */
export function engineLabel(row: UseRow, settings: AISettings): string {
  const engine = row.engine;
  if (row.model) return row.model;
  if (engine.kind === "api") return settings.connections.find(c => c.id === engine.connectionId)?.textModel || "Default model";
  if (engine.kind === "cli") return CLI_LABELS[engine.tool];
  return "Default model";
}

export const ENGINE_BADGE: Record<CliTool | "api", { letter: string; cls: string }> = {
  claude: { letter: "C", cls: "claude" },
  codex: { letter: "X", cls: "codex" },
  pi: { letter: "π", cls: "pi" },
  api: { letter: "A", cls: "api" },
};

const CLI_ORDER: readonly CliTool[] = ["claude", "codex", "pi"];
const CLAUDE_MODELS: readonly { value: string; label: string }[] = [
  { value: "opus", label: "Opus (alias)" },
  { value: "sonnet", label: "Sonnet (alias)" },
  { value: "haiku", label: "Haiku (alias)" },
  { value: "claude-opus-4-6", label: "claude-opus-4-6" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { value: "claude-haiku-4-5", label: "claude-haiku-4-5" },
];
const CUSTOM_MODEL: ModelOption = {
  value: "__custom",
  label: "Custom (type below)…",
};

export function effortLevels(engine: Engine): string[] {
  if (engine.kind !== "cli") return [];
  switch (engine.tool) {
    case "claude":
      return ["low", "medium", "high", "xhigh", "max"];
    case "codex":
      return ["minimal", "low", "medium", "high"];
    case "pi":
      return ["off", "minimal", "low", "medium", "high", "xhigh"];
  }
}

export type EngineOption = {
  value: string;
  label: string;
  engine: Engine;
  missing?: boolean;
};

export function engineOptions(
  settings: AISettings,
  clis: CliInfo[],
  current: Engine,
): EngineOption[] {
  const options: EngineOption[] = [
    { value: "none", label: "None", engine: { kind: "none" } },
  ];
  const byTool = new Map(clis.map((cli) => [cli.tool, cli]));
  for (const tool of CLI_ORDER) {
    const info = byTool.get(tool);
    const selected = current.kind === "cli" && current.tool === tool;
    if (!info?.found && !selected) continue;
    options.push({
      value: `cli:${tool}`,
      label: CLI_LABELS[tool],
      engine: { kind: "cli", tool },
      ...(!info?.found ? { missing: true } : {}),
    });
  }
  for (const connection of settings.connections) {
    options.push({
      value: `api:${connection.id}`,
      label: connection.name,
      engine: { kind: "api", connectionId: connection.id },
    });
  }
  if (current.kind === "api" && !settings.connections.some((c) => c.id === current.connectionId)) {
    options.push({
      value: engineKey(current),
      label: `${current.connectionId} (Connection deleted)`,
      engine: current,
      missing: true,
    });
  }
  return options;
}

export function engineKey(engine: Engine): string {
  if (engine.kind === "none") return "none";
  if (engine.kind === "cli") return `cli:${engine.tool}`;
  return `api:${engine.connectionId}`;
}

export type ModelOption = { value: string; label: string };

export function modelOptions(
  engine: Engine,
  settings: AISettings,
  clis: CliInfo[],
  cache: Record<string, string[]>,
  current: string,
): ModelOption[] {
  if (engine.kind === "none") return [];
  let options: ModelOption[];
  if (engine.kind === "cli") {
    const info = clis.find((cli) => cli.tool === engine.tool);
    const known = engine.tool === "claude"
      ? CLAUDE_MODELS.map((model) => ({ ...model }))
      : (info?.models ?? []).map((model) => ({ value: model, label: model }));
    options = [{ value: "", label: "CLI default" }, ...known];
  } else {
    const connection = settings.connections.find(
      (item) => item.id === engine.connectionId,
    );
    const model = connection?.textModel ?? "";
    options = [
      {
        value: "",
        label: model ? `Connection default (${model})` : "Connection default",
      },
      ...(cache[engine.connectionId] ?? []).map((item) => ({ value: item, label: item })),
    ];
  }
  const seen = new Set<string>();
  options = options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
  if (current && !seen.has(current) && current !== "__custom") {
    options.push({ value: current, label: `${current} (not in list)` });
  }
  options.push(CUSTOM_MODEL);
  return options;
}

function firstCli(clis: CliInfo[]): CliInfo | undefined {
  return CLI_ORDER.map((tool) => clis.find((cli) => cli.tool === tool && cli.found))
    .find((cli): cli is CliInfo => Boolean(cli));
}

function defaultUse(clis: CliInfo[]): UseRow {
  const cli = firstCli(clis);
  return {
    engine: cli ? { kind: "cli", tool: cli.tool } : { kind: "none" },
    model: "",
    effort: "",
  };
}

export function resolveUse(
  settings: AISettings,
  feature: FeatureId,
  clis: CliInfo[],
): UseRow {
  const explicit = settings.uses[feature];
  if (explicit) return explicit;
  if (feature !== "chat") {
    return settings.uses.chat ?? defaultUse(clis);
  }
  return defaultUse(clis);
}

export function onEngineChange(row: UseRow, next: Engine): UseRow {
  const allowed = effortLevels(next);
  return {
    engine: next,
    model: "",
    effort: row.effort && allowed.includes(row.effort) ? row.effort : "",
  };
}

