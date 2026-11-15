/** The four starter recipes (spec 5.3). */
import type { Recipe, SavedAction } from "../ai/actions-store";

/** A recipe action without its id. (`Omit<SavedAction, "id">` would drop the named fields: SavedAction has an index signature.) */
export type StarterRecipe = Pick<SavedAction, "name" | "instruction" | "result" | "input" | "engine" | "panel"> & { recipe: Recipe };

const base = { result: "answer", input: "note", panel: false, engine: null } as const;

export const STARTER_RECIPES: StarterRecipe[] = [
  {
    ...base, name: "Meeting notes → decisions, questions, tasks",
    instruction: 'From these meeting notes, list the decisions made, the open questions, and the tasks. Write each task as "- [ ] task", with the owner when named. Quote names and figures exactly as written.',
    recipe: { inputs: [{ kind: "current-note" }], output: { kind: "note", path: "{{dir}}/{{title}} summary.md" }, template: "## Decisions\n\n## Open questions\n\n## Tasks\n" },
  },
  {
    ...base, name: "Compare reports against my criteria",
    instruction: "Compare these reports against my criteria. Start with a table: one row per report, one column per criterion, and a short verdict. Then give the main differences. My criteria: (edit this recipe to list them).",
    recipe: { inputs: [{ kind: "files", paths: [] }], output: { kind: "note", path: "research/comparison.md" } },
  },
  {
    ...base, name: "Weekly review",
    instruction: "Write my weekly review from the notes changed this week and the tasks I completed. Done: the completed tasks, grouped by project. Changed: what changed in the notes, one line each with the note name. Open: unfinished work and open questions. Next week: three suggested priorities.",
    recipe: { inputs: [{ kind: "changed", days: 7 }, { kind: "completed-tasks", days: 7 }], output: { kind: "note", path: "Reviews/{{year}}-W{{week}}.md" }, template: "## Done\n\n## Changed\n\n## Open\n\n## Next week\n" },
  },
  {
    ...base, name: "File this note",
    instruction: "Propose properties for this note: a short title, up to five lowercase tags, status (draft or current), and related links to other notes it mentions. Keep every existing property you do not change.",
    recipe: { inputs: [{ kind: "current-note" }], output: { kind: "properties" } },
  },
];
