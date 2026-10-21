import { invoke } from "@tauri-apps/api/core";
type Cache = Record<string, { models: string[]; fetchedAt: number }>;
async function read(): Promise<Cache> {
  const raw: unknown = JSON.parse(await invoke<string>("ai_models_cache_read"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([, v]) =>
        v &&
        Array.isArray(v.models) &&
        v.models.every((m: unknown) => typeof m === "string") &&
        typeof v.fetchedAt === "number",
    ),
  );
}
export async function loadModelsCache(): Promise<Record<string, string[]>> {
  try {
    return Object.fromEntries(
      Object.entries(await read()).map(([id, v]) => [id, v.models]),
    );
  } catch {
    return {};
  }
}
let pending = Promise.resolve();
function update(change: (cache: Cache) => void): Promise<void> {
  const result = pending.then(async () => {
    let cache: Cache;
    try {
      cache = await read();
    } catch {
      cache = {};
    }
    change(cache);
    await invoke("ai_models_cache_write", { contents: JSON.stringify(cache) });
  });
  pending = result.catch(() => {});
  return result;
}
export function saveModels(
  connectionId: string,
  models: string[],
): Promise<void> {
  return update((cache) => {
    Object.defineProperty(cache, connectionId, {
      value: { models, fetchedAt: Date.now() },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });
}
export function dropModels(connectionId: string): Promise<void> {
  return update((cache) => {
    delete cache[connectionId];
  });
}
