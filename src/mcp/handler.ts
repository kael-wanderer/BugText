import { hashText } from "../hash";
import { applyEdits, checkRevision, type TextChange } from "./edits";
import { createSnapshotThrottle } from "./snapshot-throttle";

const MAX_BYTES = 1_000_000;
const OUTSIDE = "That path is outside the folders open in BugText.";
const EXTENSION = "Only .md, .markdown and .txt notes are supported.";
const TOO_LARGE = "The note is larger than 1 MB.";

export type McpRequest = {
  requestId: string;
  client: string;
  tool: string;
  args: any;
};

export type HandlerDeps = {
  findOpenTab(path: string): { id: string; dirty: boolean; kind: "text" | "other" } | null;
  getText(id: string): string;
  applyChanges(id: string, changes: TextChange[]): void;
  saveTab(id: string): Promise<void>;
  readDisk(path: string): Promise<string>;
  writeDiskAtomic(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  snapshot(path: string, text: string, label: string): Promise<void>;
  diskChanged(path: string): Promise<boolean>;
  refreshExplorer(): void;
  searchIndex(q: string, k: number): Promise<{ path: string; snippet: string; score: number }[]>;
  activeSelection(): {
    path: string | null;
    kind: "text" | "other";
    text: string;
    selections: { text: string; fromLine: number; toLine: number }[];
  } | null;
  notice(client: string, name: string, undo: () => Promise<void>, stillAgentResult: () => boolean): void;
};

export type McpResult = { ok: true; result: unknown } | { ok: false; error: string };

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isTextPath(path: string): boolean {
  return /\.(md|markdown|txt)$/i.test(path);
}

function success(result: unknown): McpResult { return { ok: true, result }; }
function failure(error: string): McpResult { return { ok: false, error }; }

export function createMcpHandler(deps: HandlerDeps): {
  handle(req: McpRequest): Promise<McpResult>;
} {
  const throttle = createSnapshotThrottle(() => Date.now());
  const queues = new Map<string, Promise<unknown>>();

  function enqueue(path: string, operation: () => Promise<McpResult>): Promise<McpResult> {
    const previous = queues.get(path) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    const tail = current.then(() => undefined, () => undefined);
    queues.set(path, tail);
    void tail.finally(() => {
      if (queues.get(path) === tail) queues.delete(path);
    });
    return current;
  }

  async function readNote(path: string, tabPath = path): Promise<McpResult> {
    if (!isTextPath(path)) return failure(EXTENSION);
    const tab = deps.findOpenTab(tabPath);
    if (tab?.kind === "other") return failure(EXTENSION);
    const text = tab ? deps.getText(tab.id) : await deps.readDisk(path);
    if (byteLength(text) > MAX_BYTES) return failure(TOO_LARGE);
    return success({ text, revision: hashText(text), open: !!tab, dirty: tab?.dirty ?? false });
  }

  async function updateNote(req: McpRequest): Promise<McpResult> {
    const { path } = req.args ?? {};
    const hasEdits = Array.isArray(req.args?.edits);
    const hasText = typeof req.args?.text === "string";
    if (hasEdits === hasText) return failure("Pass either edits or text.");
    if (typeof path !== "string" || !isTextPath(path)) return failure(EXTENSION);
    const tabPath = typeof req.args?.tabPath === "string" ? req.args.tabPath : path;
    const tab = deps.findOpenTab(tabPath);
    const operationPath = tab ? tabPath : path;
    if (tab?.kind === "other") return failure(EXTENSION);
    const before = tab ? deps.getText(tab.id) : await deps.readDisk(path);
    if (byteLength(before) > MAX_BYTES) return failure(TOO_LARGE);

    let next: string;
    let changes: TextChange[];
    if (hasEdits) {
      const applied = applyEdits(before, req.args.edits);
      if (!applied.ok) return failure(applied.error);
      next = applied.text;
      changes = applied.changes;
    } else {
      const revisionError = checkRevision(before, req.args.revision);
      if (revisionError) return failure(revisionError);
      next = req.args.text;
      changes = [{ from: 0, to: before.length, insert: next }];
    }
    if (byteLength(next) > MAX_BYTES) return failure(TOO_LARGE);

    if (!tab) {
      if (throttle.shouldSnapshot(operationPath, req.client, false))
        await deps.snapshot(operationPath, before, `Before ${req.client} edit`);
      await deps.writeDiskAtomic(path, next);
      return success({ revision: hashText(next), saved: true });
    }

    if (await deps.diskChanged(operationPath)) {
      const diskText = await deps.readDisk(operationPath);
      await deps.snapshot(operationPath, diskText, `Before ${req.client} edit (disk version)`);
    }
    if (throttle.shouldSnapshot(operationPath, req.client, tab.dirty))
      await deps.snapshot(operationPath, before, `Before ${req.client} edit`);
    deps.applyChanges(tab.id, changes);
    await deps.saveTab(tab.id);
    const finalText = next;
    deps.notice(
      req.client,
      path.split(/[\\/]/).pop() || path,
      async () => {
        deps.applyChanges(tab.id, [{ from: 0, to: finalText.length, insert: before }]);
        await deps.saveTab(tab.id);
      },
      () => deps.getText(tab.id) === finalText,
    );
    return success({ revision: hashText(next), saved: true });
  }

  async function handle(req: McpRequest): Promise<McpResult> {
    try {
      switch (req.tool) {
        case "read_note": {
          const path = req.args?.path;
          if (typeof path !== "string") return failure(OUTSIDE);
          return await readNote(path, typeof req.args?.tabPath === "string" ? req.args.tabPath : path);
        }
        case "update_note": {
          const path = req.args?.path;
          if (typeof path !== "string") return failure(OUTSIDE);
          return await enqueue(path, () => updateNote(req));
        }
        case "create_note": {
          const { path, text } = req.args ?? {};
          if (typeof path !== "string" || !isTextPath(path)) return failure(EXTENSION);
          if (typeof text !== "string") return failure("Note text is required.");
          if (byteLength(text) > MAX_BYTES) return failure(TOO_LARGE);
          if (await deps.exists(path)) return failure("Already exists — use update_note.");
          await deps.writeDiskAtomic(path, text);
          deps.refreshExplorer();
          return success({ path, created: true });
        }
        case "get_selection": {
          const active = deps.activeSelection();
          if (!active) return success({ path: null, selections: [], revision: null });
          if (active.kind !== "text") return failure(EXTENSION);
          if (byteLength(active.text) > MAX_BYTES) return failure(TOO_LARGE);
          return success({ path: active.path, selections: active.selections, revision: hashText(active.text) });
        }
        case "search": {
          const query = typeof req.args?.query === "string" ? req.args.query : "";
          const limit = Math.max(1, Math.min(20, Number.isInteger(req.args?.limit) ? req.args.limit : 8));
          return success((await deps.searchIndex(query, limit)).slice(0, limit));
        }
        default:
          return failure("Unknown tool.");
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  return { handle };
}
