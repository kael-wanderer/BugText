import { expect, it } from "vitest";
import { goalText, goalTitle, reachedToast } from "../writing-goals/labels";
it("formats progress and reached messages", () => {
  expect(goalText(820,1500,false)).toBe("820 / 1,500"); expect(goalText(320,500,true)).toBe("Session 320 / 500");
  expect(goalTitle(820,1500,false)).toBe("820 of 1,500 words (55%) · 680 to go");
  expect(goalTitle(320,500,true)).toBe("320 of 500 words this session (64%) · 180 to go");
  expect(goalTitle(1512,1500,false)).toBe("1,512 of 1,500 words (100%) · goal reached");
  expect(reachedToast(500,true)).toBe("Session goal reached: 500 words.");
});
