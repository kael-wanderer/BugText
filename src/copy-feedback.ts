type Feedback = { label: string; timer: ReturnType<typeof setTimeout> };
const feedback = new WeakMap<HTMLButtonElement, Feedback>();

export function flashCopied(button: HTMLButtonElement, ok: boolean): void {
  const previous = feedback.get(button);
  if (previous) clearTimeout(previous.timer);
  const label = previous?.label ?? button.textContent ?? "";
  button.textContent = ok ? "Copied" : "Copy failed";
  const timer = setTimeout(() => {
    button.textContent = label;
    feedback.delete(button);
  }, 1500);
  feedback.set(button, { label, timer });
}
