export type PaneTabs = { id: string; tabs: readonly { id: string }[] };

export function paneForTab(windows: readonly PaneTabs[], tabId: string): string | null {
  return windows.find((pane) => pane.tabs.some((tab) => tab.id === tabId))?.id ?? null;
}
