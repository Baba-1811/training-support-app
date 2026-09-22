import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() },
  profile: vi.fn(), report: vi.fn(), client: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/auth/profile", () => ({ ensureProfile: mocks.profile, reportProfileFailure: mocks.report }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
// cache is request-scoped in RSC, but is a no-op in this isolated environment.
import { signup, login, logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth/require-user";
import { GET } from "@/app/auth/confirm/route";

const user = {
  id: "verified-id", email: "owner@example.com", email_confirmed_at: "2026-09-21",
  user_metadata: { name: "太郎" }, identities: [{ id: "identity-id" }],
};
function form() {
  const data = new FormData();
  Object.entries({ email: user.email, password: "password123", name: "太郎", userId: "victim-id" })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.client.mockResolvedValue({ auth: mocks.auth });
  mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
  mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
  mocks.auth.signOut.mockResolvedValue({ error: null });
  mocks.auth.verifyOtp.mockResolvedValue({ error: null });
  mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  mocks.profile.mockResolvedValue({ id: user.id });
});
describe("signup/login/logout actions", () => {
  it("creates a profile using the Auth response, not submitted userId", async () => {
    await expect(signup({}, form())).rejects.toThrow("REDIRECT:/check-email");
    expect(mocks.profile).toHaveBeenCalledWith(user);
    expect(mocks.auth.signUp.mock.calls[0][0]).toEqual({
      email: user.email, password: "password123",
      options: { data: { name: "太郎" }, emailRedirectTo: "http://localhost:3000/auth/confirm" },
    });
  });
  it("keeps Auth intact after signup profile failure and still directs to confirmation", async () => {
    mocks.profile.mockRejectedValue(new Error("db offline"));
    await expect(signup({}, form())).rejects.toThrow("REDIRECT:/check-email");
    expect(mocks.report).toHaveBeenCalledOnce();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it("never provisions from a duplicate signup's obfuscated response", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { user: { ...user, identities: [] }, session: null }, error: null });
    await expect(signup({}, form())).rejects.toThrow("REDIRECT:/check-email");
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("rejects invalid input without calling Auth", async () => {
    expect((await signup({}, new FormData())).error).toBeTruthy();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not create a profile when Auth rejects signup", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: {}, error: new Error("failure") });
    expect((await signup({}, form())).error).toBeTruthy();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("verified login repairs a profile and ignores injected ownership", async () => {
    await expect(login({}, form())).rejects.toThrow("REDIRECT:/");
    expect(mocks.profile).toHaveBeenCalledWith(user, true);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: user.email, password: "password123" });
  });
  it("rejects invalid credentials without reaching Prisma", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: new Error("credentials") });
    expect((await login({}, form())).error).toBeTruthy();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("blocks protected access after a login profile failure", async () => {
    mocks.profile.mockRejectedValue(new Error("db offline"));
    await expect(login({}, form())).rejects.toThrow("REDIRECT:/auth/profile-error");
  });
  it("signs out the current session and invalidates the layout", async () => {
    await expect(logout({}, new FormData())).rejects.toThrow("REDIRECT:/login");
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("does not claim logout succeeded on Auth failure", async () => {
    mocks.auth.signOut.mockResolvedValue({ error: new Error("offline") });
    expect((await logout({}, new FormData())).error).toBeTruthy();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
describe("server-side protection", () => {
  it("rejects an unauthenticated request even without Proxy", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("requires email confirmation", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/check-email");
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("returns only the verified user's profile", async () => {
    expect(await requireUser()).toEqual({ id: user.id });
    expect(mocks.profile).toHaveBeenCalledWith(user, true);
  });
  it("blocks on unavailable profiles", async () => {
    mocks.profile.mockRejectedValue(new Error("offline"));
    await expect(requireUser()).rejects.toThrow("REDIRECT:/auth/profile-error");
  });
});
describe("confirmation", () => {
  const request = (query: string) => new NextRequest("http://localhost:3000/auth/confirm?" + query);
  const location = (result: Response) => result.headers.get("location");
  describe("PKCE code (default Supabase email)", () => {
    it("exchanges the code, re-verifies the user, repairs profile and discards redirect parameters", async () => {
      const result = await GET(request("code=one-time-code&type=signup&next=https://evil.example&id=victim-id&email=victim@example.com"));
      expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
      expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.auth.getUser).toHaveBeenCalledOnce();
      expect(mocks.profile).toHaveBeenCalledWith(user, true);
      expect(location(result)).toBe("http://localhost:3000/");
      expect(result.headers.get("cache-control")).toContain("no-store");
      expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    });
    it("calls getUser after the exchange and ensureProfile only after getUser", async () => {
      const order: string[] = [];
      mocks.auth.exchangeCodeForSession.mockImplementation(async () => { order.push("exchange"); return { data: {}, error: null }; });
      mocks.auth.getUser.mockImplementation(async () => { order.push("getUser"); return { data: { user }, error: null }; });
      mocks.profile.mockImplementation(async () => { order.push("ensureProfile"); return { id: user.id }; });
      await GET(request("code=abc"));
      expect(order).toEqual(["exchange", "getUser", "ensureProfile"]);
    });
    it("never uses a URL-supplied id or email for the profile", async () => {
      await GET(request("code=abc&id=victim-id&user_id=victim-id&email=victim@example.com"));
      expect(mocks.profile).toHaveBeenCalledOnce();
      expect(mocks.profile.mock.calls[0][0]).toBe(user);
    });
    it.each([
      ["auth error (missing verifier / expired / reused)", { message: "code verifier not found" }],
      ["network failure", null],
    ])("fails closed when the exchange fails: %s", async (_name, failure) => {
      if (failure) mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: failure });
      else mocks.auth.exchangeCodeForSession.mockRejectedValue(new Error("offline"));
      const result = await GET(request("code=abc"));
      expect(location(result)).toContain("/auth/error");
      expect(mocks.auth.getUser).not.toHaveBeenCalled();
      expect(mocks.profile).not.toHaveBeenCalled();
    });
    it("fails closed when the Auth server cannot re-verify the user", async () => {
      mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid jwt") });
      expect(location(await GET(request("code=abc")))).toContain("/auth/error");
      mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      expect(location(await GET(request("code=abc")))).toContain("/auth/error");
      expect(mocks.profile).not.toHaveBeenCalled();
    });
    it("does not create a profile for an unconfirmed email", async () => {
      mocks.auth.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
      expect(location(await GET(request("code=abc")))).toContain("/auth/error");
      expect(mocks.profile).not.toHaveBeenCalled();
    });
    it("shows retry UI if DB fails after a successful exchange", async () => {
      mocks.profile.mockRejectedValue(new Error("offline"));
      const result = await GET(request("code=abc"));
      expect(location(result)).toContain("/auth/profile-error");
      expect(mocks.report).toHaveBeenCalledOnce();
    });
  });
  describe("token hash (custom email template)", () => {
    it("verifies token, re-verifies the user, repairs profile and discards arbitrary redirect parameters", async () => {
      const result = await GET(request("token_hash=example&type=email&next=https://evil.example"));
      expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "example", type: "email" });
      expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(mocks.auth.getUser).toHaveBeenCalledOnce();
      expect(mocks.profile).toHaveBeenCalledWith(user, true);
      expect(location(result)).toBe("http://localhost:3000/");
      expect(result.headers.get("cache-control")).toContain("no-store");
      expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    });
    it("rejects expired or reused links", async () => {
      mocks.auth.verifyOtp.mockResolvedValue({ error: new Error("expired") });
      const result = await GET(request("token_hash=x&type=email"));
      expect(location(result)).toContain("/auth/error");
      expect(mocks.profile).not.toHaveBeenCalled();
    });
    it("does not create a profile for an unconfirmed email", async () => {
      mocks.auth.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
      expect(location(await GET(request("token_hash=x&type=email")))).toContain("/auth/error");
      expect(mocks.profile).not.toHaveBeenCalled();
    });
    it("shows retry UI if DB fails after successful confirmation", async () => {
      mocks.profile.mockRejectedValue(new Error("offline"));
      const result = await GET(request("token_hash=x&type=email"));
      expect(location(result)).toContain("/auth/profile-error");
    });
  });
  it.each([
    "", "token_hash=x&type=recovery", "type=email", "token_hash=x", "token_hash=&type=email",
    "code=", "code=" + "a".repeat(1025), "token_hash=" + "a".repeat(1025) + "&type=email",
    "code=abc&token_hash=x&type=email", "code=abc&token_hash=x",
    "error=access_denied&error_code=otp_expired&error_description=expired",
    "code=abc&error=access_denied", "code=abc&error_code=otp_expired",
  ])("rejects %s without reaching Auth or the DB", async (query) => {
    const result = await GET(request(query));
    expect(location(result)).toContain("/auth/error");
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
