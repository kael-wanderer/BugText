import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { showComparison } from "./compareview";
import {
  changeDecision,
  draftIdFor,
  fileIdFor,
  hashText,
  isPdfDraft,
  isRecoverableDraft,
  shouldSnapshot,
  snapshotsToPrune,
  type DiskState,
  type DraftRecord,
  type SnapshotEntry,
} from "./recovery-policy";

const DRAFT_DEBOUNCE_MS = 1500;
const draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
const diskStats = new Map<string, DiskState>();
const pendingStats = new Map<string, Promise<void>>();
const lastSnapshotHashes = new Map<string, string>();

export type DiscardedDraft = { file: string; name: string; path: string | null; updatedAt: number; discardedAt: number };

export async function discardDraft(id: string): Promise<string | null> {
  const timer = draftTimers.get(id);
  if (timer) clearTimeout(timer);
  draftTimers.delete(id);
  return invoke<string | null>("recovery_discard_draft", { id });
}

export function listDiscarded(): Promise<DiscardedDraft[]> {
  return invoke("recovery_list_discarded");
}

export function bringBackDiscarded(file: string): Promise<void> {
  return invoke("recovery_restore_discarded", { file });
}

export function clearDraftById(id: string): void {
  void invoke("recovery_clear_draft", { id }).catch(() => {});
}

type DraftInput = {
  windowId: string; tabId: string; path: string | null; name: string; contents: string; replacedDraftId?: string;
};

export async function writeDraftNow(record: DraftInput): Promise<void> {
  const id = draftIdFor(record.path, record.tabId);
  const timer = draftTimers.get(id);
  if (timer) clearTimeout(timer);
  draftTimers.delete(id);
  await invoke("recovery_write_draft", { draft: { id, path: record.path, name: record.name, contents: record.contents, updatedAt: Date.now(), windowId: record.windowId } });
}

export function scheduleDraft(record: {
  windowId: string;
  tabId: string;
  path: string | null;
  name: string;
  contents: string;
  replacedDraftId?: string;
}): void {
  const id = draftIdFor(record.path, record.tabId);
  const existing = draftTimers.get(id);
  if (existing) clearTimeout(existing);
  draftTimers.set(
    id,
    setTimeout(() => {
      draftTimers.delete(id);
      const draft: DraftRecord = {
        id,
        path: record.path,
        name: record.name,
        contents: record.contents,
        updatedAt: Date.now(),
        windowId: record.windowId,
      };
      void invoke("recovery_write_draft", { draft }).catch(() => {});
    }, DRAFT_DEBOUNCE_MS),
  );
}

export function clearDraft(path: string | null, tabId: string): void {
  const id = draftIdFor(path, tabId);
  const existing = draftTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    draftTimers.delete(id);
  }
  clearDraftById(id);
}

export async function restoreDrafts(deps: {
  openDraft: (draft: DraftRecord) => void;
  host: HTMLElement;
}): Promise<void> {
  let drafts: DraftRecord[];
  try {
    const stored = await invoke<DraftRecord[]>("recovery_list_drafts");
    // Earlier versions could leave text drafts for PDF tabs; drop them quietly.
    for (const draft of stored) if (isPdfDraft(draft)) clearDraftById(draft.id);
    drafts = stored.filter(isRecoverableDraft);
  } catch {
    return;
  }
  if (drafts.length === 0) return;

  deps.host.querySelector(".recovery-banner")?.remove();
  const banner = document.createElement("div");
  banner.className = "recovery-banner";

  const summary = document.createElement("span");
  summary.textContent =
    `${drafts.length} unsaved document(s) from your last session: ` +
    drafts.map((draft) => draft.name).join(", ");

  const actions = document.createElement("span");
  actions.className = "recovery-actions";
  const restore = document.createElement("button");
  restore.type = "button";
  restore.textContent = "Restore all";
  restore.addEventListener("click", () => {
    for (const draft of drafts) deps.openDraft(draft);
    banner.remove();
  });
  const discard = document.createElement("button");
  discard.type = "button";
  discard.textContent = "Discard all";
  discard.addEventListener("click", () => {
    for (const draft of drafts) void discardDraft(draft.id);
    banner.remove();
  });
  actions.append(restore, discard);
  banner.append(summary, actions);
  deps.host.prepend(banner);
}

async function statOf(path: string): Promise<DiskState> {
  try {
    return await invoke<{ mtimeMs: number; size: number }>("file_stat", {
      path,
    });
  } catch {
    return null;
  }
}

export async function recordStat(path: string): Promise<void> {
  const pending = statOf(path).then((stat) => {
    diskStats.set(path, stat);
  });
  pendingStats.set(path, pending);
  await pending;
  if (pendingStats.get(path) === pending) pendingStats.delete(path);
}

export function forgetStat(path: string): void {
  diskStats.delete(path);
  pendingStats.delete(path);
}

export async function hasDiskChanged(path: string): Promise<boolean> {
  await pendingStats.get(path);
  const recorded = diskStats.get(path) ?? null;
  const current = await statOf(path);
  const decision = changeDecision(recorded, current, true);
  return decision === "conflict";
}

export async function checkExternalChange(
  path: string,
  dirty: boolean,
  bufferText: string,
  deps: {
    reload: (text: string) => void;
    markDirty: () => void;
    host: HTMLElement;
  },
): Promise<"unchanged" | "reload" | "conflict" | "deleted" | "kept"> {
  await pendingStats.get(path);
  const current = await statOf(path);
  const decision = changeDecision(diskStats.get(path) ?? null, current, dirty);
  if (decision === "unchanged") return decision;
  if (decision === "deleted") {
    deps.markDirty();
    return decision;
  }
  if (decision === "reload") {
    try {
      const text = await invoke<string>("read_file", { path });
      deps.reload(text);
      diskStats.set(path, current);
      return "reload";
    } catch {
      return "kept";
    }
  }

  const shouldReload = await confirm(
    `"${path}" changed on disk. Reload it and discard your unsaved changes?`,
    {
      title: "File changed on disk",
      kind: "warning",
      okLabel: "Reload",
      cancelLabel: "Keep mine",
    },
  );
  if (shouldReload) {
    try {
      const text = await invoke<string>("read_file", { path });
      deps.reload(text);
      diskStats.set(path, current);
      return "reload";
    } catch {
      return "kept";
    }
  }

  try {
    const onDisk = await invoke<string>("read_file", { path });
    showComparison(
      deps.host,
      { name: "On disk", path, text: onDisk },
      { name: "In editor (mine)", path, text: bufferText },
    );
  } catch {
    // The user's buffer remains authoritative if the comparison cannot be loaded.
  }
  return "kept";
}

async function writeSnapshot(
  path: string,
  contents: string,
  label?: string,
): Promise<void> {
  const fileId = fileIdFor(path);
  const ts = Date.now();
  try {
    if (label === undefined) {
      await invoke("recovery_save_snapshot", { fileId, ts, contents });
    } else {
      await invoke("recovery_save_snapshot_labeled", {
        fileId,
        ts,
        contents,
        label,
      });
    }
    lastSnapshotHashes.set(fileId, hashText(contents));
    const entries = await invoke<SnapshotEntry[]>("recovery_list_snapshots", {
      fileId,
    });
    const timestamps = snapshotsToPrune(entries, Date.now());
    if (timestamps.length > 0) {
      await invoke("recovery_delete_snapshots", { fileId, timestamps });
    }
  } catch {
    // Version history is best-effort and must never block a real save.
  }
}

async function writeBinarySnapshot(
  path: string,
  bytes: Uint8Array,
  label: string,
): Promise<void> {
  const fileId = fileIdFor(path);
  const ts = Date.now();
  try {
    await invoke("recovery_save_snapshot_bytes_labeled", {
      fileId,
      ts,
      bytes: Array.from(bytes),
      label,
    });
    const entries = await invoke<SnapshotEntry[]>("recovery_list_snapshots", {
      fileId,
    });
    const timestamps = snapshotsToPrune(entries, Date.now());
    if (timestamps.length > 0) {
      await invoke("recovery_delete_snapshots", { fileId, timestamps });
    }
  } catch {
    // Version history is best-effort and must never block a real save.
  }
}

export async function snapshotOnSave(
  path: string,
  contents: string,
): Promise<void> {
  const fileId = fileIdFor(path);
  const hash = hashText(contents);
  if (!lastSnapshotHashes.has(fileId)) {
    try {
      const entries = await listSnapshots(path);
      if (entries[0]) {
        lastSnapshotHashes.set(
          fileId,
          hashText(await readSnapshot(path, entries[0].ts)),
        );
      }
    } catch {
      // If the existing history cannot be read, save a fresh safety snapshot.
    }
  }
  if (!shouldSnapshot(lastSnapshotHashes.get(fileId) ?? null, hash)) return;
  await writeSnapshot(path, contents);
}

export async function manualSnapshot(
  path: string,
  contents: string,
  label?: string,
): Promise<void> {
  await writeSnapshot(path, contents, label);
}

export async function manualBinarySnapshot(
  path: string,
  bytes: Uint8Array,
  label: string,
): Promise<void> {
  await writeBinarySnapshot(path, bytes, label);
}

export async function listSnapshots(path: string): Promise<SnapshotEntry[]> {
  try {
    return await invoke<SnapshotEntry[]>("recovery_list_snapshots", {
      fileId: fileIdFor(path),
    });
  } catch {
    return [];
  }
}

export function readSnapshot(path: string, ts: number): Promise<string> {
  return invoke<string>("recovery_read_snapshot", {
    fileId: fileIdFor(path),
    ts,
  });
}

export async function readBinarySnapshot(
  path: string,
  ts: number,
): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("recovery_read_snapshot_bytes", {
    fileId: fileIdFor(path),
    ts,
  });
  return new Uint8Array(bytes);
}
