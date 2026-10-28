// Quick Note: one timestamped entry appended to the daily note or the inbox.
// The target is created when missing; an open tab is edited in memory so a file
// is never written behind it.

import type { TemplateSettings } from "../settings";
import { relativeDestination } from "./naming";
import { planNote } from "./plan";

export type QuickNoteDeps = {
  folder: string;
  settings: TemplateSettings;
  now: () => Date;
  /** Text of the template named "Daily log", or null when there is none. */
  dailyTemplate: () => Promise<string | null>;
  /** The target's tab in any window, with its current buffer. */
  findOpen: (absolutePath: string) => { tabId: string; text: string } | null;
  appendToTab: (tabId: string, text: string) => void;
  exists: (absolutePath: string) => Promise<boolean>;
  create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>;
  append: (folder: string, relative: string, text: string) => Promise<string>;
  /** Refreshes the recorded disk state so no "changed on disk" prompt follows. */
  recordStat: (absolutePath: string) => Promise<void>;
  afterWrite: (absolutePath: string) => void;
  refreshExplorer: () => Promise<void>;
};

export type QuickTarget = { relative: string; dir: string; stem: string; initial: string };

/** `- 14:32 text`, continuation lines indented two spaces. */
export function formatEntry(now: Date, text: string): string {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const [first, ...rest] = text.replace(/\s+$/, "").split(/\r?\n/);
  return [`- ${time} ${first}`, ...rest.map((line) => (line.trim() ? `  ${line}` : ""))].join("\n");
}

export async function resolveTarget(deps: Pick<QuickNoteDeps, "settings" | "now" | "dailyTemplate">): Promise<QuickTarget | { error: string }> {
  const { settings } = deps;
  if (settings.quickTarget === "inbox") {
    const file = settings.inboxFile.replace(/\\/g, "/").replace(/\.md$/i, "");
    const slash = file.lastIndexOf("/");
    const destination = relativeDestination(slash < 0 ? "" : file.slice(0, slash), slash < 0 ? file : file.slice(slash + 1));
    return "error" in destination ? destination : { relative: destination.path, dir: destination.dir, stem: destination.stem, initial: "" };
  }
  const template = (await deps.dailyTemplate()) ?? "# {{date}}\n";
  const plan = planNote(template, { title: "", now: deps.now(), format: settings.dateFormat, defaultFolder: "journal", defaultName: "{{date}}" });
  if ("error" in plan.destination) return plan.destination;
  const { path, dir, stem } = plan.destination;
  return { relative: path, dir, stem, initial: plan.text };
}

const joinAbsolute = (folder: string, relative: string): string => `${folder.replace(/\/$/, "")}/${relative}`;

/** Appends one entry; returns the absolute path of the note that received it. */
export async function addQuickNote(deps: QuickNoteDeps, text: string, target: QuickTarget): Promise<string> {
  const entry = formatEntry(deps.now(), text);
  const absolute = joinAbsolute(deps.folder, target.relative);
  const open = deps.findOpen(absolute);
  if (open) {
    const separator = open.text && !open.text.endsWith("\n") ? "\n" : "";
    deps.appendToTab(open.tabId, `${separator}${entry}\n`);
    return absolute;
  }
  const present = await deps.exists(absolute);
  if (target.initial && !present) {
    const lead = target.initial.endsWith("\n") ? target.initial : `${target.initial}\n`;
    const written = await deps.create({ folder: deps.folder, relativeDir: target.dir, stem: target.stem, contents: `${lead}${entry}\n` });
    await deps.recordStat(written);
    deps.afterWrite(written);
    await deps.refreshExplorer().catch(() => {});
    return written;
  }
  const written = await deps.append(deps.folder, target.relative, entry);
  await deps.recordStat(written);
  deps.afterWrite(written);
  if (!present) await deps.refreshExplorer().catch(() => {});
  return written;
}
