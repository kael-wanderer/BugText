import { expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockRejectedValue("Spell check failed.") }));
import { checkSpelling, suggestSpelling } from "../spell/api";

it("rejects a failed check so its lines are not cached as correct", async () => {
  await expect(checkSpelling("recieve")).rejects.toBeDefined();
  await expect(suggestSpelling("recieve")).resolves.toEqual([]);
});
