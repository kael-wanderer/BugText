import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { SETTINGS_CHANGED_EVENT } from "../settings-sync";
import type { UseRow } from "./aisettings";

export type SavedAction = {
  id: string;
  name: string;
  instruction: string;
  result: "edit" | "answer";
  input: "selection-or-note" | "note";
  engine: UseRow | null;
  panel: boolean;
  recipe?: Recipe;
  [key: string]: unknown;
};
export type ActionsFile = { version: 2; actions: SavedAction[]; [key: string]: unknown };

export type RecipeInput =
  | { kind: "current-note" }
  | { kind: "files"; paths: string[] }
  | { kind: "glob"; folder: string; glob: string }
  | { kind: "view"; viewId: string }
  | { kind: "changed"; days: number }
  | { kind: "completed-tasks"; days: number };
export type RecipeOutput = { kind: "note"; path: string } | { kind: "chat" } | { kind: "properties" };
export type Recipe = { inputs: RecipeInput[]; output: RecipeOutput; template?: string };

/** A path relative to the open folder: no leading slash, no backslash, no `..` segment. */
function relativePath(value: unknown, allowEmpty = false): boolean {
  if (typeof value !== "string" || value.length > 300) return false;
  if (!value) return allowEmpty;
  return !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
}
function days(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365;
}
function validInput(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const i = value as Record<string, unknown>;
  switch (i.kind) {
    case "current-note": return true;
    case "files": return Array.isArray(i.paths) && i.paths.length <= 50 && i.paths.every(p => relativePath(p));
    case "glob": return relativePath(i.folder, true) && typeof i.glob === "string" && i.glob.length >= 1 && i.glob.length <= 200;
    case "view": return typeof i.viewId === "string" && i.viewId.length >= 1 && i.viewId.length <= 100;
    case "changed": case "completed-tasks": return days(i.days);
    default: return false;
  }
}
export function validRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (!Array.isArray(r.inputs) || r.inputs.length < 1 || r.inputs.length > 6 || !r.inputs.every(validInput)) return false;
  if (r.template !== undefined && (typeof r.template !== "string" || r.template.length > 8000)) return false;
  const hasCurrent = r.inputs.some(i => (i as RecipeInput).kind === "current-note");
  const out = r.output as Record<string, unknown> | null;
  if (!out || typeof out !== "object") return false;
  if (out.kind === "chat") return true;
  if (out.kind === "properties") return hasCurrent;
  if (out.kind !== "note" || !relativePath(out.path)) return false;
  return hasCurrent || !/\{\{(title|dir)\}\}/.test(out.path as string);
}

function validEngine(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!row.engine || typeof row.engine !== "object" || typeof row.model !== "string" ||
      (row.effort !== undefined && typeof row.effort !== "string")) return false;
  const engine = row.engine as Record<string, unknown>;
  return engine.kind === "none" ||
    (engine.kind === "cli" && ["claude", "codex", "pi"].includes(String(engine.tool))) ||
    (engine.kind === "api" && typeof engine.connectionId === "string" && !!engine.connectionId);
}

export function parseActions(contents: string): ActionsFile | null {
  try {
    const file: unknown = JSON.parse(contents);
    if (!file || typeof file !== "object" || Array.isArray(file)) return null;
    const data = file as Record<string, unknown>;
    if ((data.version !== 1 && data.version !== 2) || !Array.isArray(data.actions)) return null;
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const item of data.actions) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const a = item as Record<string, unknown>;
      if (typeof a.id !== "string" || !a.id.trim() || ids.has(a.id) ||
          typeof a.name !== "string" || !a.name.trim() || a.name.length > 60 || names.has(a.name.trim().toLowerCase()) ||
          typeof a.instruction !== "string" || !a.instruction.trim() || a.instruction.length > 8000 ||
          (a.result !== "edit" && a.result !== "answer") ||
          (a.input !== "selection-or-note" && a.input !== "note") ||
          typeof a.panel !== "boolean" || !validEngine(a.engine) ||
          (a.recipe !== undefined && !validRecipe(a.recipe))) return null;
      ids.add(a.id); names.add(a.name.trim().toLowerCase());
    }
    return { ...data, version: 2 } as ActionsFile;
  } catch { return null; }
}

export type ActionsIO = {
  read: () => Promise<string | null>;
  write: (contents: string) => Promise<void>;
  broadcast: () => void;
};
export async function loadActions(io: ActionsIO): Promise<{ file: ActionsFile | null; error: boolean }> {
  try {
    const text = await io.read();
    const file = text === null ? { version: 2 as const, actions: [] } : parseActions(text);
    return { file, error: file === null };
  } catch { return { file: null, error: true }; }
}
export async function saveActions(io: ActionsIO, file: ActionsFile): Promise<void> {
  const existing = await io.read();
  if (existing !== null && !parseActions(existing)) throw new Error("ai-actions.json could not be read");
  const text = JSON.stringify(file, null, 2);
  if (!parseActions(text)) throw new Error("Invalid actions");
  await io.write(text);
  io.broadcast();
}

export function actionsIO(windowLabel: string): ActionsIO {
  return {
    read: () => invoke<string | null>("read_ai_actions"),
    write: contents => invoke<void>("write_ai_actions", { contents }),
    broadcast: () => { void emit(SETTINGS_CHANGED_EVENT, { file: "ai-actions", from: windowLabel }).catch(() => {}); },
  };
}
