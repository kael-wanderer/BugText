/**
 * The text each tab had when it was last clean (opened, saved or reloaded from disk).
 * An edit that returns a tab to exactly that text, such as Undo, makes it clean again.
 * Tabs whose text never matched the disk (restored drafts, kept edits) are forgotten.
 */
const texts = new Map<string, string>();

export const cleanText = {
  set(tabId: string, text: string): void { texts.set(tabId, text); },
  forget(tabId: string): void { texts.delete(tabId); },
  matches(tabId: string, text: string): boolean { return texts.get(tabId) === text; },
};
