import { isDotName } from "../explorer";
export function shouldShowHint(s: { dismissed: boolean; folder: string | null; tabCount: number; loading: boolean; settingsOpen: boolean; recoveryOpen: boolean }): boolean {
  return !s.dismissed && !s.folder && s.tabCount === 0 && !s.loading && !s.settingsOpen && !s.recoveryOpen;
}
export function isFolderEmpty(children: { name: string }[] | undefined, showHidden: boolean): boolean {
  return children !== undefined && !children.some(child => showHidden || !isDotName(child.name));
}
