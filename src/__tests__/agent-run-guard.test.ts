import { expect, it, vi } from "vitest";
import { beforeAgentRun, afterAgentRun } from "../ai/agent-run-guard";
it("snapshots only dirty tabs with tool label", async () => {
  const deps = {
    tabsInFolder: vi.fn(() => [
      { path: "/notes/a.md", dirty: true, text: "unsaved" },
      { path: "/notes/b.md", dirty: false, text: "clean" },
    ]),
    snapshot: vi.fn(),
    checkTab: vi.fn(),
  };
  await beforeAgentRun("/notes", "claude", deps);
  expect(deps.snapshot).toHaveBeenCalledExactlyOnceWith(
    "/notes/a.md",
    "unsaved",
    "Before Claude Code run",
  );
});
it("checks only changed open tabs", async () => {
  const deps = {
    tabsInFolder: vi.fn(() => [
      { path: "a.md", dirty: false, text: "" },
      { path: "b.md", dirty: true, text: "" },
    ]),
    snapshot: vi.fn(),
    checkTab: vi.fn(),
  };
  await afterAgentRun(["a.md", "closed.md"], deps);
  expect(deps.checkTab).toHaveBeenCalledExactlyOnceWith("a.md");
});
