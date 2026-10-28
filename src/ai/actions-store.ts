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
  [key: string]: unknown;
};
export type ActionsFile = { version: 1; actions: SavedAction[]; [key: string]: unknown };

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
    if (data.version !== 1 || !Array.isArray(data.actions)) return null;
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
          typeof a.panel !== "boolean" || !validEngine(a.engine)) return null;
      ids.add(a.id); names.add(a.name.trim().toLowerCase());
    }
    return data as ActionsFile;
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
    const file = text === null ? { version: 1 as const, actions: [] } : parseActions(text);
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
