export function permitAISettingsSave(
  migrationReady: boolean,
  save: () => void,
  blocked: () => void,
): boolean {
  if (!migrationReady) {
    blocked();
    return false;
  }
  save();
  return true;
}
