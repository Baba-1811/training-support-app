import { describe, expect, it } from "vitest";
import { connectErrorMessage } from "@/lib/exercises/connect";

describe("connectErrorMessage (user-facing text on the exercise page)", () => {
  it("explains an unavailable exercise when starting", () => {
    expect(connectErrorMessage("start", "NOT_FOUND")).toContain("この種目は現在利用できません");
  });
  it("explains a missing workout / exercise when adding", () => {
    expect(connectErrorMessage("add", "NOT_FOUND")).toContain("進行中のトレーニング");
  });
  it("explains a workout that was finished in the meantime", () => {
    expect(connectErrorMessage("add", "INVALID_STATE")).toContain("すでに終了");
  });
  it.each(["FAILED", "CONFLICT", "VALIDATION"] as const)("has a plain message for %s in both modes", (code) => {
    for (const mode of ["start", "add"] as const) expect(connectErrorMessage(mode, code).length).toBeGreaterThan(0);
  });
  it("never leaks technical words", () => {
    for (const mode of ["start", "add"] as const) for (const code of ["VALIDATION", "NOT_FOUND", "INVALID_STATE", "CONFLICT", "FAILED"] as const) {
      expect(connectErrorMessage(mode, code)).not.toMatch(/[A-Z_]{4,}|Error|exception/i);
    }
  });
});
