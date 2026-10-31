import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { checkSpelling } from "./api";
import { spellCache, type SpellRange } from "./cache";
import { spellMask } from "./mask";

const setMisspellings = StateEffect.define<DecorationSet>();
const refresh = StateEffect.define<void>();
const mark = Decoration.mark({ class: "cm-misspelled" });
export const misspellings = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    if (tr.docChanged && tr.isUserEvent("input.type")) {
      const head = tr.newSelection.main.head;
      const changed: [number, number][] = [];
      tr.changes.iterChangedRanges((_a, _b, from, to) => changed.push([from, to]));
      value = value.update({ filter: (from, to) => !(from <= head && head <= to) && !changed.some(([a, b]) => a <= to && b >= from) });
    }
    for (const effect of tr.effects) if (effect.is(setMisspellings)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

export function misspellingAt(state: EditorState, pos: number): { from: number; to: number; word: string } | null {
  let found: { from: number; to: number; word: string } | null = null;
  state.field(misspellings, false)?.between(pos, pos, (from, to) => {
    if (from <= pos && pos <= to) found = { from, to, word: state.sliceDoc(from, to) };
  });
  return found;
}

export function refreshSpelling(view: EditorView): void { view.dispatch({ effects: refresh.of() }); }

export function spellExtension(kind: "markdown" | "plain", checker: (text: string) => Promise<SpellRange[]> = checkSpelling): Extension {
  return [misspellings, ViewPlugin.fromClass(class {
    timer: ReturnType<typeof setTimeout> | undefined;
    generation = 0;
    typing = false;
    constructor(readonly view: EditorView) { this.schedule(); }
    schedule(): void {
      clearTimeout(this.timer); const generation = ++this.generation;
      this.timer = setTimeout(() => void this.run(generation), 350);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.typing = update.transactions.some(tr => tr.isUserEvent("input.type"));
      else if (update.selectionSet) this.typing = false;
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some(tr => tr.effects.some(e => e.is(refresh)))) this.schedule();
    }
    destroy(): void { clearTimeout(this.timer); this.generation++; }
    async run(generation: number): Promise<void> {
      const state = this.view.state;
      const first = Math.max(1, state.doc.lineAt(this.view.viewport.from).number - 50);
      const last = Math.min(state.doc.lines, state.doc.lineAt(this.view.viewport.to).number + 50);
      const from = state.doc.line(first).from, to = state.doc.line(last).to;
      const lines = spellMask(state, from, to, kind).split("\n");
      const pending: { text: string; offset: number }[] = [];
      const seen = new Set<string>(); let size = 0;
      for (const line of lines) {
        if (spellCache.get(line) !== undefined || seen.has(line)) continue;
        if (line.length > 100_000 || size + line.length + (pending.length ? 1 : 0) > 100_000) continue;
        if (pending.length) size++;
        pending.push({ text: line, offset: size }); seen.add(line); size += line.length;
      }
      if (pending.length) {
        try {
          const ranges = await checker(pending.map(item => item.text).join("\n"));
          for (const item of pending) spellCache.set(item.text, ranges.filter(([start, length]) => start >= item.offset && length > 0 && start + length <= item.offset + item.text.length).map(([start, length]) => [start - item.offset, length]));
        } catch { return; }
      }
      if (generation !== this.generation || state !== this.view.state) return;
      const decorations: ReturnType<typeof mark.range>[] = [];
      let offset = from; const head = state.selection.main.head;
      for (const line of lines) {
        for (const [start, length] of spellCache.get(line) ?? []) {
          const a = offset + start, b = a + length;
          if (!(this.typing && a <= head && head <= b)) decorations.push(mark.range(a, b));
        }
        offset += line.length + 1;
      }
      this.view.dispatch({ effects: setMisspellings.of(Decoration.set(decorations, true)) });
    }
  })];
}
