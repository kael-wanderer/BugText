import { invoke } from "@tauri-apps/api/core";
import { listFilesRecursive } from "../filesys";
import { buildIndex, chunkDocument, retrieve, retrieveScored, type Chunk } from "./retrieval";

const TEXT_EXT = /\.(md|markdown|txt)$/i;
const MAX_BYTES = 1_000_000;

export type WorkspaceIndex = ReturnType<typeof createWorkspaceIndex>;

function joinPath(folder: string, relative: string): string {
  return folder.replace(/[\\/]$/, "") + "/" + relative;
}

export function createWorkspaceIndex() {
  let builtFolder: string | null = null;
  let chunks: Chunk[] = [];
  let index = buildIndex([]);
  let building: Promise<void> | null = null;

  function rebuild(): void {
    index = buildIndex(chunks);
  }

  async function build(folder: string): Promise<void> {
    const files = await listFilesRecursive(folder);
    const next: Chunk[] = [];
    for (const relative of files) {
      if (!TEXT_EXT.test(relative)) continue;
      const path = joinPath(folder, relative);
      let text: string;
      try {
        text = await invoke<string>("read_file", { path });
      } catch {
        continue;
      }
      if (text.length > MAX_BYTES) continue;
      next.push(...chunkDocument(path, text));
    }
    builtFolder = folder;
    chunks = next;
    rebuild();
  }

  return {
    async query(
      folder: string,
      q: string,
      k: number,
      excludePath?: string,
    ): Promise<Chunk[]> {
      if (builtFolder !== folder) {
        if (!building) building = build(folder);
        await building;
        building = null;
      }
      return retrieve(index, q, k, excludePath);
    },
    async queryScored(folder: string, q: string, k: number, excludePath?: string): Promise<{ chunk: Chunk; score: number }[]> {
      if (builtFolder !== folder) {
        if (!building) building = build(folder);
        await building;
        building = null;
      }
      return retrieveScored(index, q, k, excludePath);
    },
    onFileChanged(path: string, text: string): void {
      if (!builtFolder || !TEXT_EXT.test(path)) return;
      chunks = chunks.filter((chunk) => chunk.path !== path);
      if (text.length <= MAX_BYTES) {
        chunks.push(...chunkDocument(path, text));
      }
      rebuild();
    },
    onFileRemoved(path: string): void {
      if (!builtFolder) return;
      const before = chunks.length;
      chunks = chunks.filter((chunk) => chunk.path !== path);
      if (chunks.length !== before) rebuild();
    },
    reset(): void {
      builtFolder = null;
      chunks = [];
      index = buildIndex([]);
      building = null;
    },
  };
}
