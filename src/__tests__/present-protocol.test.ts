import { expect, it } from 'vitest';
import { parsePresenterCommand, parsePresenterState } from '../present/protocol';
it('validates state and commands', () => {
  const state = { index: 2, total: 12, current: '# Here', next: '# Next', notes: '<img>', notePath: null, themeName: 'nord', tone: null, notesSize: 20, owner: 'main' };
  expect(parsePresenterState(state)).toEqual(state);
  expect(parsePresenterState({ ...state, extra: '<script>' })).toEqual(state);
  for (const patch of [{ index: 12 }, { index: -1 }, { current: 7 }, { notesSize: 99 }, { themeName: 'x" onload' }, { tone: 'blue' }, { owner: '' }]) expect(parsePresenterState({ ...state, ...patch })).toBeNull();
  expect(parsePresenterCommand({ action: 'next' })).toEqual({ action: 'next' });
  expect(parsePresenterCommand({ action: 'black' })).toEqual({ action: 'black' });
  expect(parsePresenterCommand({ goto: 7 })).toEqual({ goto: 7 });
  for (const bad of [{ action: 'unknown' }, { goto: 0 }, { goto: 1.5 }, { notesSize: 8 }, { closed: { x: 0, y: 0, width: 0, height: 5 } }, null, []]) expect(parsePresenterCommand(bad)).toBeNull();
});
