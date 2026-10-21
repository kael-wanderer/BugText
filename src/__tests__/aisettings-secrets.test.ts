import { expect, it, vi } from "vitest";
import { moveLegacySecret } from "../ai/aisettings-secrets";
it("moves a key to the normalized id before deleting the old key", async () => {
  const calls: string[] = [];
  const ops = {
    get: vi.fn(async (id: string) => { calls.push(`get:${id}`); return "key-from-chain"; }),
    set: vi.fn(async (id: string) => { calls.push(`set:${id}`); }),
    delete: vi.fn(async (id: string) => { calls.push(`delete:${id}`); }),
  };
  await moveLegacySecret("OpenAI", "openai", "legacy-key", ops);
  expect(calls).toEqual(["get:OpenAI", "set:openai", "delete:OpenAI"]);
});
