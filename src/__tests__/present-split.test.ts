import { describe, expect, it } from 'vitest';
import { splitSlides, slideAtLine } from '../present/split';

describe('presentation slides', () => {
  it('recognizes only standalone breaks outside frontmatter and fences', () => {
    expect(splitSlides('# A\n\none\n\n---\n\n## B\ntwo').map(s => s.source.trim())).toEqual(['# A\n\none', '## B\ntwo']);
    expect(splitSlides('Title\n---\ntext')).toHaveLength(1);
    expect(splitSlides('```\n---\n```')).toHaveLength(1);
    expect(splitSlides('---\ntitle: x\n---\n# A')[0].source).toBe('# A');
  });
  it('splits headings and honors the override', () => {
    const body = 'intro\n# A\na\n## B\nb\n### C\nc';
    expect(splitSlides(body).map(s => s.source.trim())).toEqual(['intro', '# A\na', '## B\nb\n### C\nc']);
    expect(splitSlides(`---\npresent_split: h3\n---\n${body}`)).toHaveLength(4);
    expect(splitSlides(`---\npresent_split: rule\n---\n${body}`)).toHaveLength(1);
  });
  it('extracts notes as plain text and discards empty slides', () => {
    const [slide] = splitSlides('## A\nx\n<!-- notes: say hi -->\n<!-- notes: and bye -->');
    expect(slide.notes).toBe('say hi\n\nand bye');
    expect(slide.source).not.toContain('notes:');
    expect(splitSlides('x\n<!-- notes: <img src=x onerror=alert(1)> -->')[0].notes).toBe('<img src=x onerror=alert(1)>');
    expect(splitSlides('x\n\n---\n\n---\n\ny')).toHaveLength(2);
    expect(splitSlides('   ')).toEqual([]);
  });
  it('finds the slide for a source line', () => {
    const slides = splitSlides('intro\n# A\na\n## B\nb');
    expect(slideAtLine(slides, 2)).toBe(1);
    expect(slideAtLine(slides, 0)).toBe(0);
  });
});
