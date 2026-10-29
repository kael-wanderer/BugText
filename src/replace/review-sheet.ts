import { counts, trimAround, type ReplacePreview, type ReplaceSelection } from "./plan";
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = "") => { const node = document.createElement(tag); node.textContent = text; node.className = cls; return node; };
export function showReplaceReview(preview: ReplacePreview, query: string, replacement: string, options: string, openTag: (relative: string) => string | null): Promise<ReplaceSelection | null> {
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const scrim = el("div", "", "recovery-scrim link-rename-review"), sheet = el("section", "", "recovery-sheet");
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Replace in folder");
    const selection = preview.files.map(file => file.matches.map(() => true));
    const cancel = el("button", "Cancel"), apply = el("button");
    const close = (value: ReplaceSelection | null) => { scrim.remove(); previous?.focus(); resolve(value); };
    const update = () => { const c = counts(selection); apply.textContent = `Replace ${c.matches} matches in ${c.files} files`; apply.disabled = !c.matches; };
    sheet.append(el("h3", "Replace in folder"), el("p", `${query} → ${replacement}  ${options}`));
    preview.files.forEach((file, i) => {
      const section = el("section", "", "link-review-note"), heading = el("label"), checkbox = el("input"); checkbox.type = "checkbox"; checkbox.checked = true;
      heading.append(checkbox, el("strong", file.relative), el("span", ` ${file.matches.length} matches`)); const tag = openTag(file.relative); if (tag) heading.append(el("small", tag)); section.append(heading);
      const rows: HTMLLabelElement[] = [];
      const refresh = () => { checkbox.checked = selection[i].every(Boolean); checkbox.indeterminate = selection[i].some(Boolean) && !checkbox.checked; update(); };
      checkbox.onchange = () => { selection[i].fill(checkbox.checked); rows.forEach(row => { (row.querySelector("input") as HTMLInputElement).checked = checkbox.checked; }); refresh(); };
      file.matches.forEach((match, j) => {
        const row = el("label"), input = el("input"), line = el("pre"); input.type = "checkbox"; input.checked = true;
        const trimmed = trimAround(match.line_text, match.col_start, match.col_end);
        line.append(document.createTextNode(`${match.line}  ${trimmed.text.slice(0, trimmed.start)}`), el("del", trimmed.text.slice(trimmed.start, trimmed.end)), el("ins", match.replacement), document.createTextNode(trimmed.text.slice(trimmed.end)));
        row.append(input, line); if (j >= 20) row.hidden = true;
        input.onchange = () => { selection[i][j] = input.checked; refresh(); }; rows.push(row); section.append(row);
      });
      if (rows.length > 20) { const show = el("button", `Show all ${rows.length}`); show.onclick = () => { rows.forEach(row => { row.hidden = false; }); show.remove(); }; section.append(show); }
      sheet.append(section);
    });
    if (preview.skipped.length) { const details = el("details"), summary = el("summary", `${preview.skipped.length} files skipped`); details.append(summary); for (const skipped of preview.skipped) details.append(el("p", `${skipped.relative}: ${skipped.reason}`)); sheet.append(details); }
    if (preview.multiline) sheet.append(el("p", `${preview.multiline} matches span lines and were left out`));
    const footer = el("footer"); footer.append(el("span", "Open notes change in their tab and stay unsaved. Other files get a Recovery snapshot first."), cancel, apply); sheet.append(footer); scrim.append(sheet); document.body.append(scrim); update();
    cancel.onclick = () => close(null); apply.onclick = () => close(selection);
    scrim.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); close(null); } else if (e.key === "Enter" && !apply.disabled && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); close(selection); } else if (e.key === "Tab") { const items = Array.from(sheet.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), summary" )).filter(x => !x.hidden && !x.closest("[hidden]")); if (!items.length) return; const index = items.indexOf(document.activeElement as HTMLElement); if ((!e.shiftKey && index === items.length - 1) || (e.shiftKey && index <= 0)) { e.preventDefault(); items[e.shiftKey ? items.length - 1 : 0].focus(); } } };
    cancel.focus();
  });
}
