// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createPresentController } from '../present/controller';
vi.mock('../render-extras', () => ({ enhancePreview: vi.fn(async () => {}) }));
vi.mock('../preview-images', () => ({ resolvePreviewImages: vi.fn() }));
it('starts at the cursor and restores a windowed place', async () => {
 const host = document.createElement('div'), setFullscreen = vi.fn(async (_on:boolean) => {}), restore = vi.fn(), closePresenter = vi.fn();
 const deps = { host, text: () => '# A\na\n## B\nb\n## C', notePath: () => null, cursorLine: () => 3, capture: () => 'place', restore, isFullscreen: async () => false, setFullscreen, theme: () => 'dark' as const, notesSize: () => 20, saveNotesSize: vi.fn(), openPresenter: vi.fn(), closePresenter, publish: vi.fn(), toast: vi.fn() };
 const c = createPresentController(deps); await c.start(true); expect(c.active()).toBe(true); expect(host.textContent).toContain('2 / 3'); expect(setFullscreen).toHaveBeenCalledWith(true);
 await c.leave(); expect(setFullscreen).toHaveBeenCalledWith(false); expect(restore).toHaveBeenCalledWith('place'); expect(closePresenter).toHaveBeenCalledOnce();
});
it('preserves existing fullscreen and rejects non-Markdown', async () => {
 const setFullscreen = vi.fn(async (_on:boolean) => {}), toast = vi.fn(); let source: string | null = null;
 const c = createPresentController({host:document.createElement('div'),text:()=>source,notePath:()=>null,cursorLine:()=>1,capture:()=>null,restore:vi.fn(),isFullscreen:async()=>true,setFullscreen,theme:()=> 'light',notesSize:()=>20,saveNotesSize:vi.fn(),openPresenter:vi.fn(),closePresenter:vi.fn(),publish:vi.fn(),toast});
 await c.start(false); expect(toast).toHaveBeenCalledWith('Open a Markdown note to present.'); source = '# A'; await c.start(false); await c.leave(); expect(setFullscreen).not.toHaveBeenCalled();
});

it('clamps presentation settings and rejects malformed bounds', async () => {
 const { parseSettings } = await import('../settings');
 expect(parseSettings(JSON.stringify({presentation:{notesSize:99,presenterWindow:'x'}})).presentation).toEqual({notesSize:32,presenterWindow:null});
});
