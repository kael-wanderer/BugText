export type SpellRange = [number, number];

export function createLineCache(limit = 5000) {
  const entries = new Map<string, SpellRange[]>();
  return {
    get(line: string): SpellRange[] | undefined {
      const value = entries.get(line);
      if (value !== undefined) { entries.delete(line); entries.set(line, value); }
      return value;
    },
    set(line: string, ranges: SpellRange[]): void {
      entries.delete(line);
      entries.set(line, ranges);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    clear(): void { entries.clear(); },
  };
}

export const spellCache = createLineCache();
