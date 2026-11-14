import { getState, setState } from "./store";
import { glyphs } from "./glyphs";

export function initActivityBar(
  onLayoutChange: () => void = () => {},
  onSearch: () => void = () => {},
  onSettings: () => void = () => {},
  onAI: () => void = () => {},
  onExport: (x: number, y: number) => void = () => {},
  onGit: () => void = () => {},
  onReview: () => void = () => {},
): void {
  const explorerButton = document.getElementById("ab-explorer")!;
  explorerButton.innerHTML = glyphs.explorer;
  document.getElementById("ab-outline")!.innerHTML = glyphs.outline;

  const searchButton = document.getElementById("ab-search")!;
  searchButton.innerHTML = glyphs.search;
  searchButton.addEventListener("click", onSearch);

  const gitButton = document.getElementById("ab-git");
  if (gitButton) { gitButton.innerHTML = glyphs.git; gitButton.addEventListener("click", onGit); }

  const reviewButton = document.getElementById("ab-review");
  if (reviewButton) {
    reviewButton.innerHTML = glyphs.review;
    const badge = document.createElement("span");
    badge.className = "ab-badge";
    badge.hidden = true;
    reviewButton.append(badge);
    reviewButton.addEventListener("click", onReview);
  }

  const aiButton = document.getElementById("ab-ai")!;
  aiButton.innerHTML = glyphs.ai;
  aiButton.addEventListener("click", onAI);

  const exportButton = document.getElementById("ab-export")!;
  exportButton.innerHTML = glyphs.export;
  exportButton.addEventListener("click", () => {
    const rect = exportButton.getBoundingClientRect();
    onExport(rect.right + 4, rect.top);
  });

  const settingsButton = document.getElementById("ab-settings")!;
  settingsButton.innerHTML = glyphs.gear;
  settingsButton.addEventListener("click", () => onSettings());

  const applyVisibility = (visible: boolean): void => {
    document.body.classList.toggle("explorer-hidden", !visible);
    explorerButton.classList.toggle("active", visible);
    explorerButton.setAttribute("aria-pressed", String(visible));
  };

  applyVisibility(getState().explorerVisible);

  explorerButton.addEventListener("click", () => {
    const explorerVisible = !getState().explorerVisible;
    setState({ explorerVisible });
    applyVisibility(explorerVisible);
    onLayoutChange();
  });
}

/** Count of notes to review on the Review button; Later items are not counted. */
export function setReviewBadge(count: number): void {
  const button = document.getElementById("ab-review");
  const badge = button?.querySelector<HTMLElement>(".ab-badge");
  if (!button || !badge) return;
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? "99+" : String(count);
  button.setAttribute("aria-label", count ? `Review, ${count} to review` : "Review");
}
