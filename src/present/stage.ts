import { renderMarkdown } from '../preview';
import { resolvePreviewImages } from '../preview-images';
import { enhancePreview } from '../render-extras';
import { enhancePreviewTasks } from '../preview-tasks';
import { fitScale } from './fit';
import { createKeyReader, type PresentAction } from './keys';
import type { Tone } from './protocol';
import type { Slide } from './split';
import './present.css';

export type StageOptions = {
  host: HTMLElement; slides: Slide[]; start: number; notePath: string | null;
  /** The app theme's tone; T flips away from it for this presentation only. */
  appTone: Tone; notesSize: number;
  onLeave(): void; onPresenter(): void; onNotesSize(size: number): void;
  onIndex(index: number): void; onTone(tone: Tone | null): void;
};
export type Stage = { go(action: PresentAction): void; index(): number; tone(): Tone | null; destroy(): void };

const IDLE_MS = 2000;
const BAR_ZONE_PX = 60;

function button(parent: HTMLElement, label: string, fn: () => void, title = label): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.title = title; b.tabIndex = -1;
  b.addEventListener('click', fn);
  parent.append(b);
  return b;
}

/** Renders one slide at a time over the window and owns every key and click while presenting. */
export function createStage(o: StageOptions): Stage {
  const total = o.slides.length;
  let index = Math.max(0, Math.min(total - 1, o.start));
  let notesOpen = false, laserOn = false, size = o.notesSize, tone: Tone | null = null;
  let blackLayer: HTMLElement | null = null;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const root = document.createElement('div');
  root.className = 'present';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Presentation');
  const stageBox = document.createElement('div'); stageBox.className = 'present-stage';
  const frame = document.createElement('div'); frame.className = 'present-frame';
  const content = document.createElement('article'); content.className = 'doc present-content';
  const more = document.createElement('div'); more.className = 'present-more'; more.textContent = 'More below'; more.hidden = true;
  frame.append(content); stageBox.append(frame, more);

  const notes = document.createElement('section'); notes.className = 'present-notes'; notes.hidden = true;
  const noteHeader = document.createElement('header');
  const noteTitle = document.createElement('b');
  noteHeader.append(noteTitle);
  button(noteHeader, 'A−', () => changeSize(-2), 'Smaller notes');
  button(noteHeader, 'A+', () => changeSize(2), 'Larger notes');
  button(noteHeader, 'Close', () => { notesOpen = false; updateNotes(); });
  const noteText = document.createElement('div'); noteText.className = 'present-notes-text';
  notes.append(noteHeader, noteText);

  const bar = document.createElement('div'); bar.className = 'present-bar';
  button(bar, '‹ Previous', () => go('prev'), 'Previous slide');
  const count = document.createElement('span'); count.className = 'present-count'; bar.append(count);
  button(bar, 'Next ›', () => go('next'), 'Next slide');
  bar.append(Object.assign(document.createElement('span'), { className: 'present-sep' }));
  const notesBtn = button(bar, 'Notes', () => go('notes'), 'Speaker notes (N)');
  const laserBtn = button(bar, 'Laser', () => go('laser'), 'Laser pointer (L)');
  button(bar, 'Presenter view', () => go('presenter'), 'Presenter window (P)');
  const toneBtn = button(bar, '', () => go('theme'), 'Light or dark (T)');
  bar.append(Object.assign(document.createElement('span'), { className: 'present-sep' }));
  button(bar, 'Exit', () => go('leave'), 'Leave (Esc)').classList.add('present-exit');

  const laser = document.createElement('div'); laser.className = 'present-laser'; laser.hidden = true;
  root.append(stageBox, notes, bar, laser);
  o.host.append(root);
  root.focus();

  function currentTone(): Tone { return tone ?? o.appTone; }
  function applyTone(): void {
    root.classList.toggle('tone-light', tone === 'light');
    root.classList.toggle('tone-dark', tone === 'dark');
    toneBtn.textContent = currentTone() === 'light' ? 'Dark' : 'Light';
  }
  function changeSize(delta: number): void {
    size = Math.max(14, Math.min(32, size + delta));
    o.onNotesSize(size);
    updateNotes();
  }
  function updateNotes(): void {
    notes.hidden = !notesOpen;
    notesBtn.classList.toggle('on', notesOpen);
    noteTitle.textContent = `Speaker notes · slide ${index + 1}`;
    noteText.textContent = o.slides[index].notes || 'No notes for this slide.';
    noteText.style.fontSize = `${size}px`;
  }
  function updateMore(): void {
    more.hidden = !frame.classList.contains('scroll') || frame.scrollTop + frame.clientHeight >= frame.scrollHeight - 4;
  }
  function fit(): void {
    content.style.zoom = '';
    frame.classList.remove('scroll');
    const result = fitScale(
      { width: content.scrollWidth, height: content.scrollHeight },
      { width: frame.clientWidth, height: frame.clientHeight },
    );
    content.style.zoom = result.scale < 1 ? String(result.scale) : '';
    frame.classList.toggle('scroll', result.scroll);
    updateMore();
  }
  function render(): void {
    content.innerHTML = renderMarkdown(o.slides[index].source);
    content.querySelectorAll('a').forEach(a => { a.tabIndex = -1; });
    enhancePreviewTasks(content, null);
    resolvePreviewImages(content, o.notePath);
    frame.scrollTop = 0;
    count.textContent = `${index + 1} / ${total}`;
    updateNotes();
    fit();
    const shown = index;
    void enhancePreview(content).then(() => { if (shown === index) fit(); }).catch(() => {});
  }
  function clearBlack(): void { blackLayer?.remove(); blackLayer = null; }

  function go(action: PresentAction): void {
    // Black screen: any action only brings the slide back.
    if (blackLayer) { clearBlack(); return; }
    switch (action) {
      case 'leave':
        if (notesOpen) { notesOpen = false; updateNotes(); } else o.onLeave();
        return;
      case 'notes': notesOpen = !notesOpen; updateNotes(); return;
      case 'black':
        blackLayer = document.createElement('div'); blackLayer.className = 'present-black'; root.append(blackLayer);
        return;
      case 'laser':
        laserOn = !laserOn; laser.hidden = !laserOn;
        root.classList.toggle('laser-on', laserOn); laserBtn.classList.toggle('on', laserOn);
        return;
      case 'theme':
        tone = currentTone() === 'light' ? 'dark' : 'light';
        if (tone === o.appTone) tone = null;
        applyTone(); o.onTone(tone);
        return;
      case 'presenter': o.onPresenter(); return;
      case 'down': case 'up':
        if (frame.classList.contains('scroll')) frame.scrollBy({ top: (action === 'down' ? 1 : -1) * frame.clientHeight * 0.2 });
        return;
    }
    const target = typeof action === 'object' ? action.goto - 1
      : action === 'next' ? index + 1 : action === 'prev' ? index - 1 : action === 'first' ? 0 : total - 1;
    const clamped = Math.max(0, Math.min(total - 1, target));
    if (clamped !== index) { index = clamped; render(); o.onIndex(index); }
  }

  const reader = createKeyReader(Date.now);
  // Capture every key while presenting: unhandled keys must never reach the editor underneath.
  // Chords are not default-prevented, so native menu shortcuts (⌘Q, ⇧⌘P) still work.
  const keydown = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (blackLayer) { clearBlack(); return; }
    const action = reader.read(e);
    if (action) go(action);
  };
  const keyup = (e: KeyboardEvent) => { e.stopImmediatePropagation(); };
  const keepFocus = (e: FocusEvent) => { if (e.target instanceof Node && !root.contains(e.target)) root.focus(); };
  const click = (e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('a')) e.preventDefault();
    if (blackLayer) { clearBlack(); return; }
    if (target.closest('.present-bar, .present-notes')) return;
    go(e.clientX < window.innerWidth / 3 ? 'prev' : 'next');
  };
  let hidePointer: ReturnType<typeof setTimeout> | undefined, hideBar: ReturnType<typeof setTimeout> | undefined;
  const move = (e: MouseEvent) => {
    root.classList.remove('hide-pointer');
    clearTimeout(hidePointer);
    hidePointer = setTimeout(() => root.classList.add('hide-pointer'), IDLE_MS);
    laser.style.left = `${e.clientX}px`; laser.style.top = `${e.clientY}px`;
    const inBar = e.clientY > window.innerHeight - BAR_ZONE_PX || bar.contains(e.target as Node);
    if (inBar) { clearTimeout(hideBar); hideBar = undefined; bar.classList.add('visible'); }
    else if (bar.classList.contains('visible') && hideBar === undefined) {
      hideBar = setTimeout(() => { bar.classList.remove('visible'); hideBar = undefined; }, IDLE_MS);
    }
  };

  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);
  window.addEventListener('resize', fit);
  document.addEventListener('focusin', keepFocus, true);
  root.addEventListener('click', click);
  root.addEventListener('mousemove', move);
  frame.addEventListener('scroll', updateMore);
  content.addEventListener('load', fit, true);
  applyTone();
  render();

  return {
    go,
    index: () => index,
    tone: () => tone,
    destroy() {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('resize', fit);
      document.removeEventListener('focusin', keepFocus, true);
      clearTimeout(hidePointer); clearTimeout(hideBar);
      root.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
  };
}
