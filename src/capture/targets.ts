// Where an excerpt or task goes: the companion note, today's daily note, or a chosen note,
// and the choice remembered per folder.

import { CAPTURE_FOLDER_LIMIT, type CaptureTarget, type Settings } from "../settings";
import { dailyNotePlan } from "../notes/daily";
import { companionPath, companionStarter } from "./format";

export type { CaptureTarget };
export type ResolvedTarget = { relative: string; dir: string; stem: string; starter: string };
type Kind = "excerpt" | "task";

const trimRoot = (folder: string): string => folder.replace(/\\/g, "/").replace(/\/+$/, "");

/** A relative .md path inside the folder: no absolute path, no "..", no control characters. */
function validRelative(relative: string): boolean {
  if (!relative || relative.startsWith("/") || /^[A-Za-z]:/.test(relative)) return false;
  const parts = relative.split("/");
  // eslint-disable-next-line no-control-regex
  if (parts.some((p) => p === "" || p === "." || p === ".." || /[\u0000-\u001f]/.test(p))) return false;
  return /\.md$/i.test(relative);
}

/** Absolute → relative inside folder, or null when outside / contains "..". */
export function folderRelative(folder: string, absolute: string): string | null {
  const root = trimRoot(folder);
  const path = absolute.replace(/\\/g, "/");
  if (!root || !path.startsWith(`${root}/`)) return null;
  const relative = path.slice(root.length + 1);
  return relative.split("/").some((p) => p === ".." || p === "." || p === "") ? null : relative;
}

function split(relative: string): { dir: string; stem: string } {
  const slash = relative.lastIndexOf("/");
  return { dir: slash < 0 ? "" : relative.slice(0, slash), stem: relative.slice(slash + 1).replace(/\.md$/i, "") };
}

export function resolveTarget(folder: string, sourcePath: string, sourceTitle: string, target: CaptureTarget, now: Date): ResolvedTarget | { error: string } {
  if (target.kind === "daily") {
    const plan = dailyNotePlan(folder, now);
    return { relative: `${plan.dir}/${plan.stem}.md`, dir: plan.dir, stem: plan.stem, starter: plan.contents };
  }
  if (target.kind === "note") {
    const relative = target.relative.replace(/\\/g, "/");
    if (!validRelative(relative)) return { error: "Choose a Markdown note inside the open folder." };
    return { relative, ...split(relative), starter: "" };
  }
  const source = folderRelative(folder, sourcePath);
  if (!source) return { error: "Open the note from a folder to save excerpts." };
  const companion = companionPath(source);
  if (!companion) return { error: "This is already a notes file." };
  return { relative: companion, ...split(companion), starter: companionStarter(source, sourceTitle) };
}

const DEFAULTS: Record<Kind, CaptureTarget> = { excerpt: { kind: "companion" }, task: { kind: "daily" } };

export function rememberedTarget(settings: Settings, folder: string, kind: Kind): CaptureTarget {
  return settings.capture.targets[folder]?.[kind] ?? DEFAULTS[kind];
}

/** Settings with `target` remembered for `kind` in `folder`; the folder moves to the newest place. */
export function withRemembered(settings: Settings, folder: string, kind: Kind, target: CaptureTarget): Settings {
  const current = settings.capture.targets[folder] ?? { ...DEFAULTS };
  const rest = Object.entries(settings.capture.targets).filter(([key]) => key !== folder);
  const entries = [...rest, [folder, { ...current, [kind]: target }] as const].slice(-CAPTURE_FOLDER_LIMIT);
  return { ...settings, capture: { targets: Object.fromEntries(entries) } };
}
