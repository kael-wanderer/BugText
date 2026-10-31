import type { CardState } from "./hover-state";
import { placeCard } from "./hover-position";
export function createHoverCard(doc: Document = document) {
  const old = doc.getElementById("link-hover-card"); old?.remove();
  const card = doc.createElement("div"); card.id = "link-hover-card"; card.className = "link-hover-card"; card.setAttribute("role", "tooltip"); card.hidden = true; doc.body.append(card);
  let anchor: HTMLElement | null = null, currentState: (() => CardState | null) | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null, hideTimer: ReturnType<typeof setTimeout> | null = null;
  const cleanup: (() => void)[] = [];
  const attached = new WeakMap<HTMLElement, { pointer?: () => CardState | null; focus?: () => CardState | null }>();
  const cancelShow = () => { if (showTimer !== null) clearTimeout(showTimer); showTimer = null; };
  const cancelHide = () => { if (hideTimer !== null) clearTimeout(hideTimer); hideTimer = null; };
  function hide() { cancelShow(); cancelHide(); anchor?.removeAttribute("aria-describedby"); anchor = null; currentState = null; card.hidden = true; card.replaceChildren(); }
  function render(state: CardState) {
    card.replaceChildren();
    const text = (tag: string, value: string, className = "") => { const el = doc.createElement(tag); el.className = className; el.textContent = value; card.append(el); };
    if (state.kind === "indexing") { text("p", "Indexing notes…"); return; }
    text("strong", state.title); const heading = state.kind === "heading-missing" ? state.heading : state.kind === "excerpt" ? state.excerpt.heading : null;
    text("p", state.relative + (heading ? ` · heading "${heading}"` : ""), "link-hover-path");
    if (state.kind === "missing") text("p", "Missing note");
    else if (state.kind === "unavailable") text("p", "Preview unavailable — note is too large or unreadable.");
    else {
      if (state.kind === "heading-missing") text("p", "Heading not found");
      for (const line of state.excerpt.lines) text("p", line, "link-hover-line");
      if (state.excerpt.truncated) text("p", `Showing ${state.excerpt.lines.length} of ${state.excerpt.total} lines`, "link-hover-footer");
    }
  }
  function show(el: HTMLElement, state: () => CardState | null) {
    cancelShow(); cancelHide(); const value = state(); if (!value) { hide(); return; }
    anchor?.removeAttribute("aria-describedby"); anchor = el; currentState = state; render(value); card.hidden = false; el.setAttribute("aria-describedby", card.id);
    const position = placeCard(el.getBoundingClientRect(), card.getBoundingClientRect(), { width: doc.defaultView?.innerWidth ?? 0, height: doc.defaultView?.innerHeight ?? 0 });
    card.style.left = `${position.left}px`; card.style.top = `${position.top}px`;
  }
  function laterHide() { cancelHide(); hideTimer = setTimeout(hide, 150); }
  const find = (target: EventTarget | null, mode: "pointer" | "focus"): { el: HTMLElement; state: () => CardState | null } | null => {
    let el = target instanceof Element ? target as HTMLElement : null;
    while (el) { const state = attached.get(el)?.[mode]; if (state) return { el, state }; el = el.parentElement; }
    return null;
  };
  const onOver = (event: Event) => {
    const e = event as PointerEvent; if (card.contains(e.target as Node)) { cancelHide(); return; }
    const found = find(e.target, "pointer"); if (!found || (e.relatedTarget instanceof Node && found.el.contains(e.relatedTarget))) return;
    cancelHide(); cancelShow(); showTimer = setTimeout(() => show(found.el, found.state), 400);
  };
  const onOut = (event: Event) => {
    const e = event as PointerEvent;
    if (card.contains(e.target as Node)) { if (!(e.relatedTarget instanceof Node && card.contains(e.relatedTarget))) laterHide(); return; }
    const found = find(e.target, "pointer"); if (!found || (e.relatedTarget instanceof Node && found.el.contains(e.relatedTarget))) return;
    cancelShow(); laterHide();
  };
  const onFocus = (event: Event) => { const found = find(event.target, "focus"); if (found) show(found.el, found.state); };
  const onBlur = (event: Event) => { if (find(event.target, "focus")) laterHide(); };
  const onKey = (event: Event) => { const e = event as KeyboardEvent; if (e.key === "Escape" && anchor && (e.target === anchor || anchor.contains(e.target as Node))) { hide(); e.preventDefault(); e.stopPropagation(); } };
  const onClick = () => hide(), onScroll = () => hide();
  for (const [name, handler, capture] of [["pointerover", onOver, false], ["pointerout", onOut, false], ["focusin", onFocus, false], ["focusout", onBlur, false], ["keydown", onKey, false], ["click", onClick, false], ["scroll", onScroll, true]] as const) {
    doc.addEventListener(name, handler, capture); cleanup.push(() => doc.removeEventListener(name, handler, capture));
  }
  return {
    attach(el: HTMLElement, state: () => CardState | null, mode: "pointer" | "focus") {
      const modes = attached.get(el) ?? {}; modes[mode] = state; attached.set(el, modes);
    },
    hide,
    refresh() { if (anchor && currentState && !card.hidden) show(anchor, currentState); },
    dispose() { hide(); cleanup.forEach(fn => fn()); card.remove(); },
  };
}
