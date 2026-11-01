import { goalText, goalTitle } from "./labels";
import { goalRing } from "./ring";
export function createFocusPill(host: HTMLElement, onClick: (anchor: HTMLElement) => void) {
  const pill = document.createElement("button"); pill.type = "button"; pill.className = "goal-pill"; pill.hidden = true;
  pill.addEventListener("click", () => onClick(pill)); host.append(pill);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    update(state: { words: number; goal: number; session: boolean } | null): void {
      pill.hidden = !state;
      if (!state) return;
      const done = state.words >= state.goal; pill.classList.toggle("done", done);
      pill.title = goalTitle(state.words, state.goal, state.session);
      pill.replaceChildren(goalRing(state.words / state.goal), document.createTextNode(`${done ? "✓ " : ""}${goalText(state.words, state.goal, state.session)}`));
    },
    typing(): void { pill.classList.add("typing"); clearTimeout(timer); timer = setTimeout(() => pill.classList.remove("typing"), 2000); },
  };
}
