import { beforeEach, expect, it, vi } from "vitest";
import { listModels } from "../ai/connections";
import type { Connection } from "../ai/aisettings";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("secret"),
}));
const c: Connection = {
  id: "x",
  name: "X",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  auth: "bearer",
  textModel: "m",
};
beforeEach(() => vi.restoreAllMocks());
it("explains rejected keys", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("secret", { status: 401 }),
  );
  expect(await listModels(c)).toEqual({
    ok: false,
    message: "The key was rejected.",
  });
});
it("explains missing endpoints", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("secret", { status: 404 }),
  );
  expect(await listModels(c)).toEqual({
    ok: false,
    message: "No such endpoint — check the server address.",
  });
});
it("reports server status without leaking response bodies", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("secret", { status: 500 }),
  );
  expect(await listModels(c)).toEqual({
    ok: false,
    message: "Server answered 500.",
  });
});
