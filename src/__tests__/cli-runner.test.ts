import { expect, it } from "vitest";
import { signedOutMessage } from "../ai/cli-runner";
it("recognizes signed out Claude", () => {
  expect(signedOutMessage("claude", "Please run /login")).toBe(
    "Claude Code is signed out. Run claude in Terminal to sign in.",
  );
  expect(signedOutMessage("claude", "ok")).toBeNull();
});
