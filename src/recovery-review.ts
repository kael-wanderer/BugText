import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { showComparison } from "./compareview";
import { bringBackDiscarded, discardDraft, listDiscarded } from "./recovery";
import { draftState, isRecoverableDraft, type DiskState, type DraftRecord, type DraftState } from "./recovery-policy";
import { showToast } from "./toast";

type OpenTab = { dirty: boolean; text: string };
type Row = { draft: DraftRecord; state: DraftState; diskText: string | null; open: OpenTab | null; selected: boolean };
type ReviewDeps = { host: HTMLElement; findOpen: (path: string) => OpenTab | null; restore: (draft: DraftRecord) => void; preserveOpen?: (path: string) => Promise<void> };

function button(label: string, run: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", run);
  return element;
}

/** The last two folders of a path, so long locations stay readable. */
function shortFolder(path: string | null): string {
  if (!path) return "Never saved";
  const parts = path.split("/").slice(0, -1).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : `/${parts.join("/")}`;
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

export async function showRecoveryReview(deps: ReviewDeps, restoreAll = false): Promise<void> {
  const drafts = (await invoke<DraftRecord[]>("recovery_list_drafts")).filter(isRecoverableDraft);
  const discarded = await listDiscarded();
  if (!drafts.length && !discarded.length) { showToast("Nothing to recover"); return; }
  const rows: Row[] = await Promise.all(drafts.map(async (draft) => {
    let stat: DiskState = null;
    let diskText: string | null = null;
    if (draft.path) {
      try { stat = await invoke("file_stat", { path: draft.path }); diskText = await invoke("read_file", { path: draft.path }); } catch { /* unavailable */ }
    }
    const open = draft.path ? deps.findOpen(draft.path) : null;
    const state = draftState(draft, stat, diskText, open);
    return { draft, state, diskText, open, selected: state !== "Same as file" };
  }));
  const previous = document.activeElement as HTMLElement | null;
  const scrim = document.createElement("div");
  scrim.className = "recovery-scrim";
  const sheet = document.createElement("section");
  sheet.className = "recovery-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Recover unsaved documents");
  sheet.setAttribute("aria-modal", "true");
  scrim.append(sheet);
  const close = (): void => { scrim.remove(); previous?.focus(); };
  scrim.addEventListener("click", (event) => { if (event.target === scrim) close(); });
  scrim.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
  deps.host.append(scrim);
  const discard = async (row: Row): Promise<void> => {
    try {
      const file = await discardDraft(row.draft.id);
      if (!file) return;
      if (row.draft.path) await deps.preserveOpen?.(row.draft.path);
      rows.splice(rows.indexOf(row), 1);
      showToast(`Discarded ${row.draft.name}`, 8000, { label: "Undo", run: () => { void bringBackDiscarded(file).then(() => { close(); void showRecoveryReview(deps); }); } });
      await render();
      if (!rows.length) { deps.host.querySelector(".recovery-banner")?.remove(); close(); }
    } catch { showToast("Could not discard draft"); }
  };
  const restore = async (row: Row): Promise<void> => {
    if (row.state === "Same as file") return;
    const open = row.draft.path ? deps.findOpen(row.draft.path) : null;
    if (row.state === "File changed after draft" || (open?.dirty && open.text !== row.draft.contents)) {
      const left = open?.dirty ? open.text : row.diskText;
      if (left === null || left === undefined) return;
      const decision = await new Promise<"draft" | "file" | "close">((resolve) => {
        showComparison(deps.host, { name: open?.dirty ? "Open tab" : "On disk", path: row.draft.path ?? "", text: left },
          { name: "Recovered draft", path: row.draft.path ?? "", text: row.draft.contents }, [
            { label: "Close", run: () => resolve("close") },
            { label: "Keep file", run: () => resolve("file") },
            { label: "Use draft", primary: true, run: () => resolve("draft") },
          ]);
      });
      if (decision === "close") return;
      if (decision === "file") { await discard(row); return; }
    }
    deps.restore(row.draft);
    const index = rows.indexOf(row);
    if (index >= 0) rows.splice(index, 1);
    await render();
    if (!rows.length) { deps.host.querySelector(".recovery-banner")?.remove(); close(); }
  };
  async function render(): Promise<void> {
    sheet.replaceChildren();
    const header = document.createElement("header");
    const heading = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = "Recover unsaved documents";
    const subtitle = document.createElement("p"); subtitle.textContent = "Restored documents open as unsaved tabs. Nothing is written to disk until you save.";
    heading.append(title, subtitle); header.append(heading, button("Close", close)); sheet.append(header);
    const table = document.createElement("table");
    const head = document.createElement("tr");
    const all = document.createElement("input"); all.type = "checkbox"; all.setAttribute("aria-label", "Select all");
    all.checked = rows.length > 0 && rows.every((row) => row.selected);
    all.addEventListener("change", () => { for (const row of rows) row.selected = all.checked; void render(); });
    const selectHead = document.createElement("th"); selectHead.append(all); head.append(selectHead);
    for (const label of ["Name", "Where", "Saved", "Size", "State", ""]) { const th = document.createElement("th"); th.textContent = label; head.append(th); }
    table.append(head);
    for (const row of rows) {
      const tr = document.createElement("tr"); const checkboxCell = document.createElement("td");
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = row.selected; checkbox.setAttribute("aria-label", `Select ${row.draft.name}`);
      checkbox.addEventListener("change", () => { row.selected = checkbox.checked; void render(); }); checkboxCell.append(checkbox); tr.append(checkboxCell);
      const words = row.draft.contents.trim() ? row.draft.contents.trim().split(/\s+/).length : 0;
      for (const value of [row.draft.name, shortFolder(row.draft.path), relativeTime(row.draft.updatedAt), `${words} words`, row.state]) {
        const cell = document.createElement("td"); cell.textContent = value; tr.append(cell);
      }
      tr.children[3].setAttribute("title", new Date(row.draft.updatedAt).toLocaleString());
      if (row.draft.path) tr.children[2].setAttribute("title", row.draft.path);
      tr.children[5].className = "recovery-state";
      const actions = document.createElement("td");
      if (row.state !== "Same as file") {
        const compare = button("Compare", () => {
          const left = row.open?.dirty ? row.open.text : row.diskText;
          if (left === null || left === undefined) return;
          showComparison(deps.host, { name: row.open?.dirty ? "Open tab" : "On disk", path: row.draft.path ?? "", text: left }, { name: "Recovered draft", path: row.draft.path ?? "", text: row.draft.contents }, [
            { label: "Close", run: () => {} }, { label: "Keep file", run: () => { void discard(row); } }, { label: "Use draft", primary: true, run: () => { deps.restore(row.draft); rows.splice(rows.indexOf(row), 1); void render().then(() => { if (!rows.length) { deps.host.querySelector(".recovery-banner")?.remove(); close(); } }); } },
          ]);
        });
        compare.disabled = row.diskText === null && !row.open; actions.append(compare, button("Restore", () => { void restore(row); }));
      }
      actions.append(button("Discard", () => { void discard(row); })); tr.append(actions); table.append(tr);
    }
    const list = document.createElement("div"); list.className = "recovery-list"; list.append(table); sheet.append(list);
    const latest = await listDiscarded().catch(() => []);
    if (!scrim.isConnected) return;
    const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = `Recently discarded (${latest.length})`; details.append(summary);
    for (const item of latest) { const line = document.createElement("div"); const name = document.createElement("span"); name.textContent = `${item.name} · ${new Date(item.discardedAt).toLocaleString()}`; line.append(name, button("Bring back", () => { void bringBackDiscarded(item.file).then(() => { close(); void showRecoveryReview(deps); }); })); details.append(line); }
    sheet.append(details);
    const footer = document.createElement("footer"); const selected = rows.filter((row) => row.selected);
    const count = document.createElement("span"); count.textContent = `${selected.length} of ${rows.length} selected`;
    const discardSelected = button(`Discard selected (${selected.length})…`, () => { void (async () => {
      if (!await confirm(`${selected.map((row) => row.draft.name).join(", ")}. You can bring them back for 7 days from Recently discarded.`, { title: `Discard ${selected.length} recovered documents?`, kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" })) return;
      for (const row of selected) await discard(row);
    })(); });
    const restoreSelected = button(`Restore selected (${selected.length})`, () => { void (async () => { for (const row of selected) { if (!scrim.isConnected) break; await restore(row); } })(); });
    discardSelected.disabled = !selected.length; restoreSelected.disabled = !selected.some((row) => row.state !== "Same as file");
    footer.append(count, discardSelected, restoreSelected); sheet.append(footer);
  }
  await render();
  sheet.querySelector<HTMLButtonElement>("button")?.focus();
  if (restoreAll) for (const row of [...rows]) { if (!scrim.isConnected) break; await restore(row); }
}
