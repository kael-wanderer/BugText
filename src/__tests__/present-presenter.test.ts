// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPresenter } from '../present/presenter-main';
vi.mock('../render-extras', () => ({ enhancePreview: vi.fn(async () => {}) }));
vi.mock('../preview-images', () => ({ resolvePreviewImages: vi.fn() }));
afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
it('shows safe notes, next slide, timer and sends controls', () => {
 vi.useFakeTimers(); const host=document.createElement('div'), send=vi.fn(); document.body.append(host);
 const ui=createPresenter(host,send); const state={index:2,total:12,current:'# Current',next:'# Next title',notes:'<img src=x onerror=alert(1)>',notePath:null,themeName:'nord',tone:null,notesSize:20,owner:'main'};
 ui.update(state); expect(host.textContent).toContain('3 / 12'); expect(host.textContent).toContain('Next title'); expect(host.textContent).toContain(state.notes); expect(host.querySelector('.presenter-notes img')).toBeNull(); expect(host.textContent).toContain('00:00');
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Next ›')!.click(); expect(send).toHaveBeenCalledWith('main',{action:'next'});
 ui.update({...state,index:3,next:null}); vi.advanceTimersByTime(5000); expect(host.textContent).toContain('00:05'); expect(host.textContent).toContain('End of presentation'); host.dispatchEvent(new Event('x'));
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'4'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); expect(send).toHaveBeenCalledWith('main',{goto:4});
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'n'})); expect(send).not.toHaveBeenCalledWith('main',{action:'notes'});
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Pause')!.click(); expect(host.textContent).toContain('Resume'); ui.destroy();
});
