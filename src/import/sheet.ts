// The File ▸ Import sheet: the question (address, save path, "already imported"),
// progress, the result and failures, in one sheet that stays open across the
// steps of an import. All text from pages, files and paths goes in as textContent.

import { action, field, node, organizeSheet } from "../notes/sheet";
import type { ImportKind, ImportUI } from "./run";

type Answer = Awaited<ReturnType<ImportUI["ask"]>>;
export type ImportSheetOptions = { label?: (path: string) => string; openNote?: (path: string) => void };

const TITLES: Record<ImportKind, string> = { web: "Import Web Page", word: "Import Word Document", csv: "Import CSV" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HTTPS_ONLY = "Only https:// addresses can be imported.";

function shortDate(iso: string | null): string | null {
  const match = iso && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : null;
}

export function importUI(host: HTMLElement, options: ImportSheetOptions = {}): ImportUI {
  const label = options.label ?? ((path: string) => path);
  let sheet: ReturnType<typeof organizeSheet> | null = null;
  let content = node("div");
  let title = "Import";
  let pending: ((answer: Answer) => void) | null = null;

  const settle = (answer: Answer) => {
    const resolve = pending;
    pending = null;
    resolve?.(answer);
  };
  const show = (heading: string) => {
    title = heading;
    if (!sheet || sheet.closed) {
      sheet = organizeSheet(host, heading);
      content = node("div");
      sheet.body.append(content);
      sheet.cleanup(() => settle(null));
    } else {
      sheet.body.setAttribute("aria-label", heading);
      const h2 = sheet.body.querySelector("h2");
      if (h2) h2.textContent = heading;
    }
    content.replaceChildren();
    return content;
  };
  const close = () => sheet?.close();
  const actions = (...buttons: HTMLButtonElement[]) => {
    const row = node("div");
    row.className = "organize-actions";
    row.append(...buttons);
    return row;
  };

  return {
    ask({ kind, address, savePath, earlier }) {
      settle(null);
      const body = show(TITLES[kind]);
      const addressInput = node("input");
      addressInput.type = "url";
      addressInput.value = address ?? "";
      addressInput.placeholder = "https://";
      const saveInput = node("input");
      saveInput.value = savePath;
      if (kind === "web") saveInput.placeholder = "From the page title, beside the open note";
      const hint = node("p");
      hint.className = "organize-error";
      const submit = action(earlier ? "Import Again" : "Import", () => go());
      const refresh = () => {
        const value = addressInput.value.trim();
        const ok = kind !== "web" || value.startsWith("https://");
        hint.textContent = kind === "web" && value && !ok && !"https://".startsWith(value) ? HTTPS_ONLY : "";
        submit.disabled = !ok;
        return ok;
      };
      const go = () => {
        if (!refresh()) return;
        const answer = { savePath: saveInput.value.trim(), again: earlier !== null };
        settle(kind === "web" ? { address: addressInput.value.trim(), ...answer } : answer);
      };
      for (const control of [addressInput, saveInput]) {
        control.addEventListener("input", refresh);
        control.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            go();
          }
        });
      }
      if (earlier) {
        const when = shortDate(earlier.importedAt);
        const what = kind === "web" ? "This address" : "This file";
        body.append(
          node("h3", "Already imported"),
          node("p", `${what} was imported ${when ? `on ${when}` : "before"} as ${label(earlier.path)}.`),
        );
      }
      if (kind === "web") body.append(field("Address", addressInput));
      body.append(field("Save to", saveInput), hint);
      const buttons = [action("Cancel", close)];
      if (earlier) {
        buttons.push(action("Open Existing", () => {
          const path = earlier.path;
          const resolve = pending;
          pending = null;
          close();
          resolve?.({ open: path });
        }));
      }
      buttons.push(submit);
      body.append(actions(...buttons));
      refresh();
      (kind === "web" && !addressInput.value ? addressInput : saveInput).focus();
      return new Promise<Answer>((resolve) => {
        pending = resolve;
      });
    },
    busy(text) {
      const body = show(title);
      const status = node("p", text);
      status.setAttribute("role", "status");
      const cancel = action("Cancel", close);
      const submit = action("Import", () => {});
      cancel.disabled = true;
      submit.disabled = true;
      body.append(status, actions(cancel, submit));
    },
    result({ path, problems }) {
      const body = show(title);
      body.append(node("p", `Imported ${label(path)}`));
      if (problems.length > 0) {
        const list = node("ul");
        for (const problem of problems) list.append(node("li", problem));
        body.append(list);
      }
      const done = action("Done", close);
      body.append(actions(done, action("Open Note", () => {
        close();
        options.openNote?.(path);
      })));
      done.focus();
    },
    fail(text) {
      settle(null);
      const body = show(title);
      const error = node("p", text);
      error.className = "organize-error";
      error.setAttribute("role", "alert");
      const done = action("Done", close);
      body.append(error, actions(done));
      done.focus();
    },
  };
}
