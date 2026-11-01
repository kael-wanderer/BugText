export function goalRing(fraction: number): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 14 14"); svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
  svg.setAttribute("class", "goal-ring"); svg.setAttribute("aria-hidden", "true");
  for (const name of ["track", "progress"]) {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "7"); circle.setAttribute("cy", "7"); circle.setAttribute("r", "5");
    circle.setAttribute("class", name);
    if (name === "progress") circle.setAttribute("stroke-dasharray", `${Math.max(0, Math.min(1, fraction)) * 31.416} 31.416`);
    svg.append(circle);
  }
  return svg;
}
