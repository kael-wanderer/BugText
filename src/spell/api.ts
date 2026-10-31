import { invoke } from "@tauri-apps/api/core";
import type { SpellRange } from "./cache";

export const checkSpelling = (text: string): Promise<SpellRange[]> => invoke<SpellRange[]>("spell_check", { text }).catch(() => []);
export const suggestSpelling = (word: string): Promise<string[]> => invoke<string[]>("spell_suggest", { word }).catch(() => []);
export const ignoreSpelling = (word: string): Promise<boolean> => invoke("spell_ignore", { word }).then(() => true, () => false);
export const learnSpelling = (word: string): Promise<boolean> => invoke("spell_learn", { word }).then(() => true, () => false);
