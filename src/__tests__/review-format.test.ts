import { expect, it } from "vitest";
import { ago, counts, routeLabel } from "../review/format";

it("ago", () => {
  const now = Date.UTC(2026, 10, 14, 12);
  expect(ago(now - 30_000, now)).toBe("just now");
  expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
  expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
  expect(ago(now - 2 * 86_400_000, now)).toBe("2 d ago");
  expect(ago(Date.UTC(2026, 10, 1), now)).toBe("1 Nov");
});
it("labels and counts", () => {
  expect([routeLabel("cli"), routeLabel("mcp"), routeLabel("outside")]).toEqual(["AI panel run", "MCP", "Outside BugText"]);
  expect(counts({ added: 42, removed: 7 })).toBe("+42 −7");
  expect(counts({ added: null, removed: null })).toBe("");
});
