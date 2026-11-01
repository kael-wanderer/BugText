import { renderMarkdown } from '../preview';
import { resolvePreviewImages } from '../preview-images';
import { enhancePreview } from '../render-extras';
import { enhancePreviewTasks } from '../preview-tasks';
import { fitScale } from './fit';
import { createKeyReader, type PresentAction } from './keys';
import type { Slide } from './split';
import './present.css';

export type StageOptions = {
  host: HTMLElement; slides: Slide[]; start: number; notePath: string | null;
  theme: 'light' | 'dark'; notesSize: number;
  onLeave(): void; onPresenter(): void; onNotesSize(size: number): void; onIndex(index: number): void;
};
export function createStage(o: StageOptions): { go(action: PresentAction): void; index(): number; destroy(): void } {
  let index = Math.max(0, Math.min(o.slides.length - 1, o.start));
  let notesOpen = false, black = false, laserOn = false, size = o.notesSize;
  const root = document.createElement('div'); root.className = `present ${o.theme}`;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Presentation');
  const frame = document.createElement('div'); frame.className = 'present-frame';
  const content = document.createElement('div'); content.className = 'present-content'; frame.append(content);
  const more = document.createElement('div'); more.className = 'present-more'; more.textContent = 'More below'; frame.append(more);
  const bar = document.createElement('div'); bar.className = 'present-bar';
  const notes = document.createElement('section'); notes.className = 'present-notes'; notes.hidden = true;
  const noteHeader = document.createElement('header'); const noteTitle = document.createElement('b'); noteHeader.append(noteTitle);
  const noteText = document.createElement('div'); noteText.className = 'present-notes-text';
  const laser = document.createElement('div'); laser.className = 'present-laser'; laser.hidden = true;
  const count = document.createElement('span'); count.className = 'present-count';
  const button = (parent: HTMLElement, label: string, fn: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); parent.append(b); };
  button(noteHeader, 'A−', () => changeSize(-2)); button(noteHeader, 'A+', () => changeSize(2)); button(noteHeader, 'Close', () => { notesOpen = false; updateNotes(); });
  notes.append(noteHeader, noteText);
  button(bar, 'Previous', () => go('prev')); bar.append(count); button(bar, 'Next', () => go('next'));
  button(bar, 'Notes', () => go('notes')); button(bar, 'Laser', () => go('laser')); button(bar, 'Presenter view', () => go('presenter'));
  button(bar, 'Light/Dark', () => go('theme')); button(bar, 'Exit', () => go('leave'));
  root.append(frame, notes, bar, laser); o.host.append(root);
  let blackLayer: HTMLElement | null = null;
  function changeSize(delta: number) { size = Math.max(14, Math.min(32, size + delta)); o.onNotesSize(size); updateNotes(); }
  function updateNotes() { notes.hidden = !notesOpen; noteTitle.textContent = `Speaker notes · slide ${index + 1}`; noteText.textContent = o.slides[index].notes || 'No notes for this slide.'; noteText.style.fontSize = `${size}px`; }
  function fit() {
    content.style.transform = ''; const result = fitScale({width: content.scrollWidth, height: content.scrollHeight}, {width: frame.clientWidth, height: frame.clientHeight});
    content.style.transform = `scale(${result.scale})`; frame.classList.toggle('scroll', result.scroll); more.hidden = !result.scroll;
  }
  function render() {
    content.innerHTML = renderMarkdown(o.slides[index].source);
    content.querySelectorAll('a').forEach(a => { a.tabIndex = -1; });
    enhancePreviewTasks(content, null);
    resolvePreviewImages(content, o.notePath); void enhancePreview(content).then(fit); count.textContent = `${index + 1} / ${o.slides.length}`;
    updateNotes(); fit();
  }
  function go(action: PresentAction) {
    if (black) { black = false; blackLayer?.remove(); blackLayer = null; return; }
    if (action === 'leave') { if (notesOpen) { notesOpen = false; updateNotes(); } else o.onLeave(); return; }
    if (action === 'notes') { notesOpen = !notesOpen; updateNotes(); return; }
    if (action === 'black') { black = true; blackLayer = document.createElement('div'); blackLayer.className = 'present-black'; root.append(blackLayer); return; }
    if (action === 'laser') { laserOn = !laserOn; laser.hidden = !laserOn; return; }
    if (action === 'theme') { root.classList.toggle('light'); root.classList.toggle('dark'); return; }
    if (action === 'presenter') { o.onPresenter(); return; }
    const next = typeof action === 'object' ? action.goto - 1 : action === 'next' ? index + 1 : action === 'prev' ? index - 1 : action === 'first' ? 0 : o.slides.length - 1;
    const clamped = Math.max(0, Math.min(o.slides.length - 1, next));
    if (clamped !== index) { index = clamped; render(); o.onIndex(index); }
  }
  const reader = createKeyReader(Date.now);
  const keydown = (e: KeyboardEvent) => { if (black && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); go('black'); return; } const action = reader.read(e); if (action) { e.preventDefault(); e.stopImmediatePropagation(); go(action); } };
  const click = (e: MouseEvent) => { if ((e.target as Element).closest('a')) e.preventDefault(); if (black) { go('black'); return; } if ((e.target as Element).closest('.present-bar, .present-notes')) return; go(e.clientX < window.innerWidth / 3 ? 'prev' : 'next'); };
  let hidePointer: ReturnType<typeof setTimeout>, hideBar: ReturnType<typeof setTimeout>;
  const move = (e: MouseEvent) => { root.classList.remove('hide-pointer'); clearTimeout(hidePointer); hidePointer = setTimeout(() => root.classList.add('hide-pointer'), 2000); laser.style.left = `${e.clientX}px`; laser.style.top = `${e.clientY}px`; if (e.clientY > window.innerHeight - 60) { clearTimeout(hideBar); bar.classList.add('visible'); } else if (bar.classList.contains('visible')) { clearTimeout(hideBar); hideBar = setTimeout(() => bar.classList.remove('visible'), 2000); } };
  window.addEventListener('keydown', keydown, true); window.addEventListener('resize', fit); root.addEventListener('click', click); root.addEventListener('mousemove', move); render();
  return { go, index: () => index, destroy() { window.removeEventListener('keydown', keydown, true); window.removeEventListener('resize', fit); clearTimeout(hidePointer); clearTimeout(hideBar); root.remove(); } };
}
