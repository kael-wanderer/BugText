import { emit, emitTo, listen } from '@tauri-apps/api/event';
import { renderMarkdown } from '../preview';
import { resolvePreviewImages } from '../preview-images';
import { enhancePreview } from '../render-extras';
import { enhancePreviewTasks } from '../preview-tasks';
import { createKeyReader } from './keys';
import {
  parsePresenterState, PRESENTER_COMMAND, PRESENTER_READY, PRESENTER_STATE,
  type PresenterAction, type PresenterCommand, type PresenterState,
} from './protocol';
import '../styles.css';
import './present.css';

const FORWARDED = new Set<string>(['next', 'prev', 'first', 'last', 'black', 'leave']);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function miniStage(): { box: HTMLElement; content: HTMLElement } {
  const box = el('div', 'presenter-mini');
  const stage = el('div', 'present-stage');
  const frame = el('div', 'present-frame');
  const content = el('article', 'doc present-content');
  frame.append(content); stage.append(frame); box.append(stage);
  return { box, content };
}

/** The presenter window UI: current and next slide, notes, timer and clock. It only re-renders Markdown it receives. */
export function createPresenter(host: HTMLElement, send: (owner: string, command: PresenterCommand) => void) {
  let state: PresenterState | null = null;
  let started = false, paused = false, elapsed = 0, lastTick = Date.now();
  let rendered: { current: string; next: string | null; path: string | null } | null = null;

  const root = el('div', 'presenter');
  const header = el('header');
  const timer = el('span', 'presenter-timer');
  const pause = el('button', '', 'Pause');
  const reset = el('button', '', 'Reset');
  const clock = el('span', 'presenter-clock');
  header.append(timer, pause, reset, clock);

  const left = el('div', 'presenter-col');
  const current = miniStage();
  left.append(el('div', 'presenter-label', 'Current slide'), current.box);

  const right = el('div', 'presenter-col right');
  const next = miniStage();
  const notesLabel = el('div', 'presenter-label');
  const smaller = el('button', '', 'A−'); smaller.title = 'Smaller notes';
  const larger = el('button', '', 'A+'); larger.title = 'Larger notes';
  notesLabel.append(el('span', 'grow', 'Notes'), smaller, larger);
  const notes = el('div', 'presenter-notes');
  right.append(el('div', 'presenter-label', 'Next'), next.box, notesLabel, notes);

  const footer = el('footer');
  const prevBtn = el('button', '', '‹ Previous');
  const counter = el('span', 'presenter-count');
  const nextBtn = el('button', '', 'Next ›');
  footer.append(prevBtn, counter, nextBtn);
  root.append(header, left, right, footer);
  host.append(root);

  const command = (c: PresenterCommand) => { if (state) send(state.owner, c); };
  const action = (a: PresenterAction) => command({ action: a });
  prevBtn.addEventListener('click', () => action('prev'));
  nextBtn.addEventListener('click', () => action('next'));
  smaller.addEventListener('click', () => { if (state) command({ notesSize: Math.max(14, state.notesSize - 2) }); });
  larger.addEventListener('click', () => { if (state) command({ notesSize: Math.min(32, state.notesSize + 2) }); });
  pause.addEventListener('click', () => { paused = !paused; lastTick = Date.now(); pause.textContent = paused ? 'Resume' : 'Pause'; });
  reset.addEventListener('click', () => { elapsed = 0; started = false; lastTick = Date.now(); updateTime(); });
  root.addEventListener('click', e => { if ((e.target as Element).closest('a')) e.preventDefault(); });

  function updateTime(): void {
    const seconds = Math.floor(elapsed / 1000);
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    timer.textContent = h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const interval = setInterval(() => {
    const now = Date.now();
    if (started && !paused) elapsed += now - lastTick;
    lastTick = now;
    updateTime();
  }, 1000);
  updateTime();

  function renderSlide(target: HTMLElement, source: string, path: string | null): void {
    target.innerHTML = renderMarkdown(source);
    target.querySelectorAll('a').forEach(a => { a.tabIndex = -1; });
    enhancePreviewTasks(target, null);
    resolvePreviewImages(target, path);
    void enhancePreview(target).catch(() => {});
  }

  const reader = createKeyReader(Date.now);
  const key = (e: KeyboardEvent) => {
    const a = reader.read(e);
    if (!a) return;
    if (typeof a === 'object') { e.preventDefault(); command(a); }
    else if (FORWARDED.has(a)) { e.preventDefault(); action(a as PresenterAction); }
  };
  window.addEventListener('keydown', key, true);

  return {
    update(value: unknown): void {
      const incoming = parsePresenterState(value);
      if (!incoming) return;
      if (state && incoming.index !== state.index && !started) { started = true; lastTick = Date.now(); }
      state = incoming;
      document.documentElement.dataset.theme = state.themeName;
      root.classList.toggle('tone-light', state.tone === 'light');
      root.classList.toggle('tone-dark', state.tone === 'dark');
      counter.textContent = `${state.index + 1} / ${state.total}`;
      if (!rendered || rendered.current !== state.current || rendered.next !== state.next || rendered.path !== state.notePath) {
        renderSlide(current.content, state.current, state.notePath);
        if (state.next === null) {
          next.content.replaceChildren(el('div', 'presenter-end', 'End of presentation'));
        } else renderSlide(next.content, state.next, state.notePath);
        rendered = { current: state.current, next: state.next, path: state.notePath };
      }
      notes.textContent = state.notes || 'No notes for this slide.';
      notes.style.fontSize = `${state.notesSize}px`;
    },
    destroy(): void {
      clearInterval(interval);
      window.removeEventListener('keydown', key, true);
      root.remove();
    },
  };
}

const host = document.getElementById('presenter');
if (host) {
  const presenter = createPresenter(host, (owner, c) => { void emitTo(owner, PRESENTER_COMMAND, c); });
  void listen(PRESENTER_STATE, event => presenter.update(event.payload)).then(() => emit(PRESENTER_READY, {}));
}
