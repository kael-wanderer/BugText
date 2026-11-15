import { describe, expect, it, vi } from "vitest";
import { parseActions, saveActions, type ActionsFile } from "../ai/actions-store";
import { runnableActions } from "../ai/actions";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";

const plain = { id: "p", name: "Plain", instruction: "Do it", result: "answer" as const, input: "note" as const, engine: null, panel: true };
const base = { id: "r", name: "Weekly review", instruction: "Review", result: "answer" as const, input: "note" as const, engine: null, panel: false };
const weekly = {
  ...base,
  recipe: { inputs: [{ kind: "changed", days: 7 }, { kind: "completed-tasks", days: 7 }], output: { kind: "note", path: "Reviews/{{year}}-W{{week}}.md" } },
  extra: 1,
};
const file = (actions: unknown[]) => JSON.stringify({ version: 2, actions });
const withRecipe = (recipe: unknown) => file([{ ...base, recipe }]);
const note = { kind: "note", path: "out.md" };

describe("ai-actions.json version 2", () => {
  it("parses a version 1 file as version 2", () => {
    expect(parseActions('{"version":1,"actions":[]}')).toEqual({ version: 2, actions: [] });
  });

  it("accepts a recipe action and keeps unknown keys", () => {
    const parsed = parseActions(file([weekly]));
    expect(parsed).toEqual({ version: 2, actions: [weekly] });
  });

  it("rejects bad recipes", () => {
    const many = Array.from({ length: 51 }, (_, i) => `n${i}.md`);
    const bad: unknown[] = [
      { inputs: [], output: note },
      { inputs: Array.from({ length: 7 }, () => ({ kind: "changed", days: 1 })), output: note },
      { inputs: [{ kind: "changed", days: 0 }], output: note },
      { inputs: [{ kind: "changed", days: 366 }], output: note },
      { inputs: [{ kind: "changed", days: 1.5 }], output: note },
      { inputs: [{ kind: "files", paths: many }], output: note },
      { inputs: [{ kind: "files", paths: ["/abs.md"] }], output: note },
      { inputs: [{ kind: "files", paths: ["../x.md"] }], output: note },
      { inputs: [{ kind: "glob", folder: "..", glob: "*.md" }], output: note },
      { inputs: [{ kind: "glob", folder: "", glob: "" }], output: note },
      { inputs: [{ kind: "view", viewId: "" }], output: note },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "note", path: "" } },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "note", path: "../x.md" } },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "note", path: "/tmp/x.md" } },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "note", path: "a".repeat(301) } },
      { inputs: [{ kind: "changed", days: 7 }], output: note, template: "x".repeat(8001) },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "web" } },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "properties" } },
      { inputs: [{ kind: "changed", days: 7 }], output: { kind: "note", path: "{{title}}.md" } },
    ];
    for (const recipe of bad) expect(parseActions(withRecipe(recipe)), JSON.stringify(recipe).slice(0, 120)).toBeNull();
  });

  it("accepts an empty file list and a glob over the open folder", () => {
    expect(parseActions(withRecipe({ inputs: [{ kind: "files", paths: [] }], output: note }))).not.toBeNull();
    expect(parseActions(withRecipe({ inputs: [{ kind: "glob", folder: "", glob: "*.md" }], output: note }))).not.toBeNull();
    expect(parseActions(withRecipe({ inputs: [{ kind: "current-note" }], output: { kind: "properties" } }))).not.toBeNull();
    expect(parseActions(withRecipe({ inputs: [{ kind: "current-note" }], output: { kind: "note", path: "{{dir}}/{{title}} summary.md" } }))).not.toBeNull();
  });

  it("saveActions writes version 2", async () => {
    const write = vi.fn();
    await saveActions({ read: async () => null, write, broadcast: () => {} }, { version: 2, actions: [] } as ActionsFile);
    expect(JSON.parse(write.mock.calls[0][0]).version).toBe(2);
  });

  it("recipes are not runnable actions", () => {
    const ids = runnableActions(DEFAULT_AI_SETTINGS, [plain, weekly as never]).map(a => a.id);
    expect(ids).toContain("p");
    expect(ids).not.toContain("r");
  });
});
