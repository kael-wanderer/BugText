import { parseNote, type LinkScan } from "../../links/index";

export function largeFolder(): LinkScan {
  const notes = Array.from({ length: 2000 }, (_, i) => {
    const path = `/notes/folder-${Math.floor(i / 50)}/note-${i}.md`;
    const source = `# Note ${i}\n#one #two\n[one](note-${(i + 1) % 50}.md)\n[two](note-${(i + 2) % 50}.md)\n[three](note-${(i + 3) % 50}.md)\n${"text ".repeat(1600)}`;
    return parseNote(path, source);
  });
  return { notes, skipped: [], stamps: Object.fromEntries(notes.map(n => [n.path, "1"])) };
}
