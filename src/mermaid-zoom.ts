export type View = { scale: number; x: number; y: number };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const STEP = 1.25;

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** Keep the content under point fixed while changing scale. */
export function zoomAt(view: View, factor: number, point: { x: number; y: number }): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

export function fitView(content: { width: number; height: number }, viewport: { width: number; height: number }, padding = 24): View {
  const scale = Math.min(1, Math.max(Number.EPSILON, Math.min(
    Math.max(0, viewport.width - padding * 2) / Math.max(1, content.width),
    Math.max(0, viewport.height - padding * 2) / Math.max(1, content.height),
  )));
  return { scale, x: (viewport.width - content.width * scale) / 2, y: (viewport.height - content.height * scale) / 2 };
}
