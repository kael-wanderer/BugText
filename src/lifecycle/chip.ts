// The small status chip shown on a tab and on the properties card (spec 4.1).
import type { LifecycleStatus } from "./model";

export function lifecycleChip(doc: Document, status: LifecycleStatus): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = `lifecycle-chip is-${status}`;
  chip.textContent = status;
  return chip;
}
