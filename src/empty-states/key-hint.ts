import { KEYMAP_COMMANDS, resolveAccelerator, formatAccelerator } from "../keymap";
export function keyHint(id: string, keymap: Record<string, string>): string {
  const command = KEYMAP_COMMANDS.find(entry => entry.id === id);
  if (!command) return "";
  const accelerator = resolveAccelerator(command, keymap);
  return accelerator ? formatAccelerator(accelerator) : "";
}
