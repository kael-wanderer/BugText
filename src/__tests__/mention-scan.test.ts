import { expect, it, vi } from "vitest";
import { parseNote } from "../links/index";
import { createMentionScan } from "../links/mention-scan";
it("yields on the time budget, skips the active note, and caps results", () => {
  let time = 0; const queue: (() => void)[] = [], done = vi.fn();
  const scan = createMentionScan(() => { time += 4; return time; }, fn => queue.push(fn));
  const notes = [parseNote("/r/title.md", "title"), ...Array.from({ length: 250 }, (_, i) => parseNote(`/r/${i}.md`, "title"))];
  scan.start("title", "/r/title.md", notes, done); expect(done).not.toHaveBeenCalled(); queue.shift()!(); expect(queue.length).toBe(1);
  while (queue.length) queue.shift()!(); expect(done).toHaveBeenCalledOnce();
  expect(done.mock.calls[0][0].mentions).toHaveLength(200); expect(done.mock.calls[0][0].capped).toBe(true);
  expect(done.mock.calls[0][0].mentions.some((m: { path: string }) => m.path === "/r/title.md")).toBe(false);
});
it("drops cancelled and superseded generations", () => {
  const queue: (() => void)[] = [], old = vi.fn(), next = vi.fn(); const scan = createMentionScan(() => 0, fn => queue.push(fn));
  scan.start("title", "/r/a.md", [], old); scan.cancel(); queue.shift()!(); expect(old).not.toHaveBeenCalled(); expect(scan.running).toBe(false);
  scan.start("title", "/r/a.md", [], old); scan.start("title", "/r/a.md", [], next); while (queue.length) queue.shift()!(); expect(old).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce();
});
