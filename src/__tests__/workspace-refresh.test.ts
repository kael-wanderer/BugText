import { expect, it, vi } from "vitest";
import { createFocusDeduper, createRefreshRunner } from "../workspace-refresh";

it("serializes refreshes and merges queued requests with full taking priority", async () => {
  const finish: (() => void)[] = [];
  const run = vi.fn(() => new Promise<void>(resolve => finish.push(resolve)));
  const runner = createRefreshRunner(run);
  const first = runner.request("tabs", "timer");
  const second = runner.request("tabs", "timer");
  const third = runner.request("full", "manual");
  expect(run).toHaveBeenCalledTimes(1); finish.shift()!(); await first;
  expect(run).toHaveBeenCalledTimes(2); expect(run).toHaveBeenLastCalledWith("full", "manual");
  finish.shift()!(); await Promise.all([second, third]); expect(runner.running()).toBe(false);
});
it("continues after a failure", async () => {
  const run = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
  const runner = createRefreshRunner(run);
  await expect(runner.request("full", "timer")).rejects.toThrow("failed");
  await runner.request("tabs", "timer"); expect(run).toHaveBeenCalledTimes(2);
});
it("deduplicates focus notifications within 250 ms", () => {
  let now = 0; const action = vi.fn(); const focus = createFocusDeduper(action, () => now);
  focus(); now = 249; focus(); now = 250; focus(); expect(action).toHaveBeenCalledTimes(2);
});
