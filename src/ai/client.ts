import type { AISettings, UseRow } from "./aisettings";
import { streamConnection } from "./connections";
import { runCli } from "./cli-runner";
import { chatContentText, type ChatMessage } from "./providers";
export function streamChat(
  row: UseRow,
  settings: AISettings,
  messages: ChatMessage[],
  onChunk: (t: string) => void,
  options: {
    folder?: string | null;
    write?: boolean;
    attachmentPaths?: string[];
    signal?: AbortSignal;
    onStart?: (id: string) => void;
  },
): Promise<void> {
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
