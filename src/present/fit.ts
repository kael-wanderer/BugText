export function fitScale(content: { width: number; height: number }, box: { width: number; height: number }): { scale: number; scroll: boolean } {
  const fit = Math.min(1, box.width / content.width, box.height / content.height);
  return { scale: Math.max(0.6, fit), scroll: fit < 0.6 };
}
