import { findFrontMatter } from '../properties/frontmatter';
import { scanMarkdownLines } from '../markdown-blocks';

export type SplitMode = 'rule' | 'h1' | 'h2' | 'h3';
export type Slide = { source: string; notes: string; fromLine: number; toLine: number };

export function splitSlides(text: string): Slide[] {
  const front = findFrontMatter(text);
  const body = text.slice(front?.end ?? 0);
  const offset = front ? (text.slice(0, front.end).match(/\n/g) ?? []).length : 0;
  const lines = body.split('\n');
  const scanned = scanMarkdownLines('\n' + body).slice(1);
  const breaks = lines.map((line, i) => !scanned[i].code && /^ {0,3}---[ \t]*\r?$/.test(line)
    && (i === 0 || lines[i - 1].trim() === ''));
  const setting = front?.block.match(/^present_split:[ \t]*(rule|h1|h2|h3)[ \t]*\r?$/m)?.[1] as SplitMode | undefined;
  const mode: SplitMode = setting ?? (breaks.some(Boolean) ? 'rule' : 'h2');
  const slides: Slide[] = [];
  let start = 0;
  const add = (end: number) => {
    const notes: string[] = [];
    const source = lines.slice(start, end).join('\n').replace(/<!--\s*notes:([\s\S]*?)-->/g, (_, note: string) => {
      notes.push(note.trim()); return '';
    });
    if (source.trim()) slides.push({ source, notes: notes.join('\n\n'), fromLine: offset + start + 1, toLine: offset + end });
  };
  for (let i = 0; i < lines.length; i++) {
    if (mode === 'rule' && breaks[i]) { add(i); start = i + 1; }
    else if (mode !== 'rule' && !scanned[i].code && new RegExp(`^ {0,3}#{1,${mode.slice(1)}}(?:[ \\t]+|$)`).test(scanned[i].text)) {
      add(i); start = i;
    }
  }
  add(lines.length);
  return slides;
}

export function slideAtLine(slides: Slide[], line: number): number {
  let index = 0;
  for (let i = 1; i < slides.length; i++) if (slides[i].fromLine <= line) index = i;
  return index;
}
