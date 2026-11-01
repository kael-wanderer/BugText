import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { parsePresenterCommand, PRESENTER_COMMAND, PRESENTER_READY, PRESENTER_STATE, type Rect } from './protocol';
import { splitSlides, slideAtLine } from './split';
import type { PresentAction } from './keys';
import type { createStage } from './stage';

export type PresentDeps = {
  text(): string | null; notePath(): string | null; cursorLine(): number;
  capture(): unknown; restore(snapshot: unknown): void;
  isFullscreen(): Promise<boolean>; setFullscreen(on: boolean): Promise<void>;
  theme(): 'light' | 'dark'; notesSize(): number; saveNotesSize(size: number): void;
  openPresenter(): void; closePresenter(): void; publish(index: number): void;
  host: HTMLElement; toast(text: string): void;
  presenterBounds?(): Rect | null; savePresenterBounds?(bounds: Rect): void;
};
export function createPresentController(deps: PresentDeps) {
  let stage: ReturnType<typeof createStage> | null = null;
  let snapshot: unknown, wasFullscreen = false, starting = false;
  let unlisten: UnlistenFn[] = [];
  let slides: ReturnType<typeof splitSlides> = [], path: string | null = null;
  let owner = "main";
  const publish = (index: number) => {
    if (!slides[index]) return;
    deps.publish(index);
    void emitTo("presenter", PRESENTER_STATE, { index, total: slides.length, current: slides[index].source, next: slides[index+1]?.source ?? null, notes: slides[index].notes, notePath: path, theme: deps.theme(), notesSize: deps.notesSize(), owner }).catch(() => {});
  };
  const openPresenter = () => { deps.openPresenter(); void invoke("open_presenter_window", { owner, saved: deps.presenterBounds?.() ?? null }).catch(() => deps.toast("Could not open presenter window.")); };
  async function start(fromCursor: boolean): Promise<void> {
    if (stage || starting) return;
    const text = deps.text();
    if (text === null) { deps.toast('Open a Markdown note to present.'); return; }
    slides = splitSlides(text);
    if (!slides.length) { deps.toast('This note has nothing to present.'); return; }
    starting = true;
    try {
      snapshot = deps.capture(); wasFullscreen = await deps.isFullscreen(); path = deps.notePath();
      try {
        const current = getCurrentWindow(); owner = current.label;
        unlisten = await Promise.all([
          listen(PRESENTER_READY, event => { if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) && Object.keys(event.payload).length === 0 && stage) publish(stage.index()); }),
          current.listen(PRESENTER_COMMAND, event => { const command = parsePresenterCommand(event.payload); if (!command || !stage) return; if ('action' in command) stage.go(command.action); else if ('notesSize' in command) { deps.saveNotesSize(command.notesSize); publish(stage.index()); } else deps.savePresenterBounds?.(command.closed); }),
        ]);
      } catch { /* Browser previews and tests have no native event bridge. */ }
      if (!wasFullscreen) await deps.setFullscreen(true);
      const { createStage } = await import('./stage');
      stage = createStage({host:deps.host, slides, start:fromCursor ? slideAtLine(slides, deps.cursorLine()) : 0, notePath:path, theme:deps.theme(), notesSize:deps.notesSize(), onLeave:() => void leave(), onPresenter:openPresenter, onNotesSize:size => { deps.saveNotesSize(size); if (stage) publish(stage.index()); }, onIndex:publish});
      document.body.classList.add('presenting');
    } finally { starting = false; }
  }
  async function leave(): Promise<void> {
    if (!stage) return;
    stage.destroy(); stage = null; document.body.classList.remove('presenting'); deps.closePresenter();
    void invoke("close_presenter_window").catch(() => {});
    unlisten.forEach(stop => stop()); unlisten = [];
    try { if (!wasFullscreen) await deps.setFullscreen(false); } finally { deps.restore(snapshot); }
  }
  return { start, leave, active: () => stage !== null, go: (action: PresentAction) => stage?.go(action) };
}
