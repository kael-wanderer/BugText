import type { FilePosition } from "./layout";

function clamp(value: number | undefined, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? Math.round(value!) : min, min), Math.max(min, max));
}
export type TextPositionView = {
  cursor(): number; topLine(): number; text(): string;
  setCursor(offset: number): void; scrollLineToTop(line: number): void;
};
export function captureTextPosition(view: Pick<TextPositionView, "cursor" | "topLine">): FilePosition {
  // The preview reports an interpolated line; stored positions must be whole lines.
  return { cursor: view.cursor(), topLine: clamp(Math.floor(view.topLine()), 1, Number.MAX_SAFE_INTEGER) };
}
export function applyTextPosition(position: FilePosition, view: TextPositionView): FilePosition {
  const text = view.text();
  const cursor = clamp(position.cursor, 0, text.length);
  const topLine = clamp(position.topLine, 1, text.split("\n").length);
  view.setCursor(cursor); view.scrollLineToTop(topLine);
  return { cursor, topLine };
}
export function applyPdfPosition(position: FilePosition, count: number, goToPage: (page: number) => void): FilePosition {
  const page = clamp(position.page, 1, count);
  if (count > 0) goToPage(page);
  return { page };
}

/** Inactive tabs retain their last active position; snapshots never sample a different tab's view. */
export function createPositionTracker(changed: () => void = () => {}) {
  const positions = new Map<string, FilePosition>();
  return {
    remember(id: string, position: FilePosition): void {
      const previous = positions.get(id);
      if (previous?.cursor === position.cursor && previous?.topLine === position.topLine && previous?.page === position.page) return;
      positions.set(id, {
        ...(position.cursor !== undefined ? { cursor: position.cursor } : {}),
        ...(position.topLine !== undefined ? { topLine: position.topLine } : {}),
        ...(position.page !== undefined ? { page: position.page } : {}),
      });
      changed();
    },
    get(id: string): FilePosition | undefined { const value = positions.get(id); return value ? { ...value } : undefined; },
    snapshot(): ReadonlyMap<string, FilePosition> { return new Map([...positions].map(([id, value]) => [id, { ...value }])); },
    forget(id: string): void { positions.delete(id); },
  };
}
