type NoticeOptions = {
  client: string;
  name: string;
  onUndo: () => void;
  undoAvailable: () => boolean;
};

type NoticeRecord = {
  element: HTMLElement;
  undoButton: HTMLButtonElement;
  options: NoticeOptions;
  timer: ReturnType<typeof setTimeout>;
};

const notices = new Map<string, NoticeRecord>();

function keyFor(client: string, name: string): string {
  return `${client}\u0000${name}`;
}

function refresh(record: NoticeRecord): void {
  record.undoButton.hidden = !record.options.undoAvailable();
}

function remove(key: string, record: NoticeRecord): void {
  clearTimeout(record.timer);
  record.element.remove();
  if (notices.get(key) === record) notices.delete(key);
}

export function showAgentNotice(host: HTMLElement, options: NoticeOptions): void {
  const key = keyFor(options.client, options.name);
  const existing = notices.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.options.undoAvailable = options.undoAvailable;
    existing.timer = setTimeout(() => remove(key, existing), 6000);
    refresh(existing);
    return;
  }

  const notice = document.createElement("div");
  notice.className = "agent-notice";
  const message = document.createElement("span");
  message.className = "agent-notice-message";
  message.textContent = `${options.client} updated ${options.name} · saved`;
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "agent-notice-undo";
  undo.textContent = "Undo";
  undo.addEventListener("click", () => {
    if (!options.undoAvailable()) return;
    undo.hidden = true;
    options.onUndo();
  });
  notice.append(message, undo);
  host.append(notice);
  const record: NoticeRecord = {
    element: notice,
    undoButton: undo,
    options,
    timer: setTimeout(() => remove(key, record), 6000),
  };
  notices.set(key, record);
  refresh(record);
}

export function refreshAgentNotices(): void {
  for (const record of notices.values()) refresh(record);
}
