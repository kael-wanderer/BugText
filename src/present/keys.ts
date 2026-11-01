export type PresentAction =
  | 'next' | 'prev' | 'first' | 'last' | 'up' | 'down' | 'leave'
  | 'notes' | 'laser' | 'black' | 'theme' | 'presenter' | { goto: number };

type Key = { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean };

const ACTIONS: Record<string, PresentAction> = {
  ArrowRight: 'next', ' ': 'next', PageDown: 'next', Enter: 'next',
  ArrowLeft: 'prev', PageUp: 'prev', Backspace: 'prev',
  Home: 'first', End: 'last', ArrowDown: 'down', ArrowUp: 'up', Escape: 'leave',
  n: 'notes', l: 'laser', b: 'black', t: 'theme', p: 'presenter',
};
/** Toggles that must not flicker while a key is held down. */
const NO_REPEAT = new Set<PresentAction>(['leave', 'notes', 'laser', 'black', 'theme', 'presenter']);
const DIGIT_TIMEOUT_MS = 1500;

/** Maps presentation keys to actions. Chords are left to the app; digits then Enter jump to a slide. */
export function createKeyReader(now: () => number): { read(e: Key): PresentAction | null } {
  let digits = '';
  let last = 0;
  return {
    read(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return null;
      if (now() - last >= DIGIT_TIMEOUT_MS) digits = '';
      if (/^[0-9]$/.test(e.key)) { digits = (digits + e.key).slice(-5); last = now(); return null; }
      if (e.key === 'Enter' && digits) { const goto = Number(digits); digits = ''; return goto > 0 ? { goto } : null; }
      digits = '';
      const action = ACTIONS[e.key] ?? ACTIONS[e.key.toLowerCase()] ?? null;
      if (action && e.repeat && NO_REPEAT.has(action)) return null;
      return action;
    },
  };
}
