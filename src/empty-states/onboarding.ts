import type { Settings } from "../settings";
export function createOnboarding(deps: { get(): Settings; set(settings: Settings): void; write(settings: Settings): Promise<void>; toast(message: string): void; refresh(): void }) {
  let dismissedForSession = false;
  return {
    dismissed: () => dismissedForSession || deps.get().onboarding.hintDismissed,
    mark() {
      if (dismissedForSession || deps.get().onboarding.hintDismissed) return;
      dismissedForSession = true;
      const settings = { ...deps.get(), onboarding: { hintDismissed: true } };
      deps.set(settings); deps.refresh();
      void deps.write(settings).catch(() => deps.toast("Could not save this setting."));
    },
  };
}
