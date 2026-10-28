import { describe, expect, it } from "vitest";
import { completeSave, runSerialized } from "../save-binding";

describe("bound saves", () => {
  it("serializes saves for the same path and marks the second as queued", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = runSerialized("queue-test", async (queued) => { calls.push(`first:${queued}`); await gate; calls.push("done"); });
    const second = runSerialized("queue-test", async (queued) => { calls.push(`second:${queued}`); });
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toEqual(["first:false"]);
    release();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first:false", "done", "second:true"]);
  });
  it("only marks the saved revision clean", () => {
    const binding = { windowId: "main", tabId: "a", path: null, revision: 4 };
    expect(completeSave(binding, 4)).toBe("clean");
    expect(completeSave(binding, 5)).toBe("still-dirty");
  });
});
