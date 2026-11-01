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
};
export function createPresentController(deps: PresentDeps) {
  let stage: ReturnType<typeof createStage> | null = null;
  let snapshot: unknown, wasFullscreen = false, starting = false;
  async function start(fromCursor: boolean): Promise<void> {
    if (stage || starting) return;
    const text = deps.text();
    if (text === null) { deps.toast('Open a Markdown note to present.'); return; }
    const slides = splitSlides(text);
    if (!slides.length) { deps.toast('This note has nothing to present.'); return; }
    starting = true;
    try {
      snapshot = deps.capture(); wasFullscreen = await deps.isFullscreen();
      if (!wasFullscreen) await deps.setFullscreen(true);
      const { createStage } = await import('./stage');
      stage = createStage({host:deps.host, slides, start:fromCursor ? slideAtLine(slides, deps.cursorLine()) : 0, notePath:deps.notePath(), theme:deps.theme(), notesSize:deps.notesSize(), onLeave:() => void leave(), onPresenter:deps.openPresenter, onNotesSize:deps.saveNotesSize, onIndex:deps.publish});
      document.body.classList.add('presenting');
    } finally { starting = false; }
  }
  async function leave(): Promise<void> {
    if (!stage) return;
    stage.destroy(); stage = null; document.body.classList.remove('presenting'); deps.closePresenter();
    try { if (!wasFullscreen) await deps.setFullscreen(false); } finally { deps.restore(snapshot); }
  }
  return { start, leave, active: () => stage !== null, go: (action: PresentAction) => stage?.go(action) };
}
