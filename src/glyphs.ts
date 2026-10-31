const wrap = (inner: string): string =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const wrapFill = (inner: string): string =>
  `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">${inner}</svg>`;

export const glyphs: Record<string, string> = {
  explorer: wrapFill(
    `<path d="M49.984,56l-35.989,0c-3.309,0-5.995,-2.686-5.995,-5.995l0,-36.011c0,-3.308 2.686,-5.995 5.995,-5.995l35.989,0c3.309,0 5.995,2.687 5.995,5.995l0,36.011c0,3.309-2.686,5.995-5.995,5.995Zm-25.984,-4.001l0,-39.999l-9.012,0c-1.65,0-2.989,1.339-2.989,2.989l0,34.021c0,1.65 1.339,2.989 2.989,2.989l9.012,0Zm24.991,-39.999l-20.991,0l0,39.999l20.991,0c1.65,0,2.989,-1.339,2.989,-2.989l0,-34.021c0,-1.65-1.339,-2.989-2.989,-2.989Z"/><path d="M19.999,38.774l-6.828,-6.828l6.828,-6.829l2.829,2.829l-4,4l4,4l-2.829,2.828Z"/>`,
  ),
  editor: wrap(`<path d="M10.5 2.5l3 3-8 8-3.5.5.5-3.5z"/>`),
  read: wrap(
    `<path d="M8 4.3C6.4 3.3 4.1 3 2.4 3.3V12c1.7-.3 4 0 5.6 1 1.6-1 3.9-1.3 5.6-1V3.3C11.9 3 9.6 3.3 8 4.3Z"/><path d="M8 4.3V13"/>`,
  ),
  split: wrap(`<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/>`),
  lineNumbers: wrap(`<path d="M2.5 4h1.5M2.5 8h1.5M2.5 12h1.5M6.5 4h7M6.5 8h7M6.5 12h7"/>`),
  subToggle: wrap(
    `<rect x="1.5" y="3.5" width="6.5" height="9" rx="1.2"/><rect x="9.5" y="3.5" width="5" height="9" rx="1.2" stroke-dasharray="2 1.5"/>`,
  ),
  subClose: wrap(
    `<rect x="1.5" y="3.5" width="13" height="9" rx="1.2"/><path d="M10.5 5.8L8 8l2.5 2.2"/>`,
  ),
  newFile: wrap(
    `<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/><path d="M8 8v4M6 10h4"/>`,
  ),
  newFolder: wrap(
    `<path d="M2 4h4l1.5 1.5H14V13H2z"/><path d="M8 8v3M6.5 9.5h3"/>`,
  ),
  collapseAll: wrap(`<path d="M5 6l3-2.5L11 6"/><path d="M5 10l3 2.5L11 10"/>`),
  expandAll: wrap(`<path d="M5 4.5l3 2.5 3-2.5"/><path d="M5 9l3 2.5 3-2.5"/>`),
  outline: wrap(`<path d="M2.5 3.5h11M5 6.5h8.5M7.5 9.5h6M5 12.5h8.5"/>`),
  git: wrap(`<circle cx="5" cy="3" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="5" r="1.5"/><path d="M5 4.5v7M11 6.5c0 2-1 3-6 3"/>`),
  search: wrap(`<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/>`),
  ai: wrap(
    `<path d="M8 2.6c0 3 2.4 5.4 5.4 5.4-3 0-5.4 2.4-5.4 5.4 0-3-2.4-5.4-5.4-5.4 3 0 5.4-2.4 5.4-5.4z"/>`,
  ),
  gear: wrap(
    `<path d="M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z"/><path d="M6.9 1.5h2.2l.4 1.8 1.1.5 1.6-1 1.5 1.5-1 1.6.5 1.1 1.8.4v2.2l-1.8.4-.5 1.1 1 1.6-1.5 1.5-1.6-1-1.1.5-.4 1.8H6.9l-.4-1.8-1.1-.5-1.6 1-1.5-1.5 1-1.6-.5-1.1-1.8-.4V6.9l1.8-.4.5-1.1-1-1.6 1.5-1.5 1.6 1 1.1-.5z"/>`,
  ),
  export: wrap(
    `<path d="M8 11V2"/><path d="M5 5l3-3 3 3"/><path d="M2.5 10v3.5h11V10"/>`,
  ),
  more: wrap(
    `<circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none"/>`,
  ),
  refresh: wrap(
    `<path d="M13 7a5 5 0 1 0 .3 3"/><path d="M13 3.2V7H9.2"/>`,
  ),
};
