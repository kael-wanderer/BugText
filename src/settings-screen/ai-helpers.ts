// Pure helpers for the AI settings page (no DOM).

import { DEFAULT_AI_SETTINGS, type AISettings } from "../ai/aisettings";
import { clampStep } from "./controls";

export const CONTEXT_K_MIN = 1;
export const CONTEXT_K_MAX = 20;
export const CONTEXT_CHARS_MIN = 4_000;
export const CONTEXT_CHARS_MAX = 2_000_000;
// Same bounds the agent.json parser enforces for terminalFontSize.
export const TERMINAL_SIZE_MIN = 8;
export const TERMINAL_SIZE_MAX = 32;

export function cloneAISettings(settings: AISettings): AISettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => ({ ...provider })),
    terminals: settings.terminals.map((terminal) => ({ ...terminal })),
  };
}

function slug(label: string, fallback: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

/** Provider id derived from its label, unique among the current providers. */
export function uniqueId(label: string, settings: AISettings): string {
  const base = slug(label, "provider");
  let id = base;
  let suffix = 2;
  while (settings.providers.some((provider) => provider.id === id)) {
    id = `${base}-${suffix++}`;
  }
  return id;
}

/** Agent-command id (`<slug>-term`), unique among the current terminals. */
export function terminalUniqueId(label: string, settings: AISettings): string {
  const base = slug(label, "terminal");
  let id = `${base}-term`;
  let suffix = 2;
  while (settings.terminals.some((terminal) => terminal.id === id)) {
    id = `${base}-term-${suffix++}`;
  }
  return id;
}

export function stepContextK(k: number, delta: number): number {
  return clampStep(k, delta, CONTEXT_K_MIN, CONTEXT_K_MAX);
}

/** Max context characters as typed: rounded and clamped; non-numbers fall back to the default. */
export function clampContextChars(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AI_SETTINGS.maxContextChars;
  return Math.min(CONTEXT_CHARS_MAX, Math.max(CONTEXT_CHARS_MIN, Math.round(value)));
}

/** True when a model's base URL points at this machine (shown as a "Local" tag). */
export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}
