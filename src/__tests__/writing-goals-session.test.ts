import { expect, it } from "vitest";
import { createSessionTracker, crossed } from "../writing-goals/session";
it("tracks net words and rebases reloads", () => {
  const s = createSessionTracker(); s.start(50, new Map([["a",100]]), 10);
  s.observe("a",130); s.observe("b",10); s.observe("b",30); expect(s.state()?.written).toBe(50);
  s.observe("a",90); expect(s.state()?.written).toBe(10);
  s.rebase("b"); s.observe("b",500); expect(s.state()?.written).toBe(10);
  s.observe("b",505); expect(s.state()?.written).toBe(15);
  s.observe("a",0); expect(s.state()?.written).toBe(0); s.clear(); expect(s.state()).toBeNull();
});
it("reports only a first crossing, never an already reached goal", () => {
  const m = new Map<string,number>(); expect(crossed(m,"a",1600,1500)).toBe(false);
  expect(crossed(m,"a",1400,1500)).toBe(false); expect(crossed(m,"a",1600,1500)).toBe(false);
  expect(crossed(m,"b",1400,1500)).toBe(false); expect(crossed(m,"b",1500,1500)).toBe(true);
  expect(crossed(m,"b",1400,1500)).toBe(false); expect(crossed(m,"b",1600,1500)).toBe(false);
});
