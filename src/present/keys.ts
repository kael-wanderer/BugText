export type PresentAction = 'next' | 'prev' | 'first' | 'last' | 'leave' | 'notes' | 'laser' | 'black' | 'theme' | 'presenter' | { goto: number };
export function createKeyReader(now: () => number): { read(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean }): PresentAction | null } {
  let digits = ''; let last = 0;
  return { read(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return null;
    if (now() - last >= 1500) digits = '';
    if (/^[0-9]$/.test(e.key)) { digits += e.key; last = now(); return null; }
    if (e.key === 'Enter' && digits) { const goto = Number(digits); digits = ''; return { goto }; }
    digits = '';
    const actions: Record<string, PresentAction> = { ArrowRight:'next', ' ':'next', PageDown:'next', Enter:'next', ArrowLeft:'prev', PageUp:'prev', Backspace:'prev', Home:'first', End:'last', Escape:'leave', n:'notes', l:'laser', b:'black', t:'theme', p:'presenter' };
    const action = actions[e.key] ?? actions[e.key.toLowerCase()];
    if (e.repeat && action && ['leave','notes','laser','black','theme','presenter'].includes(action as string)) return null;
    return action ?? null;
  } };
}
