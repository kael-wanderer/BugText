// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createStage, type StageOptions } from '../present/stage';
vi.mock('../render-extras', () => ({ enhancePreview: vi.fn(async () => {}) }));
vi.mock('../preview-images', () => ({ resolvePreviewImages: vi.fn() }));
const live: { destroy(): void }[] = [];
afterEach(() => { live.splice(0).forEach(s => s.destroy()); document.body.innerHTML = ''; });

const slides = [
  { source: '[link](https://example.com)', notes: '', fromLine: 1, toLine: 1 },
  { source: '# Two', notes: '<img src=x onerror=alert(1)>', fromLine: 2, toLine: 2 },
  { source: '# Three', notes: '', fromLine: 3, toLine: 3 },
];
function setup(extra: Partial<StageOptions> = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const o: StageOptions = { host, slides, start: 0, notePath: null, appTone: 'dark', notesSize: 20, onLeave: vi.fn(), onPresenter: vi.fn(), onNotesSize: vi.fn(), onIndex: vi.fn(), onTone: vi.fn(), ...extra };
  const stage = createStage(o); live.push(stage);
  return { host, o, stage };
}
const key = (key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e); return e;
};

it('navigates, displays safe notes, dismisses black and removes listeners', () => {
  const { host, o, stage } = setup();
  const link = host.querySelector('a')!; const click = new MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
  key('ArrowRight'); expect(stage.index()).toBe(1); expect(host.textContent).toContain('2 / 3');
  key('n'); expect(host.textContent).toContain('<img src=x onerror=alert(1)>'); expect(host.querySelector('.present-notes img')).toBeNull();
  key('b'); expect(host.querySelector('.present-black')).not.toBeNull(); key('ArrowRight'); expect(stage.index()).toBe(1); expect(host.querySelector('.present-black')).toBeNull();
  key('Escape'); expect(o.onLeave).not.toHaveBeenCalled(); key('Escape'); expect(o.onLeave).toHaveBeenCalledOnce();
  key('End'); expect(stage.index()).toBe(2); key('Enter'); expect(stage.index()).toBe(2); key('n'); expect(host.textContent).toContain('No notes for this slide.');
  expect(o.onIndex).toHaveBeenCalled(); stage.destroy(); key('ArrowLeft'); expect(host.querySelector('.present')).toBeNull(); expect(stage.index()).toBe(2);
});

it('jumps to a typed slide number', () => {
  const { stage } = setup();
  key('3'); key('Enter'); expect(stage.index()).toBe(2);
  key('1'); key('Enter'); expect(stage.index()).toBe(0);
});

it('keeps every key away from the editor underneath and gives focus back on leave', () => {
  const editor = document.createElement('textarea'); document.body.append(editor); editor.focus();
  const typed = vi.fn(); editor.addEventListener('keydown', typed);
  const { host, stage } = setup();
  expect(document.activeElement).toBe(host.querySelector('.present'));
  const e = key('x'); expect(e.defaultPrevented).toBe(true);
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }));
  expect(typed).not.toHaveBeenCalled();
  const chord = key('s', { metaKey: true }); expect(chord.defaultPrevented).toBe(false);
  editor.focus(); expect(document.activeElement).toBe(host.querySelector('.present'));
  stage.destroy(); expect(document.activeElement).toBe(editor);
});

it('flips light and dark for this presentation only', () => {
  const { host, o, stage } = setup();
  key('t'); expect(stage.tone()).toBe('light'); expect(host.querySelector('.present')!.classList.contains('tone-light')).toBe(true); expect(o.onTone).toHaveBeenCalledWith('light');
  key('t'); expect(stage.tone()).toBeNull(); expect(host.querySelector('.present')!.classList.contains('tone-light')).toBe(false);
});

it('clicks go forward on the right two thirds and back on the left third', () => {
  const { host, stage } = setup({ start: 1 });
  const root = host.querySelector('.present')!;
  root.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: window.innerWidth - 10 })); expect(stage.index()).toBe(2);
  root.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5 })); expect(stage.index()).toBe(1);
  (host.querySelector('.present-bar button') as HTMLButtonElement).click(); expect(stage.index()).toBe(0);
});
