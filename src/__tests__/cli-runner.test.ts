import { expect, it } from "vitest";
import { signedOutMessage } from "../ai/cli-runner";
it("recognizes signed out Claude", () => {
  expect(signedOutMessage("claude", "Please run /login")).toBe(
    "Claude Code is signed out. Run claude in Terminal to sign in.",
  );
  expect(signedOutMessage("claude", "ok")).toBeNull();
});

import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { runCli } from "../ai/cli-runner";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
it("waits for process cancellation before completing", async () => {
  let finishCancel!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    finishCancel = resolve;
  });
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "ai_cancel" ? cancelled : undefined,
  );
  const controller = new AbortController();
  let settled = false;
  const result = runCli({
    tool: "claude",
    model: "",
    effort: "",
    write: true,
    folder: "/notes",
    prompt: "p",
    local: DEFAULT_AI_SETTINGS.localCli,
    onChunk: () => {},
    signal: controller.signal,
  }).catch((error) => {
    settled = true;
    return error;
  });
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("ai_run", expect.anything()),
  );
  controller.abort();
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("ai_cancel", expect.anything()),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(settled).toBe(false);
  finishCancel();
  expect((await result).name).toBe("AbortError");
});
it("never spawns after onStart aborts", async () => {
  vi.mocked(invoke).mockClear();
  const controller = new AbortController();
  await expect(
    runCli({
      tool: "claude",
      model: "",
      effort: "",
      write: false,
      folder: null,
      prompt: "p",
      local: DEFAULT_AI_SETTINGS.localCli,
      onChunk: () => {},
      signal: controller.signal,
      onStart: () => controller.abort(),
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(invoke).not.toHaveBeenCalled();
});
