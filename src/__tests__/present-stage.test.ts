// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createStage } from '../present/stage';
vi.mock('../render-extras', () => ({ enhancePreview: vi.fn(async () => {}) }));
vi.mock('../preview-images', () => ({ resolvePreviewImages: vi.fn() }));
afterEach(() => { document.body.innerHTML = ''; });
it('navigates, displays safe notes, dismisses black and removes listeners', () => {
  const host = document.createElement('div'); document.body.append(host);
  const onIndex = vi.fn(), onLeave = vi.fn();
  const stage = createStage({host, slides: [
    {source:'[link](https://example.com)',notes:'',fromLine:1,toLine:1},
    {source:'# Two',notes:'<img src=x onerror=alert(1)>',fromLine:2,toLine:2},
    {source:'# Three',notes:'',fromLine:3,toLine:3},
  ], start:0, notePath:null, theme:'dark', notesSize:20, onLeave, onPresenter:vi.fn(), onNotesSize:vi.fn(), onIndex});
  const key = (key:string) => window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
  const link = host.querySelector('a')!; const click = new MouseEvent('click',{bubbles:true,cancelable:true}); link.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
  key('ArrowRight'); expect(stage.index()).toBe(1); expect(host.textContent).toContain('2 / 3');
  key('n'); expect(host.textContent).toContain('<img src=x onerror=alert(1)>'); expect(host.querySelector('.present-notes img')).toBeNull();
  key('b'); expect(host.querySelector('.present-black')).not.toBeNull(); key('ArrowRight'); expect(stage.index()).toBe(1);
  key('Escape'); expect(onLeave).not.toHaveBeenCalled(); key('Escape'); expect(onLeave).toHaveBeenCalledOnce();
  key('End'); expect(stage.index()).toBe(2); key('Enter'); expect(stage.index()).toBe(2); key('n'); expect(host.textContent).toContain('No notes for this slide.');
  expect(onIndex).toHaveBeenCalled(); stage.destroy(); key('ArrowLeft'); expect(host.querySelector('.present')).toBeNull(); expect(stage.index()).toBe(2);
});
