import { createNavigationHistory, type NavigationLocation } from "./history";

/** One instance per native window. The opener must not record traversals. */
export function createNavigationController(deps: {
  position: (path: string) => NavigationLocation | null;
  open: (location: NavigationLocation, isCurrent: () => boolean) => Promise<boolean>;
}) {
  const history = createNavigationHistory();
  let busy = false, generation = 0;
  function capture() {
    const current = history.current;
    const position = current && deps.position(current.path);
    if (position) history.capture(position);
  }
  return {
    history,
    visit(location: NavigationLocation) { generation++; capture(); if (history.current?.path !== location.path) history.visit(location); },
    async travel(direction: "back" | "forward") {
      if (busy) return false;
      capture();
      const target = history.target(direction);
      if (!target) return false;
      const token = generation;
      busy = true;
      try {
        if (!await deps.open(target, () => token === generation) || token !== generation) return false;
        history[direction]();
        return true;
      } catch { return false; }
      finally { busy = false; }
    },
  };
}
