import { expect, it } from "vitest";
import { createDiagnostics } from "../perf/diagnostics";

it("keeps a bounded, private history and counts renders only during ticks", () => {
  const d = createDiagnostics();
  d.countRender();
  for (let i = 0; i < 21; i++) { const tick = d.begin("timer", "full"); tick.at = i; d.countRender(); d.end(); }
  d.countRender();
  expect(d.ticks()).toHaveLength(20);
  expect(d.ticks()[0].at).toBe(20);
  expect(d.ticks().every(t => t.renders === 1)).toBe(true);
  expect(d.asText()).not.toContain("/");
  expect(d.asText()).not.toContain("note-1.md");
});
