import { expect, it } from "vitest";
import { cleanText } from "../clean-text";

it("matches only the recorded clean text of the same tab", () => {
  cleanText.set("t1", "saved");
  expect(cleanText.matches("t1", "saved")).toBe(true);
  expect(cleanText.matches("t1", "saved ")).toBe(false);
  expect(cleanText.matches("t2", "saved")).toBe(false);
});
it("never matches after the tab is forgotten", () => {
  cleanText.set("t3", "");
  cleanText.forget("t3");
  expect(cleanText.matches("t3", "")).toBe(false);
});
