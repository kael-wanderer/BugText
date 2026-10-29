import { expect, it, vi } from "vitest";
import { createNavigationHistory, NAVIGATION_HISTORY_LIMIT } from "../navigation/history";
import { createNavigationController } from "../navigation/controller";

it("evicts the oldest entries at the documented 100-entry cap", () => {
  expect(NAVIGATION_HISTORY_LIMIT).toBe(100);
  const history = createNavigationHistory();
  for (let i = 0; i < 135; i++) history.visit({ path: `${i}.md`, line: i + 1 });
  const paths = [history.current!.path];
  while (history.canBack) paths.push(history.back()!.path);
  expect(paths).toHaveLength(100);
  expect(paths[paths.length - 1]).toBe("35.md");
  expect(history.back()).toBeNull();
});

it("Back/Forward restore positions without adding entries, including after repeated traversal", async () => {
  let line = 12;
  const open = vi.fn(async (_location: { path: string; line?: number }) => true);
  const nav = createNavigationController({ position: path => ({ path, line }), open });
  nav.visit({ path: "a.md", line: 1 });
  nav.visit({ path: "b.md", line: 1 });
  line = 30;
  for (let i = 0; i < 4; i++) {
    expect(await nav.travel("back")).toBe(true);
    if (i === 0) expect(open.mock.calls[0][0]).toMatchObject({ path: "a.md", line: 12 });
    expect(nav.history.canBack).toBe(false);
    expect(nav.history.current?.path).toBe("a.md");
    expect(await nav.travel("forward")).toBe(true);
    if (i === 0) expect(open.mock.calls[1][0]).toMatchObject({ path: "b.md", line: 30 });
    expect(nav.history.canForward).toBe(false);
  }
  expect(open.mock.calls).toHaveLength(8);
  expect(nav.history.current?.path).toBe("b.md");
});

it("does not duplicate same-note activations and clears the forward branch for a new note", () => {
  const h = createNavigationHistory();
  h.visit({ path: "a.md" }); h.visit({ path: "a.md", line: 9 });
  expect(h.canBack).toBe(false);
  h.visit({ path: "b.md" }); h.back();
  h.visit({ path: "c.md" });
  expect(h.forward()).toBeNull(); expect(h.back()?.line).toBe(9);
});

it("a failed/missing history target leaves the cursor and forward branch unchanged", async () => {
  const nav = createNavigationController({ position: () => null, open: async () => { throw new Error("private IO details"); } });
  nav.visit({ path: "a.md" }); nav.visit({ path: "b.md" });
  expect(await nav.travel("back")).toBe(false);
  expect(nav.history.current?.path).toBe("b.md");
  expect(nav.history.canForward).toBe(false);
});

it("keeps native windows independent and cancels stale pending navigation", async () => {
  let resume!: () => void;
  const wait = new Promise<void>(resolve => { resume = resolve; });
  const nav = createNavigationController({ position: () => null, open: async (_location, isCurrent) => { await wait; return isCurrent(); } });
  const other = createNavigationHistory();
  nav.visit({ path: "a.md" }); nav.visit({ path: "b.md" });
  const pending = nav.travel("back");
  nav.visit({ path: "c.md" }); resume();
  expect(await pending).toBe(false);
  expect(nav.history.current?.path).toBe("c.md");
  expect(other.current).toBeNull();
});
