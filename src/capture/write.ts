// The only writer for capture while reading. Each route is one the review write hook
// already sees as the owner's own write (docs/plans/capture/plan.md, "How each write
// reaches disk"):
//   open tab      → the editor buffer, one undo step, no disk write;
//   closed note   → Recovery snapshot, then append_note (write_atomic_at);
//   missing note  → create_from_template (create_file_exclusive_at).

import type { ResolvedTarget } from "./targets";

export type CaptureWriteDeps = {
  folder: string;
  findOpen: (absolute: string) => { tabId: string; text: string } | null;
  appendToTab: (tabId: string, text: string) => void;
  exists: (absolute: string) => Promise<boolean>;
  read: (absolute: string) => Promise<string>;
  snapshot: (absolute: string, text: string, label: string) => Promise<void>;
  append: (folder: string, relative: string, text: string) => Promise<string>;
  create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>;
  recordStat: (absolute: string) => Promise<void>;
  afterWrite: (absolute: string) => void;
  refreshExplorer: () => Promise<void>;
};

export type CaptureResult = { path: string; created: boolean; renamed: boolean };

export const SNAPSHOT_LABEL = "Before capture";

/** What goes before a block so it follows `text` after exactly one blank line. */
export function separatorFor(text: string): string {
  if (!text || text.endsWith("\n\n")) return "";
  return text.endsWith("\n") ? "\n" : "\n\n";
}

export async function writeCapture(deps: CaptureWriteDeps, target: ResolvedTarget, entry: string): Promise<CaptureResult> {
  const absolute = `${deps.folder.replace(/\/+$/, "")}/${target.relative}`;
  const open = deps.findOpen(absolute);
  if (open) {
    deps.appendToTab(open.tabId, separatorFor(open.text) + entry);
    return { path: absolute, created: false, renamed: false };
  }
  if (await deps.exists(absolute)) {
    const text = await deps.read(absolute);
    try { await deps.snapshot(absolute, text, SNAPSHOT_LABEL); }
    catch { throw new Error("Could not save a Recovery snapshot; nothing was written."); }
    // append_note first ends the file with a newline when it lacks one, so count that newline.
    const ended = text && !text.endsWith("\n") ? `${text}\n` : text;
    const path = await deps.append(deps.folder, target.relative, separatorFor(ended) + entry);
    await deps.recordStat(path);
    deps.afterWrite(path);
    return { path, created: false, renamed: false };
  }
  const contents = target.starter ? target.starter + separatorFor(target.starter) + entry : entry;
  const path = await deps.create({ folder: deps.folder, relativeDir: target.dir, stem: target.stem, contents });
  await deps.recordStat(path);
  deps.afterWrite(path);
  await deps.refreshExplorer().catch(() => {});
  return { path, created: true, renamed: path !== absolute };
}
