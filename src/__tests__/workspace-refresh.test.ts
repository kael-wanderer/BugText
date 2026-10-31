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

it("uses hysteresis and the 10-second cadence for large folders", async () => {
  const { decideLarge, tickKind } = await import("../workspace-refresh");
  expect(decideLarge(false, { markdownCount: 1999, capped: false }, "auto")).toBe(false);
  expect(decideLarge(false, { markdownCount: 2000, capped: false }, "auto")).toBe(true);
  expect(decideLarge(true, { markdownCount: 1900, capped: false }, "auto")).toBe(true);
  expect(decideLarge(true, { markdownCount: 1700, capped: false }, "auto")).toBe(false);
  expect(decideLarge(false, { markdownCount: 300, capped: true }, "auto")).toBe(true);
  expect(decideLarge(true, { markdownCount: 4000, capped: true }, "off")).toBe(false);
  expect(tickKind({ large: false, focused: false, now: 3000, lastFullAt: 0 })).toBe("full");
  expect(tickKind({ large: true, focused: true, now: 9000, lastFullAt: 0 })).toBe("tabs");
  expect(tickKind({ large: true, focused: true, now: 10000, lastFullAt: 0 })).toBe("full");
  for (let now = 3000; now <= 60000; now += 3000) expect(tickKind({ large: true, focused: false, now, lastFullAt: 0 })).toBe("tabs");
});

it("schedules only tab checks while unfocused and a full refresh on focus", async () => {
  const { tickKind, BASE_MS } = await import("../workspace-refresh");
  const invoke = vi.fn(async (command: string) => command === "read_file" ? "disk" : undefined);
  const tabs = [{ dirty: false, text: "old" }, { dirty: true, text: "edited" }];
  const runner = createRefreshRunner(async kind => {
    if (kind === "full") { await invoke("list_files_recursive"); await invoke("scan_note_links"); }
    for (const tab of tabs) if (!tab.dirty) tab.text = (await invoke("read_file")) as string;
  });
  vi.useFakeTimers();
  try {
    const timer = setInterval(() => { void runner.request(tickKind({ large: true, focused: false, now: Date.now(), lastFullAt: 0 }), "timer"); }, BASE_MS);
    await vi.advanceTimersByTimeAsync(60000); clearInterval(timer);
    expect(invoke.mock.calls.filter(([command]) => command === "read_file")).toHaveLength(20);
    expect(invoke.mock.calls.filter(([command]) => command === "scan_note_links" || command === "list_files_recursive")).toHaveLength(0);
    expect(tabs[0].text).toBe("disk"); expect(tabs[1].text).toBe("edited");
    await runner.request("full", "focus");
    expect(invoke.mock.calls.filter(([command]) => command === "scan_note_links")).toHaveLength(1);
    expect(invoke.mock.calls.filter(([command]) => command === "list_files_recursive")).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});
