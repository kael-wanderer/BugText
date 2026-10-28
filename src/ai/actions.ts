import type { AISettings, FeatureId, UseRow } from "./aisettings";
import { resolveUse, type CliInfo } from "./engines";
import { QUICK_ACTIONS } from "./quick-actions";
import type { SavedAction } from "./actions-store";

export type RunnableAction = {
  id: string;
  name: string;
  instruction: string;
  result: "edit" | "answer";
  input: "selection-or-note" | "note";
  engine: UseRow | null;
  feature?: FeatureId;
  panel: boolean;
};

export function runnableActions(settings: AISettings, saved: SavedAction[]): RunnableAction[] {
  return [
    ...QUICK_ACTIONS.filter(a => settings.enabled[a.feature]).map(a => ({
      id: a.id, name: a.label, instruction: a.prompt,
      result: a.kind === "edit" ? "edit" as const : "answer" as const,
      input: "selection-or-note" as const, engine: null, feature: a.feature, panel: true,
    })),
    ...saved,
  ];
}

export function actionEngine(action: RunnableAction, settings: AISettings, clis: CliInfo[]): UseRow {
  return action.engine ? { ...action.engine, effort: action.engine.effort ?? "" } :
    resolveUse(settings, action.feature ?? "chat", clis);
}
