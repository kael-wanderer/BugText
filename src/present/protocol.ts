export const PRESENTER_STATE = 'bugtext://presenter-state';
export const PRESENTER_COMMAND = 'bugtext://presenter-command';
export const PRESENTER_READY = 'bugtext://presenter-ready';
/** Broadcast when a window starts presenting, so any other window leaves (one presentation per app). */
export const PRESENTING_STARTED = 'bugtext://presenting-started';

export type Rect = { x: number; y: number; width: number; height: number };
export type Tone = 'light' | 'dark';
export type PresenterState = {
  index: number; total: number; current: string; next: string | null; notes: string;
  notePath: string | null; themeName: string; tone: Tone | null; notesSize: number; owner: string;
};
export type PresenterAction = 'next' | 'prev' | 'first' | 'last' | 'black' | 'leave';
export type PresenterCommand = { action: PresenterAction } | { goto: number } | { notesSize: number } | { closed: Rect };

const ACTIONS: readonly string[] = ['next', 'prev', 'first', 'last', 'black', 'leave'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const size = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 14 && v <= 32;
const rect = (v: unknown): v is Rect => object(v)
  && ['x', 'y', 'width', 'height'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
  && (v.width as number) > 0 && (v.height as number) > 0;
const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function parsePresenterState(v: unknown): PresenterState | null {
  if (!object(v) || !int(v.total, 1, 100_000) || !int(v.index, 0, (v.total as number) - 1)) return null;
  if (typeof v.current !== 'string' || !(v.next === null || typeof v.next === 'string') || typeof v.notes !== 'string') return null;
  if (!(v.notePath === null || typeof v.notePath === 'string')) return null;
  if (typeof v.themeName !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v.themeName)) return null;
  if (!(v.tone === null || v.tone === 'light' || v.tone === 'dark') || !size(v.notesSize)) return null;
  if (typeof v.owner !== 'string' || !v.owner) return null;
  return {
    index: v.index, total: v.total, current: v.current, next: v.next, notes: v.notes, notePath: v.notePath,
    themeName: v.themeName, tone: v.tone, notesSize: v.notesSize, owner: v.owner,
  };
}

export function parsePresenterCommand(v: unknown): PresenterCommand | null {
  if (!object(v)) return null;
  if (typeof v.action === 'string' && ACTIONS.includes(v.action)) return { action: v.action as PresenterAction };
  if (int(v.goto, 1, 100_000)) return { goto: v.goto };
  if (size(v.notesSize)) return { notesSize: v.notesSize };
  if (rect(v.closed)) return { closed: v.closed };
  return null;
}
