const WINDOW_MS = 10 * 60 * 1000;

export function createSnapshotThrottle(now: () => number): {
  shouldSnapshot(path: string, client: string, dirty: boolean): boolean;
} {
  const snapshots = new Map<string, number>();
  return {
    shouldSnapshot(path, client, dirty) {
      const key = `${client}\u0000${path}`;
      const current = now();
      const previous = snapshots.get(key);
      if (!dirty && previous !== undefined && current - previous < WINDOW_MS)
        return false;
      snapshots.set(key, current);
      return true;
    },
  };
}
