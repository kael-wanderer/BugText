export function createThumbs(render: (key: string) => Promise<HTMLCanvasElement | null>) {
  const cache = new Map<string, Promise<HTMLCanvasElement | null>>();
  const pending = new WeakMap<Element, string>(); let dead = false;
  async function load(slot: Element, key: string) {
    let promise = cache.get(key); if (!promise) { promise = render(key); cache.set(key, promise); }
    const canvas = await promise;
    if (dead || pending.get(slot) !== key || !canvas) return;
    const copy = canvas.ownerDocument.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0); slot.replaceChildren(copy);
  }
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { observer?.unobserve(entry.target); const key = pending.get(entry.target); if (key) void load(entry.target, key); }
  }, { rootMargin: "100% 0px" });
  return { observe(slot: Element, key: string) { pending.set(slot, key); if (observer) observer.observe(slot); else void load(slot, key); }, destroy() { dead = true; observer?.disconnect(); cache.clear(); } };
}
