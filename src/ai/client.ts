import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_AI_SETTINGS,
  type AISettings,
  type Connection,
  type PermissionMode,
  type Provider,
  type UseRow,
} from "./aisettings";
import { streamConnection, testTextModel } from "./connections";
import { runCli } from "./cli-runner";
import { chatContentText, type ChatMessage } from "./providers";
type Options = {
  folder?: string | null;
  write?: boolean;
  attachmentPaths?: string[];
  signal?: AbortSignal;
  onStart?: (id: string) => void;
};
export function streamChat(
  row: UseRow,
  settings: AISettings,
  messages: ChatMessage[],
  onChunk: (t: string) => void,
  options: Options,
): Promise<void>;
/** Temporary compatibility overload for the panel and quick actions, replaced in Tasks 6/10. */
export function streamChat(
  provider: Provider,
  messages: ChatMessage[],
  onChunk: (t: string) => void,
  mode?: PermissionMode,
  options?: {
    cwd?: string | null;
    attachmentPaths?: string[];
    signal?: AbortSignal;
    onCommandStart?: (id: string) => void;
  },
): Promise<void>;
export function streamChat(
  rowOrProvider: UseRow | Provider,
  settingsOrMessages: AISettings | ChatMessage[],
  messagesOrChunk: ChatMessage[] | ((t: string) => void),
  chunkOrMode: ((t: string) => void) | PermissionMode = "ask",
  options: Options & {
    cwd?: string | null;
    onCommandStart?: (id: string) => void;
  } = {},
): Promise<void> {
  if ("type" in rowOrProvider) {
    const p = rowOrProvider;
    const messages = settingsOrMessages as ChatMessage[];
    const chunk = messagesOrChunk as (t: string) => void;
    if (p.type === "http")
      return streamConnection(
        legacyConnection(p),
        p.model,
        messages,
        chunk,
        options.signal,
      );
    const tool = /\bclaude\b/.test(p.run)
      ? "claude"
      : /\bcodex\b/.test(p.run)
        ? "codex"
        : /\bpi\b/.test(p.run)
          ? "pi"
          : null;
    if (!tool)
      return Promise.reject(
        new Error("Choose a supported coding CLI in Settings ▸ AI ▸ Use for."),
      );
    return streamChat(
      { engine: { kind: "cli", tool }, model: "", effort: "" },
      DEFAULT_AI_SETTINGS,
      messages,
      chunk,
      {
        folder: options.cwd ?? null,
        write: false,
        attachmentPaths: options.attachmentPaths,
        signal: options.signal,
        onStart: options.onCommandStart,
      },
    );
  }
  const row = rowOrProvider,
    settings = settingsOrMessages as AISettings,
    messages = messagesOrChunk as ChatMessage[],
    onChunk = chunkOrMode as (t: string) => void;
  if (row.engine.kind === "none")
    return Promise.reject(
      new Error("Choose an engine in Settings ▸ AI ▸ Use for."),
    );
  if (row.engine.kind === "api") {
    const id = row.engine.connectionId;
    const connection = settings.connections.find((c) => c.id === id);
    if (!connection) return Promise.reject(new Error("Connection deleted"));
    return streamConnection(
      connection,
      row.model || connection.textModel,
      messages,
      onChunk,
      options.signal,
    );
  }
  const preamble = options.attachmentPaths?.length
    ? `Attached files (read them from disk as needed):\n${options.attachmentPaths.map((p) => `- ${p}`).join("\n")}\n\n`
    : "";
  return runCli({
    tool: row.engine.tool,
    model: row.model,
    effort: row.effort,
    write: options.write ?? false,
    folder: options.folder ?? null,
    prompt:
      preamble +
      messages
        .map((m) => `${m.role.toUpperCase()}: ${chatContentText(m.content)}`)
        .join("\n\n"),
    local: settings.localCli,
    onChunk,
    signal: options.signal,
    onStart: options.onStart,
  });
}
// Temporary settings-page adapter, removed when Task 9 replaces the legacy page.
function legacyConnection(p: Extract<Provider, { type: "http" }>): Connection {
  return {
    id: p.id,
    name: p.label,
    provider:
      p.api === "anthropic" ? "anthropic-compatible" : "openai-compatible",
    baseUrl: p.baseUrl,
    auth: "bearer",
    textModel: p.model,
  };
}
export async function testConnection(
  p: Extract<Provider, { type: "http" }>,
): Promise<{ ok: boolean; detail: string }> {
  const result = await testTextModel(legacyConnection(p), p.model);
  return { ok: result.ok, detail: result.message };
}
export function cancelCommandRun(requestId: string): Promise<void> {
  return invoke("ai_cancel", { requestId });
}

// Temporary legacy test/settings adapter; remove with Tasks 9/10.
export function connectionDetail(
  status: number,
  _bodyText: string,
): { ok: boolean; detail: string } {
  return {
    ok: status >= 200 && status < 300,
    detail:
      status >= 200 && status < 300
        ? "OK"
        : status === 401
          ? "The key was rejected."
          : status === 404
            ? "No such endpoint — check the server address."
            : `Server answered ${status}.`,
  };
}
