import { isContextExcluded } from "./context-exclude";
import { invoke } from "@tauri-apps/api/core";
import { listDir, listFilesRecursive } from "../filesys";
import { buildIndex, chunkDocument, retrieve, retrieveScored, type Chunk } from "./retrieval";

const TEXT_EXT = /\.(md|markdown|txt)$/i;
const MAX_BYTES = 1_000_000;
export type WorkspaceIndex = ReturnType<typeof createWorkspaceIndex>;

function joinPath(folder: string, relative: string): string {
  return folder.replace(/[\\/]$/, "") + "/" + relative;
}
function contains(folder: string, path: string): boolean {
  const prefix = folder.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
  return path.replace(/\\/g, "/").startsWith(prefix);
}

export function createWorkspaceIndex(getExclusions: () => readonly string[] = () => []) {
  let patternsKey = "";
  function excluded(path: string, folder: string): boolean { return isContextExcluded(path, folder, getExclusions()); }
  let builtFolder: string | null = null;
  let chunks: Chunk[] = [];
  let index = buildIndex([]);
  let generation = 0;
  let building: { folder: string; promise: Promise<void> } | null = null;
  let pending = new Map<string, string | null>();

  function apply(path: string, text: string | null): void {
    chunks = chunks.filter((chunk) => chunk.path !== path);
    if (!excluded(path, builtFolder ?? building?.folder ?? "") && text !== null && TEXT_EXT.test(path) && text.length <= MAX_BYTES) chunks.push(...chunkDocument(path, text));
    index = buildIndex(chunks);
  }
  async function build(folder: string, current: number): Promise<void> {
    await listDir(folder);
    if (current !== generation) return;
    const files = await listFilesRecursive(folder);
    const next: Chunk[] = [];
    for (const relative of files) {
      if (current !== generation) return;
      if (!TEXT_EXT.test(relative)) continue;
      const path = joinPath(folder, relative);
      if (excluded(path, folder)) continue;
      let text: string;
      try { text = await invoke<string>("read_file", { path }); } catch { continue; }
      if (current !== generation) return;
      if (!excluded(path, folder) && text.length <= MAX_BYTES) next.push(...chunkDocument(path, text));
    }
    if (current !== generation) return;
    builtFolder = folder; chunks = next; index = buildIndex(chunks);
    for (const [path, text] of pending) apply(path, text);
    pending.clear();
  }
  async function ensure(folder: string): Promise<boolean> {
    const key = JSON.stringify(getExclusions());
    if (key !== patternsKey) { patternsKey = key; generation++; builtFolder = null; chunks = []; index = buildIndex([]); building = null; pending.clear(); }
    if (builtFolder === folder && !building) return true;
    if (!building || building.folder !== folder) {
      const current = ++generation;
      pending = new Map();
      const promise = build(folder, current);
      building = { folder, promise };
      void promise.finally(() => { if (building?.promise === promise) building = null; }).catch(() => {});
    }
    await building.promise;
    return builtFolder === folder && (!building || building.folder === folder);
  }
  return {
    async query(folder: string, q: string, k: number, excludePath?: string): Promise<Chunk[]> {
      return await ensure(folder) ? retrieve(index, q, k, excludePath) : [];
    },
    async queryScored(folder: string, q: string, k: number, excludePath?: string): Promise<{ chunk: Chunk; score: number }[]> {
      return await ensure(folder) ? retrieveScored(index, q, k, excludePath) : [];
    },
    onFileChanged(path: string, text: string): void {
      if (excluded(path, builtFolder ?? building?.folder ?? "")) { if (building) pending.set(path, null); apply(path, null); return; }
      if (building && contains(building.folder, path)) { pending.set(path, text); return; }
      if (builtFolder && contains(builtFolder, path)) apply(path, text);
    },
    onFileRemoved(path: string): void {
      if (building && contains(building.folder, path)) { pending.set(path, null); return; }
      if (builtFolder && contains(builtFolder, path)) apply(path, null);
    },
    reset(): void {
      generation++; builtFolder = null; chunks = []; index = buildIndex([]); building = null; pending.clear();
    },
  };
}
