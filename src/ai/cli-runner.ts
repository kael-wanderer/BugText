import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CliTool, LocalCli } from "./aisettings";
export type CliRunOptions = {
  tool: CliTool;
  model: string;
  effort: string;
  write: boolean;
  folder: string | null;
  prompt: string;
  local: LocalCli;
  onChunk: (t: string) => void;
  signal?: AbortSignal;
  onStart?: (requestId: string) => void;
};
export function signedOutMessage(tool: CliTool, output: string): string | null {
  const patterns = {
    claude: /please run \/login|not logged in|unauthorized|sign in to claude/i,
    codex:
      /not logged in|unauthorized|please (?:run codex login|log in)|authentication required/i,
    pi: /not logged in|unauthorized|authentication required/i,
  };
  if (!patterns[tool].test(output)) return null;
  const label = { claude: "Claude Code", codex: "Codex", pi: "Pi" }[tool];
  return `${label} is signed out. Run ${tool} in Terminal to sign in.`;
}
export async function runCli(o: CliRunOptions): Promise<void> {
  const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const unlisteners: UnlistenFn[] = [];
  let output = "";
  let launch: Promise<unknown> | null = null;
  let cancellation: Promise<void> | null = null;
  let cancelling = false;
  let resolve!: () => void, reject!: (error: unknown) => void;
  const complete = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void complete.catch(() => {});
  const abort = (): void => {
    if (cancelling) return;
    cancelling = true;
    cancellation = (async () => {
      if (launch) {
        await launch.catch(() => {});
        await invoke("ai_cancel", { requestId }).catch(() => {});
      }
      reject(new DOMException("AI request cancelled.", "AbortError"));
    })();
  };
  try {
    if (o.signal?.aborted)
      throw new DOMException("AI request cancelled.", "AbortError");
    unlisteners.push(
      await listen<{ requestId: string; chunk: string }>("ai-chunk", (e) => {
        if (!cancelling && e.payload.requestId === requestId) {
          output += e.payload.chunk;
          o.onChunk(e.payload.chunk);
        }
      }),
    );
    unlisteners.push(
      await listen<{ requestId: string }>("ai-done", (e) => {
        if (!cancelling && e.payload.requestId === requestId) {
          const message = signedOutMessage(o.tool, output);
          if (message) reject(new Error(message));
          else resolve();
        }
      }),
    );
    unlisteners.push(
      await listen<{ requestId: string; message: string }>("ai-error", (e) => {
        if (!cancelling && e.payload.requestId === requestId)
          reject(
            new Error(
              signedOutMessage(o.tool, e.payload.message) ?? e.payload.message,
            ),
          );
      }),
    );
    o.signal?.addEventListener("abort", abort, { once: true });
    if (o.signal?.aborted)
      throw new DOMException("AI request cancelled.", "AbortError");
    o.onStart?.(requestId);
    if (o.signal?.aborted)
      throw new DOMException("AI request cancelled.", "AbortError");
    const local = o.local[o.tool];
    launch = invoke("ai_run", {
      requestId,
      spec: {
        tool: o.tool,
        model: o.model,
        effort: o.effort,
        write: o.write,
        folder: o.folder,
        prompt: o.prompt,
        executablePath: local.executablePath,
        configDir:
          o.tool === "claude"
            ? o.local.claude.configDir
            : o.tool === "codex"
              ? o.local.codex.codexHome
              : null,
        proxyBaseUrl: "proxyBaseUrl" in local ? local.proxyBaseUrl : null,
      },
    });
    await launch;
    await complete;
  } finally {
    if (cancellation) await cancellation;
    o.signal?.removeEventListener("abort", abort);
    unlisteners.forEach((unlisten) => unlisten());
  }
}
