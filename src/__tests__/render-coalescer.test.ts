import { expect, it } from "vitest";
import { createFrameCoalescer } from "../render-coalescer";

it("coalesces requests and cancels pending frames", () => {
  let fn: (() => void) | undefined; let runs = 0; let canceled = 0;
  const c = createFrameCoalescer(() => runs++, callback => { fn = callback; return 1; }, () => { fn = undefined; canceled++; });
  c.request(); c.request(); c.request(); expect(c.pending()).toBe(true);
  fn!(); expect(runs).toBe(1); expect(c.pending()).toBe(false);
  c.request(); c.cancel(); expect(canceled).toBe(1); expect(fn).toBeUndefined(); expect(c.pending()).toBe(false);
});
