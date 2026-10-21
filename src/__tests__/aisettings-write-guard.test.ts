import { expect, it, vi } from "vitest";
import { permitAISettingsSave } from "../ai/aisettings-write-guard";
it("blocks saving while key migration is pending or failed", () => {
  const save = vi.fn();
  const blocked = vi.fn();
  expect(permitAISettingsSave(false, save, blocked)).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(blocked).toHaveBeenCalledOnce();
});
it("permits saving after migration is ready", () => {
  const save = vi.fn();
  expect(permitAISettingsSave(true, save, vi.fn())).toBe(true);
  expect(save).toHaveBeenCalledOnce();
});
