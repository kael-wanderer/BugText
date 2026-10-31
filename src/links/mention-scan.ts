import type { IndexedNote } from "./index";
import { mentionPattern, mentionsInNote, type Mention } from "./mentions";
export function createMentionScan(now = () => performance.now(), defer: (fn: () => void) => unknown = fn => setTimeout(fn, 0)) {
  let generation = 0, running = false;
  return {
    start(title: string, activePath: string, notes: IndexedNote[], done: (result: { mentions: Mention[]; capped: boolean }) => void) {
      const current = ++generation, pattern = mentionPattern(title), mentions: Mention[] = []; let position = 0; running = true;
      function slice() {
        if (current !== generation) return;
        const start = now();
        while (position < notes.length) {
          const note = notes[position++];
          if (note.path !== activePath) mentions.push(...mentionsInNote(note, pattern));
          if (mentions.length >= 200) { running = false; done({ mentions: mentions.slice(0, 200), capped: true }); return; }
          if (now() - start >= 8) break;
        }
        if (position < notes.length) defer(slice);
        else { running = false; done({ mentions, capped: false }); }
      }
      defer(slice);
    },
    cancel() { generation++; running = false; },
    get running() { return running; },
  };
}
