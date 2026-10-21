import { invoke } from "@tauri-apps/api/core";
import type { ApiProviderKind, Connection } from "./aisettings";
import {
  buildHttpBody,
  parseSSEDelta,
  parseAnthropicSSEDelta,
  type ChatMessage,
} from "./providers";
export type Preset = {
  provider: ApiProviderKind;
  name: string;
  baseUrl: string;
  fixed: boolean;
  auth: "none" | "bearer";
  textModel: string;
};
export const PRESETS: Preset[] = [
  {
    provider: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    fixed: true,
    auth: "bearer",
    textModel: "claude-sonnet-4-6",
  },
  {
    provider: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    fixed: true,
    auth: "bearer",
    textModel: "gpt-4.1-mini",
  },
  {
    provider: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    fixed: true,
    auth: "bearer",
    textModel: "",
  },
  {
    provider: "openai-compatible",
    name: "Custom (OpenAI-compatible)",
    baseUrl: "",
    fixed: false,
    auth: "bearer",
    textModel: "",
  },
  {
    provider: "anthropic-compatible",
    name: "Custom (Anthropic-compatible)",
    baseUrl: "",
    fixed: false,
    auth: "bearer",
    textModel: "",
  },
];
export const QUICK_FILL = [
  { label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
  { label: "MLX", baseUrl: "http://localhost:8080/v1" },
];
export function isLocalUrl(value: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      new URL(value).hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}
export function validateBaseUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.username || u.password || u.search || u.hash)
      return "Use a server address without credentials, query or fragment.";
    if (
      u.protocol === "https:" ||
      (u.protocol === "http:" && isLocalUrl(value))
    )
      return null;
  } catch {}
  return "Use HTTPS, or HTTP on localhost.";
}
export function apiUrl(
  baseUrl: string,
  path: "/models" | "/chat/completions" | "/messages",
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return (
    base +
    ((path === "/messages" || new URL(base).hostname === "api.anthropic.com") &&
    !/\/v1$/.test(base)
      ? "/v1"
      : "") +
    path
  );
}
export function isAnthropicStyle(c: Connection): boolean {
  return c.provider === "anthropic" || c.provider === "anthropic-compatible";
}
export type TestResult =
  { ok: true; models: string[] } | { ok: false; message: string };
function statusError(status: number): string {
  return status === 401
    ? "The key was rejected."
    : status === 404
      ? "No such endpoint — check the server address."
      : `Server answered ${status}.`;
}
async function request(
  c: Connection,
  path: "/models" | "/chat/completions" | "/messages",
  body?: object,
  signal?: AbortSignal,
): Promise<Response> {
  const invalid = validateBaseUrl(c.baseUrl);
  if (invalid) throw new Error(invalid);
  let key: string | null = null;
  try {
    if (c.auth === "bearer")
      key = await invoke<string | null>("get_secret", { id: c.id });
  } catch {
    throw new Error("Could not access the saved API key.");
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (isAnthropicStyle(c)) headers["anthropic-version"] = "2023-06-01";
  if (key) {
    if (isAnthropicStyle(c)) headers["x-api-key"] = key;
    else headers.Authorization = `Bearer ${key}`;
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(c.baseUrl, path), {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: key ? "error" : "follow",
      signal,
    });
  } catch (error) {
    if (signal?.aborted)
      throw new DOMException("AI request cancelled.", "AbortError");
    throw new Error("Could not reach the server.");
  }
  if (!response.ok) throw new Error(statusError(response.status));
  return response;
}
export async function listModels(c: Connection): Promise<TestResult> {
  try {
    const response = await request(c, "/models");
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        message: "The server returned an invalid models response.",
      };
    }
    const rows = (data as { data?: unknown })?.data;
    if (!Array.isArray(rows))
      return {
        ok: false,
        message: "The server returned an invalid models response.",
      };
    return {
      ok: true,
      models: rows.flatMap((row) =>
        typeof row?.id === "string" ? [row.id] : [],
      ),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not reach the server.",
    };
  }
}
function body(
  c: Connection,
  model: string,
  messages: ChatMessage[],
): Record<string, unknown> {
  return buildHttpBody(
    {
      model,
      anthropic: isAnthropicStyle(c),
    },
    messages,
  ) as Record<string, unknown>;
}
export async function testTextModel(
  c: Connection,
  model: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const b = body(c, model, [
      { role: "user", content: "Reply with the single word: ok" },
    ]);
    b.stream = false;
    b.max_tokens = 8;
    await request(
      c,
      isAnthropicStyle(c) ? "/messages" : "/chat/completions",
      b,
    );
    return { ok: true, message: `Text model passed: ${model}` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not reach the server.",
    };
  }
}
export async function streamConnection(
  c: Connection,
  model: string,
  messages: ChatMessage[],
  onChunk: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await request(
    c,
    isAnthropicStyle(c) ? "/messages" : "/chat/completions",
    body(c, model, messages),
    signal,
  );
  if (!response.body)
    throw new Error("The server returned no response stream.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  const parse = isAnthropicStyle(c) ? parseAnthropicSSEDelta : parseSSEDelta;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const delta = parse(line);
        if (delta === "DONE") return;
        if (typeof delta === "string") onChunk(delta);
      }
      if (done) break;
    }
    const delta = parse(buffer);
    if (typeof delta === "string" && delta !== "DONE") onChunk(delta);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
export function statusLine(
  c: Connection,
  hasKey: boolean,
  result: TestResult | null,
): string {
  if (!result)
    return c.auth === "bearer" && !hasKey ? "Needs API Key" : "Not Tested";
  if (result.ok)
    return `Connection verified. ${result.models.length} models available.`;
  if (isLocalUrl(c.baseUrl)) {
    const host = new URL(c.baseUrl).host;
    const app = QUICK_FILL.find((q) => new URL(q.baseUrl).host === host)?.label;
    return `Could not reach ${host} — is ${app ?? host} running?`;
  }
  return result.message;
}
