// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createPresentController, type PresentDeps } from '../present/controller';
vi.mock('../render-extras', () => ({ enhancePreview: vi.fn(async () => {}) }));
vi.mock('../preview-images', () => ({ resolvePreviewImages: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ x: 1, y: 2, width: 900, height: 600 })) }));

function deps(patch: Partial<PresentDeps> = {}): PresentDeps {
  return {
    host: document.createElement('div'), text: () => '# A\na\n## B\nb\n## C', notePath: () => null, cursorLine: () => 3,
    capture: () => 'place', restore: vi.fn(), isFullscreen: async () => false, setFullscreen: vi.fn(async () => {}),
    appTone: () => 'dark', themeName: () => 'nord', notesSize: () => 20, saveNotesSize: vi.fn(),
    presenterBounds: () => null, savePresenterBounds: vi.fn(), toast: vi.fn(), ...patch,
  };
}

it('starts at the cursor and restores a windowed place', async () => {
  const d = deps(); const c = createPresentController(d);
  await c.start(true); expect(c.active()).toBe(true); expect(d.host.textContent).toContain('2 / 3'); expect(d.setFullscreen).toHaveBeenCalledWith(true);
  await c.leave(); expect(d.setFullscreen).toHaveBeenCalledWith(false); expect(d.restore).toHaveBeenCalledWith('place');
  expect(d.savePresenterBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 900, height: 600 });
});

it('preserves existing fullscreen and rejects non-Markdown and empty notes', async () => {
  let source: string | null = null; const d = deps({ text: () => source, isFullscreen: async () => true });
  const c = createPresentController(d);
  await c.start(false); expect(d.toast).toHaveBeenCalledWith('Open a Markdown note to present.');
  source = '---\ntitle: x\n---\n\n<!-- notes: only notes -->\n'; await c.start(false); expect(d.toast).toHaveBeenCalledWith('This note has nothing to present.'); expect(c.active()).toBe(false);
  source = '# A'; await c.start(false); await c.leave(); expect(d.setFullscreen).not.toHaveBeenCalled();
});

it('never changes the note text it presents', async () => {
  const text = '# A\n<!-- notes: hi -->\n## B'; const d = deps({ text: () => text }); const c = createPresentController(d);
  await c.start(false); c.go('next'); await c.leave(); expect(text).toBe('# A\n<!-- notes: hi -->\n## B');
});

it('clamps presentation settings and rejects malformed bounds', async () => {
  const { parseSettings } = await import('../settings');
  expect(parseSettings(JSON.stringify({ presentation: { notesSize: 99, presenterWindow: 'x' } })).presentation).toEqual({ notesSize: 32, presenterWindow: null });
});
