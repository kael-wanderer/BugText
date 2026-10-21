import { describe, expect, it } from "vitest";
import { createSnapshotThrottle } from "../mcp/snapshot-throttle";

describe("createSnapshotThrottle", () => {
  it("throttles clean tabs per path and client but always snapshots dirty tabs", () => {
    let now = 0;
    const throttle = createSnapshotThrottle(() => now);
    expect(throttle.shouldSnapshot("/notes/a.md", "Agent A", false)).toBe(true);
    expect(throttle.shouldSnapshot("/notes/a.md", "Agent A", false)).toBe(false);
    expect(throttle.shouldSnapshot("/notes/a.md", "Agent A", true)).toBe(true);
    expect(throttle.shouldSnapshot("/notes/a.md", "Agent B", false)).toBe(true);
    now += 10 * 60 * 1000;
    expect(throttle.shouldSnapshot("/notes/a.md", "Agent A", false)).toBe(true);
  });
});
