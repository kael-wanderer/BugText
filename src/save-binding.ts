export type SaveBinding = { windowId: string; tabId: string; path: string | null; revision: number };

const queues = new Map<string, Promise<unknown>>();

export function runSerialized<T>(key: string, task: (queued: boolean) => Promise<T>): Promise<T> {
  const queued = queues.has(key);
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(() => task(queued));
  queues.set(key, result);
  void result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => {});
  return result;
}

export function completeSave(binding: SaveBinding, liveRevision: number): "clean" | "still-dirty" {
  return binding.revision === liveRevision ? "clean" : "still-dirty";
}
