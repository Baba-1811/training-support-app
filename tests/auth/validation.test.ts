import { describe, expect, it } from "vitest";
import { signupSchema, loginSchema } from "@/lib/auth/validation";
describe("validation", () => {
  const input = { email: "user@example.com", password: "password123", name: "名前" };
  it("accepts valid signup and strips an injected userId", () => {
    expect(signupSchema.parse({ ...input, userId: "victim" })).toEqual(input);
  });
  it.each([
    { email: "bad" }, { password: "short" }, { password: "x".repeat(129) },
    { name: " " }, { name: "x".repeat(101) }, { email: "x".repeat(250) + "@example.com" },
  ])("rejects invalid signup %o", (change) => {
    expect(signupSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("does not trim passwords or apply signup minimum to existing passwords", () => {
    expect(loginSchema.parse({ email: " user@example.com ", password: " p " })).toEqual({
      email: "user@example.com", password: " p ",
    });
  });
});
