import { invoke } from '@tauri-apps/api/core';
import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  parsePresenterCommand, PRESENTER_COMMAND, PRESENTER_READY, PRESENTER_STATE, PRESENTING_STARTED,
  type PresenterState, type Rect, type Tone,
} from './protocol';
import { splitSlides, slideAtLine, type Slide } from './split';
import type { PresentAction } from './keys';
import type { Stage } from './stage';

export type PresentDeps = {
  host: HTMLElement;
  /** The active tab's text when it is a Markdown note, else null. */
  text(): string | null;
  notePath(): string | null;
  cursorLine(): number;
  capture(): unknown;
  restore(snapshot: unknown): void;
  isFullscreen(): Promise<boolean>;
  setFullscreen(on: boolean): Promise<void>;
  appTone(): Tone;
  themeName(): string;
  notesSize(): number;
  saveNotesSize(size: number): void;
  presenterBounds(): Rect | null;
  savePresenterBounds(bounds: Rect): void;
  toast(text: string): void;
};

const isRect = (v: unknown): v is Rect => !!v && typeof v === 'object'
  && ['x', 'y', 'width', 'height'].every(k => Number.isFinite((v as Record<string, unknown>)[k]));

export function createPresentController(deps: PresentDeps) {
  let stage: Stage | null = null;
  let snapshot: unknown;
  let wasFullscreen = false, busy = false;
  let unlisten: UnlistenFn[] = [];
  let slides: Slide[] = [];
  let path: string | null = null;
  let owner = 'main';

  function publish(): void {
    if (!stage) return;
    const index = stage.index();
    const state: PresenterState = {
      index, total: slides.length, current: slides[index].source, next: slides[index + 1]?.source ?? null,
      notes: slides[index].notes, notePath: path, themeName: deps.themeName(), tone: stage.tone(),
      notesSize: deps.notesSize(), owner,
    };
    void emitTo('presenter', PRESENTER_STATE, state).catch(() => {});
  }
  function saveNotesSize(size: number): void { deps.saveNotesSize(size); publish(); }
  function openPresenter(): void {
    void invoke('open_presenter_window', { owner, saved: deps.presenterBounds() })
      .catch(() => deps.toast('Could not open the presenter window.'));
  }
  async function listenToPresenter(): Promise<void> {
    try {
      const current = getCurrentWindow();
      owner = current.label;
      unlisten = await Promise.all([
        listen(PRESENTER_READY, () => publish()),
        current.listen(PRESENTER_COMMAND, event => {
          const command = parsePresenterCommand(event.payload);
          if (!command) return;
          if ('closed' in command) deps.savePresenterBounds(command.closed);
          else if (!stage) return;
          else if ('action' in command) stage.go(command.action);
          else if ('goto' in command) stage.go({ goto: command.goto });
          else saveNotesSize(command.notesSize);
        }),
      ]);
    } catch { /* Tests and browser previews have no native event bridge. */ }
  }

  async function start(fromCursor: boolean): Promise<void> {
    if (stage || busy) return;
    const text = deps.text();
    if (text === null) { deps.toast('Open a Markdown note to present.'); return; }
    slides = splitSlides(text);
    if (!slides.length) { deps.toast('This note has nothing to present.'); return; }
    busy = true;
    try {
      const first = fromCursor ? slideAtLine(slides, deps.cursorLine()) : 0;
      snapshot = deps.capture();
      path = deps.notePath();
      wasFullscreen = await deps.isFullscreen().catch(() => false);
      const { createStage } = await import('./stage');
      await listenToPresenter();
      stage = createStage({
        host: deps.host, slides, start: first, notePath: path, appTone: deps.appTone(), notesSize: deps.notesSize(),
        onLeave: () => void leave(), onPresenter: openPresenter, onNotesSize: saveNotesSize,
        onIndex: publish, onTone: publish,
      });
      document.body.classList.add('presenting');
      void emit(PRESENTING_STARTED, { owner }).catch(() => {});
      if (!wasFullscreen) await deps.setFullscreen(true).catch(() => {});
    } finally { busy = false; }
  }

  async function leave(): Promise<void> {
    if (!stage || busy) return;
    busy = true;
    try {
      stage.destroy();
      stage = null;
      document.body.classList.remove('presenting');
      const bounds = await invoke<unknown>('close_presenter_window', { owner }).catch(() => null);
      if (isRect(bounds)) deps.savePresenterBounds(bounds);
      unlisten.forEach(stop => stop());
      unlisten = [];
      if (!wasFullscreen) await deps.setFullscreen(false).catch(() => {});
      deps.restore(snapshot);
    } finally { busy = false; }
  }

  return {
    start, leave,
    active: () => stage !== null,
    owner: () => owner,
    go: (action: PresentAction) => stage?.go(action),
  };
}
