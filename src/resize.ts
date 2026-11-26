// Sidebar width: up to 70% of the window, but the editor always keeps EDITOR_MIN.
export const SIDEBAR_MIN = 160;
export const SIDEBAR_DEFAULT = 240;
const ACTIVITY_BAR = 48;
const EDITOR_MIN = 320;

export function sidebarMaxWidth(windowWidth: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(windowWidth * 0.7, windowWidth - ACTIVITY_BAR - EDITOR_MIN));
}

export function clampSidebarWidth(width: number, windowWidth: number): number {
  return Math.round(Math.max(SIDEBAR_MIN, Math.min(sidebarMaxWidth(windowWidth), width)));
}

// The width the user chose; a narrow window shows less but keeps this for when it grows again.
let chosen = SIDEBAR_DEFAULT;

/** Shows `width` (clamped to the window) without changing the saved width. */
export function applySidebarWidth(width: number): void {
  chosen = width;
  document.documentElement.style.setProperty("--explorer-w", `${clampSidebarWidth(width, window.innerWidth)}px`);
}

export function initResize(onCommit: (width: number) => void): void {
  const handle = document.getElementById("explorer-resize")!;
  const root = document.documentElement;
  let dragging = false;

  const handleMove = (event: MouseEvent): void => {
    if (!dragging) return;
    const width = clampSidebarWidth(event.clientX - ACTIVITY_BAR, window.innerWidth);
    root.style.setProperty("--explorer-w", `${width}px`);
  };

  const handleUp = (): void => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("resizing-explorer");
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);

    const value = getComputedStyle(root).getPropertyValue("--explorer-w");
    const width = clampSidebarWidth(Number.parseInt(value, 10) || SIDEBAR_DEFAULT, window.innerWidth);
    chosen = width;
    onCommit(width);
  };

  handle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    dragging = true;
    document.body.classList.add("resizing-explorer");
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  });

  handle.addEventListener("dblclick", () => {
    applySidebarWidth(SIDEBAR_DEFAULT);
    onCommit(SIDEBAR_DEFAULT);
  });

  window.addEventListener("resize", () => {
    if (!dragging) root.style.setProperty("--explorer-w", `${clampSidebarWidth(chosen, window.innerWidth)}px`);
  });
}
