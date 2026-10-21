import { afterEach, expect, it, vi } from "vitest";
import {
  apiUrl,
  validateBaseUrl,
  statusLine,
  listModels,
} from "../ai/connections";
import type { Connection } from "../ai/aisettings";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("secret-key"),
}));
const c: Connection = {
  id: "a",
  name: "A",
  provider: "openai-compatible",
  baseUrl: "http://localhost:1234/v1",
  auth: "bearer",
  textModel: "m",
};
afterEach(() => vi.unstubAllGlobals());
it("joins API paths", () => {
  expect(apiUrl(c.baseUrl + "/", "/models")).toBe(c.baseUrl + "/models");
  expect(apiUrl("https://api.anthropic.com", "/messages")).toBe(
    "https://api.anthropic.com/v1/messages",
  );
  expect(apiUrl("https://openrouter.ai/api/v1", "/models")).toBe(
    "https://openrouter.ai/api/v1/models",
  );
});
it("validates addresses", () => {
  expect(validateBaseUrl("http://192.168.1.4:11434/v1")).toBeTruthy();
  expect(validateBaseUrl("http://[::1]:8080/v1")).toBeNull();
  expect(validateBaseUrl("ftp://x")).toBeTruthy();
  expect(validateBaseUrl("")).toBeTruthy();
});
it("reports connection state", () => {
  expect(statusLine(c, false, null)).toBe("Needs API Key");
  expect(statusLine(c, true, null)).toBe("Not Tested");
  expect(statusLine(c, true, { ok: true, models: Array(7).fill("m") })).toBe(
    "Connection verified. 7 models available.",
  );
  expect(statusLine(c, true, { ok: false, message: "failed" })).toBe(
    "Could not reach localhost:1234 — is LM Studio running?",
  );
});
it("lists models without generation", async () => {
  const f = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "m" }] })));
  vi.stubGlobal("fetch", f);
  expect(await listModels(c)).toEqual({ ok: true, models: ["m"] });
  expect(f.mock.calls[0][1]).toMatchObject({ redirect: "error" });
});
it("redacts rejected keys", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("secret-key", { status: 401 })),
  );
  expect(await listModels(c)).toEqual({
    ok: false,
    message: "The key was rejected.",
  });
});
it("uses native Anthropic discovery and authentication", async () => {
  const f = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: [] })));
  vi.stubGlobal("fetch", f);
  expect(
    await listModels({
      ...c,
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
    }),
  ).toEqual({ ok: true, models: [] });
  expect(f.mock.calls[0]).toMatchObject([
    "https://api.anthropic.com/v1/models",
    {
      headers: { "x-api-key": "secret-key", "anthropic-version": "2023-06-01" },
      redirect: "error",
    },
  ]);
});
