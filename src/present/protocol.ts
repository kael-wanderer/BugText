export const PRESENTER_STATE = 'bugtext://presenter-state';
export const PRESENTER_COMMAND = 'bugtext://presenter-command';
export const PRESENTER_READY = 'bugtext://presenter-ready';
export type Rect = { x: number; y: number; width: number; height: number };
export type PresenterState = { index: number; total: number; current: string; next: string | null; notes: string; notePath: string | null; theme: 'light' | 'dark'; notesSize: number; owner: string };
export type PresenterCommand = { action: 'next' | 'prev' | 'first' | 'last' | 'leave' } | { notesSize: number } | { closed: Rect };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const size = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 14 && v <= 32;
const rect = (v: unknown): v is Rect => object(v) && ['x','y','width','height'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k])) && (v.width as number) > 0 && (v.height as number) > 0;
export function parsePresenterState(v: unknown): PresenterState | null {
 if (!object(v) || !Number.isInteger(v.index) || !Number.isInteger(v.total) || (v.index as number) < 0 || (v.total as number) < 1 || (v.index as number) >= (v.total as number) || typeof v.current !== 'string' || !(v.next === null || typeof v.next === 'string') || typeof v.notes !== 'string' || !(v.notePath === null || typeof v.notePath === 'string') || !(v.theme === 'dark' || v.theme === 'light') || !size(v.notesSize) || typeof v.owner !== 'string' || !v.owner) return null;
 return v as PresenterState;
}
export function parsePresenterCommand(v: unknown): PresenterCommand | null {
 if (!object(v)) return null;
 if (typeof v.action === 'string' && ['next','prev','first','last','leave'].includes(v.action)) return {action:v.action as 'next' | 'prev' | 'first' | 'last' | 'leave'};
 if (size(v.notesSize)) return {notesSize:v.notesSize};
 if (rect(v.closed)) return {closed:v.closed};
 return null;
}
